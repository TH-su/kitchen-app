#!/usr/bin/env bash
# わざと壊した版（tests/mutants/*.sql）を1本ずつ 0010 の後に当てて run.sh を回し、
# 全部で試験が落ちる（＝壊れを見逃さない）ことを確かめる。1本でも通ってしまったら終了コード1。
set -uo pipefail
cd "$(dirname "$0")/.."
missed=0
for m in tests/mutants/*.sql; do
  if MUTANT="$m" bash tests/run.sh >/dev/null 2>&1; then
    echo "見逃し: $m（壊した版でも試験が全部通った）"; missed=$((missed + 1))
  else
    echo "検出:   $m（$(MUTANT="$m" bash tests/run.sh 2>&1 | tail -1)）"
  fi
done
echo "────────"
echo "見逃し ${missed} 本"
[ "$missed" = "0" ]
