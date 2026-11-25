import { useState } from 'react'
import { api } from '../../../lib/api'
import { Confirm, useToast } from '../../../components/ui'

export default function Publishers({ publishers, reload }) {
  const [np, setNp] = useState({ name: '', booth: '' })
  const [bulk, setBulk] = useState('')
  const [toast, show] = useToast()
  const [del, setDel] = useState(null)

  async function add(e) {
    e.preventDefault()
    if (!np.name.trim()) return
    await api.addPublisher({ name: np.name.trim(), booth: np.booth.trim() || null })
    setNp({ name: '', booth: '' })
    reload()
    show('أُضيفت الدار')
  }

  // لصق قائمة: كل سطر «اسم الدار، الجناح»
  async function addBulk() {
    const rows = bulk.split('\n').map((l) => l.split(/[,،\t]/).map((s) => s.trim())).filter((r) => r[0])
    const existing = new Set(publishers.map((p) => p.name))
    let n = 0
    for (const [name, booth] of rows) {
      if (existing.has(name)) continue
      await api.addPublisher({ name, booth: booth || null })
      n++
    }
    setBulk('')
    reload()
    show(`أُضيفت ${n} دار`)
  }

  return (
    <>
      {toast}
      <Confirm open={!!del} title={`حذف «${del?.name}»؟`} body="تبقى الطلبات السابقة كما هي، لكن الدار تختفي من قائمة العملاء." confirmLabel="حذف" danger
        onCancel={() => setDel(null)} onConfirm={async () => { await api.deletePublisher(del.id); setDel(null); reload() }} />
      <div className="s-head">
        <div>
          <h1>دور النشر والأجنحة</h1>
          <p>تظهر للعميل عند اختيار دار النشر، ورقم الجناح يرتّب قوائم فريق المعرض.</p>
        </div>
      </div>
      <div className="cols-2">
        <section className="panel">
          <div className="panel-title"><h3>{publishers.length} دار</h3></div>
          <form className="row" onSubmit={add} style={{ marginBottom: 14 }}>
            <input className="input grow" style={{ minWidth: 160 }} placeholder="اسم دار النشر" value={np.name} onChange={(e) => setNp({ ...np, name: e.target.value })} />
            <input className="input ltr-in" style={{ width: 100 }} placeholder="الجناح" value={np.booth} onChange={(e) => setNp({ ...np, booth: e.target.value })} />
            <button className="btn btn-primary">إضافة</button>
          </form>
          <table className="table">
            <thead><tr><th>الدار</th><th>الجناح</th><th></th></tr></thead>
            <tbody>{publishers.map((p) => <PubRow key={p.id} p={p} reload={reload} onDelete={() => setDel(p)} />)}</tbody>
          </table>
        </section>
        <section className="panel">
          <div className="panel-title"><h3>إضافة قائمة دفعة واحدة</h3></div>
          <p className="muted small" style={{ marginBottom: 10 }}>الصق القائمة، كل دار في سطر: الاسم ثم فاصلة ثم رقم الجناح. الدور الموجودة لا تتكرر.</p>
          <textarea className="input" style={{ minHeight: 200 }} placeholder={'دار ابن الجوزي، B-14\nدار طيبة، B-03'} value={bulk} onChange={(e) => setBulk(e.target.value)} />
          <button className="btn btn-primary" style={{ marginTop: 12 }} disabled={!bulk.trim()} onClick={addBulk}>إضافة القائمة</button>
        </section>
      </div>
    </>
  )
}

function PubRow({ p, reload, onDelete }) {
  const [name, setName] = useState(p.name)
  const [booth, setBooth] = useState(p.booth || '')
  const save = async () => {
    if (name.trim() === p.name && (booth.trim() || null) === (p.booth || null)) return
    await api.updatePublisher(p.id, { name: name.trim() || p.name, booth: booth.trim() || null })
    reload()
  }
  return (
    <tr>
      <td><input className="input sm" value={name} onChange={(e) => setName(e.target.value)} onBlur={save} aria-label="اسم الدار" /></td>
      <td><input className="input sm ltr-in" style={{ width: 90 }} value={booth} onChange={(e) => setBooth(e.target.value)} onBlur={save} aria-label="الجناح" /></td>
      <td><button className="btn btn-quiet btn-sm btn-danger" onClick={onDelete}>حذف</button></td>
    </tr>
  )
}
