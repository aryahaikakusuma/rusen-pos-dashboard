-- Rusen Kopitiam POS — skema awal
--
-- Catatan lintas-file:
--  * Uang disimpan sebagai `bigint` rupiah utuh. IDR praktis tak punya satuan
--    pecahan, jadi numeric(12,2) hanya menambah berat dan risiko pembulatan.
--  * Kolom `product_code` / `product_name` / `unit_price` pada order_items
--    adalah SNAPSHOT saat transaksi. Struk dan laporan lama tidak boleh berubah
--    ketika harga atau nama produk diubah kemudian.
--  * `outlet_id` disimpan walau sekarang hanya satu outlet, agar ekspansi
--    multi-outlet nanti tidak perlu migrasi data.

create extension if not exists pgcrypto;

create type employee_role  as enum ('cashier', 'manager', 'owner');
create type order_status   as enum ('pending', 'paid', 'void');
create type payment_method as enum ('cash', 'non_cash');


-- ============================================================ master data

create table outlets (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  address    text,
  created_at timestamptz not null default now()
);

create table employees (
  id         uuid primary key default gen_random_uuid(),
  outlet_id  uuid not null references outlets (id),
  name       text not null,
  pin_hash   text not null,                     -- bcrypt, tidak pernah plaintext
  role       employee_role not null default 'cashier',
  active     boolean not null default true,
  created_at timestamptz not null default now()
);
create index employees_active_idx on employees (outlet_id) where active;

create table categories (
  id         uuid primary key default gen_random_uuid(),
  outlet_id  uuid not null references outlets (id),
  code       text not null,
  name       text not null,
  sort_order int  not null default 0,
  active     boolean not null default true,
  unique (outlet_id, code)
);

create table products (
  id          uuid primary key default gen_random_uuid(),
  outlet_id   uuid not null references outlets (id),
  category_id uuid not null references categories (id),
  code        text not null,
  name        text not null,
  price       bigint  not null check (price >= 0),
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (outlet_id, code)
);
create index products_category_idx on products (category_id) where active;


-- ============================================================ transaksi

create table orders (
  id         uuid primary key default gen_random_uuid(),  -- klien boleh kirim (persiapan offline)
  outlet_id  uuid not null references outlets (id),
  table_code text not null,
  table_seq  int  not null default 1,   -- order ke-N pada kode meja yang sama
  status     order_status not null default 'pending',
  total      bigint not null default 0 check (total >= 0),
  version    int    not null default 1, -- optimistic lock, naik tiap kali diedit

  created_by uuid not null references employees (id),
  paid_by    uuid references employees (id),
  voided_by  uuid references employees (id),

  payment_method  payment_method,
  amount_received bigint,
  change_amount   bigint,

  created_at        timestamptz not null default now(),
  client_created_at timestamptz,                  -- persiapan offline
  paid_at           timestamptz,
  voided_at         timestamptz,
  void_reason       text,

  constraint paid_fields_consistent check (
    status <> 'paid'
    or (paid_at is not null and payment_method is not null and paid_by is not null)
  ),
  constraint cash_covers_total check (
    payment_method is distinct from 'cash'
    or (amount_received >= total and change_amount = amount_received - total)
  )
);
create index orders_queue_idx   on orders (outlet_id, status, created_at desc);
create index orders_paid_at_idx on orders (outlet_id, paid_at desc) where status = 'paid';

create table order_items (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid not null references orders (id) on delete cascade,
  product_id   uuid references products (id),   -- nullable: produk bisa dihapus kelak
  product_code text   not null,                 -- SNAPSHOT
  product_name text   not null,                 -- SNAPSHOT
  quantity     int    not null check (quantity > 0),
  unit_price   bigint not null check (unit_price >= 0),  -- harga SAAT transaksi
  notes        text   not null default '',
  subtotal     bigint generated always as (quantity * unit_price) stored
);
create index order_items_order_idx on order_items (order_id);

-- Jejak void per item. Setiap pengurangan item pada order yang SUDAH tersimpan
-- wajib lewat sini — inilah satu-satunya sumber "laporan void".
create table order_item_voids (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid not null references orders (id) on delete cascade,
  product_code text   not null,
  product_name text   not null,
  quantity     int    not null check (quantity > 0),  -- jumlah yang DIBATALKAN
  unit_price   bigint not null,
  amount       bigint generated always as (quantity * unit_price) stored,
  voided_by    uuid not null references employees (id),
  reason       text,
  created_at   timestamptz not null default now()
);
create index order_item_voids_created_idx on order_item_voids (created_at desc);

create table payments (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references orders (id),
  method      payment_method not null,
  amount      bigint not null check (amount > 0),
  employee_id uuid not null references employees (id),
  created_at  timestamptz not null default now()
);
create index payments_order_idx on payments (order_id);

create table refunds (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references orders (id),
  amount      bigint not null check (amount > 0),
  reason      text,
  employee_id uuid not null references employees (id),
  created_at  timestamptz not null default now()
);
create index refunds_created_idx on refunds (created_at desc);

create table refund_items (
  id            uuid primary key default gen_random_uuid(),
  refund_id     uuid not null references refunds (id) on delete cascade,
  order_item_id uuid references order_items (id),
  product_name  text   not null,
  quantity      int    not null check (quantity > 0),
  unit_price    bigint not null,
  amount        bigint generated always as (quantity * unit_price) stored
);

create table attendance_logs (
  id          uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees (id),
  clock_in    timestamptz not null default now(),
  clock_out   timestamptz,
  created_at  timestamptz not null default now()
);
create index attendance_employee_idx on attendance_logs (employee_id, clock_in desc);

-- Pembatas brute-force PIN. Dibersihkan berkala, bukan data bisnis.
create table login_attempts (
  id         bigserial primary key,
  ip         text not null,
  created_at timestamptz not null default now()
);
create index login_attempts_ip_idx on login_attempts (ip, created_at desc);


-- ============================================================ RLS
-- Aktifkan tanpa satu pun policy: hasilnya deny-all untuk anon/authenticated.
-- service_role (satu-satunya jalur aplikasi) melewati RLS — ini disengaja.

alter table outlets          enable row level security;
alter table employees        enable row level security;
alter table categories       enable row level security;
alter table products         enable row level security;
alter table orders           enable row level security;
alter table order_items      enable row level security;
alter table order_item_voids enable row level security;
alter table payments         enable row level security;
alter table refunds          enable row level security;
alter table refund_items     enable row level security;
alter table attendance_logs  enable row level security;
alter table login_attempts   enable row level security;

-- Hak akses tabel. Hanya service_role yang diberi akses — itulah satu-satunya
-- role yang dipakai aplikasi. anon dan authenticated sengaja TIDAK diberi apa pun,
-- jadi kalau suatu saat ada yang mencoba konek dengan anon key, ia terhalang dua
-- lapis sekaligus: tanpa GRANT dan tanpa policy RLS.
grant usage on schema public to service_role;
grant all privileges on all tables    in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;

revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;


-- ============================================================ RPC transaksi

-- Cek apakah kode meja sudah punya order belum lunas.
-- Dipanggil sebelum menyimpan; kalau ada isinya, UI menampilkan dialog
-- "pelanggan sama atau berbeda".
create or replace function check_table_code(p_table_code text, p_employee_id uuid)
returns table (
  order_id   uuid,
  table_seq  int,
  total      bigint,
  item_count bigint,
  version    int,
  created_at timestamptz,
  cashier    text
)
language sql
as $$
  select o.id, o.table_seq, o.total,
         (select coalesce(sum(oi.quantity), 0) from order_items oi where oi.order_id = o.id),
         o.version, o.created_at, e.name
  from orders o
  join employees e on e.id = o.created_by
  where o.status = 'pending'
    and o.table_code = p_table_code
    and o.outlet_id = (select outlet_id from employees where id = p_employee_id)
  order by o.created_at desc;
$$;


-- Simpan keranjang jadi order baru berstatus pending.
-- Harga SELALU diambil dari tabel products, tidak pernah dari klien.
-- Idempoten lewat p_order_id, supaya retry Server Action tidak menggandakan.
create or replace function create_order(
  p_order_id          uuid,
  p_table_code        text,
  p_employee_id       uuid,
  p_items             jsonb,
  p_client_created_at timestamptz default null
) returns uuid
language plpgsql
as $$
declare
  v_outlet_id uuid;
  v_seq       int;
  v_total     bigint;
begin
  if exists (select 1 from orders where id = p_order_id) then
    return p_order_id;                              -- sudah pernah masuk, diamkan
  end if;

  select outlet_id into v_outlet_id from employees where id = p_employee_id and active;
  if v_outlet_id is null then
    raise exception 'EMPLOYEE_NOT_FOUND';
  end if;

  if p_table_code is null or btrim(p_table_code) = '' then
    raise exception 'TABLE_CODE_REQUIRED';
  end if;

  select coalesce(max(table_seq), 0) + 1 into v_seq
  from orders
  where outlet_id = v_outlet_id and table_code = p_table_code and status = 'pending';

  insert into orders (id, outlet_id, table_code, table_seq, status, created_by, client_created_at)
  values (p_order_id, v_outlet_id, btrim(p_table_code), v_seq, 'pending', p_employee_id, p_client_created_at);

  insert into order_items (order_id, product_id, product_code, product_name, quantity, unit_price, notes)
  select p_order_id, p.id, p.code, p.name,
         (i ->> 'quantity')::int, p.price, coalesce(i ->> 'notes', '')
  from jsonb_array_elements(p_items) i
  join products p on p.id = (i ->> 'productId')::uuid
  where (i ->> 'quantity')::int > 0;

  if not exists (select 1 from order_items where order_id = p_order_id) then
    raise exception 'EMPTY_ORDER';
  end if;

  select coalesce(sum(subtotal), 0) into v_total from order_items where order_id = p_order_id;
  update orders set total = v_total where id = p_order_id;

  return p_order_id;
end;
$$;


-- Tambah item ke order pending yang sudah ada.
-- Dipakai untuk kasus "pelanggan sama" dan untuk edit order.
-- Item digabung hanya kalau produk, catatan, DAN harga satuannya sama persis —
-- kalau harga produk sudah berubah, item baru dibuat terpisah agar snapshot jujur.
create or replace function append_to_order(
  p_order_id        uuid,
  p_items           jsonb,
  p_employee_id     uuid,
  p_expected_version int
) returns int
language plpgsql
as $$
declare
  v_order       orders;
  v_item        jsonb;
  v_product     products;
  v_existing_id uuid;
  v_total       bigint;
  v_version     int;
begin
  select * into v_order from orders where id = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if v_order.status <> 'pending' then raise exception 'ORDER_NOT_EDITABLE'; end if;
  if v_order.version <> p_expected_version then raise exception 'STALE_ORDER'; end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    if (v_item ->> 'quantity')::int <= 0 then continue; end if;

    select * into v_product from products where id = (v_item ->> 'productId')::uuid;
    if not found then raise exception 'PRODUCT_NOT_FOUND'; end if;

    select id into v_existing_id
    from order_items
    where order_id = p_order_id
      and product_id = v_product.id
      and notes      = coalesce(v_item ->> 'notes', '')
      and unit_price = v_product.price
    limit 1;

    if v_existing_id is not null then
      update order_items
      set quantity = quantity + (v_item ->> 'quantity')::int
      where id = v_existing_id;
    else
      insert into order_items (order_id, product_id, product_code, product_name, quantity, unit_price, notes)
      values (p_order_id, v_product.id, v_product.code, v_product.name,
              (v_item ->> 'quantity')::int, v_product.price, coalesce(v_item ->> 'notes', ''));
    end if;

    v_existing_id := null;
  end loop;

  select coalesce(sum(subtotal), 0) into v_total from order_items where order_id = p_order_id;
  update orders set total = v_total, version = version + 1
  where id = p_order_id
  returning version into v_version;

  return v_version;
end;
$$;


-- SATU-SATUNYA jalan mengurangi item dari order tersimpan.
-- Selalu menulis jejak ke order_item_voids supaya laporan void tidak bolong.
-- Kalau seluruh item habis di-void, order itu sendiri jadi berstatus 'void'.
create or replace function void_order_item(
  p_order_id         uuid,
  p_item_id          uuid,
  p_quantity         int,
  p_employee_id      uuid,
  p_reason           text,
  p_expected_version int
) returns int
language plpgsql
as $$
declare
  v_order   orders;
  v_item    order_items;
  v_total   bigint;
  v_version int;
begin
  select * into v_order from orders where id = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if v_order.status <> 'pending' then raise exception 'ORDER_NOT_EDITABLE'; end if;
  if v_order.version <> p_expected_version then raise exception 'STALE_ORDER'; end if;

  select * into v_item from order_items where id = p_item_id and order_id = p_order_id;
  if not found then raise exception 'ITEM_NOT_FOUND'; end if;
  if p_quantity <= 0 or p_quantity > v_item.quantity then
    raise exception 'INVALID_VOID_QUANTITY';
  end if;

  insert into order_item_voids
    (order_id, product_code, product_name, quantity, unit_price, voided_by, reason)
  values
    (p_order_id, v_item.product_code, v_item.product_name, p_quantity,
     v_item.unit_price, p_employee_id, nullif(btrim(coalesce(p_reason, '')), ''));

  if p_quantity = v_item.quantity then
    delete from order_items where id = p_item_id;
  else
    update order_items set quantity = quantity - p_quantity where id = p_item_id;
  end if;

  select coalesce(sum(subtotal), 0) into v_total from order_items where order_id = p_order_id;

  if not exists (select 1 from order_items where order_id = p_order_id) then
    update orders
    set total = 0, version = version + 1, status = 'void',
        voided_at = now(), voided_by = p_employee_id,
        void_reason = 'Semua item dibatalkan'
    where id = p_order_id
    returning version into v_version;
  else
    update orders set total = v_total, version = version + 1
    where id = p_order_id
    returning version into v_version;
  end if;

  return v_version;
end;
$$;


-- Pelunasan. `for update` mencegah order terbayar dua kali kalau dua perangkat
-- menekan "Pelunasan" bersamaan. Total selalu dihitung ulang dari order_items,
-- jadi item yang baru ditambah/di-void di perangkat lain tetap terhitung benar.
create or replace function pay_order(
  p_order_id        uuid,
  p_method          payment_method,
  p_amount_received bigint,
  p_employee_id     uuid
) returns uuid
language plpgsql
as $$
declare
  v_order  orders;
  v_total  bigint;
  v_recv   bigint;
begin
  select * into v_order from orders where id = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;

  if v_order.status = 'paid' then
    return p_order_id;                              -- idempoten, bukan error
  end if;
  if v_order.status <> 'pending' then
    raise exception 'ORDER_NOT_PAYABLE';
  end if;

  select coalesce(sum(subtotal), 0) into v_total from order_items where order_id = p_order_id;
  if v_total <= 0 then raise exception 'EMPTY_ORDER'; end if;

  if p_method = 'cash' then
    if p_amount_received is null or p_amount_received < v_total then
      raise exception 'INSUFFICIENT_AMOUNT';
    end if;
    v_recv := p_amount_received;
  else
    v_recv := v_total;
  end if;

  update orders
  set status = 'paid',
      total = v_total,
      paid_at = now(),
      paid_by = p_employee_id,
      payment_method = p_method,
      amount_received = v_recv,
      change_amount = v_recv - v_total,
      version = version + 1
  where id = p_order_id;

  insert into payments (order_id, method, amount, employee_id)
  values (p_order_id, p_method, v_total, p_employee_id);

  return p_order_id;
end;
$$;
