import { createClient } from '@supabase/supabase-js'
import { compressImage, blobToDataUrl } from './image'
import { ORDER_STATUS } from './format'
import { normalizePhone } from './countries'

const URL_ = import.meta.env.VITE_SUPABASE_URL
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
export const IS_DEMO = !URL_ || !KEY || import.meta.env.VITE_DEMO === '1'
export const DEMO_PASSWORD = 'demo'
export const DEMO_EMAILS = { admin: 'admin@demo.com', fair: 'fair@demo.com' }
export const DEMO_CUSTOMER = { phone: '500000000' }

/* ===================== حساب العميل: الاسم ورقم الجوال ===================== */
// لا رمز ولا كلمة مرور: رقم الجوال هو حساب العميل، ويُحفظ على جهازه حتى يخرج
const CK = 'fair-customer-v1'
const customerSubs = new Set()
export function getCustomer() {
  try {
    return JSON.parse(localStorage.getItem(CK) || 'null')
  } catch {
    return customerMem
  }
}
let customerMem = null
export function setCustomer(c) {
  customerMem = c
  try {
    if (c) localStorage.setItem(CK, JSON.stringify(c))
    else localStorage.removeItem(CK)
  } catch {
    /* */
  }
  customerSubs.forEach((f) => f(c))
}
export function onCustomer(f) {
  customerSubs.add(f)
  return () => customerSubs.delete(f)
}

// آخر عنوان استخدمه العميل على هذا الجهاز (لا يُجلب من الخادم حفاظاً على خصوصيته)
const AK = 'fair-last-address-v1'
export function getLastAddress(phoneKey) {
  try {
    const a = JSON.parse(localStorage.getItem(AK) || 'null')
    return a && a.key === phoneKey ? a : null
  } catch {
    return null
  }
}
export function saveLastAddress(a) {
  try {
    localStorage.setItem(AK, JSON.stringify(a))
  } catch {
    /* */
  }
}

export const DEFAULT_SETTINGS = {
  store_name: 'دار المحدث',
  event_name: 'معرض الرياض للكتاب',
  accepting_orders: true,
  fee_mode: 'fixed',
  fee_fixed: 15,
  fee_per_book: 5,
  fee_percent: 10,
  fee_min: 10,
  ship_redbox: 11.35,
  ship_smsa: 26,
  payment_hours: 24,
  policies: [
    'رسوم الخدمة منفصلة عن قيمة الكتب وتكلفة الشحن، وتُضاف إليهما في رابط الدفع.',
    'نتواصل معك عبر واتساب على الرقم المسجّل لإبلاغك بأسعار الكتب والمبلغ الكامل وإرسال رابط الدفع.',
    'لا نشتري أي كتاب قبل إتمام الدفع، ومدة صلاحية رابط الدفع 24 ساعة.',
    'إذا نفد الكتاب من الجناح بعد الدفع، نعيد قيمته كاملة أو نضيفها رصيداً في محفظتك في المتجر حسب اختيارك.',
    'يُشحن الطلب خلال 3 أيام عمل من تاريخ الدفع.',
    'الطلبات الدولية تُشحن عبر DHL، وتكلفة الشحن تُحدد بعد تسعير الطلب حسب الدولة والوزن، والرسوم الجمركية في بلد العميل يتحملها العميل.',
  ].join('\n'),
}

function authError(e) {
  const m = String(e?.message || '')
  if (/invalid login|invalid credentials/i.test(m)) return new Error('البريد أو كلمة المرور غير صحيحة')
  if (/rate limit|too many/i.test(m)) return new Error('محاولات كثيرة، انتظر دقيقة ثم حاول')
  if (/password/i.test(m)) return new Error('كلمة المرور قصيرة، اجعلها 8 أحرف على الأقل')
  return new Error('تعذّر إكمال العملية، حاول مرة أخرى')
}

/* ============================== Supabase ============================== */

let sb = null
if (!IS_DEMO) sb = createClient(URL_, KEY)
const BUCKET = 'book-images'
export const imageUrl = (path) => {
  if (!path) return null
  if (IS_DEMO || path.startsWith('data:')) return path
  return sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
}
const must = ({ data, error }) => {
  if (error) throw new Error(error.message || 'تعذّر الحفظ')
  return data
}

const supa = {
  /* ---- دخول الفريق: البريد وكلمة المرور ---- */
  async signIn(email, password) {
    const { data, error } = await sb.auth.signInWithPassword({ email, password })
    if (error) throw authError(error)
    return data.session
  },
  async changePassword(password) {
    const { error } = await sb.auth.updateUser({ password })
    if (error) throw authError(error)
  },
  // ينشئ حساب دخول لعضو جديد دون أن يخرج المدير من حسابه
  async createStaffLogin(email, password) {
    const tmp = createClient(URL_, KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'staff-create' } })
    const { error } = await tmp.auth.signUp({ email, password })
    if (error) {
      if (/registered|exists/i.test(error.message)) return { existed: true }
      throw authError(error)
    }
    return { existed: false }
  },
  async getSession() {
    return (await sb.auth.getSession()).data.session
  },
  onAuth(cb) {
    const { data } = sb.auth.onAuthStateChange((_e, s) => cb(s))
    return () => data.subscription.unsubscribe()
  },
  async signOut() {
    await sb.auth.signOut()
  },
  async staffRole() {
    const { data, error } = await sb.rpc('staff_role')
    return error ? null : data || null
  },

  /* ---- العميل ---- */
  async myOrders(dial, phone) {
    return must(await sb.rpc('my_orders', { p_dial: dial, p_phone: phone })) || []
  },
  async getSettings() {
    const data = must(await sb.from('settings').select('*').eq('id', 1).maybeSingle())
    return { ...DEFAULT_SETTINGS, ...(data || {}) }
  },
  async listPublishers() {
    return must(await sb.from('publishers').select('*').order('name'))
  },
  async uploadImage(blob) {
    const path = `${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.jpg`
    const { error } = await sb.storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg' })
    if (error) throw new Error('تعذّر رفع الصورة، حاول مرة أخرى أو احذفها وأرسل الطلب بدونها')
    return path
  },
  async submitOrder(payload) {
    return must(await sb.rpc('submit_order', { p: payload }))
  },

  /* ---- الإدارة ---- */
  async listOrders() {
    const data = must(
      await sb.from('orders').select('*, items:order_items(*), events:order_events(*)').order('created_at', { ascending: false }),
    )
    return data.map((o) => ({
      ...o,
      items: (o.items || []).sort((a, b) => (a.created_at < b.created_at ? -1 : 1)),
      events: (o.events || []).sort((a, b) => (a.created_at < b.created_at ? -1 : 1)),
    }))
  },
  async updateOrder(id, patch) {
    must(await sb.from('orders').update(patch).eq('id', id))
  },
  async updateItems(updates) {
    const res = await Promise.all(updates.map(({ id, patch }) => sb.from('order_items').update(patch).eq('id', id)))
    const bad = res.find((r) => r.error)
    if (bad) throw new Error(bad.error.message)
  },
  async addEvent(orderId, message) {
    const actor = (await this.staffName()) || null
    await sb.from('order_events').insert({ order_id: orderId, message, actor })
  },
  async staffName() {
    const { data: u } = await sb.auth.getUser()
    const email = u?.user?.email
    if (!email) return null
    const { data } = await sb.from('staff').select('name').eq('email', email.toLowerCase()).maybeSingle()
    return data?.name || email
  },
  async saveSettings(patch) {
    must(await sb.from('settings').upsert({ id: 1, ...patch, updated_at: new Date().toISOString() }))
  },
  async addPublisher(p) {
    must(await sb.from('publishers').insert(p))
  },
  async updatePublisher(id, patch) {
    must(await sb.from('publishers').update(patch).eq('id', id))
  },
  async deletePublisher(id) {
    must(await sb.from('publishers').delete().eq('id', id))
  },
  async listStaff() {
    return must(await sb.from('staff').select('*').order('created_at'))
  },
  async saveStaff(member) {
    must(await sb.from('staff').upsert({ ...member, email: member.email.trim().toLowerCase() }))
  },
  async removeStaff(email) {
    must(await sb.from('staff').delete().eq('email', email))
  },
  subscribe(cb) {
    const ch = sb
      .channel('orders-feed')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, cb)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, cb)
      .subscribe()
    return () => sb.removeChannel(ch)
  },

  /* ---- المعرض ---- */
  async fairBoard() {
    return must(await sb.rpc('fair_board')) || []
  },
  async fairUpdate(ids, action, price = null, note = null) {
    must(await sb.rpc('fair_update_items', { p_ids: ids, p_action: action, p_price: price, p_note: note }))
  },
  async fairPack(orderId, undo = false) {
    must(await sb.rpc('fair_mark_packed', { p_order: orderId, p_undo: undo }))
  },
}

/* ============================== Demo ============================== */
// وضع العرض التجريبي: يحاكي منطق الخادم داخل المتصفح

const LS = 'fair-orders-demo-v4'
const mem = { state: null, session: null, authCbs: new Set() }
const listeners = new Set()

const uid = () => {
  try {
    return crypto.randomUUID()
  } catch {
    return Math.random().toString(36).slice(2) + Date.now().toString(36)
  }
}

function seed() {
  const pubs = [
    ['دار ابن الجوزي', 'B-14'],
    ['دار التدمرية', 'C-07'],
    ['دار الحضارة', 'A-22'],
    ['دار طيبة', 'B-03'],
    ['مكتبة الرشد', 'D-11'],
    ['دار عالم الفوائد', 'A-09'],
  ].map(([name, booth]) => ({ id: uid(), name, booth }))
  const staff = [
    { email: DEMO_EMAILS.admin, name: 'فريق الإدارة', role: 'admin', created_at: new Date().toISOString() },
    { email: DEMO_EMAILS.fair, name: 'سالم (المعرض)', role: 'fair', created_at: new Date().toISOString() },
  ]
  const now = Date.now()
  const H = 3600e3
  const at = (h) => new Date(now - h * H).toISOString()
  const people = {
    me: { name: 'عميل تجريبي', country: 'SA', dial: '966', phone: DEMO_CUSTOMER.phone, short: 'RRRD2929' },
    a: { email: 'a.q@example.com', name: 'عبدالله القحطاني', country: 'SA', dial: '966', phone: '551234567', short: 'RIYA1180' },
    m: { email: 'm.sh@example.com', name: 'محمد الشهري', country: 'SA', dial: '966', phone: '502223344', short: 'JEDA4521' },
    s: { email: 's.o@example.com', name: 'سارة العتيبي', country: 'KW', dial: '965', phone: '55512345', city: 'الكويت', line: 'حولي، شارع تونس، مبنى 14', zip: '32001' },
    y: { email: 'yusuf@example.com', name: 'Yusuf Ahmed', country: 'GB', dial: '44', phone: '7700900123', city: 'London', line: '12 Baker St', zip: 'NW1 6XE' },
    n: { email: 'n.h@example.com', name: 'نورة الحربي', country: 'SA', dial: '966', phone: '544445566', short: 'MDNA3030' },
    k: { email: 'k.d@example.com', name: 'خالد الدوسري', country: 'SA', dial: '966', phone: '533335555', short: 'DMMA7712' },
  }
  const mk = (no, h, who, status, carrier, items, x = {}) => {
    const c = people[who]
    const created = at(h)
    const o = {
      id: uid(), order_no: `RF-${no}`, created_at: created,
      customer_name: c.name, country: c.country, phone_dial: c.dial, phone: c.phone,
      short_address: c.short || null, city: c.city || null, address_line: c.line || null, postal_code: c.zip || null,
      address_notes: null, customer_notes: x.notes || null,
      shipping_carrier: carrier,
      shipping_cost: carrier === 'redbox' ? 11.35 : carrier === 'smsa' ? 26 : x.ship ?? null,
      status, fee_mode: 'fixed', fee_fixed: 15, fee_per_book: 5, fee_percent: 10, fee_min: 10,
      payment_link: x.link || null, quote_sent_at: x.quoted ? at(x.quoted) : null, paid_at: x.paid ? at(x.paid) : null,
      shipped_at: null, tracking_number: x.tracking || null, admin_notes: null,
      items: items.map(([t, a, p, q, st, price, alt, note]) => ({
        id: uid(), title: t, author: a, publisher_id: pubs[p].id, publisher_name: pubs[p].name, quantity: q,
        accept_alternative: !!alt, unit_price: price ?? null, status: st, image_path: null, fair_note: note || null, created_at: created,
      })),
      events: [{ id: uid(), created_at: created, actor: 'العميل', message: 'أرسل العميل الطلب' }],
    }
    return o
  }
  const orders = [
    mk(1009, 0.4, 'a', 'new', 'smsa', [
      ['شرح العقيدة الطحاوية', 'ابن أبي العز', 0, 1, 'pending'],
      ['فتح الباري', 'ابن حجر العسقلاني', 3, 1, 'pending', null, true],
      ['زاد المعاد', 'ابن القيم', 1, 1, 'pending'],
    ], { notes: 'أفضّل الطبعة المجلدة' }),
    mk(1008, 2, 'm', 'new', 'redbox', [
      ['زاد المعاد', 'ابن القيم', 1, 2, 'available', 120],
      ['تهذيب الكمال', 'المزي', 4, 1, 'pending'],
    ]),
    mk(1007, 4, 's', 'priced', 'dhl', [
      ['الرسالة', 'الإمام الشافعي', 1, 1, 'available', 45],
      ['مختصر صحيح البخاري', 'الزبيدي', 2, 1, 'available', 60, true, 'طبعة 2019 مجلد واحد'],
      ['الكامل في التاريخ', 'ابن الأثير', 2, 1, 'unavailable'],
    ]),
    mk(1006, 7, 'me', 'awaiting_payment', 'redbox', [
      ['الأذكار', 'النووي', 4, 1, 'available', 35],
      ['بدائع الفوائد', 'ابن القيم', 5, 1, 'available', 95],
    ], { link: 'https://salla.sa/', quoted: 5 }),
    mk(1005, 30, 'y', 'awaiting_payment', 'dhl', [
      ['سير أعلام النبلاء', 'الذهبي', 3, 1, 'available', 650],
    ], { link: 'https://salla.sa/', quoted: 27, ship: 180 }),
    mk(1004, 10, 'n', 'paid', 'smsa', [
      ['صفة الصفوة', 'ابن الجوزي', 0, 1, 'available', 85],
      ['زاد المعاد', 'ابن القيم', 1, 1, 'available', 120],
      ['رياض الصالحين', 'النووي', 4, 2, 'purchased', 40],
    ], { link: 'https://salla.sa/', quoted: 8, paid: 6 }),
    mk(1003, 26, 'k', 'purchased', 'redbox', [
      ['الأدب المفرد', 'البخاري', 3, 1, 'purchased', 30],
      ['مدارج السالكين', 'ابن القيم', 5, 1, 'purchased', 140],
    ], { link: 'https://salla.sa/', quoted: 22, paid: 20 }),
    mk(1002, 40, 'a', 'ready_to_ship', 'smsa', [
      ['تفسير ابن كثير', 'ابن كثير', 3, 1, 'purchased', 320],
    ], { link: 'https://salla.sa/', quoted: 36, paid: 34 }),
    mk(1001, 52, 'me', 'shipped', 'smsa', [
      ['الأربعون النووية', 'النووي', 4, 2, 'purchased', 20],
      ['بلوغ المرام', 'ابن حجر العسقلاني', 2, 1, 'purchased', 55],
    ], { link: 'https://salla.sa/', quoted: 48, paid: 47, tracking: '290011223344' }),
  ]
  return { settings: { ...DEFAULT_SETTINGS }, publishers: pubs, staff, orders, seq: 1010 }
}

function load() {
  if (mem.state) return mem.state
  try {
    const raw = localStorage.getItem(LS)
    if (raw) mem.state = JSON.parse(raw)
  } catch {
    /* التخزين غير متاح */
  }
  if (!mem.state) mem.state = seed()
  return mem.state
}
// مزامنة بين التبويبات في العرض التجريبي (العميل والإدارة والمعرض في تبويبات منفصلة)
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key !== LS) return
    mem.state = null
    listeners.forEach((f) => f())
  })
}

function persist() {
  try {
    localStorage.setItem(LS, JSON.stringify(mem.state))
  } catch {
    /* تبقى البيانات في الذاكرة */
  }
  listeners.forEach((f) => f())
}
function readSession() {
  if (mem.session) return mem.session
  try {
    const e = sessionStorage.getItem('demo-session')
    if (e) mem.session = { user: { email: e } }
  } catch {
    /* */
  }
  return mem.session
}
function setSession(s) {
  mem.session = s
  try {
    if (s) sessionStorage.setItem('demo-session', s.user.email)
    else sessionStorage.removeItem('demo-session')
  } catch {
    /* */
  }
  mem.authCbs.forEach((f) => f(s))
}

const wait = (ms = 120) => new Promise((r) => setTimeout(r, ms))
const clone = (x) => JSON.parse(JSON.stringify(x))
const me = () => readSession()?.user?.email || ''
const actor = () => {
  const s = load().staff.find((x) => x.email === me())
  return s ? s.name || s.email : me() || 'النظام'
}
const findOrder = (id) => load().orders.find((o) => o.id === id)
const findItem = (id) => {
  for (const o of load().orders) {
    const i = o.items.find((x) => x.id === id)
    if (i) return [o, i]
  }
  return [null, null]
}
function log(o, message, who = actor()) {
  o.events.push({ id: uid(), created_at: new Date().toISOString(), actor: who, message })
}
function setStatus(o, status) {
  if (o.status === status) return
  o.status = status
  const now = new Date().toISOString()
  if (status === 'awaiting_payment' && !o.quote_sent_at) o.quote_sent_at = now
  if (status === 'paid' && !o.paid_at) o.paid_at = now
  if (status === 'shipped' && !o.shipped_at) o.shipped_at = now
  log(o, `نقل الطلب إلى «${ORDER_STATUS[status]?.label || status}»`)
}
// نفس منطق sync_order_status في الخادم
function sync(o) {
  const pending = o.items.filter((i) => i.status === 'pending').length
  const live = o.items.filter((i) => ['available', 'purchased', 'pending'].includes(i.status)).length
  const bought = o.items.filter((i) => i.status === 'purchased').length
  if (o.status === 'new' || o.status === 'priced') setStatus(o, pending > 0 ? 'new' : 'priced')
  else if (o.status === 'paid' || o.status === 'purchased') setStatus(o, live > 0 && bought === live ? 'purchased' : 'paid')
}
const roleOf = (email) => load().staff.find((s) => s.email === email)?.role || null

const demo = {
  async signIn(email, password) {
    await wait(300)
    if (password !== DEMO_PASSWORD) throw new Error(`البريد أو كلمة المرور غير صحيحة (للتجربة: ${DEMO_PASSWORD})`)
    const s = { user: { email: email.trim().toLowerCase() } }
    setSession(s)
    return s
  },
  async changePassword() {
    await wait(300)
  },
  async createStaffLogin() {
    return { existed: false }
  },
  async getSession() {
    return readSession()
  },
  onAuth(cb) {
    mem.authCbs.add(cb)
    return () => mem.authCbs.delete(cb)
  },
  async signOut() {
    setSession(null)
  },
  async staffRole() {
    return roleOf(me())
  },
  async myOrders(dial, phone) {
    await wait()
    const ph = normalizePhone(phone, dial)
    return load()
      .orders.filter((o) => o.phone_dial === dial && o.phone === ph)
      .map(customerView)
  },
  async getSettings() {
    return clone(load().settings)
  },
  async listPublishers() {
    return clone(load().publishers).sort((a, b) => a.name.localeCompare(b.name, 'ar'))
  },
  async uploadImage(blob) {
    const small = await compressImage(new File([blob], 'x.jpg', { type: 'image/jpeg' }), 500, 0.7)
    return blobToDataUrl(small)
  },
  async submitOrder(p) {
    await wait(450)
    const s = load()
    if (!s.settings.accepting_orders) throw new Error('استقبال الطلبات متوقف حالياً')
    const intl = p.country !== 'SA'
    const carrier = intl ? 'dhl' : p.shipping_carrier
    if (!intl && !['redbox', 'smsa'].includes(carrier)) throw new Error('اختر شركة الشحن')
    const created = new Date().toISOString()
    const o = {
      id: uid(), order_no: `RF-${s.seq++}`, created_at: created,
      customer_name: p.customer_name, country: p.country, phone_dial: p.phone_dial, phone: p.phone,
      short_address: p.short_address || null, city: p.city || null, address_line: p.address_line || null,
      postal_code: p.postal_code || null, address_notes: p.address_notes || null, customer_notes: p.customer_notes || null,
      shipping_carrier: carrier,
      shipping_cost: carrier === 'redbox' ? s.settings.ship_redbox : carrier === 'smsa' ? s.settings.ship_smsa : null,
      status: 'new', fee_mode: s.settings.fee_mode, fee_fixed: s.settings.fee_fixed, fee_per_book: s.settings.fee_per_book,
      fee_percent: s.settings.fee_percent, fee_min: s.settings.fee_min,
      payment_link: null, quote_sent_at: null, paid_at: null, shipped_at: null, tracking_number: null, admin_notes: null,
      items: p.items.map((i) => ({
        id: uid(), title: i.title, author: i.author || null, publisher_id: i.publisher_id || null,
        publisher_name: i.publisher_id ? s.publishers.find((x) => x.id === i.publisher_id)?.name || i.publisher_name : i.publisher_name,
        quantity: i.quantity, accept_alternative: i.accept_alternative, unit_price: null, status: 'pending',
        image_path: i.image_path || null, fair_note: null, created_at: created,
      })),
      events: [{ id: uid(), created_at: created, actor: 'العميل', message: 'أرسل العميل الطلب' }],
    }
    s.orders.unshift(o)
    persist()
    return { order_no: o.order_no }
  },

  /* ---- الإدارة ---- */
  async listOrders() {
    await wait()
    if (roleOf(me()) !== 'admin') throw new Error('غير مصرح')
    return clone(load().orders)
  },
  async updateOrder(id, patch) {
    const o = findOrder(id)
    if (!o) return
    const { status, ...rest } = patch
    Object.assign(o, rest)
    if (status) setStatus(o, status)
    persist()
  },
  async updateItems(updates) {
    const touched = new Set()
    for (const { id, patch } of updates) {
      const [o, i] = findItem(id)
      if (!i) continue
      Object.assign(i, patch)
      touched.add(o)
    }
    touched.forEach(sync)
    persist()
  },
  async addEvent(orderId, message) {
    const o = findOrder(orderId)
    if (o) log(o, message)
    persist()
  },
  async saveSettings(patch) {
    Object.assign(load().settings, patch)
    persist()
  },
  async addPublisher(p) {
    load().publishers.push({ id: uid(), ...p })
    persist()
  },
  async updatePublisher(id, patch) {
    Object.assign(load().publishers.find((p) => p.id === id) || {}, patch)
    persist()
  },
  async deletePublisher(id) {
    const s = load()
    s.publishers = s.publishers.filter((p) => p.id !== id)
    persist()
  },
  async listStaff() {
    return clone(load().staff)
  },
  async saveStaff(m) {
    const s = load()
    const email = m.email.trim().toLowerCase()
    const ex = s.staff.find((x) => x.email === email)
    if (ex) Object.assign(ex, m, { email })
    else s.staff.push({ ...m, email, created_at: new Date().toISOString() })
    persist()
  },
  async removeStaff(email) {
    const s = load()
    s.staff = s.staff.filter((x) => x.email !== email)
    persist()
  },
  subscribe(cb) {
    listeners.add(cb)
    return () => listeners.delete(cb)
  },

  /* ---- المعرض ---- */
  async fairBoard() {
    await wait()
    if (!roleOf(me())) throw new Error('غير مصرح')
    const cutoff = Date.now() - 48 * 3600e3
    return load()
      .orders.filter((o) => ['new', 'priced', 'paid', 'purchased', 'ready_to_ship'].includes(o.status) || (o.status === 'shipped' && new Date(o.shipped_at || 0).getTime() > cutoff))
      .map((o) => ({
        id: o.id, order_no: o.order_no, created_at: o.created_at, status: o.status, customer_name: o.customer_name,
        country: o.country, shipping_carrier: o.shipping_carrier, paid_at: o.paid_at, items: clone(o.items),
      }))
      .sort((a, b) => (a.created_at < b.created_at ? -1 : 1))
  },
  async fairUpdate(ids, action, price = null, note = null) {
    await wait(80)
    const touched = new Set()
    for (const id of ids) {
      const [o, i] = findItem(id)
      if (!i) continue
      if (['price', 'unavailable', 'reprice'].includes(action)) {
        if (!['new', 'priced'].includes(o.status)) throw new Error('لا يمكن تعديل السعر بعد إرسال السعر للعميل')
        if (action === 'unavailable') {
          log(o, `«${i.title}» غير متوفر`)
          Object.assign(i, { status: 'unavailable', unit_price: null })
        } else if (action === 'reprice') Object.assign(i, { status: 'pending', unit_price: null })
        else {
          if (price == null || price < 0) throw new Error('السعر غير صحيح')
          log(o, `سعّر «${i.title}» بـ ${price} ر.س`)
          Object.assign(i, { status: 'available', unit_price: price })
        }
      } else if (action === 'note') i.fair_note = (note || '').trim() || null
      else {
        if (!['paid', 'purchased'].includes(o.status)) throw new Error('الشراء متاح بعد تأكيد الدفع فقط')
        if (action === 'purchased' && i.status === 'available') i.status = 'purchased'
        else if (action === 'unpurchase' && i.status === 'purchased') i.status = 'available'
        else if (action === 'soldout' && ['available', 'purchased'].includes(i.status)) {
          i.status = 'unavailable'
          log(o, `«${i.title}» نفد بعد الدفع، يلزم استرجاع قيمته للعميل`)
        }
      }
      touched.add(o)
    }
    touched.forEach(sync)
    persist()
  },
  async fairPack(orderId, undo = false) {
    const o = findOrder(orderId)
    if (!o) return
    if (undo) {
      if (o.status === 'ready_to_ship') setStatus(o, 'purchased')
    } else {
      if (o.status !== 'purchased') throw new Error('الطلب ليس جاهزاً للتغليف')
      setStatus(o, 'ready_to_ship')
    }
    persist()
  },
  resetDemo() {
    mem.state = seed()
    persist()
  },
}

// ما يراه العميل من طلبه (نفس منطق my_orders في الخادم)
export function customerView(o) {
  const early = o.status === 'new' || o.status === 'priced'
  return {
    order_no: o.order_no,
    status: o.status,
    created_at: o.created_at,
    shipping_carrier: o.shipping_carrier,
    shipping_cost: o.shipping_carrier === 'dhl' && early ? null : o.shipping_cost,
    payment_link: o.status === 'awaiting_payment' ? o.payment_link : null,
    tracking_number: o.status === 'shipped' ? o.tracking_number : null,
    fee_mode: o.fee_mode,
    fee_fixed: o.fee_fixed,
    fee_per_book: o.fee_per_book,
    fee_percent: o.fee_percent,
    fee_min: o.fee_min,
    items: o.items.map((i) => ({
      title: i.title,
      publisher_name: i.publisher_name,
      quantity: i.quantity,
      status: i.status,
      unit_price: early ? null : i.unit_price,
    })),
  }
}

export const api = IS_DEMO ? demo : supa
