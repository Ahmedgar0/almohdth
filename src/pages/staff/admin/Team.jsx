import { useEffect, useState } from 'react'
import { api } from '../../../lib/api'
import { Confirm, Loading, useToast } from '../../../components/ui'

const ROLES = {
  admin: ['الإدارة', 'كل الصلاحيات: الطلبات، التواصل مع العملاء، الإعدادات والفريق'],
  fair: ['المعرض', 'التسعير والشراء والتغليف فقط، ولا يرى جوال العميل ولا عنوانه'],
}

export default function Team({ me }) {
  const [list, setList] = useState(null)
  const [m, setM] = useState({ email: '', name: '', role: 'fair', password: '' })
  const [err, setErr] = useState('')
  const [del, setDel] = useState(null)
  const [toast, show] = useToast()
  const reload = () => api.listStaff().then(setList).catch(() => setList([]))
  useEffect(() => { reload() }, [])

  async function add(e) {
    e.preventDefault()
    setErr('')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(m.email.trim())) return setErr('اكتب بريداً صحيحاً')
    if (m.password.length < 8) return setErr('كلمة المرور 8 أحرف على الأقل')
    try {
      const email = m.email.trim().toLowerCase()
      const r = await api.createStaffLogin(email, m.password)
      await api.saveStaff({ email, name: m.name.trim() || null, role: m.role })
      setM({ email: '', name: '', role: 'fair', password: '' })
      reload()
      show(r.existed ? 'أُضيف، وله حساب سابق فيبقى بكلمة مروره القديمة' : 'أُضيف إلى الفريق، أرسل له البريد وكلمة المرور')
    } catch (x) {
      setErr(x.message)
    }
  }

  return (
    <>
      {toast}
      <Confirm open={!!del} title={`إزالة ${del?.name || del?.email}؟`} body="لن يستطيع دخول لوحات الفريق بعد الآن." confirmLabel="إزالة" danger
        onCancel={() => setDel(null)} onConfirm={async () => { await api.removeStaff(del.email); setDel(null); reload() }} />
      <div className="s-head">
        <div>
          <h1>الفريق</h1>
          <p>أنشئ لكل موظف بريداً وكلمة مرور، وأرسلها له مع رابط واجهته. يستطيع تغيير كلمة مروره بعد الدخول.</p>
        </div>
      </div>
      <div className="cols-2">
        <section className="panel">
          <div className="panel-title"><h3>إضافة عضو</h3></div>
          <form className="stack" onSubmit={add}>
            <div className="grid-2">
              <label className="field"><span className="label">البريد</span><input className="input ltr-in" value={m.email} onChange={(e) => setM({ ...m, email: e.target.value })} /></label>
              <label className="field"><span className="label">الاسم <span className="opt">(يظهر في سجل الطلب)</span></span><input className="input" value={m.name} onChange={(e) => setM({ ...m, name: e.target.value })} /></label>
              <label className="field span-2"><span className="label">كلمة المرور</span><input className="input ltr-in" type="text" autoComplete="off" value={m.password} onChange={(e) => setM({ ...m, password: e.target.value })} /><span className="hint">8 أحرف على الأقل</span></label>
            </div>
            {Object.entries(ROLES).map(([k, [l, d]]) => (
              <label key={k} className={`choice ${m.role === k ? 'on' : ''}`}>
                <input type="radio" name="role" checked={m.role === k} onChange={() => setM({ ...m, role: k })} />
                <span className="dot" />
                <span><span className="strong">{l}</span><span className="muted small" style={{ display: 'block' }}>{d}</span></span>
              </label>
            ))}
            {err && <div className="notice bad">{err}</div>}
            <button className="btn btn-primary" style={{ alignSelf: 'flex-start' }}>إضافة</button>
          </form>
          <div className="notice info small" style={{ marginTop: 16 }}>
            <span>رابط الإدارة: <b className="ltr">/#admin</b>، ورابط المعرض: <b className="ltr">/#fair</b> بعد عنوان الموقع.</span>
          </div>
        </section>
        <section className="panel">
          <div className="panel-title"><h3>أعضاء الفريق</h3></div>
          {list === null ? <Loading /> : (
            <table className="table">
              <tbody>
                {list.map((s) => (
                  <tr key={s.email}>
                    <td><div className="strong">{s.name || '—'}</div><div className="muted tiny ltr">{s.email}</div></td>
                    <td>
                      <select className="input sm" style={{ width: 'auto' }} value={s.role} disabled={s.email === me}
                        onChange={async (e) => { await api.saveStaff({ ...s, role: e.target.value }); reload() }} aria-label="الصلاحية">
                        <option value="admin">الإدارة</option>
                        <option value="fair">المعرض</option>
                      </select>
                    </td>
                    <td className="end">{s.email !== me && <button className="btn btn-quiet btn-sm btn-danger" onClick={() => setDel(s)}>إزالة</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </>
  )
}
