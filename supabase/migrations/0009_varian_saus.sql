-- Varian saus untuk nasi paket goreng tepung.
--
-- Sepuluh produk baru: lima saus untuk ayam goreng tepung, lima untuk udang
-- goreng tepung. Varian Ori bukan baris baru — ia baris yang sudah ada (K148
-- dan NP2, Rp 25.000), dan sengaja TIDAK diubah namanya. Penggabungan kartu di
-- lib/product-variants.ts mengenali Ori justru dari ketiadaan akhiran saus,
-- jadi menambahkan kata "Ori" ke namanya akan memecah kartunya menjadi dua.
--
-- Harga: Rp 27.000 untuk kelima saus, selisih tetap Rp 2.000 dari Ori.
--
-- Kenapa tiap varian jadi baris produk sendiri, bukan kolom atau tabel varian:
-- pola yang sama sudah dipakai panas/dingin sejak awal, order_items menyimpan
-- product_code dan product_name sebagai snapshot, dan laporan produk harus bisa
-- membedakan teriyaki dari mentega. Tabel varian terpisah akan memaksa kedua
-- hal itu ditulis ulang.
--
-- seed.sql juga sudah memuat baris-baris ini, untuk pemasangan baru. Migrasi ini
-- untuk database yang sudah terisi — dan keduanya harus tetap sama isinya.
--
-- CATATAN OPERASIONAL: outlet saat ini berjalan di aplikasi web yang menunjuk
-- Postgres lokal, sementara aplikasi ponsel menunjuk proyek hosted. Migrasi ini
-- harus dijalankan di KEDUANYA. Kalau hanya di salah satu, menu baru muncul di
-- satu perangkat dan tidak di perangkat lain, dengan katalog yang sama-sama
-- tampak wajar.

insert into products (outlet_id, category_id, code, name, price)
select o.id, c.id, v.code, v.name, v.price
from outlets o
join categories c on c.outlet_id = o.id and c.code = 'NASPKT'
cross join (values
  ('K148A', 'Nasi Paket Ayam Goreng Tepung Mayonnaise' , 27000),
  ('K148B', 'Nasi Paket Ayam Goreng Tepung Bangkok'    , 27000),
  ('K148C', 'Nasi Paket Ayam Goreng Tepung Mentega'    , 27000),
  ('K148D', 'Nasi Paket Ayam Goreng Tepung Lada Hitam' , 27000),
  ('K148E', 'Nasi Paket Ayam Goreng Tepung Teriyaki'   , 27000),
  ('NP2A' , 'Nasi Paket Udang Goreng Tepung Mayonnaise', 27000),
  ('NP2B' , 'Nasi Paket Udang Goreng Tepung Bangkok'   , 27000),
  ('NP2C' , 'Nasi Paket Udang Goreng Tepung Mentega'   , 27000),
  ('NP2D' , 'Nasi Paket Udang Goreng Tepung Lada Hitam', 27000),
  ('NP2E' , 'Nasi Paket Udang Goreng Tepung Teriyaki'  , 27000)
) as v(code, name, price)
-- Idempoten lewat unique (outlet_id, code) dari 0001_init.sql: menjalankan
-- migrasi ini dua kali tidak menggandakan menu, dan tidak menimpa harga yang
-- mungkin sudah disesuaikan tangan di outlet.
on conflict (outlet_id, code) do nothing;
