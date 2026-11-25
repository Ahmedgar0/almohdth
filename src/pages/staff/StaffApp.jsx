import { useEffect, useState } from 'react'
import { api, IS_DEMO, DEMO_EMAILS } from '../../lib/api'
import { Loading } from '../../components/ui'
import StaffLogin from '../../components/StaffLogin'
import AdminApp from './admin/AdminApp'
import FairApp from './fair/FairApp'
import logo from '../../assets/logo.png'

export default function StaffApp({ mode, session, settings, onSettingsSaved }) {
  const [role, setRole] = useState(undefined)

  useEffect(() => {
    if (!session) return setRole(undefined)
    setRole(undefined)
    api.staffRole().then((r) => setRole(r || null))
  }, [session])

  if (!session) {
    const fair = mode === 'fair'
    return (
      <div className="auth-wrap">
        <div className="auth-band"><img className="logo logo-white" src={logo} alt={settings.store_name} /></div>
        <div className="auth-body">
          <StaffLogin title={fair ? 'دخول فريق المعرض' : 'دخول فريق الإدارة'} demoEmail={fair ? DEMO_EMAILS.fair : DEMO_EMAILS.admin} />
        </div>
      </div>
    )
  }
  if (role === undefined) return <Loading />
  if (!role) {
    return (
      <div className="auth-wrap">
        <div className="auth-band"><img className="logo logo-white" src={logo} alt={settings.store_name} /></div>
        <div className="auth-body">
          <div className="c-card auth-card"><div className="c-card-body stack">
            <h2 style={{ fontSize: '1.25rem' }}>هذا البريد غير مضاف إلى الفريق</h2>
            <p className="muted">البريد <b className="ltr">{session.user?.email}</b> ليس في قائمة الفريق، أو أُزيل منها. راجع الإدارة.</p>
            {IS_DEMO && <p className="hint">للتجربة: {DEMO_EMAILS.admin} للإدارة، و{DEMO_EMAILS.fair} للمعرض.</p>}
            <button className="btn" onClick={() => api.signOut()}>الدخول ببريد آخر</button>
          </div></div>
        </div>
      </div>
    )
  }
  if (mode === 'admin' && role === 'admin') return <AdminApp session={session} settings={settings} onSettingsSaved={onSettingsSaved} />
  return <FairApp session={session} settings={settings} role={role} />
}
