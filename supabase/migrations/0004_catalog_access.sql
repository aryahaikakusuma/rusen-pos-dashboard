-- Katalog untuk aplikasi mobile.
--
-- 0003 hanya membuka satu petak: pegawai membaca barisnya sendiri. Langkah 3
-- (database lokal) butuh satu petak lagi — tanpa daftar produk di perangkat,
-- tidak ada order yang bisa dibuat, apalagi saat offline.
--
-- Yang dibuka di sini hanya BACA, dan hanya dua tabel master. Order, pembayaran,
-- dan void tetap tertutup sampai langkah 5 membawa layar kasirnya.
--
-- Perhatikan: tidak ada insert/update/delete di sini. Katalog satu arah, dari
-- server ke perangkat. Harga produk tidak boleh bisa diubah dari APK.

grant select on categories to authenticated;
grant select on products   to authenticated;

-- Batasi ke outlet pegawai yang login, bukan ke semua outlet. Sekarang outletnya
-- baru satu, tapi kolom outlet_id sudah ada sejak 0001 justru supaya ekspansi
-- nanti tidak perlu migrasi data — policy-nya ikut disiapkan sekarang.
create policy categories_read_own_outlet on categories
  for select
  to authenticated
  using (
    outlet_id = (select e.outlet_id from employees e where e.id = (select auth.uid()))
  );

create policy products_read_own_outlet on products
  for select
  to authenticated
  using (
    outlet_id = (select e.outlet_id from employees e where e.id = (select auth.uid()))
  );
