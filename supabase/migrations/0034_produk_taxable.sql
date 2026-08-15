-- PBJT — override per produk, di atas bawaan kategori.
--
-- 0019 sengaja menaruh status kena-pajak di KATEGORI, karena itu sifat barangnya
-- (rokok), bukan pilihan. Permintaan konkret yang mematahkan itu: produk promo
-- (mis. Rp17.000, jadi Rp18.700 kalau kena PBJT) yang butuh statusnya sendiri,
-- lepas dari kategori tempat ia didaftarkan — tanpa harus membuat kategori baru
-- tiap kali ada satu produk yang berbeda.
--
-- `products.taxable` sekarang OTORITATIF untuk transaksi baru. `categories.taxable`
-- tetap ada dan tetap dipakai dashboard sebagai SARAN nilai awal saat produk baru
-- dibuat, tapi tidak lagi satu-satunya sumber. Snapshot ke `order_items.taxable`
-- (0019) tidak berubah sama sekali — order lama tetap membaca apa yang sudah
-- tersimpan di baris itemnya sendiri.
--
-- Backfill dari kategori supaya produk yang sudah ada TIDAK berubah perilaku:
-- produk di kategori Rokok tetap bebas pajak, produk di kategori lain tetap kena,
-- persis seperti sebelum migrasi ini berjalan.

begin;

alter table products
  add column if not exists taxable boolean not null default true;

update products p
set taxable = c.taxable
from categories c
where c.id = p.category_id and p.taxable is distinct from c.taxable;

-- ============================================================ create_order
-- Sama dengan 0019, satu baris berubah: taxable diambil dari produk (p.taxable),
-- bukan dari kategorinya. Join ke categories tidak lagi diperlukan untuk ini.
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

  insert into order_items (order_id, product_id, product_code, product_name, quantity, unit_price, notes, taxable)
  select p_order_id, p.id, p.code, p.name,
         (i ->> 'quantity')::int, p.price, coalesce(i ->> 'notes', ''),
         p.taxable
  from jsonb_array_elements(p_items) i
  join products p on p.id = (i ->> 'productId')::uuid
  where (i ->> 'quantity')::int > 0;

  if not exists (select 1 from order_items where order_id = p_order_id) then
    raise exception 'EMPTY_ORDER';
  end if;

  select coalesce(sum(subtotal), 0),
         coalesce(sum(subtotal) filter (where taxable), 0)
  into v_total, v_kena
  from order_items where order_id = p_order_id;

  update orders set total = v_total, subtotal = v_total, taxable_subtotal = v_kena
  where id = p_order_id;

  return p_order_id;
end;
$$;


-- ============================================================ append_to_order
-- Sama dengan 0019, taxable diambil dari v_product.taxable (produk), bukan lagi
-- dari join ke categories.
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
              v_product.taxable);
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

commit;
