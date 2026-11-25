import { useState } from 'react'
import { api } from '../../../lib/api'
import { FEE_MODES, sar } from '../../../lib/format'
import { serviceFee } from '../../../lib/fees'
import { useToast } from '../../../components/ui'

export default function Settings({ settings, onSaved }) {
  const [s, setS] = useState(settings)
  const [busy, setBusy] = useState(false)
  const [toast, show] = useToast()
  const set = (k, v) => setS((x) => ({ ...x, [k]: v }))
  const n = (k) => ({ value: s[k], onChange: (e) => set(k, e.target.value), className: 'input ltr-in', inputMode: 'decimal' })

  async function save() {
    setBusy(true)
    try {
      await api.saveSettings({
        store_name: s.store_name.trim(), event_name: s.event_name.trim(), accepting_orders: !!s.accepting_orders,
        fee_mode: s.fee_mode, fee_fixed: +s.fee_fixed || 0, fee_per_book: +s.fee_per_book || 0, fee_percent: +s.fee_percent || 0, fee_min: +s.fee_min || 0,
        ship_redbox: +s.ship_redbox || 0, ship_smsa: +s.ship_smsa || 0, payment_hours: Math.max(1, parseInt(s.payment_hours) || 24), policies: s.policies,
      })
      await onSaved()
      show('حُفظت الإعدادات')
    } catch {
      show('تعذّر الحفظ', true)
    } finally {
      setBusy(false)
    }
  }

  const fee = { ...s, fee_fixed: +s.fee_fixed, fee_per_book: +s.fee_per_book, fee_percent: +s.fee_percent, fee_min: +s.fee_min }
  const ex = [['كتاب واحد بـ 50 ر.س', [{ unit_price: 50, quantity: 1 }]], ['3 كتب بـ 300 ر.س', [{ unit_price: 100, quantity: 3 }]]]

  return (
    <>
      {toast}
      <div className="s-head">
        <div><h1>الإعدادات</h1><p>التغييرات تسري على الطلبات الجديدة فقط، وكل طلب يحتفظ برسومه وقت إرساله.</p></div>
        <button className="btn btn-primary" onClick={save} disabled={busy}>حفظ الإعدادات</button>
      </div>
      <div className="cols-2">
        <div className="stack-lg">
          <section className="panel stack">
            <h3>استقبال الطلبات</h3>
            <label className="check">
              <input type="checkbox" checked={!!s.accepting_orders} onChange={(e) => set('accepting_orders', e.target.checked)} />
              <span><b>مفتوح للعملاء</b><span className="muted small" style={{ display: 'block' }}>أغلقه بعد انتهاء المعرض، فتظهر للعملاء رسالة بأن الطلبات متوقفة.</span></span>
            </label>
            <div className="grid-2">
              <label className="field"><span className="label">اسم المتجر</span><input className="input" value={s.store_name} onChange={(e) => set('store_name', e.target.value)} /></label>
              <label className="field"><span className="label">اسم المعرض</span><input className="input" value={s.event_name} onChange={(e) => set('event_name', e.target.value)} /></label>
            </div>
          </section>

          <section className="panel stack">
            <h3>رسوم الخدمة</h3>
            {Object.entries(FEE_MODES).map(([k, l]) => (
              <label key={k} className={`choice ${s.fee_mode === k ? 'on' : ''}`}>
                <input type="radio" name="fee" checked={s.fee_mode === k} onChange={() => set('fee_mode', k)} />
                <span className="dot" /><span className="strong">{l}</span>
              </label>
            ))}
            <div className="grid-2">
              {s.fee_mode === 'fixed' && <label className="field"><span className="label">المبلغ لكل طلب (ر.س)</span><input {...n('fee_fixed')} /></label>}
              {s.fee_mode === 'per_book' && <label className="field"><span className="label">المبلغ لكل كتاب (ر.س)</span><input {...n('fee_per_book')} /></label>}
              {s.fee_mode === 'percent' && <>
                <label className="field"><span className="label">النسبة من قيمة الكتب (٪)</span><input {...n('fee_percent')} /></label>
                <label className="field"><span className="label">الحد الأدنى (ر.س)</span><input {...n('fee_min')} /></label>
              </>}
            </div>
            <div className="notice brand small" style={{ display: 'block' }}>
              {ex.map(([l, items]) => <div key={l}>{l}: رسوم الخدمة {sar(serviceFee(fee, items))}</div>)}
            </div>
          </section>
        </div>

        <div className="stack-lg">
          <section className="panel stack">
            <h3>الشحن والدفع</h3>
            <div className="grid-2">
              <label className="field"><span className="label">ريدبوكس (ر.س)</span><input {...n('ship_redbox')} /></label>
              <label className="field"><span className="label">سمسا (ر.س)</span><input {...n('ship_smsa')} /></label>
            </div>
            <p className="muted small">DHL للطلبات الدولية فقط، وتكلفتها تُدخل لكل طلب بعد التسعير.</p>
            <label className="field" style={{ maxWidth: 240 }}>
              <span className="label">مهلة الدفع (ساعات)</span>
              <input {...n('payment_hours')} inputMode="numeric" />
              <span className="hint">بعدها يظهر الطلب «متأخراً» للإدارة</span>
            </label>
          </section>

          <section className="panel stack">
            <div className="row-between"><h3>سياسات الخدمة</h3><span className="muted tiny">كل سطر بند مستقل</span></div>
            <textarea className="input" style={{ minHeight: 260 }} value={s.policies} onChange={(e) => set('policies', e.target.value)} />
          </section>
        </div>
      </div>
    </>
  )
}
