import { useCallback, useEffect, useMemo, useState } from 'react'
import { api, imageUrl } from '../../../lib/api'
import { normTitle, num, sar, CARRIERS, ago, copies } from '../../../lib/format'
import { Icon, ImageModal, Loading, Confirm, useToast, Spinner, PasswordDialog } from '../../../components/ui'
import logo from '../../../assets/logo.png'

const TABS = [
  ['price', 'tag', 'التسعير'],
  ['buy', 'bag', 'الشراء'],
  ['pack', 'box', 'التغليف'],
]

// تجميع الكتب حسب الجناح ثم حسب العنوان، حتى يُسعَّر الكتاب المطلوب في عدة طلبات مرة واحدة
function group(board, publishersById, orderOk, itemOpen, itemDone) {
  const pubs = new Map()
  for (const o of board) {
    if (!orderOk(o)) continue
    for (const i of o.items) {
      const open = itemOpen(i)
      const done = itemDone(i)
      if (!open && !done) continue
      const pub = publishersById.get(i.publisher_id)
      const pk = pub ? pub.id : `n:${normTitle(i.publisher_name)}`
      if (!pubs.has(pk)) pubs.set(pk, { key: pk, name: pub?.name || i.publisher_name, booth: pub?.booth || '', rows: new Map() })
      const g = pubs.get(pk)
      const tk = normTitle(i.title) + '|' + (open ? 'open' : `${i.status}:${i.unit_price ?? ''}`)
      if (!g.rows.has(tk)) g.rows.set(tk, { key: tk, title: i.title, authors: new Set(), items: [], orders: new Set(), qty: 0, alt: 0, image: null, open, note: i.fair_note, price: i.unit_price, status: i.status })
      const r = g.rows.get(tk)
      r.items.push(i)
      r.orders.add(o.order_no)
      r.qty += i.quantity
      if (i.author) r.authors.add(i.author)
      if (i.accept_alternative) r.alt++
      if (!r.image && i.image_path) r.image = imageUrl(i.image_path)
      if (i.fair_note) r.note = i.fair_note
    }
  }
  return [...pubs.values()]
    .map((g) => ({ ...g, rows: [...g.rows.values()].sort((a, b) => Number(b.open) - Number(a.open)) }))
    .sort((a, b) => (a.booth || 'ي').localeCompare(b.booth || 'ي') || a.name.localeCompare(b.name, 'ar'))
}

export default function FairApp({ session, settings, role }) {
  const [tab, setTab] = useState('price')
  const [board, setBoard] = useState(null)
  const [publishers, setPublishers] = useState([])
  const [q, setQ] = useState('')
  const [showDone, setShowDone] = useState(false)
  const [img, setImg] = useState(null)
  const [toast, show] = useToast()
  const [err, setErr] = useState('')
  const [pwOpen, setPwOpen] = useState(false)

  const reload = useCallback(async () => {
    try {
      const [b, p] = await Promise.all([api.fairBoard(), api.listPublishers()])
      setBoard(b)
      setPublishers(p)
      setErr('')
    } catch (e) {
      setErr(e.message || 'تعذّر التحميل، تحقق من الاتصال')
      setBoard((x) => x || [])
    }
  }, [])

  useEffect(() => {
    reload()
    const t = setInterval(reload, 20000)
    const onFocus = () => reload()
    window.addEventListener('focus', onFocus)
    const unsub = api.subscribe(() => reload())
    return () => { clearInterval(t); window.removeEventListener('focus', onFocus); unsub() }
  }, [reload])

  const pubById = useMemo(() => new Map(publishers.map((p) => [p.id, p])), [publishers])

  const priceGroups = useMemo(() => board ? group(board, pubById, (o) => ['new', 'priced'].includes(o.status), (i) => i.status === 'pending', (i) => ['available', 'unavailable'].includes(i.status)) : [], [board, pubById])
  const buyGroups = useMemo(() => board ? group(board, pubById, (o) => ['paid', 'purchased'].includes(o.status), (i) => i.status === 'available', (i) => i.status === 'purchased') : [], [board, pubById])
  const toPack = board ? board.filter((o) => o.status === 'purchased') : []
  const packed = board ? board.filter((o) => o.status === 'ready_to_ship') : []

  const countOpen = (gs) => gs.reduce((s, g) => s + g.rows.filter((r) => r.open).length, 0)
  const counts = { price: countOpen(priceGroups), buy: countOpen(buyGroups), pack: toPack.length }

  async function act(ids, action, price, note, msg) {
    try {
      await api.fairUpdate(ids, action, price, note)
      await reload()
      if (msg) show(msg)
    } catch (e) {
      show(e.message || 'تعذّر الحفظ', true)
      reload()
    }
  }

  const filter = (gs) => {
    const s = q.trim()
    return gs
      .map((g) => ({ ...g, rows: g.rows.filter((r) => (showDone || r.open) && (!s || r.title.includes(s) || g.name.includes(s) || [...r.orders].some((n) => n.includes(s.toUpperCase())))) }))
      .filter((g) => g.rows.length)
  }

  return (
    <div className="f-shell">
      {toast}
      <ImageModal src={img} onClose={() => setImg(null)} />
      <PasswordDialog open={pwOpen} onSave={(pw) => api.changePassword(pw)} onClose={(ok) => { setPwOpen(false); if (ok) show('تغيّرت كلمة المرور') }} />
      <header className="f-top">
        <div className="f-top-in">
          <img className="logo logo-white" src={logo} alt={settings.store_name} />
          <div className="grow">
            <div className="title">فريق المعرض</div>
            <div className="sub">{settings.event_name}</div>
          </div>
          <button className="btn btn-quiet btn-sm" onClick={reload} aria-label="تحديث"><Icon name="refresh" /></button>
          {role === 'admin' && <a className="btn btn-quiet btn-sm" href="#admin">الإدارة</a>}
          <button className="btn btn-quiet btn-sm" onClick={() => setPwOpen(true)} aria-label="تغيير كلمة المرور"><Icon name="gear" /></button>
          <button className="btn btn-quiet btn-sm" onClick={() => api.signOut()} aria-label="خروج"><Icon name="logout" /></button>
        </div>
      </header>

      {tab !== 'pack' && (
        <div className="f-search">
          <div className="row">
            <input className="input grow" placeholder="ابحث بالكتاب أو الدار أو رقم الطلب" value={q} onChange={(e) => setQ(e.target.value)} />
            <label className="check small" style={{ whiteSpace: 'nowrap' }}>
              <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} /> <span>المنجز</span>
            </label>
          </div>
        </div>
      )}

      <main className="f-main">
        {err && <div className="notice bad">{err}</div>}
        {board === null ? <Loading /> : (
          <>
            {tab === 'price' && (
              <>
                <p className="f-intro">كتب الطلبات الجديدة مرتبة حسب الجناح. السعر الذي تكتبه لنسخة واحدة، ويُطبَّق على كل الطلبات التي فيها الكتاب نفسه.</p>
                <Groups groups={filter(priceGroups)} empty="لا توجد كتب بانتظار التسعير الآن." render={(r) => <PriceRow key={r.key} r={r} onImg={setImg} act={act} />} />
              </>
            )}
            {tab === 'buy' && (
              <>
                <p className="f-intro">كتب الطلبات المدفوعة فقط. لا تشترِ أي كتاب غير موجود في هذه القائمة.</p>
                <Groups groups={filter(buyGroups)} empty="لا توجد طلبات مدفوعة بانتظار الشراء." render={(r) => <BuyRow key={r.key} r={r} onImg={setImg} act={act} />} />
              </>
            )}
            {tab === 'pack' && <Packing toPack={toPack} packed={packed} reload={reload} show={show} />}
          </>
        )}
      </main>

      <nav className="f-tabs" aria-label="أقسام المعرض">
        {TABS.map(([k, icon, label]) => (
          <button key={k} className={tab === k ? 'on' : ''} onClick={() => { setTab(k); window.scrollTo(0, 0) }} aria-current={tab === k ? 'page' : undefined}>
            <Icon name={icon} size={22} />
            {label}
            {counts[k] > 0 && <span className="count">{counts[k]}</span>}
          </button>
        ))}
      </nav>
    </div>
  )
}

function Groups({ groups, empty, render }) {
  if (!groups.length) return <div className="panel empty"><h3>لا شيء هنا</h3><p>{empty}</p></div>
  return groups.map((g) => (
    <section className="booth-group" key={g.key}>
      <div className="booth-head">
        {g.booth ? <span className="booth">{g.booth}</span> : <span className="tag">بلا جناح</span>}
        <h3 className="grow">{g.name}</h3>
        <span className="muted small">{copies(g.rows.filter((r) => r.open).reduce((s, r) => s + r.qty, 0))}</span>
      </div>
      {g.rows.map(render)}
    </section>
  ))
}

function RowHead({ r, onImg }) {
  return (
    <div className="row" style={{ alignItems: 'flex-start', flexWrap: 'nowrap' }}>
      {r.image && <img className="thumb" src={r.image} alt="صورة الغلاف من العميل" onClick={() => onImg(r.image)} />}
      <div className="grow">
        <div className="f-title">{r.title}<span className="qty-pill">{num(r.qty)}</span></div>
        <div className="f-meta">
          {[...r.authors].join('، ')}{r.authors.size ? '، ' : ''}طلب <span className="ltr">{[...r.orders].join(' ، ')}</span>
        </div>
        {r.alt > 0 && <div className="tiny" style={{ color: 'var(--warn)', fontWeight: 600 }}>{r.alt === r.items.length ? 'يقبل طبعة أخرى' : `${num(r.alt)} من ${num(r.items.length)} يقبلون طبعة أخرى`}</div>}
      </div>
    </div>
  )
}

function PriceRow({ r, onImg, act }) {
  const [price, setPrice] = useState('')
  const [noteOpen, setNoteOpen] = useState(false)
  const [note, setNote] = useState(r.note || '')
  const [busy, setBusy] = useState(false)
  const ids = r.items.map((i) => i.id)
  const run = async (...a) => { setBusy(true); await act(ids, ...a); setBusy(false) }

  if (!r.open) {
    return (
      <div className="f-item done">
        <RowHead r={r} onImg={onImg} />
        <div className="f-actions">
          <span className={`badge ${r.status === 'unavailable' ? 't-bad' : 't-good'}`}>{r.status === 'unavailable' ? 'غير متوفر' : `${sar(r.price)} للنسخة`}</span>
          {r.note && <span className="tiny muted">ملاحظة: {r.note}</span>}
          <button className="link small" onClick={() => run('reprice', null, null, 'أُعيد الكتاب للتسعير')}>تعديل</button>
        </div>
      </div>
    )
  }
  const valid = price !== '' && !isNaN(Number(price)) && Number(price) >= 0
  return (
    <div className="f-item">
      <RowHead r={r} onImg={onImg} />
      {noteOpen ? (
        <div className="row">
          <input className="input grow" placeholder="مثال: الطبعة المتوفرة 2019 في مجلدين" value={note} onChange={(e) => setNote(e.target.value)} />
          <button className="btn btn-sm" onClick={async () => { await run('note', null, note, 'حُفظت الملاحظة'); setNoteOpen(false) }}>حفظ</button>
        </div>
      ) : r.note ? <div className="tiny" style={{ color: 'var(--act)' }}>ملاحظتك: {r.note}</div> : null}
      <form className="f-actions" onSubmit={(e) => { e.preventDefault(); if (valid) run('price', Number(price), null, `سُعّر «${r.title}»`) }}>
        <input className="input price-in" inputMode="decimal" placeholder="السعر" aria-label="سعر النسخة" value={price} onChange={(e) => setPrice(e.target.value.replace(/[٠-٩]/g, (x) => '٠١٢٣٤٥٦٧٨٩'.indexOf(x)))} />
        <button className="btn btn-primary" disabled={!valid || busy}>{busy ? <Spinner /> : <Icon name="check" />} حفظ السعر</button>
        <button type="button" className="btn btn-danger" disabled={busy} onClick={() => run('unavailable', null, null, `«${r.title}» غير متوفر`)}>غير متوفر</button>
        {!noteOpen && <button type="button" className="btn btn-quiet btn-sm" onClick={() => setNoteOpen(true)}><Icon name="note" size={16} /> ملاحظة</button>}
      </form>
    </div>
  )
}

function BuyRow({ r, onImg, act }) {
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const ids = r.items.map((i) => i.id)
  const run = async (...a) => { setBusy(true); await act(ids, ...a); setBusy(false) }
  return (
    <div className={`f-item ${r.open ? '' : 'done'}`}>
      <Confirm open={confirm} title={`«${r.title}» نفد؟`} body="سيُبلَّغ فريق الإدارة لاسترجاع قيمته للعميل." confirmLabel="نعم، نفد" danger
        onCancel={() => setConfirm(false)} onConfirm={() => { setConfirm(false); run('soldout', null, null, 'أُبلغت الإدارة') }} />
      <RowHead r={r} onImg={onImg} />
      {r.note && <div className="tiny" style={{ color: 'var(--act)' }}>ملاحظة التسعير: {r.note}</div>}
      <div className="f-actions">
        <span className="strong num">{sar(r.price)} × {num(r.qty)} = {sar((r.price || 0) * r.qty)}</span>
        <span className="grow" />
        {r.open ? (
          <>
            <button className="btn btn-primary" disabled={busy} onClick={() => run('purchased', null, null, `اشتُري «${r.title}»`)}>{busy ? <Spinner /> : <Icon name="check" />} اشتريته</button>
            <button className="btn btn-quiet btn-danger" disabled={busy} onClick={() => setConfirm(true)}>نفد</button>
          </>
        ) : (
          <>
            <span className="badge t-good">تم الشراء</span>
            <button className="link small" onClick={() => run('unpurchase')}>تراجع</button>
          </>
        )}
      </div>
    </div>
  )
}

function Packing({ toPack, packed, reload, show }) {
  const [busy, setBusy] = useState(null)
  async function pack(o, undo) {
    setBusy(o.id)
    try {
      await api.fairPack(o.id, undo)
      await reload()
      show(undo ? 'أُعيد الطلب للتغليف' : `الطلب ${o.order_no} جاهز للشحن`)
    } catch (e) {
      show(e.message, true)
    } finally {
      setBusy(null)
    }
  }
  return (
    <>
      <p className="f-intro">طلبات اشتُريت كل كتبها. غلّف كل طلب على حدة واكتب رقمه على الطرد، ثم أكّد هنا ليصدر فريق الإدارة بوليصة الشحن.</p>
      {toPack.length === 0 && <div className="panel empty"><h3>لا طلبات للتغليف</h3><p>تظهر هنا حين تُشترى كل كتب الطلب.</p></div>}
      {toPack.map((o) => <PackCard key={o.id} o={o} busy={busy === o.id} onPack={() => pack(o)} />)}
      {packed.length > 0 && (
        <>
          <h3 style={{ fontSize: '1rem', marginTop: 10 }}>جاهزة للشحن ({num(packed.length)})</h3>
          {packed.map((o) => <PackCard key={o.id} o={o} done busy={busy === o.id} onPack={() => pack(o, true)} />)}
        </>
      )}
    </>
  )
}

function PackCard({ o, done, busy, onPack }) {
  const items = o.items.filter((i) => i.status === 'purchased')
  const out = o.items.filter((i) => i.status === 'unavailable')
  return (
    <article className="pack-card" style={done ? { opacity: 0.75 } : null}>
      <div className="h">
        <span className="no">{o.order_no}</span>
        <span className="grow">{o.customer_name}</span>
        <span className="tag brand">{CARRIERS[o.shipping_carrier]?.name}</span>
      </div>
      <ul>
        {items.map((i) => (
          <li key={i.id}><Icon name="check" size={16} /><span className="grow">{i.title}</span><span className="strong">× {i.quantity}</span></li>
        ))}
        {out.map((i) => (
          <li key={i.id} className="muted"><Icon name="x" size={16} /><span className="grow" style={{ textDecoration: 'line-through' }}>{i.title}</span><span className="tiny">نفد</span></li>
        ))}
      </ul>
      <div className="f">
        {done ? (
          <div className="row-between"><span className="badge t-act">جاهز للشحن</span><button className="link small" disabled={busy} onClick={onPack}>تراجع</button></div>
        ) : (
          <button className="btn btn-dark btn-block btn-lg" disabled={busy} onClick={onPack}>{busy ? <Spinner /> : <Icon name="box" />} تم التغليف، جاهز للشحن</button>
        )}
        <div className="tiny muted" style={{ marginTop: 6 }}>دُفع {ago(o.paid_at || o.created_at)}</div>
      </div>
    </article>
  )
}
