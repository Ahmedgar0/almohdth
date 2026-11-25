// الدول المتاحة للطلب مع مفاتيح الاتصال.
// الدول المستثناة (لا تُعرض في النموذج ويرفضها الخادم أيضاً):
// جميع الدول الأفريقية، واليمن، والعراق، وسوريا، ولبنان، والأردن، وفلسطين.
// لتعديل القائمة: عدّل EXCLUDED هنا وفي دالة submit_order في supabase/schema.sql.

export const EXCLUDED = [
  // أفريقيا
  'DZ','AO','BJ','BW','BF','BI','CV','CM','CF','TD','KM','CG','CD','CI','DJ','EG','GQ','ER','SZ','ET',
  'GA','GM','GH','GN','GW','KE','LS','LR','LY','MG','MW','ML','MR','MU','MA','MZ','NA','NE','NG','RW',
  'ST','SN','SC','SL','SO','ZA','SS','SD','TZ','TG','TN','UG','ZM','ZW','EH','RE','YT','SH',
  // دول آسيوية مستثناة
  'YE','IQ','SY','LB','JO','PS','IL',
]

const RAW = `SA:966,AE:971,KW:965,QA:974,BH:973,OM:968,TR:90,IR:98,AF:93,PK:92,IN:91,BD:880,LK:94,NP:977,
BT:975,MV:960,CN:86,HK:852,MO:853,TW:886,JP:81,KR:82,MN:976,KZ:7,UZ:998,TM:993,TJ:992,KG:996,AZ:994,
AM:374,GE:995,MY:60,SG:65,ID:62,TH:66,VN:84,PH:63,MM:95,KH:855,LA:856,BN:673,TL:670,CY:357,
GB:44,IE:353,FR:33,DE:49,IT:39,ES:34,PT:351,NL:31,BE:32,LU:352,CH:41,AT:43,DK:45,SE:46,NO:47,FI:358,
IS:354,PL:48,CZ:420,SK:421,HU:36,RO:40,BG:359,GR:30,HR:385,SI:386,RS:381,BA:387,ME:382,MK:389,AL:355,
XK:383,EE:372,LV:371,LT:370,UA:380,MD:373,BY:375,RU:7,MT:356,MC:377,LI:423,AD:376,SM:378,
US:1,CA:1,MX:52,BR:55,AR:54,CL:56,CO:57,PE:51,VE:58,EC:593,BO:591,PY:595,UY:598,GT:502,HN:504,SV:503,
NI:505,CR:506,PA:507,CU:53,DO:1,PR:1,JM:1,TT:1,BS:1,BB:1,HT:509,GY:592,SR:597,BZ:501,
AU:61,NZ:64,FJ:679,PG:675`

const PRIORITY = ['SA', 'AE', 'KW', 'QA', 'BH', 'OM']

let names
try {
  names = new Intl.DisplayNames(['ar'], { type: 'region' })
} catch {
  names = null
}

export function countryName(code) {
  if (code === 'XK') return 'كوسوفو'
  try {
    return (names && names.of(code)) || code
  } catch {
    return code
  }
}

export const COUNTRIES = RAW.replace(/\s/g, '')
  .split(',')
  .filter(Boolean)
  .map((p) => {
    const [code, dial] = p.split(':')
    return { code, dial, name: countryName(code) }
  })
  .filter((c) => !EXCLUDED.includes(c.code))
  .sort((a, b) => {
    const pa = PRIORITY.indexOf(a.code)
    const pb = PRIORITY.indexOf(b.code)
    if (pa !== -1 || pb !== -1) return (pa === -1 ? 99 : pa) - (pb === -1 ? 99 : pb)
    return a.name.localeCompare(b.name, 'ar')
  })

export const findCountry = (code) => COUNTRIES.find((c) => c.code === code)

// توحيد رقم الجوال: أرقام فقط، بدون مفتاح الدولة أو الصفر البادئ
export function normalizePhone(raw, dial) {
  let d = String(raw || '')
    .replace(/[٠-٩]/g, (x) => '٠١٢٣٤٥٦٧٨٩'.indexOf(x))
    .replace(/\D/g, '')
  if (d.startsWith('00')) d = d.slice(2)
  if (dial && d.startsWith(dial) && d.length > dial.length + 6) d = d.slice(dial.length)
  d = d.replace(/^0+/, '')
  return d
}

export function validatePhone(phone, country) {
  if (country === 'SA') return /^5\d{8}$/.test(phone)
  return /^\d{6,14}$/.test(phone)
}

// العنوان الوطني المختصر: ٤ أحرف لاتينية و٤ أرقام، مثل RRRD2929
export function normalizeShortAddress(v) {
  return String(v || '')
    .replace(/[٠-٩]/g, (x) => '٠١٢٣٤٥٦٧٨٩'.indexOf(x))
    .replace(/\s|-/g, '')
    .toUpperCase()
}
export const validShortAddress = (v) => /^[A-Z]{4}\d{4}$/.test(v)
