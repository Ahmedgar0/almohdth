// مراحل الطلب: تسمية للإدارة، وتسمية مبسّطة للعميل
export const ORDER_STATUS = {
  new: { label: 'بانتظار التسعير', customer: 'نسعّر كتبك من المعرض', tone: 'info' },
  priced: { label: 'جاهز لإبلاغ العميل', customer: 'نسعّر كتبك من المعرض', tone: 'act' },
  awaiting_payment: { label: 'بانتظار الدفع', customer: 'السعر جاهز، بانتظار الدفع', tone: 'warn' },
  paid: { label: 'مدفوع، قيد الشراء', customer: 'تم الدفع، نشتري كتبك', tone: 'good' },
  purchased: { label: 'تم الشراء، قيد التغليف', customer: 'اشترينا كتبك ونجهّزها', tone: 'good' },
  ready_to_ship: { label: 'جاهز للشحن', customer: 'طلبك جاهز للشحن', tone: 'act' },
  shipped: { label: 'تم الشحن', customer: 'تم الشحن', tone: 'done' },
  cancelled: { label: 'ملغي', customer: 'ملغي', tone: 'bad' },
}

export const PIPELINE = ['new', 'priced', 'awaiting_payment', 'paid', 'purchased', 'ready_to_ship', 'shipped']

export const ITEM_STATUS = {
  pending: { label: 'بانتظار التسعير', tone: 'info' },
  available: { label: 'متوفر', tone: 'good' },
  unavailable: { label: 'غير متوفر', tone: 'bad' },
  declined: { label: 'ألغاه العميل', tone: 'done' },
  purchased: { label: 'تم الشراء', tone: 'done' },
}

export const CARRIERS = {
  redbox: { name: 'ريدبوكس', desc: 'استلام من أقرب خزانة ذكية', domestic: true },
  smsa: { name: 'سمسا', desc: 'توصيل إلى باب المنزل', domestic: true },
  dhl: { name: 'DHL', desc: 'شحن دولي، تُحدد تكلفته بعد التسعير', domestic: false },
}

export const FEE_MODES = {
  fixed: 'مبلغ ثابت لكل طلب',
  per_book: 'مبلغ لكل كتاب',
  percent: 'نسبة من قيمة الكتب',
}

const nf = new Intl.NumberFormat('ar-SA-u-nu-latn', { maximumFractionDigits: 2 })
export const num = (n) => nf.format(Number(n) || 0)
export const sar = (n) => `${num(n)} ر.س`

export function dateTime(iso) {
  try {
    return new Date(iso).toLocaleString('ar-SA-u-nu-latn-ca-gregory', {
      day: 'numeric',
      month: 'short',
      hour: 'numeric',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

export function ago(iso) {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000))
  if (m < 1) return 'الآن'
  if (m < 60) return `قبل ${m} د`
  const h = Math.floor(m / 60)
  if (h < 24) return `قبل ${h} س`
  return `قبل ${Math.floor(h / 24)} يوم`
}

export const hoursSince = (iso) => (iso ? (Date.now() - new Date(iso).getTime()) / 3600e3 : 0)

export const dayKey = (iso) => {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export const normTitle = (s) =>
  String(s || '')
    .trim()
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/\s+/g, ' ')
    .toLowerCase()

export const copies = (n) => `${num(n)} ${Number(n) === 1 ? 'نسخة' : 'نسخ'}`
