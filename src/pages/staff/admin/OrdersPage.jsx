import { useMemo, useState } from 'react'
import { orderTotals } from '../../../lib/fees'
import { ORDER_STATUS, PIPELINE, sar, ago, num, CARRIERS } from '../../../lib/format'
import { countryName } from '../../../lib/countries'
import { Badge, Icon } from '../../../components/ui'
import { toCSV } from '../../../lib/workflow'

export default function OrdersPage({ orders, filter, setFilter, onOpen }) {
  const [q, setQ] = useState('')
  const counts = useMemo(() => {
    const c = { all: orders.length }
    orders.forEach((o) => (c[o.status] = (c[o.status] || 0) + 1))
    return c
  }, [orders])

  const list = useMemo(() => {
    const s = q.trim().toLowerCase()
    const digits = s.replace(/\D/g, '')
    return orders.filter((o) => {
      if (filter !== 'all' && o.status !== filter) return false
      if (!s) return true
      return (
        o.order_no.toLowerCase().includes(s) || o.customer_name.toLowerCase().includes(s) ||
        (digits.length >= 4 && `${o.phone_dial}${o.phone}`.includes(digits)) || o.items.some((i) => i.title.toLowerCase().includes(s))
      )
    })
  }, [orders, filter, q])

  function exportCsv() {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([toCSV(list)], { type: 'text/csv;charset=utf-8' }))
    a.download = `orders-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
  }

  return (
    <>
      <div className="s-head">
        <div>
          <h1>كل الطلبات</h1>
          <p>{num(list.length)} طلب{filter !== 'all' ? ` في «${ORDER_STATUS[filter].label}»` : ''}</p>
        </div>
        <div className="row">
          <div style={{ position: 'relative' }}>
            <input className="input" style={{ width: 280, paddingInlineStart: 38 }} placeholder="رقم الطلب، الاسم، الجوال أو الكتاب" value={q} onChange={(e) => setQ(e.target.value)} />
            <span style={{ position: 'absolute', insetInlineStart: 12, top: 13, color: 'var(--muted)' }}><Icon name="search" /></span>
          </div>
          <button className="btn" onClick={exportCsv}>تصدير CSV</button>
        </div>
      </div>

      <div className="tabs" style={{ marginBottom: 14 }}>
        {[['all', 'الكل'], ...PIPELINE.map((s) => [s, ORDER_STATUS[s].label]), ['cancelled', 'ملغي']].map(([k, l]) => (
          <button key={k} className={`tab ${filter === k ? 'on' : ''}`} onClick={() => setFilter(k)}>
            {l}<span className="n">{counts[k] || 0}</span>
          </button>
        ))}
      </div>

      <div className="olist">
        <div className="orow olist-head">
          <span>الطلب</span><span>العميل</span><span className="c3">الكتب</span><span className="c4">المبلغ</span><span>المرحلة</span>
        </div>
        {list.length === 0 && <div className="empty"><h3>لا توجد طلبات هنا</h3><p>غيّر التصفية أو كلمة البحث.</p></div>}
        {list.map((o) => {
          const t = orderTotals(o)
          const n = o.items.reduce((s, i) => s + i.quantity, 0)
          return (
            <button key={o.id} className="orow" onClick={() => onOpen(o.id)}>
              <span>
                <span className="no">{o.order_no}</span>
                <span className="muted tiny" style={{ display: 'block' }}>{ago(o.created_at)}</span>
              </span>
              <span style={{ minWidth: 0 }}>
                <span className="strong" style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.customer_name}</span>
                <span className="muted tiny">{countryName(o.country)}، {CARRIERS[o.shipping_carrier]?.name}</span>
              </span>
              <span className="c3 small" style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {num(n)} {n === 1 ? 'نسخة' : 'نسخ'}: {o.items.map((i) => i.title).join('، ')}
              </span>
              <span className="c4 num">{o.status === 'new' ? <span className="muted">قيد التسعير</span> : sar(t.total)}</span>
              <span><Badge status={o.status} /></span>
            </button>
          )
        })}
      </div>
    </>
  )
}
