import { emptyNisshi, mergeNisshi, applyNisshiAuto } from '../lib/reports'
import ReportBulkPage from './ReportBulkPage'
import Nisshi from './reports/Nisshi'

// 給食日誌: 記入モード（単日・前日/当日/翌日）／印刷モード（期間・一括補完）。画面枠は ReportBulkPage に共通化。
export default function NisshiBulkPage() {
  return (
    <ReportBulkPage
      title="給食日誌"
      pageClass="nisshi-page"
      column="nisshi"
      empty={emptyNisshi}
      merge={mergeNisshi}
      applyAuto={applyNisshiAuto}
      renderForm={(d, editable, bulk, reload) => (
        <Nisshi data={d} editable={editable} reload={reload} bulk={bulk} date={d.menu_date} pickSets={[]} pickSnacks={[]} />
      )}
    />
  )
}
