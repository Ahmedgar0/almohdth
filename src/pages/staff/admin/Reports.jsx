import { useMemo } from 'react'
import { orderTotals } from '../../../lib/fees'
import { ORDER_STATUS, PIPELINE, CARRIERS, num, sar, dayKey, normTitle, hoursSince } from '../../../lib/format'
import { countryName } from '../../../lib/countries'

const PAID = ['paid', 'purchased', 'ready_to_ship', 'shipped']
const QUOTED = ['awaiting_payment', ...PAID]
const rank = (m, n = 10) => [...m.entries()].sort((a, b) => b[1].v - a[1].v).slice(0, n)
const bump = (m, k, label, by = 1, sub) => m.set(k, { label, sub, v: (m.get(k)?.v || 0) + by })

export default function Reports({ orders }) {
  const r = useMemo(() => {
    const live = orders.filter((o) => o.status !== 'cancelled')
    const paid = live.filter((o) => PAID.includes(o.status))
    const quoted = live.filter((o) => QUOTED.includes(o.status))
    const sum = (arr, k) => arr.reduce((s, o) => s + (orderTotals(o)[k] || 0), 0)
    const books = new Map(), pubs = new Map(), countries = new Map(), days = new Map(), carriers = new Map()
    let qty = 0, decided = 0, unavailable = 0
    for (const o of live) {
      bump(countries, o.country, countryName(o.country))
      bump(days, dayKey(o.created_at), dayKey(o.created_at))
      bump(carriers, o.shipping_carrier, CARRIERS[o.shipping_carrier]?.name)
      for (const i of o.items) {
        qty += i.quantity
        bump(books, normTitle(i.title), i.title, i.quantity, i.publisher_name)
        bump(pubs, normTitle(i.publisher_name), i.publisher_name, i.quantity)
        if (i.status !== 'pending') decided++
        if (i.status === 'unavailable') unavailable++
      }
    }
    const payHours = paid.filter((o) => o.quote_sent_at && o.paid_at).map((o) => (new Date(o.paid_at) - new Date(o.quote_sent_at)) / 3600e3)
    return {
      orders: live.length, today: days.get(dayKey(new Date().toISOString()))?.v || 0, qty,
      conversion: quoted.length ? (paid.length / quoted.length) * 100 : 0, paidN: paid.length, quotedN: quoted.length,
      books: sum(paid, 'books'), fees: sum(paid, 'fee'), shipping: sum(paid, 'shipping'),
      avg: paid.length ? sum(paid, 'total') / paid.length : 0,
      waiting: sum(live.filter((o) => o.status === 'awaiting_payment'), 'total'),
      unavailableRate: decided ? (unavailable / decided) * 100 : 0,
      payHours: payHours.length ? payHours.reduce((a, b) => a + b, 0) / payHours.length : null,
      stale: live.filter((o) => o.status === 'new' && hoursSince(o.created_at) > 6).length,
      topBooks: rank(books), topPubs: rank(pubs), countries: rank(countries), carriers: rank(carriers),
      days: [...days.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)),
      stages: PIPELINE.map((s) => [s, { label: ORDER_STATUS[s].label, v: live.filter((o) => o.status === s).length }]),
    }
  }, [orders])

  return (
    <>
      <div className="s-head"><div><h1>التقارير</h1><p>الأرقام المالية تشمل الطلبات المدفوعة فقط.</p></div></div>
      <div className="kpis">
        <Kpi l="الطلبات" v={num(r.orders)} s={`اليوم ${num(r.today)}`} />
        <Kpi l="النسخ المطلوبة" v={num(r.qty)} />
        <Kpi l="نسبة الدفع" v={`${num(r.conversion)}٪`} s={`${num(r.paidN)} دفعوا من ${num(r.quotedN)} وصلهم السعر`} />
        <Kpi l="قيمة الكتب المدفوعة" v={sar(r.books)} />
        <Kpi l="رسوم الخدمة المحصّلة" v={sar(r.fees)} />
        <Kpi l="الشحن المحصّل" v={sar(r.shipping)} />
        <Kpi l="متوسط الطلب المدفوع" v={sar(r.avg)} />
        <Kpi l="بانتظار الدفع" v={sar(r.waiting)} />
        <Kpi l="الكتب غير المتوفرة" v={`${num(r.unavailableRate)}٪`} s="من الكتب المسعّرة" />
        <Kpi l="متوسط وقت الدفع" v={r.payHours == null ? '—' : `${num(r.payHours)} س`} s="من إرسال السعر حتى الدفع" />
      </div>
      <div className="cols-2" style={{ marginTop: 16 }}>
        <Bars title="الكتب الأكثر طلباً (نسخ)" rows={r.topBooks} />
        <Bars title="دور النشر الأكثر طلباً (نسخ)" rows={r.topPubs} />
        <Bars title="الطلبات حسب المرحلة" rows={r.stages} />
        <Bars title="الطلبات حسب اليوم" rows={r.days} ltr />
        <Bars title="الطلبات حسب الدولة" rows={r.countries} />
        <Bars title="شركات الشحن" rows={r.carriers} />
      </div>
    </>
  )
}

const Kpi = ({ l, v, s }) => (
  <div className="kpi"><div className="l">{l}</div><div className="v">{v}</div>{s && <div className="s">{s}</div>}</div>
)

function Bars({ title, rows, ltr }) {
  const max = Math.max(1, ...rows.map(([, x]) => x.v))
  return (
    <section className="panel panel-tight">
      <h3 style={{ fontSize: '.98rem', marginBottom: 12 }}>{title}</h3>
      {rows.length === 0 ? <p className="muted small">لا توجد بيانات بعد</p> : (
        <div className="bars">
          {rows.map(([k, x]) => (
            <div className="bar-row" key={k} title={`${x.label}${x.sub ? `، ${x.sub}` : ''}: ${num(x.v)}`}>
              <span className={`name ${ltr ? 'ltr' : ''}`}>{x.label}</span>
              <div className="bar-track"><div className="bar-fill" style={{ width: `${(x.v / max) * 100}%` }} /></div>
              <span className="val">{num(x.v)}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
