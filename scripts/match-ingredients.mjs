// =====================================================================
// 使用食材(165件) → 八訂food_composition の food_code マッチング
//   入力: data/food_composition.json, data/ingredients_live.json
//   出力: data/ingredient_code_map.json（採用コード）
//         data/match_review.tsv（人手レビュー用・候補上位3つき）
//   実行: node scripts/match-ingredients.mjs
//
//   方針: 各食材にひらがなクエリ(q)を与え、実テーブルから自動解決。
//         野菜/肉/魚は「生」を優先・加工状態(ゆで/乾/油いため等)を減点。
//         調味料は実製品コードへ。code指定があれば最優先。skip=非食品。
// =====================================================================
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const comp = JSON.parse(readFileSync(join(ROOT, 'data', 'food_composition.json'), 'utf8'))
const live = JSON.parse(readFileSync(join(ROOT, 'data', 'ingredients_live.json'), 'utf8'))

const norm = (s) =>
  String(s ?? '')
    .normalize('NFKC')
    .replace(/[\s　]/g, '')
    .toLowerCase()

// 正規化名インデックス
const compN = comp.map((c) => ({ ...c, n: norm(c.food_name) }))
const byCode = new Map(comp.map((c) => [c.food_code, c]))

const AVOID = ['ゆで', '油いため', '焼き', '蒸し', '水煮', '味付け', 'フライ', '素揚げ', '天ぷら', '缶詰', '冷凍', '乾']

// 全クエリトークンを含む候補を返し、preferを加点・avoidを減点・短名優先で並べる
function search(q, { prefer = ['生'], avoid = AVOID } = {}) {
  const toks = q.split(/\s+/).map(norm).filter(Boolean)
  const hits = compN.filter((c) => toks.every((t) => c.n.includes(t)))
  const score = (c) => {
    let s = 0
    for (const p of prefer) if (c.food_name.includes(p)) s += 10
    for (const a of avoid) if (c.food_name.includes(a)) s -= 6
    s -= c.food_name.length * 0.1 // 短く一般的な名前を優先
    return s
  }
  return hits.sort((a, b) => score(b) - score(a)).slice(0, 3)
}

// ---- キュレーション辞書 ----------------------------------------------
// q: 検索クエリ / code: 明示コード(最優先) / prefer,avoid: 状態ヒント / skip: 非食品
const MAP = {
  // 野菜（生優先）
  人参: { code: '06212' }, にんじん: { code: '06212' },
  玉ねぎ: { code: '06153' }, たまねぎ: { code: '06153' },
  ねぎ: { code: '06226' }, ネギ: { code: '06226' }, 白ネギ: { code: '06226' },
  白菜: { code: '06233' }, キャベツ: { code: '06061' },
  じゃがいも: { code: '02017' }, 大根: { code: '06132' }, 大根葉: { code: '06130' },
  もやし: { code: '06291' }, ほうれん草: { code: '06267' }, 小松菜: { code: '06086' },
  チンゲン菜: { code: '06160' }, ピーマン: { code: '06245' }, 三色ピーマン: { code: '06245' },
  なす: { code: '06191' }, きゅうり: { code: '06065' },
  かぼちゃ: { code: '06048' }, カボチャ: { code: '06048' }, かぼちゃペースト: { code: '06048' },
  ごぼう: { code: '06084' }, 生姜: { code: '06103' }, ニンニク: { code: '06223' }, にんにく: { code: '06223' },
  アスパラ: { code: '06007' }, ニラ: { code: '06207' }, 水菜: { code: '06072' }, 春菊: { code: '06099' },
  豆苗: { code: '06329' }, セロリ: { code: '06119' }, レタス: { code: '06312' }, サニー: { code: '06315' },
  かいわれ: { code: '06128' }, トマト: { code: '06182' }, トマト缶: { code: '06184' },
  ブロッコリー: { code: '06263' }, インゲン: { code: '06010' }, いんげん: { code: '06010' },
  里芋: { code: '02010' }, さつま芋: { code: '02006' }, さつまいも: { code: '02006' },
  ふき: { code: '06256' }, 高菜: { code: '06147' }, 菜の花: { code: '06201' }, 大葉: { code: '06095' },
  たけのこ: { q: 'たけのこ 若茎 ゆで', prefer: ['ゆで'] }, グリンピース: { q: 'グリンピース', prefer: ['冷凍'] },
  コーン: { q: 'スイートコーン 缶詰 ホールカーネル', prefer: ['ホールカーネル'] },
  野菜ミックス: { q: 'ミックスベジタブル', prefer: ['冷凍'] }, ミックスベジタブル: { q: 'ミックスベジタブル', prefer: ['冷凍'] },
  切干: { code: '06136' }, '切干（乾燥）': { code: '06136' }, 大根おろし: { code: '06132' },
  葉物: { skip: '総称（具体菜は別途）' },
  // きのこ
  しいたけ: { code: '08042' }, しめじ: { code: '08016' }, えのき: { code: '08001' },
  なめこ: { code: '08020' }, 舞茸: { code: '08028' },
  // 果物・缶
  みかん缶: { code: '07035' }, 黄桃: { code: '07175' }, 白桃: { code: '07138' }, バナナ: { code: '07107' },
  // 大豆製品
  豆腐: { code: '04032' }, 木綿: { code: '04032' }, 焼き豆腐: { code: '04038' }, 厚揚げ: { code: '04039' },
  あげ: { code: '04040' }, 刻み揚げ: { code: '04040' }, 刻みあげ: { code: '04040' },
  大豆: { q: 'だいず 全粒 国産 黄大豆 ゆで', prefer: ['ゆで'] }, 玉子とうふ: { code: '12020' },
  mixビーンズ: { q: 'いんげんまめ ゆで', prefer: ['ゆで'] },
  // 卵
  たまご: { code: '12004' }, 温玉: { code: '12004' },
  // 肉
  豚小間: { q: 'ぶた 大型種肉 もも 脂身つき 生' }, 豚肉: { q: 'ぶた 大型種肉 もも 脂身つき 生' },
  豚: { q: 'ぶた 大型種肉 もも 脂身つき 生' }, 豚ロース: { q: 'ぶた 大型種肉 ロース 脂身つき 生' },
  豚ミンチ: { q: 'ぶた ひき肉 生' }, 鶏ミンチ: { q: 'にわとり ひき肉 生' },
  あいびき: { q: 'うし ひき肉 生' }, 合い挽き: { q: 'うし ひき肉 生' },
  蒸し鶏: { q: 'にわとり 若どり むね 皮なし 生' }, 鶏: { q: 'にわとり 若どり むね 皮なし 生' },
  ベーコン: { q: 'ばらベーコン' }, ハム: { q: 'ロースハム' }, ウィンナー: { q: 'ウインナーソーセージ' },
  // 魚介・練物
  ツナ: { code: '10260' },
  しらす: { q: 'しらす干し 微乾燥品' }, 干しエビ: { q: '干しえび' }, あさり: { code: '10281' },
  かにかま: { q: 'かに風味かまぼこ' }, 細かま: { q: 'かに風味かまぼこ' }, 細かまぼこ: { q: 'かに風味かまぼこ' },
  丸天: { code: '10386' }, ちくわ: { code: '10381' }, はんぺん: { q: 'はんぺん' },
  魚肉: { q: '魚肉ソーセージ' }, 鯖水煮: { code: '10164' },
  かつお節: { q: 'かつお節' }, おかか: { q: 'かつお節' }, 糸かつお: { q: 'かつお節' },
  // 海藻・乾物
  わかめ: { q: 'カットわかめ', prefer: ['乾'], avoid: [] }, わかわ: { q: 'カットわかめ', prefer: ['乾'], avoid: [] },
  ひじき: { q: 'ほしひじき ステンレス釜 乾', prefer: ['乾'], avoid: [] }, 春雨: { q: '緑豆はるさめ 乾', prefer: ['乾'], avoid: [] },
  あられふ: { q: 'ふ 焼きふ', avoid: [] }, 糸こん: { q: 'しらたき' }, こんにゃく: { q: '板こんにゃく 精粉こんにゃく' },
  // 漬物・キムチ
  キムチ: { code: '06236' }, たくあん: { q: 'たくあん漬 塩押し' },
  ねり梅: { q: '梅干し 塩漬', avoid: [] }, 梅: { q: '梅干し 塩漬', avoid: [] },
  // 調味料
  砂糖: { code: '03003' }, 醬油: { code: '17007' }, しょうゆ: { code: '17007' }, うすくち: { code: '17008' },
  みりん: { code: '16025' }, 酒: { code: '16001' }, みそ: { code: '17045' },
  塩コショウ: { code: '17012' }, 酢: { code: '17015' }, 甘酢: { code: '17016', note: '米酢で近似（砂糖分は別途）' },
  めんつゆ: { q: 'めんつゆ ストレート', avoid: [] }, ケチャップ: { q: 'トマトケチャップ' },
  マヨネーズ: { q: 'マヨネーズ 全卵型' }, ウスター: { code: '17001' },
  中濃: { q: '中濃ソース' }, 中濃ソース: { q: '中濃ソース' }, ポン酢: { q: 'ぽん酢しょうゆ 市販品' },
  コンソメ: { q: '固形ブイヨン' }, オイスター: { q: 'オイスターソース' },
  豆板醬: { q: 'トウバンジャン' }, 甜麵醬: { q: 'テンメンジャン' },
  コチュジャン: { code: '17106', note: '八訂本表に未収載→テンメンジャンでカロリー近似' },
  ごま油: { code: '14002' }, 油: { code: '14006' }, バター: { q: '有塩バター' },
  すりごま: { code: '05018' }, 片栗粉: { code: '02034' }, 小麦粉: { code: '01015' },
  だし: { code: '17021' }, 中華だし: { code: '17093' },
  鶏ガラ: { code: '17093' }, とりがら: { code: '17093' },
  ダシダ: { code: '17093' }, 鶏ガラorダシダ: { code: '17093' },
  // 乳・穀
  // 米は主食。グラム未登録（適量）かつ主食目安kcalを別途定数加算する設計のため、
  // 成分計算対象外にして二重計上・生米(342kcal)誤計上を防ぐ。
  牛乳: { code: '13003' }, 米: { skip: '主食グラム未登録・主食目安kcalで別計上' }, めん: { q: 'うどん ゆで', prefer: ['ゆで'] },
  // 既製合わせ調味料・不明（レビュー対象）
  ドレ: { code: '17039', note: '和風ノンオイルで代表' }, チョレギドレ: { code: '17117', note: 'ごまドレで近似' },
  白だし: { code: '17029', note: 'めんつゆ(ｽﾄﾚｰﾄ)で近似' }, コンポタ: { review: 'コーンポタージュ（要確認）' },
  たれ: { review: '合わせだれ' }, おろしだれ: { review: '合わせだれ' }, 照りたれ: { review: '照り焼きのたれ' },
  塩タレ: { review: '合わせだれ' }, 塩だれ: { review: '合わせだれ' }, ヨープ: { review: '不明（要確認）' },
}

// ---- 拡張辞書（表記ゆれ・全件ページング後に判明した未紐付け食材）----------
const EXT = {
  // しょうゆ・塩・だし・みそ（表記ゆれ）
  醤油: { code: '17007' }, 濃口: { code: '17007' }, 濃い口: { code: '17007' }, 薄口: { code: '17008' },
  薄口しょうゆ: { code: '17008' }, 塩: { code: '17012' }, だし汁: { code: '17021' }, 出し汁: { code: '17021' },
  鶏がら: { code: '17093' }, 味噌: { code: '17045' }, 白みそ: { code: '17044' }, 白味噌: { code: '17044' },
  赤味噌: { code: '17046' }, 赤みそ: { code: '17046' }, 八丁味噌: { code: '17046' }, マヨ: { code: '17042' },
  // 肉
  鶏もも: { code: '11221' }, 鶏肉: { code: '11221' }, 牛肉: { code: '11020' }, 豚バラ: { code: '11129' },
  // 魚介
  鮭: { code: '10134' }, 鯖: { code: '10154' }, サバ: { code: '10154' }, 塩サバ: { code: '10154' },
  ぶり: { code: '10241' }, たら: { code: '10205' }, タラ: { code: '10205' }, アジ: { code: '10003' }, あじ: { code: '10003' },
  赤魚: { code: '10030' }, 煮干し: { code: '10045' }, ちりめん: { code: '10055' }, 鰹節: { code: '10091' },
  かまぼこ: { q: 'かまぼこ 蒸し', avoid: [] },
  // 卵
  卵: { code: '12004' }, ゆで卵: { code: '12005' }, いり卵: { code: '12004' }, 玉子焼き: { code: '12004' },
  錦糸卵: { code: '12004' }, うずら: { q: 'うずら卵 全卵 生', avoid: [] },
  // 大豆製品
  絹: { code: '04033' }, 絹ごし: { code: '04033' }, 絹豆腐: { code: '04033' }, 高野豆腐: { code: '04042' },
  豆乳: { code: '04052' }, おから: { code: '04051' }, 納豆: { code: '04046' },
  // 野菜・きのこ・芋
  じゃが芋: { code: '02017' }, 長いも: { code: '02023' }, ながいも: { code: '02023' }, 里芋: { code: '02010' },
  ささがきごぼう: { code: '06084' }, 長ネギ: { code: '06226' }, ミリピーマン: { code: '06245' },
  ゴーヤ: { code: '06205' }, にがうり: { code: '06205' }, きぬさや: { code: '06020' }, キヌサヤ: { code: '06020' },
  きんさや: { code: '06020' }, 枝豆: { q: 'えだまめ 生', avoid: [] }, タケノコ: { code: '06150' }, 竹のこ: { code: '06150' },
  エリンギ: { q: 'エリンギ 生', avoid: [] }, 椎茸: { code: '08042' }, 生シイタケ: { code: '08042' },
  干しシイタケ: { code: '08013' }, 干し椎茸: { code: '08013' }, 干ししいたけ: { code: '08013' },
  切り干し大根: { code: '06136' }, 切り干し: { code: '06136' }, 高菜漬け: { code: '06147' },
  // こんにゃく
  いとこん: { code: '02005' }, 糸コン: { code: '02005' }, 糸こんにゃく: { code: '02005' }, 板こんにゃく: { code: '02003' }, 板こん: { code: '02003' },
  // 麺・粉物・麩
  うどん: { code: '01039' }, 素麺: { code: '01044' }, 素麵: { code: '01044' }, そうめん: { code: '01044' },
  マカロニ: { code: '01064' }, パスタ: { code: '01064' }, 麺: { code: '01039' }, まき麩: { code: '01067' }, 麩: { code: '01067' },
  // 果物
  りんご: { code: '07148' }, みかん: { code: '07029' }, もも缶: { code: '07138' },
  // 乳・冷凍野菜
  ヨーグルト: { code: '13025' }, チーズ: { code: '13040' }, mixベジ: { code: '06382' }, MIXベジ: { code: '06382' },
  ミックスベジ: { code: '06382' }, 野菜mix: { code: '06382' }, 冷凍野菜: { code: '06382' },
  // しょうが・薬味
  ショウガ: { code: '06103' }, ショウガ汁: { code: '06103' }, おろし生姜: { code: '06103' }, 刻みねぎ: { code: '06226' },
  刻み柚子: { q: 'ゆず 果皮', avoid: [] }, 刻みゆず: { q: 'ゆず 果皮', avoid: [] },
  // 豆・乾物
  小豆: { q: 'あずき 全粒 ゆで', avoid: [] }, かんぴょう: { q: 'かんぴょう 乾', avoid: [] },
  刻み昆布: { q: '刻み昆布', avoid: [] }, 塩昆布: { q: '塩昆布', avoid: [] },
  // 酒類
  白ワイン: { q: 'ぶどう酒 白', avoid: [] }, 赤ワイン: { q: 'ぶどう酒 赤', avoid: [] },
  // 非食品・だし戻し（水扱い=0kcal）
  水: { skip: '水' }, みず: { skip: '水' }, 戻し汁: { skip: 'だし戻し汁≒水' }, 椎茸戻し汁: { skip: 'だし戻し汁≒水' }, 素材: { skip: '不定' }, 素: { skip: '不定' },
  // 合成料理・市販合わせ（要レビュー：カロリー寄与は限定的）
  天ぷら: { review: '料理（衣＋具）' }, ハンバーグ: { review: '成形肉' }, チキンカツ: { review: '揚げ物' },
  鶏団子: { review: '成形肉' }, 肉団子: { review: '成形肉' }, つみれ: { review: '練り物' }, いわしつみれ: { review: '練り物' },
  じゃこボール: { review: '練り物' }, 海老ボール: { review: '練り物' }, すいとん: { review: '料理' }, いももち: { review: '料理' },
  生湯葉: { review: 'ゆば' }, フルーツソース: { review: '市販' }, フルカク: { review: 'フルーツ角切缶？' },
  もずく酢: { review: '味付もずく' }, らっきょう甘酢漬: { review: '漬物' }, 奈良漬: { review: '漬物' }, 福神漬け: { review: '漬物' },
  カレー粉: { review: '香辛料' }, ハヤシフレーク: { review: 'ルウ' }, シチュー粉: { review: 'ルウ' }, シーフードmix: { review: '冷凍' },
  きんぴら: { review: '料理' }, コールスロー: { review: '料理' }, ヨープ: { review: '不明' }, どれ: { code: '17039' },
  粉チーズ: { q: 'パルメザン', avoid: [] }, 粉パセリ: { review: '乾パセリ' }, 粉ピーナッツ: { review: '落花生加工' },
  // 既マップ食材の細かな別表記・一般食材（長い裾）
  まいたけ: { code: '08028' }, 南瓜: { code: '06048' }, かいわれ大根: { code: '06128' }, サニーレタス: { code: '06315' },
  甜麺醤: { code: '17106' }, 長なす: { code: '06191' }, しらたき: { code: '02005' }, ウスターソース: { code: '17001' },
  ゴマ: { code: '05018' }, 角チーズ: { code: '13040' }, 黒砂糖: { code: '03001' }, レーズン: { q: 'ぶどう 干しぶどう', avoid: [] },
  みつば: { q: 'みつば 糸みつば 葉 生', avoid: [] }, 三つ葉: { q: 'みつば 糸みつば 葉 生', avoid: [] },
  アボカド: { q: 'アボカド 生', avoid: [] }, マッシュルーム: { q: 'マッシュルーム 生', avoid: [] },
  さわら: { q: 'さわら 生', avoid: [] }, ぜんまい: { q: 'ぜんまい 生ぜんまい 若芽 生', avoid: [] },
  ししとう: { q: 'ししとう 果実 生', avoid: [] }, ホタテ: { q: 'ほたてがい 生', avoid: [] }, たらこ: { q: 'たらこ 生', avoid: [] },
  いか: { q: 'するめいか 生', avoid: [] }, するめ: { q: 'するめ', avoid: [] }, かつお: { q: 'かつお 春獲り 生', avoid: [] },
  えび: { q: 'バナメイえび 養殖 生', avoid: [] }, みょうが: { q: 'みょうが 花穂 生', avoid: [] }, あおさ: { q: 'あおさ 素干し', avoid: [] },
  オリーブ油: { q: 'オリーブ油', avoid: [] }, レモン汁: { q: 'レモン 果汁 生', avoid: [] }, かぼす汁: { q: 'かぼす 果汁', avoid: [] },
  すし酢: { code: '17016' }, ご飯: { skip: '主食グラム未登録・主食目安kcalで別計上' }, 野沢菜: { q: 'のざわな 漬物 塩漬', avoid: [] },
  だし昆布: { q: 'まこんぶ 素干し', avoid: [] }, 岩ノリ: { q: 'いわのり 素干し', avoid: [] },
  金時豆: { code: '04008' }, 栗: { code: '05011' },
}
Object.assign(MAP, EXT)

// 非食品（数値ゴミ等）
const SKIP_RE = /^[\d.．，,／/]+(個|本|枚|g|ｇ|cc|ｃｃ)?$/
const HARD_SKIP = new Set(['水', '２個', 'ドレ'])

const used = live.filter((r) => r.uses > 0)
const out = {} // name -> { food_code, food_name, kcal } or null
const review = []
let auto = 0, manual = 0, skipped = 0

for (const r of used) {
  const name = r.name
  const m = MAP[name]
  if (SKIP_RE.test(name) || name === '水') {
    skipped++; review.push([name, r.uses, 'SKIP(非食品)', '', '']); continue
  }
  if (m?.skip) { skipped++; review.push([name, r.uses, 'SKIP', m.skip, '']); continue }
  if (m?.review) { review.push([name, r.uses, 'REVIEW', m.review, '']); continue }
  if (m?.code) {
    const c = byCode.get(m.code)
    if (c) { out[name] = { food_code: c.food_code, food_name: c.food_name, kcal: c.energy_kcal }; auto++
      review.push([name, r.uses, 'CODE', `${c.food_code} ${c.food_name}`, `${c.energy_kcal}kcal`]); continue }
    review.push([name, r.uses, 'CODE-NOTFOUND', m.code, '']); continue
  }
  if (m?.q) {
    const cands = search(m.q, { prefer: m.prefer, avoid: m.avoid })
    if (cands.length) {
      const c = cands[0]
      out[name] = { food_code: c.food_code, food_name: c.food_name, kcal: c.energy_kcal }; auto++
      review.push([name, r.uses, 'AUTO', `${c.food_code} ${c.food_name}`,
        cands.slice(1).map((x) => `${x.food_code} ${x.food_name}`).join(' ｜ ')])
    } else review.push([name, r.uses, 'NOHIT', m.q, ''])
    continue
  }
  // 辞書に無い → 名前そのままで検索（フォールバック）
  const cands = search(name)
  if (cands.length) {
    review.push([name, r.uses, 'GUESS', `${cands[0].food_code} ${cands[0].food_name}`,
      cands.slice(1).map((x) => `${x.food_code} ${x.food_name}`).join(' ｜ ')])
  } else review.push([name, r.uses, 'UNMAPPED', '', ''])
}

manual = review.filter((x) => ['REVIEW', 'GUESS', 'NOHIT', 'UNMAPPED', 'CODE-NOTFOUND'].includes(x[2])).length
writeFileSync(join(ROOT, 'data', 'ingredient_code_map.json'), JSON.stringify(out, null, 2))
writeFileSync(
  join(ROOT, 'data', 'match_review.tsv'),
  '食材\t使用\t判定\t採用/候補1\t候補2-3\n' + review.map((r) => r.join('\t')).join('\n')
)
console.log(`使用食材 ${used.length}　→　採用 ${auto}　スキップ ${skipped}　要レビュー ${manual}`)
console.log('--- 要レビュー/推測 ---')
for (const r of review.filter((x) => ['REVIEW', 'GUESS', 'NOHIT', 'UNMAPPED', 'CODE-NOTFOUND'].includes(x[2])))
  console.log(` [${r[2]}] ${r[0]}(${r[1]}x) ${r[3]}`)
