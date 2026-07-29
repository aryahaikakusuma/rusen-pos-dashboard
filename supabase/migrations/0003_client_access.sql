-- Akses klien untuk aplikasi mobile.
--
-- 0001_init.sql sengaja mengunci semua tabel: RLS menyala tanpa satu pun policy,
-- dan hanya service_role yang diberi GRANT. Itu tepat selama satu-satunya klien
-- adalah aplikasi web, yang seluruh query-nya lewat server.
--
-- Aplikasi React Native tidak punya sisi server. Ia tidak boleh memegang
-- service_role key (bisa diekstrak dari APK dan melewati RLS), jadi ia masuk
-- sebagai `authenticated` memakai token dari Edge Function `pin-login`.
--
-- Migrasi ini membuka SEPETAK KECIL saja: pegawai boleh membaca barisnya
-- sendiri. Tabel lain tetap tertutup. Produk, order, dan pembayaran menyusul
-- di langkah 5 bersama layar yang benar-benar membutuhkannya — setiap GRANT
-- baru adalah lubang di database yang tadinya rapat, jadi harus ada alasannya.
--
-- Aplikasi web tidak terpengaruh sama sekali: ia tetap memakai service_role,
-- yang melewati RLS.

grant usage on schema public to authenticated;

-- GRANT per kolom, bukan per tabel. RLS tidak bisa menyembunyikan kolom, jadi
-- pin_hash harus ditahan di lapisan GRANT — kalau tidak, pegawai mana pun bisa
-- menarik hash PIN rekannya dan menebaknya secara offline.
grant select (id, outlet_id, name, role, active) on employees to authenticated;

-- auth.uid() berasal dari klaim `sub` token, yang diisi employees.id oleh
-- pin-login.
create policy employees_read_self on employees
  for select
  to authenticated
  using (id = (select auth.uid()));
