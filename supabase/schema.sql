-- =====================================================================
-- طلبات المعرض — دار المحدث
-- قاعدة البيانات (Supabase / PostgreSQL)
-- شغّل هذا الملف كاملاً مرة واحدة من: Supabase → SQL Editor → New query
--
-- الأدوار:
--   العميل   : بلا حساب في Supabase. يدخل بالاسم ورقم الجوال، ورقم الجوال هو حسابه.
--              يرسل الطلب ويرى طلباته عبر دالتين محددتين لا تكشفان الاسم ولا العنوان.
--   الإدارة  : staff.role = 'admin'  — صلاحية كاملة. الفريق يدخل بالبريد وكلمة المرور.
--   المعرض   : staff.role = 'fair'   — يرى الطلبات بلا بيانات تواصل، ويسعّر ويشتري ويغلّف عبر دوال محددة.
--
-- مراحل الطلب (orders.status):
--   new → priced → awaiting_payment → paid → purchased → ready_to_ship → shipped
--   (و cancelled في أي مرحلة)
--   new↔priced و paid↔purchased تتغير تلقائياً حسب حالة الكتب.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- الإعدادات (صف واحد)
-- ---------------------------------------------------------------------
create table if not exists public.settings (
  id int primary key default 1 check (id = 1),
  store_name text not null default 'دار المحدث',
  event_name text not null default 'معرض الرياض للكتاب',
  accepting_orders boolean not null default true,
  fee_mode text not null default 'fixed' check (fee_mode in ('fixed', 'per_book', 'percent')),
  fee_fixed numeric(10,2) not null default 15,
  fee_per_book numeric(10,2) not null default 5,
  fee_percent numeric(5,2) not null default 10,
  fee_min numeric(10,2) not null default 10,
  ship_redbox numeric(10,2) not null default 11.35,
  ship_smsa numeric(10,2) not null default 26,
  payment_hours int not null default 24,
  policies text not null default '',
  updated_at timestamptz not null default now()
);

insert into public.settings (id, policies) values (1,
'رسوم الخدمة منفصلة عن قيمة الكتب وتكلفة الشحن، وتُضاف إليهما في رابط الدفع.
نتواصل معك عبر واتساب على الرقم المسجّل لإبلاغك بأسعار الكتب والمبلغ الكامل وإرسال رابط الدفع.
لا نشتري أي كتاب قبل إتمام الدفع، ومدة صلاحية رابط الدفع 24 ساعة.
إذا نفد الكتاب من الجناح بعد الدفع، نعيد قيمته كاملة أو نضيفها رصيداً في محفظتك في المتجر حسب اختيارك.
يُشحن الطلب خلال 3 أيام عمل من تاريخ الدفع.
الطلبات الدولية تُشحن عبر DHL، وتكلفة الشحن تُحدد بعد تسعير الطلب حسب الدولة والوزن، والرسوم الجمركية في بلد العميل يتحملها العميل.')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- الفريق: يُضاف بالبريد من لوحة الإدارة، قبل أو بعد أول دخول
-- ---------------------------------------------------------------------
create table if not exists public.staff (
  email text primary key check (email = lower(email)),
  name text,
  role text not null default 'fair' check (role in ('admin', 'fair')),
  created_at timestamptz not null default now()
);

create or replace function public.my_email()
returns text language sql stable as $$
  select lower(coalesce(auth.jwt()->>'email', ''));
$$;

create or replace function public.staff_role()
returns text
language sql stable security definer set search_path = public
as $$
  select role from public.staff where email = public.my_email() and public.my_email() <> '';
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public
as $$ select coalesce(public.staff_role() = 'admin', false); $$;

create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public
as $$ select public.staff_role() is not null; $$;

grant execute on function public.staff_role() to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_staff() to authenticated;

-- ---------------------------------------------------------------------
-- دور النشر والأجنحة
-- ---------------------------------------------------------------------
create table if not exists public.publishers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  booth text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- الطلبات والكتب وسجل الأحداث
-- ---------------------------------------------------------------------
create sequence if not exists public.order_no_seq start 1001;

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_no text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  customer_name text not null,
  country text not null,
  phone_dial text not null,
  phone text not null,
  short_address text,
  city text,
  address_line text,
  postal_code text,
  address_notes text,
  customer_notes text,
  shipping_carrier text not null check (shipping_carrier in ('redbox', 'smsa', 'dhl')),
  shipping_cost numeric(10,2),
  status text not null default 'new' check (status in
    ('new', 'priced', 'awaiting_payment', 'paid', 'purchased', 'ready_to_ship', 'shipped', 'cancelled')),
  -- نسخة من إعدادات الرسوم وقت إرسال الطلب
  fee_mode text not null,
  fee_fixed numeric(10,2) not null default 0,
  fee_per_book numeric(10,2) not null default 0,
  fee_percent numeric(5,2) not null default 0,
  fee_min numeric(10,2) not null default 0,
  payment_link text,
  quote_sent_at timestamptz,
  paid_at timestamptz,
  shipped_at timestamptz,
  tracking_number text,
  admin_notes text
);
create index if not exists orders_status_idx on public.orders (status, created_at desc);
create index if not exists orders_phone_idx on public.orders (phone_dial, phone, created_at desc);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  created_at timestamptz not null default now(),
  title text not null,
  author text,
  publisher_id uuid references public.publishers(id) on delete set null,
  publisher_name text not null,
  quantity int not null default 1 check (quantity between 1 and 20),
  accept_alternative boolean not null default false,
  image_path text,
  unit_price numeric(10,2) check (unit_price is null or unit_price >= 0),
  -- pending: بانتظار التسعير · available: مسعّر ومتوفر · unavailable: غير متوفر
  -- declined: ألغاه العميل بعد معرفة السعر · purchased: تم الشراء
  status text not null default 'pending' check (status in ('pending', 'available', 'unavailable', 'declined', 'purchased')),
  fair_note text
);
create index if not exists order_items_order_idx on public.order_items (order_id);

create table if not exists public.order_events (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders(id) on delete cascade,
  created_at timestamptz not null default now(),
  actor text,
  message text not null
);
create index if not exists order_events_order_idx on public.order_events (order_id, created_at);

-- ---------------------------------------------------------------------
-- منطق المراحل التلقائي
-- ---------------------------------------------------------------------
create or replace function public.actor_label()
returns text language sql stable security definer set search_path = public
as $$
  select coalesce(
    (select coalesce(name, email) from public.staff where email = public.my_email()),
    nullif(public.my_email(), ''),
    'النظام');
$$;

create or replace function public.sync_order_status(p_order uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  st text;
  pending int;
  live int;
  bought int;
begin
  select status into st from public.orders where id = p_order for update;
  select
    count(*) filter (where status = 'pending'),
    count(*) filter (where status in ('available', 'purchased', 'pending')),
    count(*) filter (where status = 'purchased')
  into pending, live, bought
  from public.order_items where order_id = p_order;

  if st in ('new', 'priced') then
    update public.orders set status = case when pending > 0 then 'new' else 'priced' end, updated_at = now()
    where id = p_order and status <> case when pending > 0 then 'new' else 'priced' end;
  elsif st in ('paid', 'purchased') then
    update public.orders set status = case when live > 0 and bought = live then 'purchased' else 'paid' end, updated_at = now()
    where id = p_order and status <> case when live > 0 and bought = live then 'purchased' else 'paid' end;
  end if;
end;
$$;

create or replace function public.trg_items_sync()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  perform public.sync_order_status(coalesce(new.order_id, old.order_id));
  return null;
end;
$$;

drop trigger if exists items_sync on public.order_items;
create trigger items_sync after update of status, unit_price on public.order_items
  for each row execute function public.trg_items_sync();

create or replace function public.status_label(s text)
returns text language sql immutable as $$
  select case s
    when 'new' then 'بانتظار التسعير'
    when 'priced' then 'تم التسعير'
    when 'awaiting_payment' then 'بانتظار الدفع'
    when 'paid' then 'مدفوع، بانتظار الشراء'
    when 'purchased' then 'تم الشراء، بانتظار التغليف'
    when 'ready_to_ship' then 'جاهز للشحن'
    when 'shipped' then 'تم الشحن'
    when 'cancelled' then 'ملغي'
    else s end;
$$;

create or replace function public.trg_order_status_log()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if new.status is distinct from old.status then
    insert into public.order_events (order_id, actor, message)
    values (new.id, public.actor_label(), 'نقل الطلب إلى «' || public.status_label(new.status) || '»');
    if new.status = 'awaiting_payment' and new.quote_sent_at is null then new.quote_sent_at := now(); end if;
    if new.status = 'paid' and new.paid_at is null then new.paid_at := now(); end if;
    if new.status = 'shipped' and new.shipped_at is null then new.shipped_at := now(); end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists order_status_log on public.orders;
create trigger order_status_log before update on public.orders
  for each row execute function public.trg_order_status_log();

-- ---------------------------------------------------------------------
-- الصلاحيات (RLS)
-- ---------------------------------------------------------------------
alter table public.settings enable row level security;
alter table public.staff enable row level security;
alter table public.publishers enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_events enable row level security;

drop policy if exists settings_read on public.settings;
create policy settings_read on public.settings for select using (true);
drop policy if exists settings_admin on public.settings;
create policy settings_admin on public.settings for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists staff_admin on public.staff;
create policy staff_admin on public.staff for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists publishers_read on public.publishers;
create policy publishers_read on public.publishers for select using (true);
drop policy if exists publishers_admin on public.publishers;
create policy publishers_admin on public.publishers for all to authenticated using (public.is_admin()) with check (public.is_admin());


drop policy if exists orders_admin on public.orders;
create policy orders_admin on public.orders for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists items_admin on public.order_items;
create policy items_admin on public.order_items for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists events_admin on public.order_events;
create policy events_admin on public.order_events for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------
-- العميل: إرسال الطلب
-- ---------------------------------------------------------------------
create or replace function public.submit_order(p jsonb)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  s public.settings;
  o_id uuid;
  o_no text;
  it jsonb;
  n int;
  v_country text := upper(coalesce(p->>'country', ''));
  v_phone text := coalesce(p->>'phone', '');
  v_short text := upper(coalesce(p->>'short_address', ''));
  v_carrier text := lower(coalesce(p->>'shipping_carrier', ''));
  v_ship numeric;
  v_pub_id uuid;
  v_pub_name text;
  v_qty int;
  excluded text[] := array[
    'DZ','AO','BJ','BW','BF','BI','CV','CM','CF','TD','KM','CG','CD','CI','DJ','EG','GQ','ER','SZ','ET',
    'GA','GM','GH','GN','GW','KE','LS','LR','LY','MG','MW','ML','MR','MU','MA','MZ','NA','NE','NG','RW',
    'ST','SN','SC','SL','SO','ZA','SS','SD','TZ','TG','TN','UG','ZM','ZW','EH','RE','YT','SH',
    'YE','IQ','SY','LB','JO','PS','IL'
  ];
begin
  select * into s from public.settings where id = 1;
  if not coalesce(s.accepting_orders, false) then raise exception 'استقبال الطلبات متوقف حالياً'; end if;

  if v_country !~ '^[A-Z]{2}$' or v_country = any(excluded) then raise exception 'الشحن غير متاح لهذه الدولة'; end if;
  if length(trim(coalesce(p->>'customer_name', ''))) < 3 then raise exception 'اكتب الاسم الكامل'; end if;
  if coalesce(p->>'phone_dial', '') !~ '^\d{1,4}$' then raise exception 'مفتاح الدولة غير صحيح'; end if;
  if (v_country = 'SA' and v_phone !~ '^5\d{8}$') or v_phone !~ '^\d{6,14}$' then raise exception 'رقم الجوال غير صحيح'; end if;

  if v_country = 'SA' then
    if v_short !~ '^[A-Z]{4}\d{4}$' then raise exception 'العنوان الوطني المختصر غير صحيح'; end if;
    if v_carrier = 'redbox' then v_ship := s.ship_redbox;
    elsif v_carrier = 'smsa' then v_ship := s.ship_smsa;
    else raise exception 'اختر شركة الشحن'; end if;
  else
    if length(trim(coalesce(p->>'city', ''))) < 2 or length(trim(coalesce(p->>'address_line', ''))) < 6 then
      raise exception 'العنوان غير مكتمل';
    end if;
    v_carrier := 'dhl';
    v_ship := null; -- يحدده فريق الإدارة بعد التسعير
  end if;

  n := jsonb_array_length(coalesce(p->'items', '[]'::jsonb));
  if n < 1 or n > 30 then raise exception 'عدد الكتب يجب أن يكون بين 1 و30'; end if;

  -- حماية من الإغراق: 5 طلبات كحد أقصى لكل رقم جوال في الساعة، و300 طلب للموقع كله
  if (select count(*) from public.orders where phone = v_phone and created_at > now() - interval '1 hour') >= 5 then
    raise exception 'أرسلت عدداً كبيراً من الطلبات خلال ساعة، حاول لاحقاً';
  end if;
  if (select count(*) from public.orders where created_at > now() - interval '1 hour') >= 300 then
    raise exception 'الضغط على الخدمة مرتفع الآن، حاول بعد قليل';
  end if;

  o_no := 'RF-' || nextval('public.order_no_seq');

  insert into public.orders (
    order_no, customer_name, country, phone_dial, phone,
    short_address, city, address_line, postal_code, address_notes, customer_notes,
    shipping_carrier, shipping_cost,
    fee_mode, fee_fixed, fee_per_book, fee_percent, fee_min
  ) values (
    o_no, left(trim(p->>'customer_name'), 100), v_country, p->>'phone_dial', v_phone,
    case when v_country = 'SA' then v_short end,
    case when v_country <> 'SA' then left(trim(p->>'city'), 100) end,
    case when v_country <> 'SA' then left(trim(p->>'address_line'), 250) end,
    case when v_country <> 'SA' then nullif(left(trim(coalesce(p->>'postal_code', '')), 20), '') end,
    nullif(left(trim(coalesce(p->>'address_notes', '')), 200), ''),
    nullif(left(trim(coalesce(p->>'customer_notes', '')), 500), ''),
    v_carrier,
    v_ship,
    s.fee_mode, s.fee_fixed, s.fee_per_book, s.fee_percent, s.fee_min
  ) returning id into o_id;

  for it in select * from jsonb_array_elements(p->'items') loop
    if length(trim(coalesce(it->>'title', ''))) = 0 then raise exception 'اسم الكتاب مطلوب'; end if;
    v_qty := coalesce((it->>'quantity')::int, 1);
    if v_qty < 1 or v_qty > 20 then raise exception 'الكمية غير صحيحة'; end if;

    v_pub_id := null;
    v_pub_name := null;
    if coalesce(it->>'publisher_id', '') ~ '^[0-9a-f-]{36}$' then
      select id, name into v_pub_id, v_pub_name from public.publishers where id = (it->>'publisher_id')::uuid;
    end if;
    v_pub_name := coalesce(v_pub_name, nullif(left(trim(coalesce(it->>'publisher_name', '')), 150), ''));
    if v_pub_name is null then raise exception 'دار النشر مطلوبة'; end if;

    insert into public.order_items (order_id, title, author, publisher_id, publisher_name, quantity, accept_alternative, image_path)
    values (
      o_id, left(trim(it->>'title'), 200), nullif(left(trim(coalesce(it->>'author', '')), 150), ''),
      v_pub_id, v_pub_name, v_qty, coalesce((it->>'accept_alternative')::boolean, false),
      case when coalesce(it->>'image_path', '') ~ '^\d{4}-\d{2}-\d{2}/[0-9a-f-]{36}\.jpg$' then it->>'image_path' end
    );
  end loop;

  insert into public.order_events (order_id, actor, message) values (o_id, 'العميل', 'أرسل العميل الطلب');

  return jsonb_build_object('order_no', o_no);
end;
$$;
revoke all on function public.submit_order(jsonb) from public;
grant execute on function public.submit_order(jsonb) to anon, authenticated;

-- ---------------------------------------------------------------------
-- العميل: طلباتي (بلا ملاحظات داخلية)
-- ---------------------------------------------------------------------
drop function if exists public.my_orders();

-- توحيد رقم الجوال: أرقام فقط، بلا مفتاح الدولة ولا الصفر البادئ
create or replace function public.norm_phone(p_dial text, p_phone text)
returns text language plpgsql immutable as $$
declare ph text;
begin
  ph := regexp_replace(translate(coalesce(p_phone, ''), '٠١٢٣٤٥٦٧٨٩', '0123456789'), '\D', '', 'g');
  ph := regexp_replace(ph, '^00', '');
  if left(ph, length(p_dial)) = p_dial and length(ph) > length(p_dial) + 6 then
    ph := substr(ph, length(p_dial) + 1);
  end if;
  return regexp_replace(ph, '^0+', '');
end;
$$;

-- طلبات رقم جوال: المرحلة والكتب والمبالغ فقط، بلا اسم ولا عنوان
create or replace function public.my_orders(p_dial text, p_phone text)
returns jsonb
language sql stable security definer set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'order_no', o.order_no,
    'status', o.status,
    'created_at', o.created_at,
    'shipping_carrier', o.shipping_carrier,
    'shipping_cost', case when o.shipping_carrier = 'dhl' and o.status in ('new', 'priced') then null else o.shipping_cost end,
    'payment_link', case when o.status = 'awaiting_payment' then o.payment_link end,
    'tracking_number', case when o.status = 'shipped' then o.tracking_number end,
    'fee_mode', o.fee_mode, 'fee_fixed', o.fee_fixed, 'fee_per_book', o.fee_per_book,
    'fee_percent', o.fee_percent, 'fee_min', o.fee_min,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'title', i.title, 'publisher_name', i.publisher_name, 'quantity', i.quantity, 'status', i.status,
        'unit_price', case when o.status in ('new', 'priced') then null else i.unit_price end
      ) order by i.created_at)
      from public.order_items i where i.order_id = o.id
    ), '[]'::jsonb)
  ) order by o.created_at desc), '[]'::jsonb)
  from public.orders o
  where coalesce(p_dial, '') ~ '^\d{1,4}$'
    and o.phone_dial = p_dial
    and o.phone = public.norm_phone(p_dial, p_phone)
    and length(public.norm_phone(p_dial, p_phone)) >= 6;
$$;
revoke all on function public.my_orders(text, text) from public;
grant execute on function public.my_orders(text, text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- المعرض: لوحة العمل (بلا جوال ولا بريد ولا عنوان)
-- ---------------------------------------------------------------------
create or replace function public.fair_board()
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.is_staff() then raise exception 'غير مصرح'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', o.id, 'order_no', o.order_no, 'created_at', o.created_at, 'status', o.status,
      'customer_name', o.customer_name, 'country', o.country, 'shipping_carrier', o.shipping_carrier,
      'paid_at', o.paid_at,
      'items', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', i.id, 'title', i.title, 'author', i.author, 'publisher_id', i.publisher_id,
          'publisher_name', i.publisher_name, 'quantity', i.quantity, 'accept_alternative', i.accept_alternative,
          'image_path', i.image_path, 'unit_price', i.unit_price, 'status', i.status, 'fair_note', i.fair_note
        ) order by i.created_at)
        from public.order_items i where i.order_id = o.id
      ), '[]'::jsonb)
    ) order by o.created_at)
    from public.orders o
    where o.status in ('new', 'priced', 'paid', 'purchased', 'ready_to_ship')
       or (o.status = 'shipped' and o.shipped_at > now() - interval '2 days')
  ), '[]'::jsonb);
end;
$$;
revoke all on function public.fair_board() from public, anon;
grant execute on function public.fair_board() to authenticated;

-- تحديث كتب من المعرض. p_action: price | unavailable | note | purchased | unpurchase | reprice
create or replace function public.fair_update_items(p_ids uuid[], p_action text, p_price numeric default null, p_note text default null)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  r record;
begin
  if not public.is_staff() then raise exception 'غير مصرح'; end if;
  for r in
    select i.id, i.title, o.id as order_id, o.status as ostatus, i.status
    from public.order_items i join public.orders o on o.id = i.order_id
    where i.id = any(p_ids)
  loop
    if p_action in ('price', 'unavailable', 'reprice') then
      if r.ostatus not in ('new', 'priced') then raise exception 'لا يمكن تعديل السعر بعد إرسال السعر للعميل'; end if;
      if p_action = 'unavailable' then
        insert into public.order_events (order_id, actor, message) values (r.order_id, public.actor_label(), '«' || r.title || '» غير متوفر');
        update public.order_items set status = 'unavailable', unit_price = null where id = r.id;
      elsif p_action = 'reprice' then
        update public.order_items set status = 'pending', unit_price = null where id = r.id;
      else
        if p_price is null or p_price < 0 then raise exception 'السعر غير صحيح'; end if;
        insert into public.order_events (order_id, actor, message) values (r.order_id, public.actor_label(), 'سعّر «' || r.title || '» بـ ' || p_price || ' ر.س');
        update public.order_items set status = 'available', unit_price = p_price where id = r.id;
      end if;
    elsif p_action = 'note' then
      update public.order_items set fair_note = nullif(left(trim(coalesce(p_note, '')), 200), '') where id = r.id;
    elsif p_action in ('purchased', 'unpurchase', 'soldout') then
      if r.ostatus not in ('paid', 'purchased') then raise exception 'الشراء متاح بعد تأكيد الدفع فقط'; end if;
      if p_action = 'purchased' and r.status = 'available' then
        update public.order_items set status = 'purchased' where id = r.id;
      elsif p_action = 'unpurchase' and r.status = 'purchased' then
        update public.order_items set status = 'available' where id = r.id;
      elsif p_action = 'soldout' and r.status in ('available', 'purchased') then
        update public.order_items set status = 'unavailable' where id = r.id;
        insert into public.order_events (order_id, actor, message)
        values (r.order_id, public.actor_label(), '«' || r.title || '» نفد بعد الدفع، يلزم استرجاع قيمته للعميل');
      end if;
    else
      raise exception 'إجراء غير معروف';
    end if;
  end loop;
end;
$$;
revoke all on function public.fair_update_items(uuid[], text, numeric, text) from public, anon;
grant execute on function public.fair_update_items(uuid[], text, numeric, text) to authenticated;

-- المعرض: تم التغليف (purchased → ready_to_ship)
create or replace function public.fair_mark_packed(p_order uuid, p_undo boolean default false)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_staff() then raise exception 'غير مصرح'; end if;
  if p_undo then
    update public.orders set status = 'purchased' where id = p_order and status = 'ready_to_ship';
  else
    update public.orders set status = 'ready_to_ship' where id = p_order and status = 'purchased';
    if not found then raise exception 'الطلب ليس جاهزاً للتغليف'; end if;
  end if;
end;
$$;
revoke all on function public.fair_mark_packed(uuid, boolean) from public, anon;
grant execute on function public.fair_mark_packed(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------
-- صور الكتب (Storage): الزائر يرفع فقط، والصور بروابط عامة بأسماء عشوائية
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('book-images', 'book-images', true, 3145728, array['image/jpeg'])
on conflict (id) do nothing;

drop policy if exists "book images: customers upload" on storage.objects;
create policy "book images: customers upload" on storage.objects
  for insert to anon, authenticated with check (bucket_id = 'book-images');

drop policy if exists "book images: admin manage" on storage.objects;
create policy "book images: admin manage" on storage.objects
  for all to authenticated
  using (bucket_id = 'book-images' and public.is_admin())
  with check (bucket_id = 'book-images' and public.is_admin());

-- ---------------------------------------------------------------------
-- التحديث اللحظي
-- ---------------------------------------------------------------------
do $$
begin
  begin alter publication supabase_realtime add table public.orders; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.order_items; exception when duplicate_object then null; end;
end $$;

-- =====================================================================
-- أول مدير:
--   1) أنشئ حسابه من Authentication → Users → Add user (بريد وكلمة مرور، مع Auto Confirm)
--   2) غيّر البريد في السطر التالي ثم شغّله مرة واحدة.
-- بعدها يضيف المدير بقية الفريق بكلمات مرورهم من لوحة الإدارة ← الفريق.
--
--   insert into public.staff (email, name, role) values ('you@example.com', 'أحمد', 'admin');
-- =====================================================================
