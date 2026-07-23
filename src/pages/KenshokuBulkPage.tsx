import { emptyKenshoku, mergeKenshoku, applyKenshokuAuto } from '../lib/reports'
import ReportBulkPage from './ReportBulkPage'
import Kenshoku from './reports/Kenshoku'

// 検食簿: 記入モード（単日・前日/当日/翌日）／印刷モード（期間・一括補完）。画面枠は ReportBulkPage に共通化。
export default function KenshokuBulkPage() {
  return (
    <ReportBulkPage
      title="検食簿"
      pageClass="kenshoku-page"
      column="kenshoku"
      empty={emptyKenshoku}
      merge={mergeKenshoku}
      applyAuto={applyKenshokuAuto}
      renderForm={(d, editable, bulk, reload) => (
        <Kenshoku data={d} editable={editable} reload={reload} bulk={bulk} date={d.menu_date} pickSets={[]} pickSnacks={[]} />
      )}
    />
  )
}
