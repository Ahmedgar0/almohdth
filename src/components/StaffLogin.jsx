import { useState } from 'react'
import { api, IS_DEMO, DEMO_PASSWORD } from '../lib/api'
import { Spinner } from './ui'

export default function StaffLogin({ title, demoEmail }) {
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  async function go(e) {
    e.preventDefault()
    setErr('')
    if (!email.trim() || !pw) return setErr('اكتب البريد وكلمة المرور')
    setBusy(true)
    try {
      await api.signIn(email.trim().toLowerCase(), pw)
    } catch (x) {
      setErr(x.message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="c-card auth-card">
      <form className="c-card-body stack" onSubmit={go} noValidate>
        <div>
          <h2 style={{ fontSize: '1.3rem' }}>{title}</h2>
          <p className="muted" style={{ marginTop: 6 }}>للفريق فقط. البريد وكلمة المرور يصلانك من الإدارة.</p>
        </div>
        <label className="field">
          <span className="label">البريد الإلكتروني</span>
          <input className="input ltr-in" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="field">
          <span className="label">كلمة المرور</span>
          <input className="input ltr-in" type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} />
        </label>
        {IS_DEMO && <p className="hint">للتجربة: {demoEmail} وكلمة المرور {DEMO_PASSWORD}</p>}
        {err && <div className="notice bad">{err}</div>}
        <button className="btn btn-primary btn-lg btn-block" disabled={busy}>{busy && <Spinner />} دخول</button>
      </form>
    </div>
  )
}
