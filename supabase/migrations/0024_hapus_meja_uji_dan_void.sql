-- Hapus order testing (table_code satu huruf) dan semua order void
-- Target: 16 order (7 void + 9 paid dengan table_code satu huruf)
-- Urutan: refunds → payments → orders (order_items dan order_item_voids cascade otomatis)

with target_orders as (
  select id from orders
  where table_code ~ '^[A-Za-z]$' or status = 'void'
)
delete from refunds where order_id in (select id from target_orders);

with target_orders as (
  select id from orders
  where table_code ~ '^[A-Za-z]$' or status = 'void'
)
delete from payments where order_id in (select id from target_orders);

with target_orders as (
  select id from orders
  where table_code ~ '^[A-Za-z]$' or status = 'void'
)
delete from orders where id in (select id from target_orders);

-- Verifikasi: tidak ada sisa order yang seharusnya dihapus
do $$
declare sisa int;
begin
  select count(*) into sisa from orders
  where table_code ~ '^[A-Za-z]$' or status = 'void';
  if sisa > 0 then
    raise exception 'Masih ada % order yang seharusnya terhapus', sisa;
  end if;
end $$;
