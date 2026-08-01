-- Hapus A3 (semua) dan nomor meja 1 dengan transaksi < 30000
-- Target: 12 order (2 A3 + 10 order '1' dengan total < 30000)
-- Total nominal: Rp60.400 (A3) + Rp181.400 (table_code '1' < 30k) = Rp241.800
-- Urutan: refunds → payments → orders (order_items dan order_item_voids cascade otomatis)

with target_orders as (
  select id from orders
  where table_code = 'A3' or (table_code = '1' and total < 30000)
)
delete from refunds where order_id in (select id from target_orders);

with target_orders as (
  select id from orders
  where table_code = 'A3' or (table_code = '1' and total < 30000)
)
delete from payments where order_id in (select id from target_orders);

with target_orders as (
  select id from orders
  where table_code = 'A3' or (table_code = '1' and total < 30000)
)
delete from orders where id in (select id from target_orders);

-- Verifikasi: tidak ada sisa order yang seharusnya dihapus
do $$
declare sisa int;
begin
  select count(*) into sisa from orders
  where table_code = 'A3' or (table_code = '1' and total < 30000);
  if sisa > 0 then
    raise exception 'Masih ada % order yang seharusnya terhapus', sisa;
  end if;
end $$;
