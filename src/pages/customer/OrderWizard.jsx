import { useEffect, useMemo, useRef, useState } from 'react'
import { api, setCustomer, getLastAddress, saveLastAddress } from '../../lib/api'
import { countryName, normalizeShortAddress, validShortAddress } from '../../lib/countries'
import { feeDescription, feeKnownUpfront } from '../../lib/fees'
import { compressImage } from '../../lib/image'
import { CARRIERS, sar, num } from '../../lib/format'
import { Icon, Spinner, WaIcon } from '../../components/ui'
import CustomerLogin from '../../components/CustomerLogin'

const MAX_BOOKS = 30
const OTHER = '__other__'
const DRAFT = 'fair-order-draft-v1'
let seq = 0
const newBook = (b = {}) => ({ key: ++seq, title: '', author: '', publisher_id: '', publisher_other: '', quantity: 1, accept_alternative: false, image: null, imageError: '', ...b })

function loadDraft() {
  try {
    const d = JSON.parse(localStorage.getItem(DRAFT) || 'null')
    if (d?.books?.length) return d.books.map((b) => newBook({ ...b, image: null }))
  } catch {
    /* */
  }
  return [newBook()]
}

export default function OrderWizard({ settings, customer }) {
  if (!customer) {
    return (
      <CustomerLogin
        title="ادخل لتبدأ طلبك"
        subtitle="اسمك ورقم جوالك فقط. نرسل لك الأسعار ورابط الدفع على واتساب بهذا الرقم."
      />
    )
  }
  if (!settings.accepting_orders) {
    return (
      <div className="c-card"><div className="empty"><h3>استقبال الطلبات متوقف حالياً</h3><p>تابعنا لمعرفة موعد فتح الطلبات من جديد.</p></div></div>
    )
  }
  return <Wizard key={customer.dial + customer.phone} settings={settings} customer={customer} />
}

function Wizard({ settings, customer }) {
  const [step, setStep] = useState(1)
  const [publishers, setPublishers] = useState([])
  const [books, setBooks] = useState(loadDraft)
  const accountKey = `${customer.dial}${customer.phone}`
  const [c, setC] = useState(() => {
    const last = getLastAddress(accountKey) || {}
    return {
      name: customer.name || '', country: customer.country, short_address: last.short_address || '', city: last.city || '',
      address_line: last.address_line || '', postal_code: last.postal_code || '', address_notes: last.address_notes || '',
      carrier: last.carrier || '', notes: '', agree: false, honey: '',
    }
  })
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [done, setDone] = useState(null)
  const top = useRef(null)

  useEffect(() => {
    api.listPublishers().then(setPublishers).catch(() => setPublishers([]))
  }, [])

  // حفظ مسودة الكتب حتى لا تضيع عند تحديث الصفحة
  useEffect(() => {
    try {
      localStorage.setItem(DRAFT, JSON.stringify({ books: books.map(({ image, imageError, key, ...b }) => b) }))
    } catch {
      /* */
    }
  }, [books])

  const isSA = c.country === 'SA'
  const carrier = isSA ? c.carrier : 'dhl'
  const shipCost = carrier === 'redbox' ? settings.ship_redbox : carrier === 'smsa' ? settings.ship_smsa : null
  const bookCount = books.reduce((s, b) => s + b.quantity, 0)
  const feeNow = feeKnownUpfront(settings, bookCount)
  const policies = useMemo(() => (settings.policies || '').split('\n').map((s) => s.trim()).filter(Boolean), [settings.policies])
  const pubName = (b) => (b.publisher_id === OTHER ? b.publisher_other : publishers.find((p) => p.id === b.publisher_id)?.name || '')

  const setBook = (key, patch) => setBooks((bs) => bs.map((b) => (b.key === key ? { ...b, ...patch } : b)))
  const set = (k, v) => setC((x) => ({ ...x, [k]: v }))

  async function pickImage(key, file) {
    if (!file) return
    setBook(key, { imageError: '' })
    try {
      const blob = await compressImage(file)
      setBook(key, { image: { blob, preview: URL.createObjectURL(blob) } })
    } catch (e) {
      setBook(key, { image: null, imageError: e.message })
    }
  }

  function validate(s) {
    const e = {}
    if (s === 1) {
      books.forEach((b) => {
        if (!b.title.trim()) e[`t${b.key}`] = 'اكتب اسم الكتاب'
        if (!b.publisher_id) e[`p${b.key}`] = 'اختر دار النشر'
        else if (b.publisher_id === OTHER && !b.publisher_other.trim()) e[`p${b.key}`] = 'اكتب اسم دار النشر'
      })
    }
    if (s === 2) {
      if (c.name.trim().length < 3) e.name = 'اكتب اسمك الكامل'
      if (isSA) {
        if (!validShortAddress(normalizeShortAddress(c.short_address))) e.short_address = 'العنوان المختصر 4 أحرف ثم 4 أرقام، مثل RRRD2929'
        if (!c.carrier) e.carrier = 'اختر شركة الشحن'
      } else {
        if (!c.city.trim()) e.city = 'اكتب المدينة'
        if (c.address_line.trim().length < 6) e.address_line = 'اكتب العنوان بالتفصيل'
      }
    }
    if (s === 3 && !c.agree) e.agree = 'وافق على سياسات الخدمة لإرسال الطلب'
    return e
  }

  function go(next) {
    if (next > step) {
      for (let s = step; s < next; s++) {
        const e = validate(s)
        if (Object.keys(e).length) {
          setErrors(e)
          setStep(s)
          requestAnimationFrame(() => document.querySelector('.invalid, .error')?.scrollIntoView({ block: 'center', behavior: 'smooth' }))
          return
        }
      }
    }
    setErrors({})
    setStep(next)
    requestAnimationFrame(() => top.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  async function submit() {
    setSubmitError('')
    if (c.honey) return
    const e = validate(3)
    setErrors(e)
    if (Object.keys(e).length) return
    setBusy(true)
    try {
      const items = []
      for (const b of books) {
        const image_path = b.image ? await api.uploadImage(b.image.blob) : null
        const pub = publishers.find((p) => p.id === b.publisher_id)
        items.push({
          title: b.title.trim(), author: b.author.trim() || null, publisher_id: pub ? pub.id : null,
          publisher_name: pub ? pub.name : b.publisher_other.trim(), quantity: b.quantity, accept_alternative: b.accept_alternative, image_path,
        })
      }
      const phone = customer.phone
      const res = await api.submitOrder({
        customer_name: c.name.trim(), country: customer.country, phone_dial: customer.dial, phone,
        short_address: isSA ? normalizeShortAddress(c.short_address) : null,
        city: isSA ? null : c.city.trim(), address_line: isSA ? null : c.address_line.trim(),
        postal_code: isSA ? null : c.postal_code.trim() || null, address_notes: c.address_notes.trim() || null,
        shipping_carrier: carrier,
        customer_notes: c.notes.trim() || null, items,
      })
      try { localStorage.removeItem(DRAFT) } catch { /* */ }
      saveLastAddress({ key: accountKey, short_address: c.short_address, city: c.city, address_line: c.address_line, postal_code: c.postal_code, address_notes: c.address_notes, carrier: isSA ? c.carrier : '' })
      if (c.name.trim() !== customer.name) setCustomer({ ...customer, name: c.name.trim() })
      setDone({ order_no: res.order_no, phone: `+${customer.dial} ${phone}` })
      window.scrollTo({ top: 0 })
    } catch (err) {
      setSubmitError(err.message || 'تعذّر إرسال الطلب، حاول مرة أخرى')
    } finally {
      setBusy(false)
    }
  }

  if (done) return <Success done={done} onNew={() => { setDone(null); setBooks([newBook()]); setStep(1); set('agree', false); set('notes', '') }} />

  const STEPS = [[1, 'الكتب'], [2, 'العنوان والشحن'], [3, 'المراجعة والإرسال']]

  return (
    <div className="c-grid" ref={top} style={{ scrollMarginTop: 12 }}>
      <div className="c-card">
        <nav className="steps" aria-label="مراحل الطلب">
          {STEPS.map(([n, t]) => (
            <button key={n} type="button" className={step === n ? 'on' : step > n ? 'done' : ''} onClick={() => go(n)} aria-current={step === n ? 'step' : undefined}>
              <span className="n">{step > n ? <Icon name="check" size={14} stroke={2.5} /> : n}</span>
              <span className="t">{t}</span>
            </button>
          ))}
        </nav>

        <div className="c-card-body">
          <div className="honey" aria-hidden="true"><input tabIndex={-1} autoComplete="off" value={c.honey} onChange={(e) => set('honey', e.target.value)} /></div>

          {step === 1 && (
            <div className="stack-lg">
              <div>
                <h2 style={{ fontSize: '1.2rem' }}>ما الكتب التي تريدها؟</h2>
                <p className="muted" style={{ marginTop: 4 }}>اسم الكتاب ودار النشر يكفيان. الصورة تساعد فريقنا في المعرض على إيجاد الطبعة نفسها.</p>
              </div>
              {books.map((b, idx) => (
                <BookCard key={b.key} b={b} idx={idx} total={books.length} publishers={publishers} errors={errors}
                  onChange={(p) => setBook(b.key, p)} onRemove={() => setBooks((bs) => bs.filter((x) => x.key !== b.key))} onImage={(f) => pickImage(b.key, f)} />
              ))}
              {books.length < MAX_BOOKS && (
                <button type="button" className="add-book" onClick={() => setBooks((bs) => [...bs, newBook()])}>
                  <Icon name="plus" /> إضافة كتاب آخر
                </button>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="stack-lg">
              <section className="stack">
                <h2 style={{ fontSize: '1.2rem' }}>بياناتك</h2>
                <div className="grid-2">
                  <Field label="الاسم الكامل" req error={errors.name}>
                    <input className={`input ${errors.name ? 'invalid' : ''}`} value={c.name} maxLength={100} autoComplete="name" onChange={(e) => set('name', e.target.value)} />
                  </Field>
                  <div className="field">
                    <span className="label">جوال واتساب (حسابك)</span>
                    <div className="phone">
                      <span className="dial">+{customer.dial}</span>
                      <input className="input" value={customer.phone} disabled />
                    </div>
                    <span className="hint">نرسل لك الأسعار ورابط الدفع عليه. لتغييره <button type="button" className="link" onClick={() => setCustomer(null)}>ادخل برقم آخر</button></span>
                  </div>
                </div>
              </section>

              <section className="stack">
                <h2 style={{ fontSize: '1.2rem' }}>عنوان الشحن</h2>
                {isSA ? (
                  <div className="grid-2">
                    <Field label="العنوان الوطني المختصر" req error={errors.short_address} hint={!errors.short_address && 'تجده في تطبيق توكلنا أو موقع سبل'}>
                      <input className={`input ltr-in ${errors.short_address ? 'invalid' : ''}`} placeholder="RRRD2929" maxLength={10} value={c.short_address} onChange={(e) => set('short_address', e.target.value.toUpperCase())} />
                    </Field>
                    <Field label="تفاصيل إضافية" opt>
                      <input className="input" value={c.address_notes} maxLength={200} placeholder="رقم الشقة أو علامة مميزة" onChange={(e) => set('address_notes', e.target.value)} />
                    </Field>
                  </div>
                ) : (
                  <div className="grid-2">
                    <Field label="المدينة" req error={errors.city}>
                      <input className={`input ${errors.city ? 'invalid' : ''}`} value={c.city} maxLength={100} onChange={(e) => set('city', e.target.value)} />
                    </Field>
                    <Field label="الرمز البريدي" opt>
                      <input className="input ltr-in" value={c.postal_code} maxLength={20} onChange={(e) => set('postal_code', e.target.value)} />
                    </Field>
                    <div className="span-2">
                      <Field label="العنوان بالتفصيل" req error={errors.address_line}>
                        <input className={`input ${errors.address_line ? 'invalid' : ''}`} value={c.address_line} maxLength={250} placeholder="الحي، الشارع، رقم المبنى والشقة" onChange={(e) => set('address_line', e.target.value)} />
                      </Field>
                    </div>
                  </div>
                )}
              </section>

              <section className="stack">
                <h2 style={{ fontSize: '1.2rem' }}>شركة الشحن</h2>
                {isSA ? (
                  <>
                    <div className="stack" role="radiogroup" aria-label="شركة الشحن">
                      {['redbox', 'smsa'].map((k) => (
                        <label key={k} className={`choice ${c.carrier === k ? 'on' : ''}`}>
                          <input type="radio" name="carrier" checked={c.carrier === k} onChange={() => set('carrier', k)} />
                          <span className="dot" />
                          <span>
                            <span className="strong">{CARRIERS[k].name}</span>
                            <span className="muted small" style={{ display: 'block' }}>{CARRIERS[k].desc}</span>
                          </span>
                          <span className="price">{sar(k === 'redbox' ? settings.ship_redbox : settings.ship_smsa)}</span>
                        </label>
                      ))}
                    </div>
                    {errors.carrier && <span className="error">{errors.carrier}</span>}
                    {c.carrier === 'redbox' && (
                      <p className="hint">يصلك من ريدبوكس رابط لاختيار الخزانة الأقرب لك بعد شحن الطلب.</p>
                    )}
                  </>
                ) : (
                  <div className="choice on" style={{ cursor: 'default' }}>
                    <span className="dot" />
                    <span>
                      <span className="strong">DHL</span>
                      <span className="muted small" style={{ display: 'block' }}>الشحن الوحيد المتاح إلى {countryName(c.country)}. نحدد تكلفته بعد تسعير الطلب حسب الوزن، ونرسلها لك قبل الدفع.</span>
                    </span>
                  </div>
                )}
              </section>
            </div>
          )}

          {step === 3 && (
            <div className="stack-lg">
              <h2 style={{ fontSize: '1.2rem' }}>راجع طلبك قبل الإرسال</h2>
              <div className="review-block">
                <h3>الكتب <button className="link small" onClick={() => go(1)}>تعديل</button></h3>
                <table className="table">
                  <tbody>
                    {books.map((b) => (
                      <tr key={b.key}>
                        <td>
                          <div className="strong">{b.title}</div>
                          <div className="muted small">{[b.author, pubName(b)].filter(Boolean).join('، ')}{b.accept_alternative ? '، يقبل طبعة أخرى' : ''}</div>
                        </td>
                        <td className="end muted nowrap">{b.quantity} {b.quantity === 1 ? 'نسخة' : 'نسخ'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="review-block">
                <h3>الشحن إلى <button className="link small" onClick={() => go(2)}>تعديل</button></h3>
                <p>{c.name}، <span className="ltr">+{customer.dial} {customer.phone}</span></p>
                <p className="muted">{isSA ? <span className="ltr">{normalizeShortAddress(c.short_address)}</span> : [c.address_line, c.city, countryName(c.country)].join('، ')}{c.address_notes ? `، ${c.address_notes}` : ''}</p>
                <p className="muted">عبر {CARRIERS[carrier]?.name}{shipCost != null ? ` (${sar(shipCost)})` : '، التكلفة بعد التسعير'}</p>
              </div>

              <div className="notice brand">
                <Icon name="info" />
                <div>
                  <b>كيف يُحسب المبلغ؟</b> قيمة الكتب كما يسعّرها فريقنا في المعرض، ثم رسوم الخدمة ({feeDescription(settings, bookCount)})، ثم الشحن. رسوم الخدمة منفصلة عن قيمة الكتب. يصلك المبلغ الكامل ورابط الدفع على واتساب قبل أن نشتري أي كتاب.
                </div>
              </div>

              {policies.length > 0 && (
                <div>
                  <h3 style={{ fontSize: '1rem', marginBottom: 8 }}>سياسات الخدمة</h3>
                  <ul className="policies">{policies.map((p, i) => <li key={i}>{p}</li>)}</ul>
                </div>
              )}

              <Field label="ملاحظات لفريقنا" opt>
                <textarea className="input" value={c.notes} maxLength={500} onChange={(e) => set('notes', e.target.value)} />
              </Field>

              <div>
                <label className="check">
                  <input type="checkbox" checked={c.agree} onChange={(e) => set('agree', e.target.checked)} />
                  <span>قرأت سياسات الخدمة وأوافق عليها، وأعلم أن رسوم الخدمة منفصلة عن قيمة الكتب.</span>
                </label>
                {errors.agree && <div className="error" style={{ marginTop: 6 }}>{errors.agree}</div>}
              </div>
              {submitError && <div className="notice bad">{submitError}</div>}
            </div>
          )}
        </div>

        <div className="c-foot">
          {step > 1 ? <button className="btn btn-quiet" onClick={() => go(step - 1)}><Icon name="back" /> السابق</button> : <span />}
          {step < 3 ? (
            <button className="btn btn-primary btn-lg" onClick={() => go(step + 1)}>التالي <Icon name="arrow" /></button>
          ) : (
            <button className="btn btn-primary btn-lg" onClick={submit} disabled={busy}>{busy ? <><Spinner /> جارٍ الإرسال</> : 'إرسال الطلب'}</button>
          )}
        </div>
      </div>

      <aside className="c-aside">
        <div className="c-card summary"><div className="c-card-body">
          <h3>ملخص طلبك</h3>
          <ul className="books">
            {books.filter((b) => b.title.trim()).map((b) => (
              <li key={b.key}><span>{b.title}</span><span className="muted">×{b.quantity}</span></li>
            ))}
            {!books.some((b) => b.title.trim()) && <li className="muted">لم تُضف كتباً بعد</li>}
          </ul>
          <div className="line"><span>عدد النسخ</span><span className="num">{num(bookCount)}</span></div>
          <div className="line"><span>قيمة الكتب</span><span className="muted">بعد التسعير</span></div>
          <div className="line"><span>رسوم الخدمة</span><span>{feeNow != null ? sar(feeNow) : <span className="muted">{num(settings.fee_percent)}٪ من القيمة</span>}</span></div>
          <div className="line"><span>الشحن{carrier ? ` (${CARRIERS[carrier].name})` : ''}</span><span>{shipCost != null ? sar(shipCost) : <span className="muted">{carrier === 'dhl' ? 'بعد التسعير' : 'اختر الشركة'}</span>}</span></div>
          <div className="notice wa" style={{ marginTop: 14 }}>
            <WaIcon />
            <span className="small">يصلك المبلغ الكامل ورابط الدفع على واتساب بعد التسعير.</span>
          </div>
        </div></div>
      </aside>
    </div>
  )
}

function Field({ label, req, opt, error, hint, children }) {
  return (
    <label className="field">
      <span className="label">{label} {req && <span className="req">*</span>}{opt && <span className="opt">(اختياري)</span>}</span>
      {children}
      {error ? <span className="error">{error}</span> : hint ? <span className="hint">{hint}</span> : null}
    </label>
  )
}

function BookCard({ b, idx, total, publishers, errors, onChange, onRemove, onImage }) {
  const et = errors[`t${b.key}`]
  const ep = errors[`p${b.key}`]
  return (
    <div className="book">
      <div className="book-head">
        <h3>الكتاب {idx + 1}</h3>
        {total > 1 && <button type="button" className="btn btn-quiet btn-sm btn-danger" onClick={onRemove}>حذف</button>}
      </div>
      <div className="grid-2">
        <Field label="اسم الكتاب" req error={et}>
          <input className={`input ${et ? 'invalid' : ''}`} value={b.title} maxLength={200} onChange={(e) => onChange({ title: e.target.value })} />
        </Field>
        <Field label="دار النشر" req error={b.publisher_id !== OTHER ? ep : null}>
          <select className={`input ${ep && b.publisher_id !== OTHER ? 'invalid' : ''}`} value={b.publisher_id} onChange={(e) => onChange({ publisher_id: e.target.value })}>
            <option value="">اختر دار النشر</option>
            {publishers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            <option value={OTHER}>دار غير موجودة في القائمة</option>
          </select>
        </Field>
        {b.publisher_id === OTHER && (
          <div className="span-2">
            <Field label="اسم دار النشر" req error={ep}>
              <input className={`input ${ep ? 'invalid' : ''}`} value={b.publisher_other} maxLength={150} onChange={(e) => onChange({ publisher_other: e.target.value })} />
            </Field>
          </div>
        )}
        <Field label="المؤلف" opt>
          <input className="input" value={b.author} maxLength={150} onChange={(e) => onChange({ author: e.target.value })} />
        </Field>
        <div className="field">
          <span className="label">عدد النسخ</span>
          <div className="stepper-num">
            <button type="button" aria-label="زيادة" onClick={() => onChange({ quantity: Math.min(20, b.quantity + 1) })}>+</button>
            <span>{b.quantity}</span>
            <button type="button" aria-label="إنقاص" onClick={() => onChange({ quantity: Math.max(1, b.quantity - 1) })}>−</button>
          </div>
        </div>
        <div className="field span-2">
          <span className="label">صورة الغلاف <span className="opt">(اختياري)</span></span>
          <div className="img-pick">
            <div className="ph">{b.image ? <img src={b.image.preview} alt="" /> : <Icon name="image" size={22} />}</div>
            <label className="btn btn-sm file-btn">
              {b.image ? 'تغيير الصورة' : 'إضافة صورة'}
              <input type="file" accept="image/*" onChange={(e) => onImage(e.target.files?.[0])} />
            </label>
            {b.image && <button type="button" className="btn btn-quiet btn-sm btn-danger" onClick={() => onChange({ image: null })}>إزالة</button>}
          </div>
          {b.imageError && <span className="error">{b.imageError}</span>}
        </div>
      </div>
      <label className="check" style={{ marginTop: 14 }}>
        <input type="checkbox" checked={b.accept_alternative} onChange={(e) => onChange({ accept_alternative: e.target.checked })} />
        <span>أقبل طبعة أخرى من الكتاب إن لم تتوفر المطلوبة</span>
      </label>
    </div>
  )
}

function Success({ done, onNew }) {
  return (
    <div className="c-card" style={{ maxWidth: 640, margin: '0 auto' }}>
      <div className="c-card-body" style={{ textAlign: 'center' }}>
        <h2 style={{ fontSize: '1.5rem' }}>وصلنا طلبك</h2>
        <div className="success-no">{done.order_no}</div>
        <p className="muted">رقم طلبك. تجده دائماً في صفحة «طلباتي».</p>
        <ol className="timeline" style={{ textAlign: 'start', margin: '24px auto', maxWidth: 380 }}>
          <li className="now">فريقنا في المعرض يسعّر كتبك</li>
          <li>نرسل لك المبلغ الكامل ورابط الدفع على واتساب <span className="ltr">{done.phone}</span></li>
          <li>نشتري الكتب بعد الدفع</li>
          <li>نغلّفها ونشحنها إليك</li>
        </ol>
        <div className="row" style={{ justifyContent: 'center' }}>
          <a className="btn btn-primary" href="#orders">طلباتي</a>
          <button className="btn" onClick={onNew}>طلب جديد</button>
        </div>
      </div>
    </div>
  )
}
