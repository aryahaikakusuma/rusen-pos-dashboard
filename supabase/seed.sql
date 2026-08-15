-- Data awal Rusen Kopitiam.
-- Kategori & produk diambil dari "Daftar Produk.xlsx" (ekspor 29/07/2026 13:26):
-- 293 produk, 23 kategori. Harga dalam rupiah utuh (bigint), sesuai kolom
-- "Harga Jual Satuan #1". Kolom "code" memakai SKU dari file tersebut.
--
-- Tiga penyesuaian terhadap file sumber, semuanya disengaja:
--   1. Tiga produk berkategori "-" dipetakan manual: MLD & Surya Pro -> Rokok,
--      "snack 9 k" -> Snack & Minuman Botol. Kategori "-" tidak dibuat.
--   2. SKU "KPc" (Kopi Pancung) diubah jadi "KPCG" karena bentrok dengan
--      "KPC" (Kopi Cha) — kolom code tidak membedakan huruf besar/kecil.
--   3. SKU "k141" (+jahe) diubah jadi "ADDJHE" karena bentrok dengan
--      "K141" (Nasi Goreng Ayam).
-- Kalau file sumber diperbaiki, sesuaikan kembali ke SKU aslinya.
--
-- Akun mengikuti pembagian shift di toko, bukan per orang (hash bcrypt di
-- bawah, plaintext TIDAK pernah masuk database):
--   Pagi   123456  kasir
--   Sore   654321  kasir
--   Owner  (PIN diganti pemilik; plaintext sengaja tidak ditulis di sini)  owner
--
-- Konsekuensi yang disengaja: orders.created_by, paid_by, dan voided_by akan
-- menunjuk ke shift, bukan ke orang. Selama satu shift dijaga satu orang, itu
-- setara. Begitu dua orang bergantian dalam shift yang sama, laporan void tidak
-- lagi bisa menyebut siapa yang membatalkan — dan itulah satu-satunya hal yang
-- dilacak fitur void. Kalau nanti perlu, tambahkan akun per orang.
--
-- Peran keduanya `cashier`. Fungsi yang menuntut manager sengaja tetap harus
-- lewat akun Owner.
--
-- Ganti semua PIN ini sebelum dipakai di outlet sungguhan.

begin;

-- tax_rate_bps ditulis eksplisit walau nilainya sama dengan default kolomnya
-- (0012). Tarif pajak adalah angka yang orang cari dan ubah; membiarkannya
-- hanya hidup sebagai default di migrasi berarti ia tidak terlihat sama sekali
-- dari berkas yang dibaca saat memasang instalasi baru.
insert into outlets (id, name, address, tax_rate_bps) values
  ('00000000-0000-0000-0000-000000000001', 'Rusen Kopitiam', 'Outlet Utama', 1000);  -- PBJT 10%

insert into employees (outlet_id, name, pin_hash, role) values
  ('00000000-0000-0000-0000-000000000001', 'Pagi',  '$2b$10$mqWL5jMOE5X8Jg8DPLTWaOkMPMbKsK73Pv24JnQpsKrvm3qBe/Uae', 'cashier'),
  ('00000000-0000-0000-0000-000000000001', 'Sore',  '$2b$10$r2kFseKsqWCs93ISuf7TJ.sAqU2Gs1/uzgddHvvxx1EDjoBZRwohe', 'cashier'),
  ('00000000-0000-0000-0000-000000000001', 'Owner', '$2b$10$OGm53hMvN33t9ZqKZTignugMDGCwtzxWnuM5iWo2rh5ImR8CFemyu', 'owner');

insert into categories (outlet_id, code, name, sort_order) values
  ('00000000-0000-0000-0000-000000000001', 'KOPI'   , 'Kopi'                          ,  1),
  ('00000000-0000-0000-0000-000000000001', 'TEH'    , 'Teh'                           ,  2),
  ('00000000-0000-0000-0000-000000000001', 'MILKY'  , 'Milky'                         ,  3),
  ('00000000-0000-0000-0000-000000000001', 'JAHE'   , 'Jahe'                          ,  4),
  ('00000000-0000-0000-0000-000000000001', 'JERUK'  , 'Jeruk'                         ,  5),
  ('00000000-0000-0000-0000-000000000001', 'YAKULT' , 'Yakult'                        ,  6),
  ('00000000-0000-0000-0000-000000000001', 'MNLL'   , 'Minuman Lain-Lain'             ,  7),
  ('00000000-0000-0000-0000-000000000001', 'SNKBTL' , 'Snack & Minuman Botol'         ,  8),
  ('00000000-0000-0000-0000-000000000001', 'SRPN'   , 'Sarapan Pagi'                  ,  9),
  ('00000000-0000-0000-0000-000000000001', 'NASGOR' , 'Nasi Goreng'                   , 10),
  ('00000000-0000-0000-0000-000000000001', 'NASPKT' , 'Nasi Paket'                    , 11),
  ('00000000-0000-0000-0000-000000000001', 'INDOMIE', 'Indomie'                       , 12),
  ('00000000-0000-0000-0000-000000000001', 'DIMSUM' , 'Dimsum'                        , 13),
  ('00000000-0000-0000-0000-000000000001', 'ROTBKR' , 'Roti Bakar'                    , 14),
  ('00000000-0000-0000-0000-000000000001', 'PSGGRG' , 'Pisang Goreng'                 , 15),
  ('00000000-0000-0000-0000-000000000001', 'PSGARM' , 'Pisang Aroma'                  , 16),
  ('00000000-0000-0000-0000-000000000001', 'KTGTELA', 'Kentang / Tela Singkong Goreng', 17),
  ('00000000-0000-0000-0000-000000000001', 'TAHTMP' , 'Tahu / Tempe'                  , 18),
  ('00000000-0000-0000-0000-000000000001', 'TELUR'  , 'Telur'                         , 19),
  ('00000000-0000-0000-0000-000000000001', 'MKNLL'  , 'Makanan Lain-Lain'             , 20),
  ('00000000-0000-0000-0000-000000000001', 'ADDON'  , 'Add On'                        , 21),
  ('00000000-0000-0000-0000-000000000001', 'TOPPING', 'Topping'                       , 22),
  ('00000000-0000-0000-0000-000000000001', 'ROKOK'  , 'Rokok'                         , 23);

-- Rokok bukan objek PBJT (0019). Ditulis sebagai UPDATE terpisah, bukan sebagai
-- kolom di INSERT di atas, karena hanya satu dari 23 baris yang berbeda dan
-- menambahkan kolom ke setiap baris menyembunyikan satu-satunya yang penting.
-- Bentuknya sama persis dengan yang ada di migrasinya.
update categories set taxable = false where code = 'ROKOK';

insert into products (outlet_id, category_id, code, name, price)
select '00000000-0000-0000-0000-000000000001', c.id, v.code, v.name, v.price
from (values
  -- Kopi
  ('KOPI'   , 'KP'     , 'Kopi'                                      , 11000),
  ('KOPI'   , 'R006'   , 'Kopi Bubuk 200gr'                          , 32000),
  ('KOPI'   , 'KCES'   , 'Kopi Cendol S'                             , 22000),
  ('KOPI'   , 'KPC'    , 'Kopi Cha'                                  , 14000),
  ('KOPI'   , 'KPCS'   , 'Kopi Cha S'                                , 18000),
  ('KOPI'   , 'KCS'    , 'Kopi Cha Susu'                             , 16000),
  ('KOPI'   , 'KCSS'   , 'Kopi Cha Susu S'                           , 20000),
  ('KOPI'   , 'KGB'    , 'Kopi Gelas Besar'                          , 14000),
  ('KOPI'   , 'KPM'    , 'Kopi Milo'                                 , 14000),
  ('KOPI'   , 'KPMS'   , 'Kopi Milo S'                               , 18000),
  ('KOPI'   , 'KMS'    , 'Kopi Milo Susu'                            , 16000),
  ('KOPI'   , 'KMSS'   , 'Kopi Milo Susu Es'                         , 20000),
  ('KOPI'   , 'KPCG'   , 'Kopi Pancung'                              ,  9000),
  ('KOPI'   , 'KR'     , 'Kopi Rusen'                                , 14000),
  ('KOPI'   , 'KPS'    , 'Kopi S'                                    , 15000),
  ('KOPI'   , 'K7'     , 'Kopi SGM Panas'                            , 17000),
  ('KOPI'   , 'KPSGS'  , 'Kopi SGM S'                                , 21000),
  ('KOPI'   , 'KSGB'   , 'Kopi Susu Gelas Besar'                     , 17000),
  ('KOPI'   , 'KSM'    , 'Kopi Susu Muda'                            , 17000),
  ('KOPI'   , 'KSMS'   , 'Kopi Susu Muda S'                          , 21000),
  ('KOPI'   , 'KS'     , 'Kopi Susu Panas'                           , 13000),
  ('KOPI'   , 'K206'   , 'Kopi Susu Pancung'                         , 11000),
  ('KOPI'   , 'KSS'    , 'Kopi Susu S'                               , 18000),
  ('KOPI'   , 'K11'    , 'Kopi Tubruk (Bubuk)'                       , 15000),
  ('KOPI'   , 'KV'     , 'Kopi Vietnam'                              , 12000),
  ('KOPI'   , 'KVS'    , 'Kopi VIetnam Susu'                         , 14000),

  -- Teh
  ('TEH'    , 'LTS'    , 'Lemon Tea Dingin'                          , 12000),
  ('TEH'    , 'LT'     , 'Lemon Tea Panas'                           , 10000),
  ('TEH'    , 'TGMS'   , 'Teh Gula Merah Dingin'                     , 12000),
  ('TEH'    , 'TGM'    , 'Teh Gula Merah Panas'                      , 10000),
  ('TEH'    , 'TJGS'   , 'Teh Jahe Gula Merah Dingin'                , 15000),
  ('TEH'    , 'TJG'    , 'Teh Jahe Gula Merah Panas'                 , 12000),
  ('TEH'    , 'TJ'     , 'Teh Jahe Panas'                            , 10000),
  ('TEH'    , 'TJS'    , 'Teh Jahe S'                                , 12000),
  ('TEH'    , 'TJSGS'  , 'Teh Jahe SGM Dingin'                       , 18000),
  ('TEH'    , 'TJSG'   , 'Teh Jahe SGM Panas'                        , 15000),
  ('TEH'    , 'R019'   , 'Teh Jahe Susu Dingin'                      , 15000),
  ('TEH'    , 'R018'   , 'Teh Jahe Susu Panas'                       , 12000),
  ('TEH'    , 'R011'   , 'Teh Manis Dingin'                          ,  7000),
  ('TEH'    , 'R010'   , 'Teh Manis Panas'                           ,  7000),
  ('TEH'    , 'R022'   , 'Teh SGM Dingin'                            , 17000),
  ('TEH'    , 'R020'   , 'Teh SGM Panas'                             , 14000),
  ('TEH'    , 'R015'   , 'Teh Susu Dingin'                           , 15000),
  ('TEH'    , 'R014'   , 'Teh Susu Panas'                            , 10000),
  ('TEH'    , 'R041'   , 'Teh Susu Tarik Dingin'                     , 18000),
  ('TEH'    , 'R040'   , 'Teh Susu Tarik Panas'                      , 15000),
  ('TEH'    , 'R009'   , 'Teh Tawar Dingin'                          ,  5000),
  ('TEH'    , 'R008'   , 'Teh Tawar Panas'                           ,  5000),

  -- Milky
  ('MILKY'  , 'K47'    , 'Avocado Milky Dingin'                      , 20000),
  ('MILKY'  , 'K46'    , 'Avocado Milky Panas'                       , 17000),
  ('MILKY'  , 'R036'   , 'Cappucino Cincau'                          , 22000),
  ('MILKY'  , 'K29'    , 'Cappucino Dingin'                          , 20000),
  ('MILKY'  , 'K28'    , 'Cappucino Panas'                           , 17000),
  ('MILKY'  , 'K37'    , 'Choco Caramel Dingin'                      , 20000),
  ('MILKY'  , 'K36'    , 'Choco Caramel Panas'                       , 17000),
  ('MILKY'  , 'K33'    , 'Choco Hazelnut Dingin'                     , 20000),
  ('MILKY'  , 'K32'    , 'Choco Hazelnut Panas'                      , 17000),
  ('MILKY'  , 'K35'    , 'Choco Oreo Dingin'                         , 20000),
  ('MILKY'  , 'K34'    , 'Choco Oreo Panas'                          , 17000),
  ('MILKY'  , 'K27'    , 'Coklat Dingin'                             , 20000),
  ('MILKY'  , 'K26'    , 'Coklat Panas'                              , 17000),
  ('MILKY'  , 'K43'    , 'Green Thaitea Milk Dingin'                 , 20000),
  ('MILKY'  , 'K42'    , 'Green Thaitea Milk Panas'                  , 17000),
  ('MILKY'  , 'K45'    , 'Manggo Milky Dingin'                       , 20000),
  ('MILKY'  , 'K44'    , 'Manggo Milky Panas'                        , 17000),
  ('MILKY'  , 'K25'    , 'Milo Dingin'                               , 20000),
  ('MILKY'  , 'K24'    , 'Milo Panas'                                , 17000),
  ('MILKY'  , 'K49'    , 'Red Velvet Dingin'                         , 20000),
  ('MILKY'  , 'K48'    , 'Red Velvet Panas'                          , 17000),
  ('MILKY'  , 'K23'    , 'Susu Dingin'                               , 15000),
  ('MILKY'  , 'K22'    , 'Susu Panas'                                , 12000),
  ('MILKY'  , 'K41'    , 'Thai Tea Milk Dingin'                      , 20000),
  ('MILKY'  , 'K40'    , 'Thai Tea Milk Panas'                       , 17000),
  ('MILKY'  , 'K50'    , 'Topping Cincau'                            ,  2000),
  ('MILKY'  , 'K39'    , 'Vanilla Latte Dingin'                      , 20000),
  ('MILKY'  , 'K38'    , 'Vanilla Latte Panas'                       , 17000),

  -- Jahe
  ('JAHE'   , 'R028'   , 'Jahe Dingin'                               ,  7000),
  ('JAHE'   , 'R033'   , 'Jahe Gula Merah Dingin'                    , 12000),
  ('JAHE'   , 'R031'   , 'Jahe Gula Merah Panas'                     , 10000),
  ('JAHE'   , 'R027'   , 'Jahe Panas'                                ,  7000),
  ('JAHE'   , 'R030'   , 'Jahe Susu Dingin'                          , 12000),
  ('JAHE'   , 'R035'   , 'Jahe Susu Gula Merah Dingin'               , 15000),
  ('JAHE'   , 'R034'   , 'Jahe Susu Gula Merah Panas'                , 14000),
  ('JAHE'   , 'R029'   , 'Jahe Susu Panas'                           , 10000),

  -- Jeruk
  ('JERUK'  , 'K60'    , 'Blue Ocean'                                , 18000),
  ('JERUK'  , 'R078'   , 'Jeruk Besar'                               , 15000),
  ('JERUK'  , 'K56'    , 'Jeruk Melon'                               , 18000),
  ('JERUK'  , 'R077'   , 'Jeruk Nipis'                               ,  7000),
  ('JERUK'  , 'K57'    , 'Lemon Dingin'                              , 10000),
  ('JERUK'  , 'R079'   , 'Lemon Panas'                               , 10000),
  ('JERUK'  , 'K59'    , 'Lemon Soda'                                , 18000),
  ('JERUK'  , 'R81'    , 'Nammong'                                   , 10000),
  ('JERUK'  , 'R82'    , 'Nammong Special'                           , 12000),
  ('JERUK'  , 'K61'    , 'Tiga Asam'                                 , 15000),

  -- Yakult
  ('YAKULT' , 'K51'    , 'Lemon Yakult'                              , 20000),
  ('YAKULT' , 'K53'    , 'Manggo Yakult'                             , 20000),
  ('YAKULT' , 'K52'    , 'Orange Yakult'                             , 20000),

  -- Minuman Lain-Lain
  ('MNLL'   , 'K70'    , 'ABC'                                       , 18000),
  ('MNLL'   , 'K77'    , 'Air Putih / Es Batu'                       ,  3000),
  ('MNLL'   , 'K64'    , 'Air Tahu'                                  ,  7000),
  ('MNLL'   , 'K69'    , 'Es Buah'                                   , 15000),
  ('MNLL'   , 'K67'    , 'Es Cendol'                                 , 15000),
  ('MNLL'   , 'R03'    , 'Es Cincau'                                 , 10000),
  ('MNLL'   , 'K78'    , 'Es Tawar'                                  ,  5000),
  ('MNLL'   , 'K71'    , 'Extrajoss'                                 , 10000),
  ('MNLL'   , 'K72'    , 'Extrajoss Susu'                            , 12000),
  ('MNLL'   , 'R038'   , 'Jus Buah Alpukat'                          , 18000),
  ('MNLL'   , 'R039'   , 'Jus Buah Apel'                             , 18000),
  ('MNLL'   , 'R037'   , 'Jus Buah Naga'                             , 18000),
  ('MNLL'   , 'K65'    , 'Kacang Hijau'                              , 10000),
  ('MNLL'   , 'R084'   , 'Kacang Hijau Susu'                         , 12000),
  ('MNLL'   , 'K68'    , 'Lidah Buaya'                               , 12000),
  ('MNLL'   , 'K75'    , 'Mineral 330 ML'                            ,  5000),
  ('MNLL'   , 'K76'    , 'Mineral 600 ML'                            ,  8000),
  ('MNLL'   , 'R052'   , 'Ocha Dingin'                               , 10000),
  ('MNLL'   , 'R051'   , 'Ocha Panas'                                ,  8000),
  ('MNLL'   , 'K73'    , 'Sarsapila'                                 , 15000),

  -- Snack & Minuman Botol
  ('SNKBTL' , 'K181'   , 'Cimory Squezze'                            , 13000),
  ('SNKBTL' , 'K182'   , 'Kue'                                       ,  4000),
  ('SNKBTL' , 'K179'   , 'Minuman Botol 10K'                         , 10000),
  ('SNKBTL' , 'K180'   , 'Minuman Kotak'                             , 10000),
  ('SNKBTL' , 'K192'   , 'Nammong Cup'                               , 15000),
  ('SNKBTL' , 'R072'   , 'Nescafe'                                   , 10000),
  ('SNKBTL' , 'K190'   , 'Permen Lunak'                              ,  3000),
  ('SNKBTL' , 'K188'   , 'Permen Orang Tua'                          ,  5000),
  ('SNKBTL' , 'K187'   , 'Permen Sanca'                              ,  3000),
  ('SNKBTL' , 'K189'   , 'Permen Stik'                               ,  2000),
  ('SNKBTL' , 'K191'   , 'Roti Aoka'                                 ,  4000),
  ('SNKBTL' , 'K185'   , 'Snack 10K'                                 , 10000),
  ('SNKBTL' , 'R79'    , 'Snack 3K'                                  ,  3000),
  ('SNKBTL' , 'K183'   , 'Snack 4K'                                  ,  4000),
  ('SNKBTL' , 'K186'   , 'Snack 5K'                                  ,  5000),
  ('SNKBTL' , 'K184'   , 'Snack 7K'                                  ,  7000),
  ('SNKBTL' , 'R097'   , 'Snack 8K'                                  ,  8000),
  ('SNKBTL' , 'M123'   , 'snack 9 k'                                 ,  9000),
  ('SNKBTL' , 'K-339'  , 'Snack 9k'                                  ,  9000),
  ('SNKBTL' , 'K175'   , 'Susu Beruang'                              , 13000),
  ('SNKBTL' , 'K177'   , 'Susu Kotak'                                ,  8000),
  ('SNKBTL' , 'K176'   , 'UC 1000'                                   , 13000),
  ('SNKBTL' , 'K193'   , 'Yakult B'                                  ,  5000),
  ('SNKBTL' , 'K173'   , 'Yakult Botol'                              ,  3000),
  ('SNKBTL' , 'K174'   , 'Yakult Strip'                              , 13000),

  -- Sarapan Pagi
  ('SRPN'   , 'R048'   , 'Bubur Ayam'                                , 20000),
  ('SRPN'   , 'R054'   , 'Bubur Ayam / Sapi 1/2 Porsi'               , 15000),
  ('SRPN'   , 'R50'    , 'Bubur Pedas'                               , 15000),
  ('SRPN'   , 'R070'   , 'Bubur Polos'                               , 10000),
  ('SRPN'   , 'R049'   , 'Bubur Sapi'                                , 20000),
  ('SRPN'   , 'R069'   , 'Bubur Teri'                                , 15000),
  ('SRPN'   , 'R062'   , 'Nasi Kuning'                               , 15000),
  ('SRPN'   , 'R061'   , 'Nasi Kuning + Ayam'                        , 25000),
  ('SRPN'   , 'PAMS1A' , 'Paket 1A'                                  , 20000),
  ('SRPN'   , 'PAMS1B' , 'Paket 1B'                                  , 17000),
  ('SRPN'   , 'PAMS1C' , 'Paket 1C'                                  , 18000),
  ('SRPN'   , 'PAMS2A' , 'Paket 2A'                                  , 22000),
  ('SRPN'   , 'PAMS2B' , 'Paket 2B'                                  , 19000),
  ('SRPN'   , 'PAMS2C' , 'Paket 2C'                                  , 20000),
  ('SRPN'   , 'PAMS3A' , 'Paket 3A'                                  , 23000),
  ('SRPN'   , 'PAMS3B' , 'Paket 3B'                                  , 21000),
  ('SRPN'   , 'PAMS3C' , 'Paket 3C'                                  , 22000),
  ('SRPN'   , 'PAMS4A' , 'Paket 4A'                                  , 23000),
  ('SRPN'   , 'PAMS4B' , 'Paket 4B'                                  , 21000),
  ('SRPN'   , 'PAMS4C' , 'Paket 4C'                                  , 22000),
  ('SRPN'   , 'PAMSA'  , 'Paket A'                                   , 26000),
  ('SRPN'   , 'PAMSB'  , 'Paket B'                                   , 28000),
  ('SRPN'   , 'R081'   , 'Sop Ikan Teri'                             , 13000),
  ('SRPN'   , 'R085'   , 'Sop Kuah'                                  ,  5000),
  ('SRPN'   , 'R84'    , 'Tambah Kacang Teri'                        ,  3000),
  ('SRPN'   , 'K339'   , 'topping paketan hemat'                     ,  3000),

  -- Nasi Goreng
  ('NASGOR' , 'K141'   , 'Nasi Goreng Ayam'                          , 27000),
  ('NASGOR' , 'K143'   , 'Nasi Goreng Ikan Asin'                     , 25000),
  ('NASGOR' , 'K142'   , 'Nasi Goreng Ikan Teri'                     , 25000),
  ('NASGOR' , 'K144'   , 'Nasi Goreng Kampung'                       , 30000),
  ('NASGOR' , 'K140'   , 'Nasi Goreng Seafood'                       , 27000),
  ('NASGOR' , 'K139'   , 'Nasi Goreng Sosis'                         , 25000),
  ('NASGOR' , 'K138'   , 'Nasi Goreng Vegetarian'                    , 18000),

  -- Nasi Paket
  ('NASPKT' , 'K147'   , 'Nasi Paket Ayam Goreng'                    , 30000),
  -- Varian saus. Baris tanpa akhiran saus (K148, NP2) adalah varian Ori dan
  -- tetap Rp 25.000; kelima sausnya Rp 27.000, selisih tetap Rp 2.000. Nama
  -- dasarnya harus persis sama dengan baris Ori, karena penggabungan kartu di
  -- lib/product-variants.ts memotong akhiran saus lalu mencocokkan sisanya.
  ('NASPKT' , 'K148'   , 'Nasi Paket Ayam Goreng Tepung'             , 25000),
  ('NASPKT' , 'K148A'  , 'Nasi Paket Ayam Goreng Tepung Mayonnaise'  , 27000),
  ('NASPKT' , 'K148B'  , 'Nasi Paket Ayam Goreng Tepung Bangkok'     , 27000),
  ('NASPKT' , 'K148C'  , 'Nasi Paket Ayam Goreng Tepung Mentega'     , 27000),
  ('NASPKT' , 'K148D'  , 'Nasi Paket Ayam Goreng Tepung Lada Hitam'  , 27000),
  ('NASPKT' , 'K148E'  , 'Nasi Paket Ayam Goreng Tepung Teriyaki'    , 27000),
  ('NASPKT' , 'NP003'  , 'Nasi Paket Cumi Goreng Tepung'             , 25000),
  ('NASPKT' , 'K145'   , 'Nasi Paket Telur Kecap'                    , 15000),
  ('NASPKT' , 'K146'   , 'Nasi Paket Telur Kecap Pedas'              , 18000),
  ('NASPKT' , 'NP2'    , 'Nasi Paket Udang Goreng Tepung'            , 25000),
  ('NASPKT' , 'NP2A'   , 'Nasi Paket Udang Goreng Tepung Mayonnaise' , 27000),
  ('NASPKT' , 'NP2B'   , 'Nasi Paket Udang Goreng Tepung Bangkok'    , 27000),
  ('NASPKT' , 'NP2C'   , 'Nasi Paket Udang Goreng Tepung Mentega'    , 27000),
  ('NASPKT' , 'NP2D'   , 'Nasi Paket Udang Goreng Tepung Lada Hitam' , 27000),
  ('NASPKT' , 'NP2E'   , 'Nasi Paket Udang Goreng Tepung Teriyaki'   , 27000),

  -- Indomie
  ('INDOMIE', 'K134'   , 'Indomie Goreng Polos'                      , 10000),
  ('INDOMIE', 'K135'   , 'Indomie Goreng Sayur'                      , 12000),
  ('INDOMIE', 'K136'   , 'Indomie Goreng Sayur + Telur'              , 17000),
  ('INDOMIE', 'K137'   , 'Indomie Goreng Sayur + Telur + Sosis'      , 20000),
  ('INDOMIE', '138'    , 'Indomie Goreng Telur'                      , 15000),
  ('INDOMIE', 'K134A'   , 'Indomie Goreng Sosis'                      , 13000),
  ('INDOMIE', 'K134B'   , 'Indomie Goreng Sayur + Sosis'              , 15000),
  ('INDOMIE', 'K134C'   , 'Indomie Goreng Telur + Sosis'              , 18000),
  ('INDOMIE', 'K130'   , 'Indomie Kuah Polos'                        ,  8000),
  ('INDOMIE', 'K131'   , 'Indomie Kuah Sayur'                        , 10000),
  ('INDOMIE', 'K132'   , 'Indomie Kuah Sayur + Telur'                , 15000),
  ('INDOMIE', 'K133'   , 'Indomie Kuah Sayur + Telur + Sosis'        , 18000),
  ('INDOMIE', '139'    , 'Indomie Kuah Telur'                        , 13000),
  ('INDOMIE', 'K130A'   , 'Indomie Kuah Sosis'                        , 11000),
  ('INDOMIE', 'K130B'   , 'Indomie Kuah Sayur + Sosis'                , 13000),
  ('INDOMIE', 'K130C'   , 'Indomie Kuah Telur + Sosis'                , 16000),
  ('INDOMIE', 'R005'   , 'Tambah Indomie Sebungkus'                  ,  5000),

  -- Dimsum
  ('DIMSUM' , 'K112'   , 'Bakpao Ayam Charsiu'                       , 24000),
  ('DIMSUM' , 'K114'   , 'Bakpao Coklat'                             , 24000),
  ('DIMSUM' , 'K113'   , 'Bakpao Kacang Merah'                       , 24000),
  ('DIMSUM' , 'K115'   , 'Bakpao Talas'                              , 24000),
  ('DIMSUM' , 'K116'   , 'Bakpao Telur Asin'                         , 24000),
  ('DIMSUM' , 'K117'   , 'Choi Pan'                                  , 15000),
  ('DIMSUM' , 'K106'   , 'Kuotie'                                    , 20000),
  ('DIMSUM' , 'K107'   , 'Lumpia Ayam'                               , 21000),
  ('DIMSUM' , 'K109'   , 'Lumpia Bengkuang'                          , 15000),
  ('DIMSUM' , 'K108'   , 'Lumpia Bihun Ayam'                         , 15000),
  ('DIMSUM' , 'K111'   , 'Mantao Goreng'                             , 20000),
  ('DIMSUM' , 'K110'   , 'Mantao Kukus'                              , 17000),
  ('DIMSUM' , 'K104'   , 'Siomay Ayam'                               , 25000),
  ('DIMSUM' , 'K105'   , 'Siomay Udang'                              , 25000),

  -- Roti Bakar
  ('ROTBKR' , 'K82'    , 'Roti Bakar Caramel Susu'                   , 17000),
  ('ROTBKR' , 'K81'    , 'Roti Bakar Chocomaltine'                   , 17000),
  ('ROTBKR' , 'K83'    , 'Roti Bakar Mentega Kacang'                 , 17000),
  ('ROTBKR' , 'K85'    , 'Roti Bakar Nenas'                          , 17000),
  ('ROTBKR' , 'K84'    , 'Roti Bakar Srikaya'                        , 17000),
  ('ROTBKR' , 'K79'    , 'Roti Bakar Susu Keju'                      , 17000),
  ('ROTBKR' , 'K80'    , 'Roti Bakar Susu Keju Coklat'               , 17000),

  -- Pisang Goreng
  ('PSGGRG' , 'K89'    , 'Pisang Goreng Caramel Susu'                , 15000),
  ('PSGGRG' , 'K86'    , 'Pisang Goreng Original'                    , 12000),
  ('PSGGRG' , 'K90'    , 'Pisang Goreng Srikaya'                     , 15000),
  ('PSGGRG' , 'K87'    , 'Pisang Goreng Susu Keju'                   , 15000),
  ('PSGGRG' , 'K88'    , 'Pisang Goreng Susu Keju Coklat'            , 18000),
  ('PSGGRG' , 'PSC'    , 'Pisang Susu Coklat'                        , 15000),
  ('PSGGRG' , 'PSKCM'  , 'Pisang Susu Keju Coklat Meses'             , 18000),

  -- Pisang Aroma
  ('PSGARM' , 'K92'    , 'Pisang Aroma Susu Coklat'                  , 18000),
  ('PSGARM' , 'K91'    , 'Pisang Aroma Susu Keju'                    , 20000),

  -- Kentang / Tela Singkong Goreng
  ('KTGTELA', 'KTK'    , 'Kentang / Tela Keju'                       , 15000),
  ('KTGTELA', 'K94'    , 'Kentang Goreng Balado'                     , 15000),
  ('KTGTELA', 'K95'    , 'Kentang Goreng Balado Extra Pedas'         , 15000),
  ('KTGTELA', 'K96'    , 'Kentang Goreng BBQ'                        , 15000),
  ('KTGTELA', 'K97'    , 'Kentang Goreng Jagung Bakar / Jagung Manis', 15000),
  ('KTGTELA', 'K93'    , 'Kentang Goreng Ori'                        , 12000),
  ('KTGTELA', 'K98'    , 'Kentang Goreng Saos Mayo'                  , 17000),
  ('KTGTELA', 'K99'    , 'Kentang Wedges Original'                   , 18000),
  ('KTGTELA', 'K100'   , 'Kentang Wedges Saos Mayoneis'              , 20000),
  ('KTGTELA', 'MKP'    , 'Mix Platter A'                             , 20000),
  ('KTGTELA', 'R44'    , 'Tela Balado Extra Pedas'                   , 15000),
  ('KTGTELA', 'R43'    , 'Tela Goreng Balado'                        , 15000),
  ('KTGTELA', 'R045'   , 'Tela Goreng BBQ'                           , 15000),
  ('KTGTELA', 'R047'   , 'Tela Goreng Saos Mayoneis'                 , 15000),
  ('KTGTELA', 'R046'   , 'Tela Jagung Bakar / Jagung Manis'          , 15000),
  ('KTGTELA', 'R42'    , 'Tela Singkong Original'                    , 12000),

  -- Tahu / Tempe
  ('TAHTMP' , 'K118'   , 'Tahu Goreng'                               , 12000),
  ('TAHTMP' , 'K119'   , 'Tahu Isi Goreng'                           , 15000),
  ('TAHTMP' , 'K120'   , 'Tahu Sosis Goreng'                         , 15000),
  ('TAHTMP' , 'K121'   , 'Tempe Goreng'                              , 15000),

  -- Telur
  ('TELUR'  , 'R056'   , '1 Butir Telur Rebus'                       ,  6000),
  ('TELUR'  , 'R057'   , '1/2 Butir Telur Rebus'                     ,  3000),
  ('TELUR'  , 'K101'   , 'Telur 1/2 Matang'                          , 12000),
  ('TELUR'  , 'K103'   , 'Telur Dadar'                               ,  6000),
  ('TELUR'  , 'K102'   , 'Telur Mata Sapi'                           ,  6000),

  -- Makanan Lain-Lain
  ('MKNLL'  , 'K125'   , 'Cireng'                                    , 15000),
  ('MKNLL'  , 'CASP'   , 'Cireng Ayam Suwir Pedas'                   , 15000),
  ('MKNLL'  , 'CK'     , 'Cireng Keju'                               , 15000),
  ('MKNLL'  , 'CP'     , 'Cireng Platter'                            , 20000),
  ('MKNLL'  , 'R055'   , 'Emping'                                    ,  3000),
  ('MKNLL'  , 'K126'   , 'Jamur Goreng'                              , 15000),
  ('MKNLL'  , 'R007'   , 'Nasi Putih'                                ,  6000),
  ('MKNLL'  , 'R08'    , 'Nasi Putih 1/2 Porsi'                      ,  4000),
  ('MKNLL'  , 'K124'   , 'Nugget Goreng'                             , 15000),
  ('MKNLL'  , 'K128'   , 'Otak-Otak Ikan'                            , 18000),
  ('MKNLL'  , 'K129'   , 'Pempek Kapal Selam'                        , 22000),
  ('MKNLL'  , 'K122'   , 'Sosis Goreng'                              , 15000),

  -- Add On
  ('ADDON'  , 'R059'   , '+ Porsi Kerupuk Ikan'                      ,  3000),
  ('ADDON'  , 'ADDJHE' , '+jahe'                                     ,  2000),
  ('ADDON'  , 'K208'   , '+Telur 1/2 Matang'                         ,  6000),
  ('ADDON'  , 'K207'   , 'Ayam Potong'                               , 22000),
  ('ADDON'  , 'K195'   , 'Cincau'                                    ,  2000),
  ('ADDON'  , 'S209'   , 'Extra Topping Lebih Untuk Nasi'            , 15000),
  ('ADDON'  , 'K202'   , 'Gula Jagung (Tropicana)'                   ,  2000),
  ('ADDON'  , 'K201'   , 'Gula Merah'                                ,  2000),
  ('ADDON'  , 'K203'   , 'Kayu Manis'                                ,  2000),
  ('ADDON'  , 'K200'   , 'Susu Kental Manis'                         ,  2000),
  ('ADDON'  , 'S206'   , 'Tambah Ayam Potong'                        , 22000),

  -- Topping
  ('TOPPING', 'SY0001' , 'Sayur'                                     ,  2000),
  ('TOPPING', 'SS0001' , 'Sosis'                                     ,  3000),
  ('TOPPING', 'TL00001', 'Telur'                                     ,  5000),

  -- Rokok
  ('ROKOK'  , 'K171'   , 'Dji Sam Soe H'                             , 24000),
  ('ROKOK'  , 'K170'   , 'Dji Sam Soe K'                             , 22000),
  ('ROKOK'  , 'K161'   , 'Dunhill Hitam'                             , 33000),
  ('ROKOK'  , 'K162'   , 'Dunhill Putih'                             , 40000),
  ('ROKOK'  , 'K168'   , 'Esse Change'                               , 43000),
  ('ROKOK'  , 'K157'   , 'Evolution H/M'                             , 47000),
  ('ROKOK'  , 'K167'   , 'GF'                                        , 29000),
  ('ROKOK'  , 'K164'   , 'La Bold'                                   , 40000),
  ('ROKOK'  , 'K163'   , 'LA M/B/H'                                  , 37000),
  ('ROKOK'  , 'K 140'  , 'Lucky Strike'                              , 36000),
  ('ROKOK'  , 'K166'   , 'Marlboro Hitam'                            , 42000),
  ('ROKOK'  , 'K165'   , 'Marlboro M/B/P'                            , 55000),
  ('ROKOK'  , 'K172'   , 'MLD'                                       , 35000),
  ('ROKOK'  , 'K154'   , 'Sampoerna / Hijau'                         , 38000),
  ('ROKOK'  , 'K155'   , 'Sampoerna Biru'                            , 30000),
  ('ROKOK'  , 'K156'   , 'Sampoerna Kecil'                           , 28000),
  ('ROKOK'  , 'K158'   , 'Surya Besar'                               , 38000),
  ('ROKOK'  , 'K159'   , 'Surya Kecil'                               , 29000),
  ('ROKOK'  , 'K160'   , 'Surya Pro'                                 , 33000),
  ('ROKOK'  , 'R1'     , 'Tokai (Korek Api)'                         ,  3000)
) as v (cat_code, code, name, price)
join categories c
  on c.code = v.cat_code
 and c.outlet_id = '00000000-0000-0000-0000-000000000001';

-- products.taxable otoritatif sejak 0034, defaultnya true di kolom. Backfill
-- dari kategori supaya instalasi baru lewat seed ini mendarat di keadaan yang
-- sama dengan basis data yang naik lewat migrasi satu-satu — Rokok bebas
-- pajak di sini juga, bukan cuma di kategorinya.
update products p
set taxable = c.taxable
from categories c
where c.id = p.category_id and p.taxable is distinct from c.taxable;

commit;
