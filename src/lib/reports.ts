// 検食簿・給食日誌の入力値の型・選択肢・空値ファクトリ・後方互換マージ。
// 保存先は daily_menus.kenshoku / daily_menus.nisshi（jsonb・様式まるごと1オブジェクト）。
// 数値も string 保持（入力中間状態を許容。表示も string で往復）。

// ---- 選択肢（正典の順序＝画面/印刷の並び順） ----
export const K_OPTS = {
  staple: ['ちょうどよい', '硬い', 'やわらかい'],
  taste: ['ちょうどよい', '薄い', '濃い'],
  amount: ['よい', '多い', '少ない'],
  freshness: ['特によい', '良い', '悪い'],
  temp: ['ちょうどよい', '熱い', '冷たい'],
  plating: ['特によい', 'よい', '悪い'],
  foreign: ['なし', 'あり'],
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
  special: string // 特別食対応
  inspector: string // 検食者
  doneTime: string // 出来上がり時間 HH:MM
  actualCount: string // 実施人数（予定は data.meal_count 自動）
  recorder: string // 検食日誌記録者
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

// ---- 空値ファクトリ（全フィールド '' ＝未入力＝印刷空欄） ----
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
  special: '',
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

// ---- 後方互換マージ（保存JSONに欠けキーがあっても空値で補完＝様式追加に強い） ----
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
