import { useState } from 'react'
import { setCustomer, IS_DEMO, DEMO_CUSTOMER } from '../lib/api'
import { COUNTRIES, findCountry, normalizePhone, validatePhone } from '../lib/countries'

// دخول العميل: الاسم ورقم الجوال فقط. رقم الجوال هو حسابه
export default function CustomerLogin({ title, subtitle }) {
  const [name, setName] = useState('')
  const [country, setCountry] = useState('SA')
  const [phone, setPhone] = useState('')
  const [err, setErr] = useState({})
  const c = findCountry(country) || COUNTRIES[0]
  const isSA = country === 'SA'

  function go(e) {
    e.preventDefault()
    const ph = normalizePhone(phone, c.dial)
    const x = {}
    if (name.trim().length < 3) x.name = 'اكتب اسمك الكامل'
    if (!validatePhone(ph, country)) x.phone = isSA ? 'رقم الجوال يبدأ بـ 5 ويتكون من 9 أرقام' : 'اكتب رقم الجوال بدون مفتاح الدولة'
    setErr(x)
    if (Object.keys(x).length) return
    setCustomer({ name: name.trim(), country, dial: c.dial, phone: ph })
  }

  return (
    <div className="c-card auth-card">
      <form className="c-card-body stack" onSubmit={go} noValidate>
        <div>
          <h2 style={{ fontSize: '1.3rem' }}>{title}</h2>
          {subtitle && <p className="muted" style={{ marginTop: 6 }}>{subtitle}</p>}
        </div>
        <label className="field">
          <span className="label">الاسم الكامل</span>
          <input className={`input ${err.name ? 'invalid' : ''}`} autoComplete="name" value={name} maxLength={100} onChange={(e) => setName(e.target.value)} />
          {err.name && <span className="error">{err.name}</span>}
        </label>
        <div className="stack">
          <label className="field">
            <span className="label">الدولة</span>
            <select className="input" value={country} onChange={(e) => setCountry(e.target.value)}>
              {COUNTRIES.map((x) => <option key={x.code} value={x.code}>{x.name}</option>)}
            </select>
          </label>
          <label className="field">
            <span className="label">جوال واتساب</span>
            <div className="phone">
              <span className="dial">+{c.dial}</span>
              <input className={`input ${err.phone ? 'invalid' : ''}`} inputMode="tel" autoComplete="tel-national" placeholder={isSA ? '5XXXXXXXX' : ''} value={phone} maxLength={18} onChange={(e) => setPhone(e.target.value)} />
            </div>
          </label>
        </div>
        {err.phone && <span className="error">{err.phone}</span>}
        <button className="btn btn-primary btn-lg btn-block">دخول</button>
        <p className="hint">رقم جوالك هو حسابك: تجد طلباتك كلها بالدخول به من أي جهاز، ونتواصل معك عليه عبر واتساب.</p>
        {IS_DEMO && <p className="hint">للتجربة: استخدم الرقم {DEMO_CUSTOMER.phone} لترى طلبات سابقة.</p>}
      </form>
    </div>
  )
}
