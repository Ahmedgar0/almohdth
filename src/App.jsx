import { useEffect, useState } from 'react'
import { api, IS_DEMO, DEFAULT_SETTINGS, getCustomer, onCustomer, setCustomer } from './lib/api'
import OrderWizard from './pages/customer/OrderWizard'
import MyOrders from './pages/customer/MyOrders'
import CustomerLayout from './pages/customer/CustomerLayout'
import StaffApp from './pages/staff/StaffApp'

const ROUTES = ['order', 'orders', 'admin', 'fair']
const current = () => {
  let h = (location.hash || '').replace('#', '')
  if (h === 'track') h = 'orders'
  return ROUTES.includes(h) ? h : 'order'
}

export default function App() {
  const [route, setRoute] = useState(current)
  const [settings, setSettings] = useState(DEFAULT_SETTINGS)
  const [session, setSession] = useState(undefined) // جلسة الفريق
  const [customer, setCust] = useState(getCustomer) // حساب العميل (رقم الجوال)

  useEffect(() => {
    const on = () => {
      setRoute(current())
      window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])

  const reloadSettings = () => api.getSettings().then(setSettings).catch(() => {})

  useEffect(() => {
    reloadSettings()
    api.getSession().then((s) => setSession(s || null))
    const a = api.onAuth((s) => setSession(s || null))
    const b = onCustomer(setCust)
    return () => { a(); b() }
  }, [])

  const staff = route === 'admin' || route === 'fair'

  return (
    <>
      {IS_DEMO && (
        <div className="demo-bar">
          نسخة تجريبية: البيانات في متصفحك فقط. جرّب الواجهات:
          <a href="#order">العميل</a>·<a href="#admin">الإدارة</a>·<a href="#fair">المعرض</a>·
          <button onClick={() => { api.resetDemo(); api.signOut(); setCustomer(null); location.reload() }}>إعادة البيانات</button>
        </div>
      )}
      {staff ? (
        session === undefined ? null : <StaffApp mode={route} session={session} settings={settings} onSettingsSaved={reloadSettings} />
      ) : (
        <CustomerLayout route={route} settings={settings} customer={customer}>
          {route === 'order' && <OrderWizard settings={settings} customer={customer} />}
          {route === 'orders' && <MyOrders customer={customer} />}
        </CustomerLayout>
      )}
    </>
  )
}
