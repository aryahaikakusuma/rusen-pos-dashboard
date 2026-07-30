-- Membersihkan seluruh order uji coba. Outlet belum pernah memakai aplikasi
-- ini untuk penjualan sungguhan, jadi setiap baris di orders adalah data
-- fiktif yang lahir saat pengujian di perangkat — dan kalau dibiarkan, semua
-- ikut terhitung di laporan penjualan begitu toko mulai berjalan.
--
-- Ditulis sebagai migrasi karena itu satu-satunya jalur tulis yang tersedia
-- ke basis data terhosting, dan karena penghapusan data di basis data hidup
-- pantas meninggalkan jejak yang bisa dilacak.
--
-- Urutannya bukan selera. payments dan refunds mereferensikan orders TANPA
-- `on delete cascade`, jadi keduanya harus lebih dulu — kalau tidak,
-- penghapusan orders langsung ditolak foreign key. order_items dan
-- order_item_voids punya cascade dan ikut terhapus sendiri; refund_items ikut
-- lewat cascade dari refunds.
--
-- Aman dijalankan di basis data yang baru di-seed: tidak ada order di sana,
-- jadi ketiga perintah ini tidak menyentuh apa pun.

begin;

delete from refunds
where order_id in (
  select id from orders
  where outlet_id = '00000000-0000-0000-0000-000000000001'
);

delete from payments
where order_id in (
  select id from orders
  where outlet_id = '00000000-0000-0000-0000-000000000001'
);

delete from orders
where outlet_id = '00000000-0000-0000-0000-000000000001';

-- Jaring pengaman. Kalau ada baris yang lolos — misalnya karena tabel baru
-- ditambahkan yang mereferensikan orders — seluruh transaksi dibatalkan
-- daripada meninggalkan basis data setengah bersih.
do $$
declare sisa int;
begin
  select count(*) into sisa from orders;
  if sisa > 0 then
    raise exception 'Masih ada % order tersisa setelah penghapusan', sisa;
  end if;
end $$;

commit;
