import { useEffect, useState } from 'react'
import { api, imageUrl } from '../../../lib/api'
import { orderTotals, feeDescription } from '../../../lib/fees'
import { ORDER_STATUS, sar, num, dateTime, ago, hoursSince, CARRIERS, copies } from '../../../lib/format'
import { countryName } from '../../../lib/countries'
import { Badge, Icon, WaIcon, ImageModal, Confirm, useToast } from '../../../components/ui'
import { waLink, quoteMessage, reminderMessage, unavailableMessage, paidMessage, shippedMessage, addressText, allUnavailable } from '../../../lib/workflow'

export default function OrderDrawer({ o, settings, publishers, reload, onClose }) {
  const [toast, show] = useToast()
  const [img, setImg] = useState(null)
  const [confirm, setConfirm] = useState(null)
  const [f, setF] = useState({
    shipping_cost: o.shipping_cost ?? '',
    payment_link: o.payment_link || '',
    tracking_number: o.tracking_number || '',
    admin_notes: o.admin_notes || '',
  })

  useEffect(() => {
    const k = (e) => e.key === 'Escape' && !img && !confirm && onClose()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [img, confirm, onClose])

  const ship = f.shipping_cost === '' ? null : Number(f.shipping_cost)
  const draft = { ...o, shipping_cost: ship, payment_link: f.payment_link.trim(), tracking_number: f.tracking_number.trim() }
  const t = orderTotals(draft)
  const booth = (i) => publishers.find((p) => p.id === i.publisher_id || p.name === i.publisher_name)?.booth
  const editablePrices = ['new', 'priced'].includes(o.status)
  const canDecline = ['priced', 'awaiting_payment'].includes(o.status)

  async function save(patch, msg) {
    try {
      await api.updateOrder(o.id, patch)
      await reload()
      if (msg) show(msg)
    } catch (e) {
      show(e.message || 'تعذّر الحفظ', true)
    }
  }
  async function saveItem(i, patch, msg) {
    try {
      await api.updateItems([{ id: i.id, patch }])
      if (msg) await api.addEvent(o.id, msg)
      await reload()
    } catch (e) {
      show(e.message || 'تعذّر الحفظ', true)
    }
  }
  function saveField(k) {
    let v = f[k]
    v = k === 'shipping_cost' ? (v === '' ? null : Number(v)) : String(v).trim() || null
    if ((o[k] ?? null) === v) return
    if (k === 'shipping_cost' && v != null && (isNaN(v) || v < 0)) return show('تكلفة الشحن غير صحيحة', true)
    save({ [k]: v })
  }

  const priced = o.items.filter((i) => i.status !== 'pending').length
  const live = o.items.filter((i) => ['available', 'purchased'].includes(i.status))
  const bought = live.filter((i) => i.status === 'purchased').length
  const canQuote = ship != null && f.payment_link.trim().length > 8
  const late = o.status === 'awaiting_payment' && hoursSince(o.quote_sent_at) > (settings.payment_hours || 24)

  return (
    <>
      <div className="drawer-bg" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-label={`الطلب ${o.order_no}`}>
        {toast}
        <ImageModal src={img} onClose={() => setImg(null)} />
        <Confirm open={!!confirm} {...(confirm || {})} onCancel={() => setConfirm(null)} onConfirm={() => { confirm.run(); setConfirm(null) }} />

        <div className="drawer-head">
          <button className="btn btn-quiet btn-sm" onClick={onClose} aria-label="إغلاق"><Icon name="x" /></button>
          <div className="grow">
            <div className="row" style={{ gap: 8 }}>
              <h2 className="ltr" style={{ fontSize: '1.25rem' }}>{o.order_no}</h2>
              <Badge status={o.status} />
            </div>
            <div className="muted tiny">{o.customer_name}، {dateTime(o.created_at)}</div>
          </div>
          <a className="btn btn-wa btn-sm" href={waLink(o)} target="_blank" rel="noreferrer"><WaIcon size={16} /> محادثة</a>
        </div>

        <div className="drawer-body">
          {/* ---------- الخطوة التالية ---------- */}
          <NextStep>
            {o.status === 'new' && (
              <Step title="بانتظار تسعير فريق المعرض" icon="clock">
                <p>سُعّر {num(priced)} من {num(o.items.length)} كتب. ينتقل الطلب إلى «جاهز لإبلاغ العميل» تلقائياً حين يكتمل التسعير.</p>
              </Step>
            )}

            {o.status === 'priced' && allUnavailable(o) && (
              <Step title="كل الكتب غير متوفرة" icon="info">
                <p>أبلغ العميل ثم ألغِ الطلب.</p>
                <a className="btn btn-wa" href={waLink(o, unavailableMessage(o, settings))} target="_blank" rel="noreferrer" onClick={() => save({ status: 'cancelled' }, 'أُلغي الطلب')}>
                  <WaIcon /> أبلغ العميل وألغِ الطلب
                </a>
              </Step>
            )}

            {o.status === 'priced' && !allUnavailable(o) && (
              <Step title="أبلغ العميل بالمبلغ الكامل" icon="tag">
                <ol className="small" style={{ margin: 0, paddingInlineStart: 18, color: 'var(--ink-2)' }}>
                  <li>راجع الأسعار وملاحظات المعرض في جدول الكتب.</li>
                  <li>أنشئ في سلة طلباً يدوياً بمبلغ <b className="num">{sar(t.total)}</b> وحالة «غير مدفوع»، ثم انسخ رابط الدفع.</li>
                  <li>الصق الرابط هنا وأرسل الرسالة للعميل.</li>
                </ol>
                <div className="grid-2">
                  <label className="field">
                    <span className="label">تكلفة الشحن ({CARRIERS[o.shipping_carrier]?.name})</span>
                    <input className="input ltr-in" inputMode="decimal" placeholder={o.shipping_carrier === 'dhl' ? 'حسب الوزن والدولة' : ''} value={f.shipping_cost} onChange={(e) => setF({ ...f, shipping_cost: e.target.value })} onBlur={() => saveField('shipping_cost')} />
                  </label>
                  <label className="field">
                    <span className="label">رابط الدفع من سلة</span>
                    <input className="input ltr-in" placeholder="https://" value={f.payment_link} onChange={(e) => setF({ ...f, payment_link: e.target.value })} onBlur={() => saveField('payment_link')} />
                  </label>
                </div>
                {canQuote ? (
                  <a className="btn btn-wa btn-lg" href={waLink(o, quoteMessage(draft, settings))} target="_blank" rel="noreferrer"
                    onClick={() => save({ status: 'awaiting_payment', shipping_cost: ship, payment_link: f.payment_link.trim() }, 'أُرسل السعر، والطلب الآن بانتظار الدفع')}>
                    <WaIcon /> أرسل المبلغ ورابط الدفع ({sar(t.total)})
                  </a>
                ) : (
                  <button className="btn btn-wa btn-lg" disabled><WaIcon /> أدخل {ship == null ? 'تكلفة الشحن' : 'رابط الدفع'} أولاً</button>
                )}
              </Step>
            )}

            {o.status === 'awaiting_payment' && (
              <Step title={late ? 'تجاوز العميل مهلة الدفع' : 'بانتظار دفع العميل'} icon="clock">
                <p>أُرسل السعر {ago(o.quote_sent_at || o.updated_at)}. حين يظهر الطلب مدفوعاً في سلة، أكّد الدفع هنا فيظهر لفريق المعرض في قائمة الشراء.</p>
                <div className="row">
                  <button className="btn btn-primary btn-lg" onClick={() => setConfirm({ title: 'تأكيد دفع العميل؟', body: `تأكد أن الطلب مدفوع في سلة. بعد التأكيد يشتري فريق المعرض ${num(live.length)} كتب.`, confirmLabel: 'تم الدفع، أرسله للمعرض', run: () => save({ status: 'paid' }, 'أُرسل الطلب لفريق المعرض للشراء') })}>
                    <Icon name="check" /> تأكيد الدفع
                  </button>
                  <a className="btn btn-wa" href={waLink(o, reminderMessage(draft, settings))} target="_blank" rel="noreferrer"><WaIcon /> تذكير بالدفع</a>
                  <a className="btn btn-quiet" href={waLink(o, quoteMessage(draft, settings))} target="_blank" rel="noreferrer">إعادة إرسال السعر</a>
                </div>
                <button className="link small" style={{ alignSelf: 'flex-start' }} onClick={() => save({ status: 'priced' }, 'أُعيد الطلب لتعديل السعر')}>العميل يريد حذف كتب أو تعديل الطلب؟ أعده لمرحلة التسعير</button>
              </Step>
            )}

            {o.status === 'paid' && (
              <Step title="فريق المعرض يشتري الكتب" icon="bag">
                <p>اشترى {num(bought)} من {num(live.length)} كتب. ينتقل الطلب إلى التغليف تلقائياً حين تُشترى كلها.</p>
                <a className="btn btn-wa" href={waLink(o, paidMessage(o, settings))} target="_blank" rel="noreferrer"><WaIcon /> أبلغ العميل باستلام الدفع</a>
              </Step>
            )}

            {o.status === 'purchased' && (
              <Step title="فريق المعرض يغلّف الطلب" icon="box">
                <p>اشتُريت كل الكتب. ينتقل الطلب إلى «جاهز للشحن» حين يؤكد فريق المعرض التغليف.</p>
              </Step>
            )}

            {o.status === 'ready_to_ship' && (
              <Step title="أصدر بوليصة الشحن" icon="truck">
                <p>أصدر البوليصة من طلب سلة عبر {CARRIERS[o.shipping_carrier]?.name}، ثم أدخل رقم الشحنة.{o.shipping_carrier === 'redbox' ? ' ريدبوكس ترسل للعميل رابط اختيار الخزانة.' : ''}</p>
                <div className="row">
                  <input className="input ltr-in grow" style={{ maxWidth: 320 }} placeholder="رقم الشحنة" value={f.tracking_number} onChange={(e) => setF({ ...f, tracking_number: e.target.value })} onBlur={() => saveField('tracking_number')} />
                  <a className={`btn btn-primary ${f.tracking_number.trim() ? '' : 'disabled'}`} aria-disabled={!f.tracking_number.trim()} href={waLink(o, shippedMessage(draft, settings))} target="_blank" rel="noreferrer"
                    onClick={() => save({ status: 'shipped', tracking_number: f.tracking_number.trim() }, 'تم الشحن وأُبلغ العميل')}>
                    <Icon name="truck" /> تم الشحن، أبلغ العميل
                  </a>
                </div>
              </Step>
            )}

            {o.status === 'shipped' && (
              <Step title="اكتمل الطلب" icon="check">
                <p>شُحن الطلب{o.tracking_number ? <> برقم <b className="ltr">{o.tracking_number}</b></> : ''}.</p>
                <a className="btn btn-wa" href={waLink(o, shippedMessage(o, settings))} target="_blank" rel="noreferrer" style={{ alignSelf: 'flex-start' }}><WaIcon /> إعادة إرسال رسالة الشحن</a>
              </Step>
            )}

            {o.status === 'cancelled' && (
              <Step title="الطلب ملغي" icon="x">
                <button className="btn" style={{ alignSelf: 'flex-start' }} onClick={() => save({ status: 'priced' }, 'أُعيد فتح الطلب')}>إعادة فتح الطلب</button>
              </Step>
            )}
          </NextStep>

          {/* ---------- الكتب ---------- */}
          <section className="panel panel-tight">
            <div className="panel-title"><h3>الكتب</h3><span className="muted small">{copies(o.items.reduce((s, i) => s + i.quantity, 0))}</span></div>
            <div className="scroll-x">
              <table className="table">
                <thead><tr><th></th><th>الكتاب</th><th>النسخ</th><th>السعر</th><th>الحالة</th><th className="end">المجموع</th></tr></thead>
                <tbody>
                  {o.items.map((i) => (
                    <ItemRow key={i.id} i={i} booth={booth(i)} editable={editablePrices} canDecline={canDecline} onImg={setImg} onSave={saveItem} />
                  ))}
                </tbody>
              </table>
            </div>
            <div className="sum" style={{ maxWidth: 340, marginInlineStart: 'auto', marginTop: 14 }}>
              <div><span>قيمة الكتب</span><span className="num">{sar(t.books)}</span></div>
              <div title={feeDescription(o, 0)}><span>رسوم الخدمة</span><span className="num">{sar(t.fee)}</span></div>
              <div><span>الشحن ({CARRIERS[o.shipping_carrier]?.name})</span><span className="num">{t.shippingKnown ? sar(t.shipping) : '—'}</span></div>
              <div className="total"><span>المبلغ الكامل</span><span className="num">{sar(t.total)}</span></div>
            </div>
          </section>

          {/* ---------- العميل ---------- */}
          <section className="panel panel-tight">
            <div className="panel-title"><h3>العميل والشحن</h3></div>
            <dl className="events" style={{ margin: 0 }}>
              <Row k="الاسم" v={o.customer_name} />
              <Row k="الجوال" v={<span className="ltr">+{o.phone_dial} {o.phone}</span>} />
              <Row k="الدولة" v={countryName(o.country)} />
              <Row k="العنوان" v={o.country === 'SA' ? <span className="ltr">{addressText(o)}</span> : addressText(o)} />
              <Row k="الشحن" v={CARRIERS[o.shipping_carrier]?.name} />
              {o.customer_notes && <Row k="ملاحظات العميل" v={o.customer_notes} />}
            </dl>
          </section>

          <section className="panel panel-tight">
            <div className="panel-title"><h3>ملاحظات داخلية</h3><span className="muted tiny">لا يراها العميل</span></div>
            <textarea className="input" value={f.admin_notes} onChange={(e) => setF({ ...f, admin_notes: e.target.value })} onBlur={() => saveField('admin_notes')} placeholder="مثال: طلب العميل التغليف كهدية" />
          </section>

          <section className="panel panel-tight">
            <div className="panel-title"><h3>سجل الطلب</h3></div>
            <ul className="events">
              {[...(o.events || [])].reverse().map((e) => (
                <li key={e.id}><span className="muted">{dateTime(e.created_at)}</span><span><span className="who">{e.actor || 'النظام'}</span>: {e.message}</span></li>
              ))}
            </ul>
          </section>

          <details className="panel panel-tight">
            <summary className="strong" style={{ cursor: 'pointer' }}>إجراءات أخرى</summary>
            <div className="stack" style={{ marginTop: 14 }}>
              <label className="field">
                <span className="label">تغيير المرحلة يدوياً</span>
                <select className="input" value={o.status} onChange={(e) => save({ status: e.target.value }, 'تم تغيير المرحلة')}>
                  {Object.entries(ORDER_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </label>
              {o.status !== 'cancelled' && (
                <button className="btn btn-danger" style={{ alignSelf: 'flex-start' }} onClick={() => setConfirm({ title: `إلغاء الطلب ${o.order_no}؟`, body: 'يختفي الطلب من قوائم فريق المعرض. تستطيع إعادة فتحه لاحقاً.', confirmLabel: 'إلغاء الطلب', danger: true, run: () => save({ status: 'cancelled' }, 'أُلغي الطلب') })}>
                  إلغاء الطلب
                </button>
              )}
            </div>
          </details>
        </div>
      </aside>
    </>
  )
}

const NextStep = ({ children }) => <>{children}</>

function Step({ title, icon, children }) {
  return (
    <section className="step-card">
      <div className="h"><Icon name={icon} /> {title}</div>
      <div className="b">{children}</div>
    </section>
  )
}

const Row = ({ k, v }) => (
  <li style={{ listStyle: 'none' }}><span className="muted">{k}</span><span>{v}</span></li>
)

function ItemRow({ i, booth, editable, canDecline, onImg, onSave }) {
  const [price, setPrice] = useState(i.unit_price ?? '')
  useEffect(() => setPrice(i.unit_price ?? ''), [i.unit_price])
  const img = imageUrl(i.image_path)
  function commit() {
    const raw = String(price).trim()
    if (raw === '' || Number(raw) === Number(i.unit_price)) return
    const v = Number(raw)
    if (isNaN(v) || v < 0) return
    onSave(i, { unit_price: v, status: i.status === 'pending' || i.status === 'unavailable' ? 'available' : i.status }, `عدّلت الإدارة سعر «${i.title}» إلى ${v} ر.س`)
  }
  return (
    <tr>
      <td style={{ width: 52 }}>{img && <img className="thumb" src={img} alt="صورة الكتاب" onClick={() => onImg(img)} />}</td>
      <td>
        <div className="strong">{i.title}</div>
        <div className="muted tiny">{[i.author, i.publisher_name].filter(Boolean).join('، ')} {booth && <span className="booth">{booth}</span>}</div>
        {i.accept_alternative && <div className="tiny" style={{ color: 'var(--warn)' }}>يقبل طبعة أخرى</div>}
        {i.fair_note && <div className="tiny" style={{ color: 'var(--act)' }}>المعرض: {i.fair_note}</div>}
      </td>
      <td className="num">{i.quantity}</td>
      <td>
        {editable && i.status !== 'unavailable' ? (
          <input className="input sm ltr-in" style={{ width: 96 }} inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
        ) : (
          <span className="num">{i.unit_price != null ? sar(i.unit_price) : '—'}</span>
        )}
      </td>
      <td>
        <Badge kind="item" status={i.status} />
        {canDecline && i.status === 'available' && (
          <button className="link tiny" style={{ display: 'block', marginTop: 4 }} onClick={() => onSave(i, { status: 'declined' }, `حذف العميل «${i.title}» من الطلب`)}>حذف بطلب العميل</button>
        )}
        {canDecline && i.status === 'declined' && (
          <button className="link tiny" style={{ display: 'block', marginTop: 4 }} onClick={() => onSave(i, { status: 'available' }, `أُعيد «${i.title}» إلى الطلب`)}>إرجاعه</button>
        )}
      </td>
      <td className="end num">{['unavailable', 'declined'].includes(i.status) || i.unit_price == null ? '—' : sar(i.unit_price * i.quantity)}</td>
    </tr>
  )
}
