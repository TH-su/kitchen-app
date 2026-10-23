#!/usr/bin/env bash
# 施設ごとの分割（0010）の守りの試験を流す。本番と同じ順番（0001〜0009 → 今あるデータの見本 → 0010）で流し、
# FAIL・ERROR が1件でもあれば終了コード1。実データは一切使わない。
# 形は介護ツールの基盤（care-backend）の supabase/tests/run.sh と同じ。
#
# 素の PostgreSQL に Supabase の真似（00_supabase_stub.sql）を立てて回す（Docker の無い Mac 向け）。
#   bash supabase/tests/run.sh
#   ・PGBIN で PostgreSQL の bin を指定できる（既定: Homebrew の postgresql@17 → /usr/lib/postgresql/*/bin の新しい版）
#   ・既に動いている空の PostgreSQL に流す時は TEST_DB_URL を渡す（CI のサービスコンテナ用・スーパーユーザーで）
#   ・MUTANT=tests/mutants/xxx.sql（supabase/ からの相対）を渡すと、0010 の後にその「わざと壊した版」を
#     当ててから試す（壊した版で試験が落ちることを確かめる。mutants.sh が全部をまとめて回す）
set -euo pipefail
cd "$(dirname "$0")/.."

# Unix ソケットのパスは約103文字まで。長い一時ディレクトリだと起動できないので /tmp の下に作る
WORK="$(TMPDIR=/tmp mktemp -d)"
OUT="$WORK/out.txt"

if [ -n "${TEST_DB_URL:-}" ]; then
  echo "土台: 既存の PostgreSQL（TEST_DB_URL）＋ Supabase の真似"
  cleanup() { rm -rf "$WORK"; }
  trap cleanup EXIT
  PSQL=(psql "$TEST_DB_URL" -v ON_ERROR_STOP=1 -q -X)
else
  echo "土台: 素の PostgreSQL ＋ Supabase の真似"
  if [ -z "${PGBIN:-}" ]; then
    for d in /opt/homebrew/opt/postgresql@17/bin /usr/local/opt/postgresql@17/bin $(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -r); do
      if [ -x "$d/initdb" ]; then PGBIN="$d"; break; fi
    done
  fi
  [ -n "${PGBIN:-}" ] || { echo "PostgreSQL が見つかりません（PGBIN で bin を指定してください）"; exit 1; }
  PORT="${PGPORT_TEST:-54339}"
  cleanup() { LC_ALL=C "$PGBIN/pg_ctl" -D "$WORK/db" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$WORK"; }
  trap cleanup EXIT

  # postgres ユーザーで動かす必要がある環境（root）への配慮
  RUN=""
  if [ "$(id -u)" = "0" ]; then
    id postgres >/dev/null 2>&1 || useradd -m postgres
    chown -R postgres "$WORK"
    RUN="runuser -u postgres --"
  fi

  LC_ALL=C $RUN "$PGBIN/initdb" -D "$WORK/db" -U postgres --auth=trust -E UTF8 --locale=C >/dev/null
  # macOS では LC_ALL が無いと postmaster が起動直後に止まる（"became multithreaded"）ので C を渡す
  LC_ALL=C $RUN "$PGBIN/pg_ctl" -D "$WORK/db" -o "-p $PORT -k $WORK -c listen_addresses='' -c wal_level=logical" -l "$WORK/log" -w start >/dev/null
  PSQL=("$PGBIN/psql" -h "$WORK" -p "$PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -q -X)
fi
export PGCLIENTENCODING=UTF8
"${PSQL[@]}" -t -c "select 'PostgreSQL ' || current_setting('server_version')"

# 準備（ここで失敗したら set -e で止まる）
# 準備の出力は控えに残し、失敗した時だけ見せる
prep() { "${PSQL[@]}" -f "$1" >>"$WORK/prep.txt" 2>&1 || { echo "準備で失敗: $1"; tail -20 "$WORK/prep.txt"; exit 1; }; }
prep tests/00_supabase_stub.sql
for f in migrations/000[1-9]_*.sql; do prep "$f"; done
prep tests/fixtures/05_before_0010.sql
# 0010 は2回当てる（冪等＝2回目でエラーにならず、結果も変わらないことを試験で見る）
prep migrations/0010_facility_scope.sql
# 1回目と2回目の間に、既存の利用者3を会員から外す（再実行で戻らないことを試験 0-13 で見る）
"${PSQL[@]}" -c "delete from facility_members where user_id = '00000000-0000-4000-8000-0000000000a3'" >/dev/null
prep migrations/0010_facility_scope.sql
# 0011（削除の通知の絞り込み）も2回当てる（冪等）
prep migrations/0011_realtime_delete_scope.sql
prep migrations/0011_realtime_delete_scope.sql
if [ -n "${MUTANT:-}" ]; then
  echo "壊した版を当てる: $MUTANT"
  prep "$MUTANT"
fi

{
  "${PSQL[@]}" -f tests/10_facility_scope_test.sql 2>&1 || true
  "${PSQL[@]}" -f tests/20_realtime_scope_test.sql 2>&1 || true
  # 施設Bの行がある間に戻しを流すと止まること（止まらなければ不合格）
  if rb_out="$("${PSQL[@]}" -f rollback/0010_back.sql 2>&1)"; then
    echo "FAIL 9-1 他施設の行があるのに戻しが止まらなかった"
  elif grep -q "既定の施設以外の行" <<<"$rb_out"; then
    echo "PASS 9-1 他施設の行があると戻しは止まる"
  else
    echo "FAIL 9-1 戻しが想定外の理由で失敗した: $(grep -m1 ERROR <<<"$rb_out" | sed 's/ERROR/E/')"
  fi
  "${PSQL[@]}" -f tests/90_rollback_test.sql 2>&1 || true
} > "$OUT"
grep -E "PASS|FAIL|ERROR" "$OUT" | sed -E 's/^(psql:[^ ]+ )?(NOTICE|WARNING):[[:space:]]+//' || true

pass=$(grep -c "PASS" "$OUT" || true)
fail=$(grep -c "FAIL" "$OUT" || true)
err=$(grep -c "ERROR" "$OUT" || true)
echo "────────"
echo "合格 ${pass} / 不合格 ${fail} / エラー ${err}"
[ "$fail" = "0" ] && [ "$err" = "0" ] && [ "$pass" -gt 0 ]
