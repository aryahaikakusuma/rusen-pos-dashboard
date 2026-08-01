-- Topping Indomie: dari tangga empat preset menjadi tiga topping bebas.
--
-- Sebelumnya hanya empat kombinasi yang punya baris produk — Polos, Sayur,
-- Sayur + Telur, Sayur + Telur + Sosis — sehingga kotak centang di layar kasir
-- terpaksa saling mengunci: mencentang Telur ikut mencentang Sayur, karena
-- "Telur saja" tidak punya harga. Kasir minta ketiganya bisa dicentang bebas.
--
-- Harga topping bersifat PENJUMLAHAN, dan itu bukan aturan baru yang dikarang
-- di sini. Kategori TOPPING sudah mencantumkannya sebagai barang tersendiri:
--
--   Sayur  Rp 2.000
--   Telur  Rp 5.000
--   Sosis  Rp 3.000
--
-- Dijumlahkan, angka-angka itu mereproduksi SELURUH baris Indomie yang sudah
-- ada, termasuk dua baris huruf kecil yang sempat dikira sisa POS lama:
--
--   Goreng polos                10.000
--   Goreng sayur                12.000 = 10.000 + 2.000
--   Goreng sayur + telur        17.000 = 10.000 + 2.000 + 5.000
--   Goreng sayur+telur+sosis    20.000 = 10.000 + 2.000 + 5.000 + 3.000
--   'indomie goreng+telur'      15.000 = 10.000 + 5.000          <-- telur saja
--   Kuah polos                   8.000
--   'indomie kuah+telur'        13.000 =  8.000 + 5.000          <-- telur saja
--
-- Jadi dua baris itu justru kombinasi bebas yang sudah dipakai outlet, ditulis
-- dengan tangan di POS lama. Yang hilang tinggal tiga kombinasi per menu.
--
-- Migrasi ini melakukan dua hal, keduanya data — tidak ada perubahan skema:
--
--   1. Menamai ulang dua baris huruf kecil itu mengikuti pola nama yang dibaca
--      pengelompokan varian, supaya ia ikut masuk ke kartunya alih-alih berdiri
--      sendiri sebagai kartu terpisah.
--   2. Menambah enam baris untuk kombinasi yang belum pernah ada.
--
-- Menamai ulang aman terhadap riwayat: order_items menyimpan product_code dan
-- product_name sebagai snapshot saat transaksi, jadi struk dan laporan lama
-- tetap berbunyi persis seperti saat dicetak.
--
-- CATATAN OPERASIONAL, sama seperti 0009: outlet menjalankan aplikasi web di
-- Postgres lokal dan aplikasi ponsel di proyek hosted. Migrasi ini harus
-- dijalankan di KEDUANYA, atau menu baru hanya muncul di salah satu perangkat.

-- 1. Nama baru untuk kombinasi "telur saja" yang sudah ada.
--
-- Disaring per kode DAN per nama lama: kalau seseorang sudah menamainya dengan
-- benar lewat tangan, tidak ada yang perlu diubah, dan kalau kode itu ternyata
-- dipakai untuk menu lain di outlet lain, ia tidak ikut tersentuh.
update products p
set name = 'Indomie Goreng Telur'
where p.code = '138' and lower(p.name) = 'indomie goreng+telur';

update products p
set name = 'Indomie Kuah Telur'
where p.code = '139' and lower(p.name) = 'indomie kuah+telur';

-- 2. Kombinasi yang belum punya baris sama sekali.
--
-- Urutan kata dalam nama mengikuti urutan kotak centang di layar — Sayur,
-- Telur, Sosis — supaya nama produk terbaca sebagai kotak mana yang tercentang,
-- bukan sebagai daftar yang urutannya kebetulan.
insert into products (outlet_id, category_id, code, name, price)
select o.id, c.id, v.code, v.name, v.price
from outlets o
join categories c on c.outlet_id = o.id and c.code = 'INDOMIE'
cross join (values
  -- Goreng, dasar 10.000
  ('K134A', 'Indomie Goreng Sosis'        , 13000),  -- + 3.000
  ('K134B', 'Indomie Goreng Sayur + Sosis', 15000),  -- + 2.000 + 3.000
  ('K134C', 'Indomie Goreng Telur + Sosis', 18000),  -- + 5.000 + 3.000
  -- Kuah, dasar 8.000
  ('K130A', 'Indomie Kuah Sosis'          , 11000),
  ('K130B', 'Indomie Kuah Sayur + Sosis'  , 13000),
  ('K130C', 'Indomie Kuah Telur + Sosis'  , 16000)
) as v(code, name, price)
-- Idempoten lewat unique (outlet_id, code) dari 0001_init.sql, alasan yang sama
-- seperti 0009: menjalankan ulang tidak menggandakan menu dan tidak menimpa
-- harga yang mungkin sudah disesuaikan tangan di outlet.
on conflict (outlet_id, code) do nothing;
