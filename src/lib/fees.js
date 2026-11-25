import { sar, num } from './format'

// الكتب المحسوبة في المبلغ: كل كتاب ليس "غير متوفر" ولا "ألغاه العميل"
export const countedItems = (items) => (items || []).filter((i) => i.status !== 'unavailable' && i.status !== 'declined')

export const booksTotal = (items) =>
  countedItems(items).reduce((s, i) => s + (Number(i.unit_price) || 0) * (Number(i.quantity) || 1), 0)

export const booksCount = (items) => countedItems(items).reduce((s, i) => s + (Number(i.quantity) || 1), 0)

// fee: إعدادات الرسوم (من الإعدادات أو المحفوظة مع الطلب)
export function serviceFee(fee, items) {
  if (!fee) return 0
  const count = booksCount(items)
  if (count === 0) return 0
  let v = 0
  if (fee.fee_mode === 'fixed') v = Number(fee.fee_fixed) || 0
  else if (fee.fee_mode === 'per_book') v = (Number(fee.fee_per_book) || 0) * count
  else if (fee.fee_mode === 'percent') v = Math.max((booksTotal(items) * (Number(fee.fee_percent) || 0)) / 100, Number(fee.fee_min) || 0)
  return Math.round(v * 100) / 100
}

export function orderTotals(order, overrides = {}) {
  const o = { ...order, ...overrides }
  const books = booksTotal(o.items)
  const fee = serviceFee(o, o.items)
  const shipping = o.shipping_cost == null || o.shipping_cost === '' ? null : Number(o.shipping_cost)
  return { books, fee, shipping, total: books + fee + (shipping || 0), shippingKnown: shipping != null }
}

export function feeDescription(s, bookCount) {
  if (!s) return ''
  if (s.fee_mode === 'fixed') return `${sar(s.fee_fixed)} لكل طلب، مهما كان عدد الكتب`
  if (s.fee_mode === 'per_book') {
    const base = `${sar(s.fee_per_book)} لكل كتاب`
    return bookCount > 0 ? `${base}، أي ${sar(bookCount * s.fee_per_book)} لطلبك` : base
  }
  if (s.fee_mode === 'percent') {
    const min = Number(s.fee_min) > 0 ? `، بحد أدنى ${sar(s.fee_min)}` : ''
    return `${num(s.fee_percent)}٪ من قيمة الكتب${min}`
  }
  return ''
}

// قيمة الرسوم إن أمكن معرفتها قبل التسعير
export function feeKnownUpfront(s, bookCount) {
  if (s.fee_mode === 'fixed') return Number(s.fee_fixed) || 0
  if (s.fee_mode === 'per_book') return (Number(s.fee_per_book) || 0) * bookCount
  return null
}
