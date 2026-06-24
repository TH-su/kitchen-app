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
  const { editable } = useAuth()
  return (
    <nav className="bg-white border-b flex gap-1 px-2 print:hidden">
      <Tab to="/">献立一覧</Tab>
      <Tab to="/days">作業指示書</Tab>
      <Tab to="/work-print">作業指示書印刷</Tab>
      <Tab to="/kondate">献立掲示</Tab>
      <Tab to="/snacks">おやつ</Tab>
      <Tab to="/sides">副菜</Tab>
      {editable && <Tab to="/new">＋新規</Tab>}
    </nav>
  )
}

export default function App() {
  return (
    <HashRouter>
      <div className="min-h-screen bg-slate-50 text-slate-800">
        <header className="bg-emerald-700 text-white px-4 py-3 shadow print:hidden flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold">厨房メニュー管理</h1>
            <p className="text-emerald-100 text-xs">ラウレアハレ厨房</p>
          </div>
          <LoginBar />
        </header>
        <Nav />
        <main className="p-3 max-w-5xl mx-auto">
          <Routes>
            <Route path="/" element={<MenuSetListPage />} />
            <Route path="/set/:id" element={<MenuSetDetailPage />} />
            <Route path="/snacks" element={<SimpleListPage type="snack" title="おやつ" />} />
            <Route path="/sides" element={<SimpleListPage type="side" title="副菜" />} />
            <Route path="/days" element={<DailyMenuListPage />} />
            <Route path="/day/:date" element={<DailyMenuPage />} />
            <Route path="/kondate" element={<KondateBulkPage />} />
            <Route path="/work-print" element={<WorkBulkPage />} />
            <Route path="/new" element={<NewMenuSetPage />} />
          </Routes>
        </main>
      </div>
    </HashRouter>
  )
}
