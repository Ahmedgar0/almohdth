import { orderTotals } from './fees'
import { num, sar, CARRIERS } from './format'
import { countryName } from './countries'

export const waLink = (o, text) =>
  `https://wa.me/${o.phone_dial}${o.phone}${text ? `?text=${encodeURIComponent(text)}` : ''}`

export const allUnavailable = (o) => o.items.length > 0 && o.items.every((i) => i.status === 'unavailable')

export function addressText(o) {
  if (o.country === 'SA') return [o.short_address, o.address_notes].filter(Boolean).join(' — ')
  return [o.address_line, o.city, o.postal_code, countryName(o.country), o.address_notes].filter(Boolean).join('، ')
}

const sign = (s) => `\n${s.store_name}`

export function quoteMessage(o, s) {
  const t = orderTotals(o)
  const ok = o.items.filter((i) => i.status === 'available' || i.status === 'purchased')
  const no = o.items.filter((i) => i.status === 'unavailable')
  const L = [`السلام عليكم ${o.customer_name}،`, `أسعار طلبك رقم ${o.order_no} من ${s.event_name} جاهزة:`, '']
  if (ok.length) {
    L.push('الكتب المتوفرة:')
    ok.forEach((i) => {
      L.push(`• ${i.title}${i.quantity > 1 ? ` (${i.quantity} نسخ)` : ''}: ${sar((i.unit_price || 0) * i.quantity)}`)
      if (i.fair_note) L.push(`  ملاحظة: ${i.fair_note}`)
    })
  }
  if (no.length) {
    L.push('', 'غير متوفرة في المعرض:')
    no.forEach((i) => L.push(`• ${i.title}`))
  }
  L.push(
    '',
    `قيمة الكتب: ${sar(t.books)}`,
    `رسوم الخدمة: ${sar(t.fee)}`,
    `الشحن (${CARRIERS[o.shipping_carrier]?.name}): ${sar(t.shipping || 0)}`,
    `المبلغ الكامل: ${sar(t.total)}`,
  )
  if (o.payment_link) L.push('', `رابط الدفع: ${o.payment_link}`)
  L.push('', `صلاحية رابط الدفع ${s.payment_hours || 24} ساعة، ونشتري الكتب فور إتمام الدفع.`)
  L.push('إن أردت حذف أي كتاب من الطلب فأخبرنا قبل الدفع.')
  return L.join('\n') + sign(s)
}

export function reminderMessage(o, s) {
  const t = orderTotals(o)
  return [
    `السلام عليكم ${o.customer_name}،`,
    `تذكير بطلبك رقم ${o.order_no}: المبلغ ${sar(t.total)} بانتظار الدفع.`,
    o.payment_link ? `رابط الدفع: ${o.payment_link}` : null,
    'الكتب في المعرض محدودة، وننصح بالدفع قريباً حتى لا تنفد.',
  ]
    .filter(Boolean)
    .join('\n') + sign(s)
}

export function unavailableMessage(o, s) {
  return [
    `السلام عليكم ${o.customer_name}،`,
    `نعتذر منك، الكتب المطلوبة في طلبك رقم ${o.order_no} غير متوفرة في ${s.event_name}.`,
    'لم يُخصم منك أي مبلغ، ونسعد بخدمتك في طلب آخر.',
  ].join('\n') + sign(s)
}

export function paidMessage(o, s) {
  return [
    `السلام عليكم ${o.customer_name}،`,
    `استلمنا دفعتك لطلب رقم ${o.order_no}، شكراً لك.`,
    'فريقنا في المعرض يشتري كتبك الآن، وسنبلغك فور شحنها.',
  ].join('\n') + sign(s)
}

export function shippedMessage(o, s) {
  return [
    `السلام عليكم ${o.customer_name}،`,
    `شُحن طلبك رقم ${o.order_no} عبر ${CARRIERS[o.shipping_carrier]?.name}.`,
    o.tracking_number ? `رقم الشحنة: ${o.tracking_number}` : null,
    'شكراً لثقتك.',
  ]
    .filter(Boolean)
    .join('\n') + sign(s)
}

export function toCSV(orders) {
  const head = ['رقم الطلب', 'التاريخ', 'المرحلة', 'العميل', 'الجوال', 'الدولة', 'العنوان', 'الشحن', 'الكتاب', 'المؤلف', 'دار النشر', 'الكمية', 'حالة الكتاب', 'السعر', 'قيمة الكتب', 'رسوم الخدمة', 'تكلفة الشحن', 'الإجمالي']
  const rows = [head]
  for (const o of orders) {
    const t = orderTotals(o)
    for (const i of o.items) {
      rows.push([
        o.order_no, o.created_at, o.status, o.customer_name, `+${o.phone_dial}${o.phone}`,
        countryName(o.country), addressText(o), CARRIERS[o.shipping_carrier]?.name || '', i.title, i.author || '',
        i.publisher_name, i.quantity, i.status, i.unit_price ?? '', num(t.books), num(t.fee), t.shipping ?? '', num(t.total),
      ])
    }
  }
  return '﻿' + rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
}
