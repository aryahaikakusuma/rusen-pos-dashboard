-- PBJT — kategori yang bukan objek pajak.
--
-- Rokok bukan objek PBJT. PBJT dikenakan atas makanan dan minuman; rokok yang
-- dijual eceran tidak termasuk. Sampai 2026-08-01 aplikasi memungutnya juga,
-- karena pajak dihitung atas SELURUH subtotal order.
--
-- ============================================================================
-- TIGA KEPUTUSAN YANG MENENTUKAN BENTUK BERKAS INI
-- ============================================================================
--
-- 1. PENANDANYA DATA, BUKAN KODE. `categories.taxable`, bukan pencocokan
--    `code = 'ROKOK'` di dalam fungsi. Mengikuti preseden `tax_rate_bps` di
--    0012: kalau kelak ada kategori lain yang bukan objek pajak, itu satu
--    UPDATE, bukan migrasi baru dan bukan build ulang dua aplikasi. Kode yang
--    mencocokkan nama kategori juga akan diam-diam salah begitu kategori
--    diganti namanya — dan mengganti nama kategori adalah tindakan yang
--    tampaknya tidak berbahaya.
--
-- 2. SIFAT KENA-PAJAK DI-SNAPSHOT KE `order_items.taxable`, sama seperti
--    product_name dan unit_price. Tanpa snapshot, memindahkan satu produk ke
--    kategori lain akan menulis ulang pajak yang seharusnya dipungut pada order
--    LAMA. Akibatnya bukan angka di layar yang berubah — `orders.tax_amount`
--    sudah tersimpan — melainkan refund yang dihitung belakangan memakai basis
--    berbeda dari struk yang sudah ada di tangan pelanggan. Selisihnya uang, dan
--    tidak ada error di mana pun.
--
-- 3. `orders.taxable_subtotal` DISIMPAN, BUKAN DITURUNKAN LEWAT JOIN.
--    Alasannya tunggal: CHECK constraint tidak bisa menanyakan tabel lain, dan
--    seluruh gunanya `tax_arithmetic` di 0012 adalah membuat basis data SECARA
--    FISIK tidak bisa menyimpan baris yang pembulatannya menyimpang dari server.
--    Kalau basis pajaknya tidak ada di baris itu sendiri, jaminan itu hilang dan
--    yang tersisa cuma konvensi. Ponsel menghitung pajak saat offline; konvensi
--    tidak cukup.
--
-- Yang TIDAK berubah, dan jangan diubah: pajak tetap dihitung SEKALI, atas satu
-- basis, tidak pernah per baris lalu dijumlahkan. Yang berubah hanya basisnya —
-- dari `subtotal` menjadi `taxable_subtotal`. Pada order tanpa rokok keduanya
-- sama persis, jadi seluruh order lama tetap sah tanpa disentuh.
--
-- Rumusnya tetap `(basis * rate_bps + 5000) / 10000`, pembagian bulat. Tiga
-- mesin, satu rumus: sini, lib/tax.ts, mobile/lib/tax.ts.

begin;

-- ------------------------------------------------------------- kategori bebas
alter table categories
  add column if not exists taxable boolean not null default true;

-- Idempoten dan sempit: hanya ROKOK, hanya kalau masih true.
update categories set taxable = false
where code = 'ROKOK' and taxable;

-- ---------------------------------------------------------- snapshot per baris
alter table order_items
  add column if not exists taxable boolean not null default true;

-- Order lama: sebelum migrasi ini rokok memang dipungut pajak, dan itu yang
-- tercetak di struknya. Baris lama karena itu TETAP taxable = true (bawaan
-- kolom). Menandainya false surut akan membuat tax_amount yang tersimpan tidak
-- lagi cocok dengan taxable_subtotal-nya, dan constraint di bawah menolak
-- seluruh tabel. Riwayat dibiarkan mengatakan apa yang sebenarnya terjadi.

-- ------------------------------------------------------------- basis di orders
alter table orders
  add column if not exists taxable_subtotal bigint not null default 0;

-- Order lama dipungut pajak atas seluruh subtotal, jadi basisnya = subtotal.
-- Harus dijalankan SEBELUM constraint dipasang, kalau tidak setiap baris lama
-- yang tax_amount-nya > 0 akan ditolak.
update orders set taxable_subtotal = subtotal
where taxable_subtotal = 0 and subtotal > 0;

alter table orders drop constraint if exists tax_arithmetic;
alter table orders drop constraint if exists orders_taxable_subtotal_wajar;

alter table orders
  add constraint orders_taxable_subtotal_wajar
    check (taxable_subtotal >= 0 and taxable_subtotal <= subtotal);

alter table orders
  add constraint tax_arithmetic check (
    tax_amount = case
                   when tax_status = 'exempt' then 0
                   else (taxable_subtotal * tax_rate_bps + 5000) / 10000
                 end
    and total = subtotal + tax_amount
  );

-- ============================================================ create_order
-- Sama dengan 0013, dua hal ditambahkan: order_items.taxable diambil dari
-- kategori produknya, dan taxable_subtotal ikut ditulis.
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
  v_kena      bigint;
begin
  if exists (select 1 from orders where id = p_order_id) then
    return p_order_id;
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

  -- `coalesce(c.taxable, true)`: products.category_id nullable, dan produk tanpa
  -- kategori dipungut pajak. Bebas pajak harus jadi pilihan yang disengaja.
  insert into order_items (order_id, product_id, product_code, product_name, quantity, unit_price, notes, taxable)
  select p_order_id, p.id, p.code, p.name,
         (i ->> 'quantity')::int, p.price, coalesce(i ->> 'notes', ''),
         coalesce(c.taxable, true)
  from jsonb_array_elements(p_items) i
  join products p on p.id = (i ->> 'productId')::uuid
  left join categories c on c.id = p.category_id
  where (i ->> 'quantity')::int > 0;

  if not exists (select 1 from order_items where order_id = p_order_id) then
    raise exception 'EMPTY_ORDER';
  end if;

  select coalesce(sum(subtotal), 0),
         coalesce(sum(subtotal) filter (where taxable), 0)
  into v_total, v_kena
  from order_items where order_id = p_order_id;

  -- Order pending: pajak belum diputuskan, tax_amount tetap 0 dan total masih
  -- sama dengan subtotal. taxable_subtotal sudah diisi supaya ponsel dan web
  -- bisa menampilkan perkiraan pajak sebelum pelunasan tanpa menghitung ulang.
  update orders set total = v_total, subtotal = v_total, taxable_subtotal = v_kena
  where id = p_order_id;

  return p_order_id;
end;
$$;


-- ============================================================ append_to_order
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
  v_taxable     boolean;
  v_existing_id uuid;
  v_total       bigint;
  v_kena        bigint;
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

    select coalesce(c.taxable, true) into v_taxable
    from categories c where c.id = v_product.category_id;
    v_taxable := coalesce(v_taxable, true);

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
      insert into order_items (order_id, product_id, product_code, product_name, quantity, unit_price, notes, taxable)
      values (p_order_id, v_product.id, v_product.code, v_product.name,
              (v_item ->> 'quantity')::int, v_product.price, coalesce(v_item ->> 'notes', ''),
              v_taxable);
    end if;

    v_existing_id := null;
  end loop;

  select coalesce(sum(subtotal), 0),
         coalesce(sum(subtotal) filter (where taxable), 0)
  into v_total, v_kena
  from order_items where order_id = p_order_id;

  update orders
  set total = v_total, subtotal = v_total, taxable_subtotal = v_kena, version = version + 1
  where id = p_order_id
  returning version into v_version;

  return v_version;
end;
$$;


-- ============================================================ void_order_item
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
  v_kena    bigint;
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

  select coalesce(sum(subtotal), 0),
         coalesce(sum(subtotal) filter (where taxable), 0)
  into v_total, v_kena
  from order_items where order_id = p_order_id;

  if not exists (select 1 from order_items where order_id = p_order_id) then
    update orders
    set total = 0, subtotal = 0, taxable_subtotal = 0, version = version + 1, status = 'void',
        voided_at = now(), voided_by = p_employee_id,
        void_reason = 'Semua item dibatalkan'
    where id = p_order_id
    returning version into v_version;
  else
    update orders
    set total = v_total, subtotal = v_total, taxable_subtotal = v_kena, version = version + 1
    where id = p_order_id
    returning version into v_version;
  end if;

  return v_version;
end;
$$;


-- ============================================================ pay_order
-- Satu perubahan: pajak dihitung atas basis kena pajak, bukan seluruh subtotal.
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
  v_kena     bigint;
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
    return p_order_id;
  end if;
  if v_order.status <> 'pending' then
    raise exception 'ORDER_NOT_PAYABLE';
  end if;

  -- Keduanya dihitung ulang dari order_items, jadi item yang baru ditambah atau
  -- di-void di perangkat lain tetap terhitung benar — termasuk basis pajaknya.
  select coalesce(sum(subtotal), 0),
         coalesce(sum(subtotal) filter (where taxable), 0)
  into v_subtotal, v_kena
  from order_items where order_id = p_order_id;
  if v_subtotal <= 0 then raise exception 'EMPTY_ORDER'; end if;

  select o.tax_rate_bps into v_rate
  from outlets o where o.id = v_order.outlet_id;

  if p_tax_status = 'exempt' then
    if btrim(coalesce(p_tax_exempt_reason, '')) = '' then
      raise exception 'TAX_EXEMPT_REASON_REQUIRED';
    end if;
    v_tax      := 0;
    v_reason   := btrim(p_tax_exempt_reason);
    v_approver := p_employee_id;
  else
    -- Order yang isinya rokok saja: v_kena = 0, jadi v_tax = 0. Itu BUKAN
    -- 'exempt' — tax_status tetap 'taxable' dan tidak ada keterangan yang
    -- diminta, karena tidak ada yang dibebaskan. Barangnya memang bukan objek
    -- pajak. Membedakan keduanya penting buat laporan: pembebasan adalah
    -- keputusan orang yang harus bisa diaudit, ini bukan.
    v_tax      := (v_kena * v_rate + 5000) / 10000;
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
      taxable_subtotal  = v_kena,
      tax_status        = p_tax_status,
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

  insert into payments (order_id, method, amount, employee_id)
  values (p_order_id, p_method, v_total, p_employee_id);

  return p_order_id;
end;
$$;

-- Tidak ada grant baru di sini. 0004 memberi `select` atas SELURUH tabel
-- categories, bukan daftar kolom, jadi `taxable` sudah ikut terbawa dan ponsel
-- bisa menariknya bersama katalog. Berbeda dengan outlets di 0012, yang memang
-- grant tingkat kolom karena memuat alamat.

commit;
