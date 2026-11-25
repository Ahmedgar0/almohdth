import { useCallback, useEffect, useState } from 'react'
import { api } from '../../../lib/api'
import { Icon, Loading, PasswordDialog, useToast } from '../../../components/ui'
import logo from '../../../assets/logo.png'
import Overview from './Overview'
import OrdersPage from './OrdersPage'
import OrderDrawer from './OrderDrawer'
import Publishers from './Publishers'
import Reports from './Reports'
import Team from './Team'
import Settings from './Settings'

const NAV = [
  ['overview', 'home', 'ما يحتاج إجراءً'],
  ['orders', 'list', 'كل الطلبات'],
  ['publishers', 'store', 'دور النشر والأجنحة'],
  ['reports', 'chart', 'التقارير'],
  ['team', 'users', 'الفريق'],
  ['settings', 'gear', 'الإعدادات'],
]

export default function AdminApp({ session, settings, onSettingsSaved }) {
  const [page, setPage] = useState('overview')
  const [orders, setOrders] = useState(null)
  const [publishers, setPublishers] = useState([])
  const [open, setOpen] = useState(null)
  const [ordersFilter, setOrdersFilter] = useState('all')
  const [err, setErr] = useState('')
  const [pwOpen, setPwOpen] = useState(false)
  const [toast, show] = useToast()

  const reload = useCallback(async () => {
    try {
      const [o, p] = await Promise.all([api.listOrders(), api.listPublishers()])
      setOrders(o)
      setPublishers(p)
      setErr('')
    } catch (e) {
      setErr(e.message || 'تعذّر تحميل الطلبات')
      setOrders((x) => x || [])
    }
  }, [])

  useEffect(() => {
    reload()
    let t
    const unsub = api.subscribe(() => { clearTimeout(t); t = setTimeout(reload, 250) })
    const poll = setInterval(reload, 60000)
    return () => { clearTimeout(t); clearInterval(poll); unsub() }
  }, [reload])

  const needs = orders ? orders.filter((o) => ['priced', 'ready_to_ship'].includes(o.status)).length : 0
  const current = orders?.find((o) => o.id === open) || null
  const showOrders = (f) => { setOrdersFilter(f); setPage('orders') }

  return (
    <div className="s-shell">
      {toast}
      <PasswordDialog open={pwOpen} onSave={(pw) => api.changePassword(pw)} onClose={(ok) => { setPwOpen(false); if (ok) show('تغيّرت كلمة المرور') }} />
      <aside className="s-side">
        <img className="logo logo-white" src={logo} alt={settings.store_name} />
        <div className="who">فريق الإدارة، <span className="ltr">{session.user?.email}</span></div>
        <nav className="s-nav">
          {NAV.map(([k, icon, label]) => (
            <button key={k} className={page === k ? 'on' : ''} onClick={() => setPage(k)} aria-current={page === k ? 'page' : undefined}>
              <Icon name={icon} />
              <span className={k === 'overview' || k === 'orders' ? '' : 'txt-sm-hide'}>{label}</span>
              {k === 'overview' && needs > 0 && <span className="count">{needs}</span>}
            </button>
          ))}
        </nav>
        <div className="foot s-nav">
          <a href="#fair"><Icon name="bag" /><span className="label-txt">واجهة المعرض</span></a>
          <button onClick={() => setPwOpen(true)}><Icon name="gear" /><span className="label-txt">كلمة المرور</span></button>
          <button onClick={() => api.signOut()}><Icon name="logout" /><span className="label-txt">خروج</span></button>
        </div>
      </aside>
      <main className="s-main">
        {err && <div className="notice bad" style={{ marginBottom: 14 }}>{err}</div>}
        {orders === null ? <Loading /> : (
          <>
            {page === 'overview' && <Overview orders={orders} settings={settings} onOpen={setOpen} onShow={showOrders} />}
            {page === 'orders' && <OrdersPage orders={orders} filter={ordersFilter} setFilter={setOrdersFilter} onOpen={setOpen} />}
            {page === 'publishers' && <Publishers publishers={publishers} reload={reload} />}
            {page === 'reports' && <Reports orders={orders} />}
            {page === 'team' && <Team me={session.user?.email} />}
            {page === 'settings' && <Settings settings={settings} onSaved={onSettingsSaved} />}
          </>
        )}
      </main>
      {current && <OrderDrawer key={current.id} o={current} settings={settings} publishers={publishers} reload={reload} onClose={() => setOpen(null)} />}
    </div>
  )
}
