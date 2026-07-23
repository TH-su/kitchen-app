// 検食簿・給食日誌の入力値の型・選択肢・空値ファクトリ・後方互換マージ・時間経過の自動反映。
// 保存先は daily_menus.kenshoku / daily_menus.nisshi（jsonb・様式まるごと1オブジェクト）。
// 数値も string 保持（入力中間状態を許容。表示も string で往復）。
import { todayStr, nowHHMM } from './date'
import { REPORT_INSPECTORS, REPORT_COOKS, DEFAULT_INSPECTOR, DEFAULT_COOK } from './facility'

// ---- 選択肢（正典の順序＝画面/印刷の並び順） ----
// 検食者/調理担当者は環境変数で差し替え可（未設定なら従来の既定値。詳細は lib/facility.ts）
export const K_OPTS = {
  staple: ['ちょうどよい', '硬い', 'やわらかい'],
  taste: ['ちょうどよい', '薄い', '濃い'],
  amount: ['よい', '多い', '少ない'],
  freshness: ['特によい', '良い', '悪い'],
  temp: ['ちょうどよい', '熱い', '冷たい'],
  plating: ['特によい', 'よい', '悪い'],
  foreign: ['なし', 'あり'],
  weather: ['晴れ', '曇り', '雨'],
  inspector: REPORT_INSPECTORS,
  cook: REPORT_COOKS,
} as const
export const N_LEFT = ['多', '少', '無'] as const // おやつ残食 1F/2F

// ---- 検食簿 ----
export interface KenshokuMeal {
  weather: string
  staple: string
  taste: string
  amount: string
  freshness: string
  temp: string
  plating: string
  foreign: string // なし/あり
  foreignNote: string // 「あり」の内容
  inspector: string // 検食者
  cook: string // 調理担当者
  time: string // 検食時間 HH:MM
  note: string // 所見
}
export interface KenshokuSnack {
  inspector: string
  cook: string
  time: string
  note: string
}
export interface KenshokuRecord {
  breakfast: KenshokuMeal
  lunch: KenshokuMeal
  dinner: KenshokuMeal
  snack: KenshokuSnack
}

// ---- 給食日誌 ----
export interface NisshiMeal {
  cook: string // 調理担当者
  tempMain: string // 中心温度 主菜℃
  tempSide: string // 中心温度 副菜℃
  leftover: string // 残食 g
  inspector: string // 検食者
  doneTime: string // 出来上がり時間 HH:MM
  actualCount: string // 実施人数（予定は data.meal_count 自動）
  recorder: string // 検食日誌記録者（調理担当者に連動）
}
export interface NisshiSnack {
  cook: string
  inspector: string
  left1F: string // 残食 1F（多/少/無）
  left2F: string // 残食 2F（多/少/無）
}
export interface NisshiRecord {
  breakfast: NisshiMeal
  lunch: NisshiMeal
  dinner: NisshiMeal
  snack: NisshiSnack
}

// ---- 空値ファクトリ（未入力は '' ＝印刷空欄）。天候/検食者/調理担当者の既定(晴れ/候補先頭)は
//      種付けせず、検食時間到達時の自動反映(kAuto/nAuto)で入る＝未記入日は空欄で印刷される。 ----
export const emptyKMeal = (): KenshokuMeal => ({
  weather: '',
  staple: '',
  taste: '',
  amount: '',
  freshness: '',
  temp: '',
  plating: '',
  foreign: '',
  foreignNote: '',
  inspector: '',
  cook: '',
  time: '',
  note: '',
})
export const emptyKenshoku = (): KenshokuRecord => ({
  breakfast: emptyKMeal(),
  lunch: emptyKMeal(),
  dinner: emptyKMeal(),
  snack: { inspector: '', cook: '', time: '', note: '' },
})

export const emptyNMeal = (): NisshiMeal => ({
  cook: '',
  tempMain: '',
  tempSide: '',
  leftover: '',
  inspector: '',
  doneTime: '',
  actualCount: '',
  recorder: '',
})
export const emptyNisshi = (): NisshiRecord => ({
  breakfast: emptyNMeal(),
  lunch: emptyNMeal(),
  dinner: emptyNMeal(),
  snack: { cook: '', inspector: '', left1F: '', left2F: '' },
})

// ---- 後方互換マージ（保存JSONに欠けキーがあっても既定/空で補完＝様式追加に強い） ----
export const mergeKenshoku = (base: KenshokuRecord, saved: any): KenshokuRecord => ({
  breakfast: { ...base.breakfast, ...(saved?.breakfast ?? {}) },
  lunch: { ...base.lunch, ...(saved?.lunch ?? {}) },
  dinner: { ...base.dinner, ...(saved?.dinner ?? {}) },
  snack: { ...base.snack, ...(saved?.snack ?? {}) },
})
export const mergeNisshi = (base: NisshiRecord, saved: any): NisshiRecord => ({
  breakfast: { ...base.breakfast, ...(saved?.breakfast ?? {}) },
  lunch: { ...base.lunch, ...(saved?.lunch ?? {}) },
  dinner: { ...base.dinner, ...(saved?.dinner ?? {}) },
  snack: { ...base.snack, ...(saved?.snack ?? {}) },
})

// ================= 時間経過による自動反映（当日のみ・未入力欄のみ・先祖返り不可） =================
export const MEAL_THRESHOLD: Record<'breakfast' | 'lunch' | 'dinner', string> = {
  breakfast: '07:50',
  lunch: '11:50',
  dinner: '17:20',
}

// 空判定は '' と null/undefined のみ（'0'＝温度/残食0は入力済み扱いで保護）
export const isEmpty = (v: unknown): boolean => v === '' || v == null
// base の空フィールドにのみ auto を入れる。非空値は絶対に触らない（＝手動保存値は不可侵）
function fillEmpty<T extends object>(base: T, auto: Partial<T>): T {
  const out = { ...base }
  for (const key in auto) {
    if (isEmpty((out as any)[key])) (out as any)[key] = auto[key]
  }
  return out
}

// 検食者(inspector)は食ごとに規定が異なる（昼=既定検食者 独立／朝夕=調理担当者に連動）ため kAuto から
// 分離し、applyKenshokuAuto 側で補完する。ここでは共通項目＋既定の調理担当者のみ。
// 既定の担当者は候補リストの先頭（環境変数 VITE_REPORT_INSPECTORS / VITE_REPORT_COOKS で指定）。
const kAuto = (time: string): Partial<KenshokuMeal> => ({
  time,
  weather: '晴れ',
  staple: 'ちょうどよい',
  taste: 'ちょうどよい',
  temp: 'ちょうどよい',
  amount: 'よい',
  freshness: '特によい',
  plating: '特によい',
  foreign: 'なし',
  cook: DEFAULT_COOK,
})
const nAuto = (doneTime: string): Partial<NisshiMeal> => ({
  doneTime,
  tempMain: '90',
  tempSide: '90',
  inspector: DEFAULT_INSPECTOR,
  cook: DEFAULT_COOK,
  recorder: DEFAULT_COOK,
})

const MEALS = ['breakfast', 'lunch', 'dinner'] as const

// 自動反映の対象範囲。
//   未来日 … 対象外（まだ提供していない日を埋めない。献立は先の日付まで登録済みのため必須のガード）
//   過去日 … 1日が終了済みなので朝昼夕すべてが対象（開いた日にしか埋まらない穴を塞ぐ）
//   当日   … しきい値（提供時刻）を過ぎた食のみ
function autoScope(menuDate: string): { active: boolean; allMeals: boolean } {
  const today = todayStr()
  if (!menuDate || menuDate > today) return { active: false, allMeals: false }
  return { active: true, allMeals: menuDate < today }
}

// editable かつ「未来日でない」日の、対象となる食の「未入力欄のみ」自動反映。
// 判定基準は保存済み saved＝冪等・手動保存値は不可侵（先祖返り防止）。
export function applyKenshokuAuto(saved: KenshokuRecord, menuDate: string, editable: boolean): KenshokuRecord {
  if (!editable) return saved
  const { active, allMeals } = autoScope(menuDate)
  if (!active) return saved
  const t = nowHHMM()
  let next = saved
  for (const m of MEALS) {
    if (!allMeals && t < MEAL_THRESHOLD[m]) continue
    let meal = fillEmpty(next[m], kAuto(MEAL_THRESHOLD[m]))
    // 検食者: 元が未入力の食のみ補完。昼=既定検食者(独立)、朝夕=調理担当者に連動（確定後の cook を写す）。
    if (isEmpty(next[m].inspector)) {
      meal = { ...meal, inspector: m === 'lunch' ? DEFAULT_INSPECTOR : meal.cook }
    }
    next = { ...next, [m]: meal }
  }
  return next
}
export function applyNisshiAuto(saved: NisshiRecord, menuDate: string, editable: boolean): NisshiRecord {
  if (!editable) return saved
  const { active, allMeals } = autoScope(menuDate)
  if (!active) return saved
  const t = nowHHMM()
  let next = saved
  for (const m of MEALS) {
    if (allMeals || t >= MEAL_THRESHOLD[m]) next = { ...next, [m]: fillEmpty(next[m], nAuto(MEAL_THRESHOLD[m])) }
  }
  return next
}

// 施設長 押印の表示判定（時刻計算のみ・保存しない）。夕食提供(17:20)経過で当日押印、過去日は常時、未来日は無し。
export function sealAt(menuDate: string): boolean {
  const today = todayStr()
  if (menuDate < today) return true
  if (menuDate > today) return false
  return nowHHMM() >= MEAL_THRESHOLD.dinner
}
