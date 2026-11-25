import { setCustomer } from '../../lib/api'
import logo from '../../assets/logo.png'

const HERO = {
  order: {
    title: 'كتابك من المعرض، يصلك إلى بابك',
    text: 'اكتب الكتب التي تريدها ودار النشر لكل كتاب. فريقنا في المعرض يسعّرها لك، وتصلك الأسعار والمبلغ الكامل على واتساب، وبعد الدفع نشتريها ونشحنها إليك.',
  },
  orders: {
    title: 'طلباتي',
    text: 'تابع مرحلة كل طلب، وادفع من هنا حين يصبح السعر جاهزاً.',
  },
}

export default function CustomerLayout({ route, settings, customer, children }) {
  const h = HERO[route]
  return (
    <>
      <header className="c-header">
        <div className="c-header-in">
          <a href="#order" aria-label={settings.store_name}><img className="logo" src={logo} alt={settings.store_name} /></a>
          <nav className="c-nav">
            <a href="#order" className={route === 'order' ? 'on' : ''}>طلب جديد</a>
            <a href="#orders" className={route === 'orders' ? 'on' : ''}>طلباتي</a>
            {customer && <button className="btn btn-quiet btn-sm" onClick={() => setCustomer(null)} title={`+${customer.dial} ${customer.phone}`}>خروج</button>}
          </nav>
        </div>
      </header>
      <section className="c-hero">
        <div className="c-hero-in">
          <h1>{h.title}</h1>
          <p>{h.text}</p>
          {route === 'order' && <span className="meta">خدمة {settings.store_name} في {settings.event_name}</span>}
        </div>
      </section>
      <main className="c-main">{children}</main>
    </>
  )
}
