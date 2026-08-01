-- PBJT — fungsi tulis order.
--
-- pay_order sekarang menerima status pajak dan menghitung pajaknya sendiri.
-- Tiga fungsi penulis lain (create_order, append_to_order, void_order_item)
-- ikut disentuh karena satu alasan saja: masing-masing menulis `total`, dan
-- constraint `tax_arithmetic` dari 0012 menuntut `total = subtotal + tax_amount`
-- di setiap saat. Kalau salah satu lupa mengisi `subtotal`, SETIAP order baru
-- dari aplikasi web ditolak basis data. Gagalnya keras, dan itu memang yang
-- diinginkan — tapi lebih baik tidak usah gagal sama sekali.

begin;

-- ============================================================ pay_order
--
-- WAJIB DROP, BUKAN `create or replace`. Postgres meng-overload fungsi
-- berdasarkan tipe argumennya, jadi `create or replace` dengan parameter baru
-- hanya membuat fungsi KEDUA dan versi empat-argumen yang lama tetap bisa
-- dipanggil — menulis order lunas tanpa pajak sama sekali.
--
-- Tanda tangannya ditulis lengkap. Itu yang membuat perintah ini idempoten saat
-- migrasi dijalankan dua kali, dan `drop function pay_order` tanpa tipe justru
-- ambigu begitu ada dua versi.
--
-- Catatan untuk yang tergoda memakai pola yang sama di tempat lain:
-- `create or replace` MEMPERTAHANKAN grant, sementara drop+create membuangnya.
-- Di sini tidak ada yang hilang karena pay_order hanya dipanggil service_role
-- dan mengandalkan EXECUTE bawaan PUBLIC. Refleks yang sama diterapkan ke
-- push_order akan ikut membuang `grant execute ... to authenticated` (0008) dan
-- mematikan sinkronisasi seluruh ponsel — lihat 0014, yang memang memakai
-- `create or replace`.
drop function if exists pay_order(uuid, payment_method, bigint, uuid);

-- Pelunasan. `for update` mencegah order terbayar dua kali kalau dua perangkat
-- menekan "Pelunasan" bersamaan. Subtotal selalu dihitung ulang dari
-- order_items, jadi item yang baru ditambah/di-void di perangkat lain tetap
-- terhitung benar.
--
-- Tarif TIDAK diterima sebagai parameter. Aplikasi web bicara langsung ke
-- Postgres, jadi ia tidak punya alasan memegang angka tarif sama sekali; fungsi
-- ini membacanya sendiri dari outlets. Itu aturan "harga selalu dari server"
-- di AGENTS.md, diterapkan ke pajak.
create or replace function pay_order(
  p_order_id          uuid,
  p_method            payment_method,
  p_amount_received   bigint,
  p_employee_id       uuid,
  p_tax_status        tax_status default 'taxable',
  p_tax_exempt_reason text       default null
) returns uuid
language plpgsql
as $$
declare
  v_order    orders;
  v_subtotal bigint;
  v_rate     int;
  v_tax      bigint;
  v_total    bigint;
  v_recv     bigint;
  v_reason   text;
  v_approver uuid;
begin
  select * into v_order from orders where id = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;

  if v_order.status = 'paid' then
    return p_order_id;                              -- idempoten, bukan error
  end if;
  if v_order.status <> 'pending' then
    raise exception 'ORDER_NOT_PAYABLE';
  end if;

  select coalesce(sum(subtotal), 0) into v_subtotal
  from order_items where order_id = p_order_id;
  if v_subtotal <= 0 then raise exception 'EMPTY_ORDER'; end if;

  select o.tax_rate_bps into v_rate
  from outlets o where o.id = v_order.outlet_id;

  if p_tax_status = 'exempt' then
    -- Keterangan wajib. Tanpa ini, "kenapa transaksi ini tidak dipungut pajak"
    -- hanya bisa dijawab dari ingatan orang, dan itu bukan jawaban.
    if btrim(coalesce(p_tax_exempt_reason, '')) = '' then
      raise exception 'TAX_EXEMPT_REASON_REQUIRED';
    end if;
    v_tax      := 0;
    v_reason   := btrim(p_tax_exempt_reason);
    v_approver := p_employee_id;
  else
    -- Pembagian bilangan bulat, memotong ke bawah. Sama persis dengan
    -- Math.floor((subtotal * rateBps + 5000) / 10000) di lib/tax.ts.
    v_tax      := (v_subtotal * v_rate + 5000) / 10000;
    v_reason   := null;
    v_approver := null;
  end if;

  v_total := v_subtotal + v_tax;

  if p_method = 'cash' then
    if p_amount_received is null or p_amount_received < v_total then
      raise exception 'INSUFFICIENT_AMOUNT';
    end if;
    v_recv := p_amount_received;
  else
    v_recv := v_total;
  end if;

  update orders
  set status            = 'paid',
      subtotal          = v_subtotal,
      tax_status        = p_tax_status,
      -- Tarif di-snapshot juga saat bebas pajak — lihat keputusan 3 di 0012.
      tax_rate_bps      = v_rate,
      tax_amount        = v_tax,
      tax_exempt_reason = v_reason,
      tax_approved_by   = v_approver,
      total             = v_total,
      paid_at           = now(),
      paid_by           = p_employee_id,
      payment_method    = p_method,
      amount_received   = v_recv,
      change_amount     = v_recv - v_total,
      version           = version + 1
  where id = p_order_id;

  -- Yang masuk laci adalah angka tagihan, termasuk pajaknya.
  insert into payments (order_id, method, amount, employee_id)
  values (p_order_id, p_method, v_total, p_employee_id);

  return p_order_id;
end;
$$;


-- ============================================================ create_order
-- Sama persis dengan 0001, satu baris berubah: `subtotal` ikut ditulis.
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

  -- Order pending: pajak belum diputuskan, jadi tax_rate_bps dan tax_amount
  -- tetap 0 dan `total` masih sama dengan `subtotal`. Keduanya baru berpisah
  -- di pay_order.
  update orders set total = v_total, subtotal = v_total where id = p_order_id;

  return p_order_id;
end;
$$;


-- ============================================================ append_to_order
-- Sama persis dengan 0001, satu baris berubah: `subtotal` ikut ditulis.
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
  update orders set total = v_total, subtotal = v_total, version = version + 1
  where id = p_order_id
  returning version into v_version;

  return v_version;
end;
$$;


-- ============================================================ void_order_item
-- Sama persis dengan 0001, dua cabang update-nya ikut menulis `subtotal`.
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
    set total = 0, subtotal = 0, version = version + 1, status = 'void',
        voided_at = now(), voided_by = p_employee_id,
        void_reason = 'Semua item dibatalkan'
    where id = p_order_id
    returning version into v_version;
  else
    update orders set total = v_total, subtotal = v_total, version = version + 1
    where id = p_order_id
    returning version into v_version;
  end if;

  return v_version;
end;
$$;

commit;
