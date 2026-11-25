import { useEffect, useState } from 'react'
import { api } from '../../lib/api'
import { orderTotals } from '../../lib/fees'
import { sar, dateTime, CARRIERS } from '../../lib/format'
import { Badge, Loading } from '../../components/ui'
import CustomerLogin from '../../components/CustomerLogin'

const STEPS = [
  [['new', 'priced'], 'فريقنا في المعرض يسعّر كتبك'],
  [['awaiting_payment'], 'المبلغ جاهز، بانتظار الدفع'],
  [['paid'], 'نشتري كتبك من المعرض'],
  [['purchased', 'ready_to_ship'], 'نغلّف طلبك ونجهّزه للشحن'],
  [['shipped'], 'شُحن طلبك'],
]

export default function MyOrders({ customer }) {
  const [orders, setOrders] = useState(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!customer) return
    setOrders(null)
    api.myOrders(customer.dial, customer.phone).then(setOrders).catch(() => { setErr('تعذّر تحميل طلباتك، حدّث الصفحة'); setOrders([]) })
  }, [customer])

  if (!customer) {
    return <CustomerLogin title="ادخل لعرض طلباتك" subtitle="اكتب اسمك ورقم الجوال الذي أرسلت به طلبك." />
  }

  return (
    <div className="stack-lg" style={{ maxWidth: 760, margin: '0 auto' }}>
      {err && <div className="notice bad">{err}</div>}
      {orders === null && <div className="c-card"><Loading /></div>}
      {orders && orders.length === 0 && (
        <div className="c-card"><div className="empty">
          <h3>لا توجد طلبات على الرقم <span className="ltr">+{customer.dial} {customer.phone}</span></h3>
          <p style={{ marginBottom: 16 }}>أرسل طلبك الأول وتابعه من هنا.</p>
          <a className="btn btn-primary" href="#order">طلب جديد</a>
        </div></div>
      )}
      {orders?.map((o) => <OrderCard key={o.order_no} o={o} />)}
    </div>
  )
}

function OrderCard({ o }) {
  const idx = STEPS.findIndex(([s]) => s.includes(o.status))
  const priced = !['new', 'priced'].includes(o.status)
  const t = priced ? orderTotals(o) : null
  return (
    <article className="c-card">
      <div className="c-card-body stack-lg">
        <div className="row-between">
          <div>
            <h2 className="ltr" style={{ fontSize: '1.3rem' }}>{o.order_no}</h2>
            <div className="muted small">{dateTime(o.created_at)}، الشحن عبر {CARRIERS[o.shipping_carrier]?.name}</div>
          </div>
          <Badge status={o.status} customer />
        </div>

        {o.status === 'cancelled' ? (
          <div className="notice bad">أُلغي هذا الطلب. للاستفسار راسلنا على واتساب.</div>
        ) : (
          <ol className="timeline">
            {STEPS.map(([, label], i) => (
              <li key={i} className={i < idx || o.status === 'shipped' ? 'done' : i === idx ? 'now' : ''}>{label}</li>
            ))}
          </ol>
        )}

        {o.payment_link && (
          <a className="btn btn-primary btn-lg btn-block" href={o.payment_link} target="_blank" rel="noreferrer">
            ادفع {t ? sar(t.total) : ''}
          </a>
        )}
        {o.tracking_number && <div className="notice info">رقم الشحنة لدى {CARRIERS[o.shipping_carrier]?.name}: <b className="ltr">{o.tracking_number}</b></div>}

        <div className="scroll-x">
          <table className="table">
            <thead><tr><th>الكتاب</th><th>النسخ</th><th>الحالة</th>{t && <th className="end">السعر</th>}</tr></thead>
            <tbody>
              {o.items.map((i, k) => (
                <tr key={k}>
                  <td><div className="strong">{i.title}</div><div className="muted small">{i.publisher_name}</div></td>
                  <td>{i.quantity}</td>
                  <td>{priced ? <Badge kind="item" status={i.status} /> : <span className="muted small">قيد التسعير</span>}</td>
                  {t && <td className="end num">{['unavailable', 'declined'].includes(i.status) || i.unit_price == null ? '—' : sar(i.unit_price * i.quantity)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {t && (
          <div className="sum" style={{ maxWidth: 340, marginInlineStart: 'auto', width: '100%' }}>
            <div><span>قيمة الكتب</span><span className="num">{sar(t.books)}</span></div>
            <div><span>رسوم الخدمة</span><span className="num">{sar(t.fee)}</span></div>
            <div><span>الشحن</span><span className="num">{t.shippingKnown ? sar(t.shipping) : '—'}</span></div>
            <div className="total"><span>المبلغ الكامل</span><span className="num">{sar(t.total)}</span></div>
          </div>
        )}
      </div>
    </article>
  )
}
