import type { ReactNode } from 'react'
import { HashRouter, Routes, Route, NavLink } from 'react-router-dom'
import MenuSetListPage from './pages/MenuSetListPage'
import MenuSetDetailPage from './pages/MenuSetDetailPage'
import SimpleListPage from './pages/SimpleListPage'
import NewMenuSetPage from './pages/NewMenuSetPage'
import DailyMenuListPage from './pages/DailyMenuListPage'
import DailyMenuPage from './pages/DailyMenuPage'
import KondateBulkPage from './pages/KondateBulkPage'
import WorkBulkPage from './pages/WorkBulkPage'
import SimulatePage from './pages/SimulatePage'
import LoginPage from './pages/LoginPage'
import LoginBar from './components/LoginBar'
import { useAuth } from './hooks/useAuth'

function Tab({ to, children }: { to: string; children: ReactNode }) {
  return (
    <NavLink
      to={to}
      end
      className={({ isActive }) =>
        `inline-flex items-center min-h-[44px] px-4 text-sm font-medium border-b-2 ${
          isActive ? 'border-emerald-600 text-emerald-700' : 'border-transparent text-slate-500'
        }`
      }
    >
      {children}
    </NavLink>
  )
}

function Nav() {
  return (
    <nav className="bg-white border-b flex gap-1 px-2 print:hidden">
      <Tab to="/">献立一覧</Tab>
      <Tab to="/days">作業指示書</Tab>
      <Tab to="/work-print">作業指示書印刷</Tab>
      <Tab to="/kondate">献立掲示</Tab>
      <Tab to="/simulate">シミュ</Tab>
    </nav>
  )
}

// 認証ゲート: ready 待ち→未ログインは LoginPage→ログイン済みのみアプリ本体
function AppShell() {
  const { session, ready } = useAuth()
  if (!ready) {
    return <div className="min-h-screen bg-slate-100 flex items-center justify-center text-slate-400">読み込み中…</div>
  }
  if (!session) {
    return <LoginPage />
  }
  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      <header className="bg-emerald-700 text-white px-4 py-3 shadow print:hidden flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold">厨房メニュー管理</h1>
          <p className="text-emerald-100 text-xs">ラウレアハレ厨房</p>
        </div>
        <LoginBar />
      </header>
      <Nav />
      {/* 画面は max-w-5xl 中央。印刷時のみ上限解除＝A3献立表を用紙幅いっぱいに（A4帳票は元々用紙幅で頭打ちのため影響なし。paddingは触らずA4帳票を完全保護） */}
      <main className="p-3 max-w-5xl mx-auto print:max-w-none">
        <Routes>
          <Route path="/" element={<MenuSetListPage />} />
          <Route path="/set/:id" element={<MenuSetDetailPage />} />
          <Route path="/snacks" element={<SimpleListPage type="snack" title="おやつ" />} />
          <Route path="/sides" element={<SimpleListPage type="side" title="副菜" />} />
          <Route path="/days" element={<DailyMenuListPage />} />
          <Route path="/day/:date" element={<DailyMenuPage />} />
          <Route path="/kondate" element={<KondateBulkPage />} />
          <Route path="/work-print" element={<WorkBulkPage />} />
          <Route path="/simulate" element={<SimulatePage />} />
          <Route path="/new" element={<NewMenuSetPage />} />
        </Routes>
      </main>
    </div>
  )
}

export default function App() {
  return (
    <HashRouter>
      <AppShell />
    </HashRouter>
  )
}
