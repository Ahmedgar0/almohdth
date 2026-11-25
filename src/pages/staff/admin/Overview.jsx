import { orderTotals } from '../../../lib/fees'
import { ORDER_STATUS, PIPELINE, sar, ago, hoursSince, num } from '../../../lib/format'
import { allUnavailable } from '../../../lib/workflow'
import { Badge, Icon } from '../../../components/ui'

export default function Overview({ orders, settings, onOpen, onShow }) {
  const by = (s) => orders.filter((o) => s.includes(o.status)).sort((a, b) => (a.created_at < b.created_at ? -1 : 1))
  const priced = by(['priced'])
  const awaiting = by(['awaiting_payment'])
  const ship = by(['ready_to_ship'])
  const atFair = by(['new', 'paid', 'purchased'])
  const late = awaiting.filter((o) => hoursSince(o.quote_sent_at) > (settings.payment_hours || 24))

  return (
    <>
      <div className="s-head">
        <div>
          <h1>ما يحتاج إجراءً</h1>
          <p>الطلبات التي تنتظر فريق الإدارة الآن، وأقدمها في الأعلى.</p>
        </div>
      </div>

      <div className="pipeline" role="list">
        {PIPELINE.map((s) => (
          <button key={s} role="listitem" onClick={() => onShow(s)}>
            <span className="v">{num(orders.filter((o) => o.status === s).length)}</span>
            <span className="l">{ORDER_STATUS[s].label}</span>
          </button>
        ))}
      </div>

      <div className="queues">
        <Queue icon="tag" title="أبلغ العميل بالسعر" hint="سعّرها فريق المعرض" list={priced} onOpen={onOpen} onMore={() => onShow('priced')}
          right={(o) => allUnavailable(o) ? <span className="badge t-bad">كل الكتب غير متوفرة</span> : <span className="num strong">{sar(orderTotals(o).books)}</span>} />
        <Queue icon="clock" title="بانتظار الدفع" hint={late.length ? `${late.length} تجاوزت مهلة الدفع` : 'أكّد الدفع حين يظهر في سلة'} list={awaiting} onOpen={onOpen} onMore={() => onShow('awaiting_payment')}
          right={(o) => { const isLate = hoursSince(o.quote_sent_at) > (settings.payment_hours || 24); return <span className={isLate ? 'late small' : 'muted small'}>{isLate ? 'متأخر، ' : ''}{ago(o.quote_sent_at || o.created_at)}</span> }} />
        <Queue icon="truck" title="جاهزة للشحن" hint="غلّفها فريق المعرض، أدخل رقم الشحنة" list={ship} onOpen={onOpen} onMore={() => onShow('ready_to_ship')}
          right={(o) => <span className="tag">{o.shipping_carrier === 'redbox' ? 'ريدبوكس' : o.shipping_carrier === 'smsa' ? 'سمسا' : 'DHL'}</span>} />
        <Queue icon="bag" title="لدى فريق المعرض" hint="تسعير، شراء أو تغليف" list={atFair} onOpen={onOpen} onMore={() => onShow('new')} quiet
          right={(o) => <Badge status={o.status} />} />
      </div>
    </>
  )
}

function Queue({ icon, title, hint, list, onOpen, onMore, right, quiet }) {
  const shown = list.slice(0, 6)
  return (
    <section className="queue">
      <div className="queue-head" style={quiet ? { background: 'var(--paper)' } : null}>
        <Icon name={icon} />
        <div>
          <h3>{title}</h3>
          <div className="muted tiny">{hint}</div>
        </div>
        <span className="big num">{num(list.length)}</span>
      </div>
      {list.length === 0 ? (
        <div className="muted small" style={{ padding: '18px 16px' }}>لا شيء هنا الآن.</div>
      ) : (
        shown.map((o) => (
          <button key={o.id} className="queue-row" onClick={() => onOpen(o.id)}>
            <span className="strong ltr">{o.order_no}</span>
            <span className="grow" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.customer_name}</span>
            {right(o)}
          </button>
        ))
      )}
      {list.length > shown.length && <button className="link more" onClick={onMore}>عرض الكل ({num(list.length)})</button>}
    </section>
  )
}
