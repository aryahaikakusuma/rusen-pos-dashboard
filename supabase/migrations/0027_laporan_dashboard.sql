-- Laporan dashboard — tiga fungsi, tiga grain, satu sumbu angka.
--
-- Lapisan perhitungan untuk tiga halaman laporan manajer. Tidak ada satu pun
-- angka di sini yang boleh dihitung ulang di TypeScript: layar dan file export
-- memanggil fungsi yang sama, supaya tidak pernah ada dua jalur perhitungan
-- yang cepat atau lambat berbeda.
--
-- ============================================================================
-- EMPAT KEPUTUSAN YANG MENENTUKAN BENTUK BERKAS INI
-- ============================================================================
--
-- 1. PARAMETERNYA `date` WIB, BUKAN `timestamptz`. Sepuluh fungsi laporan yang
--    sudah ada semuanya menerima timestamptz, yang berarti konversi WIB→UTC
--    dikerjakan pemanggil. Itu persis tempat kesalahannya tidak terlihat:
--    server berjalan di UTC, jadi order jam sebelas malam WIB masuk tanggal
--    berikutnya kalau pemanggil lupa menggeser. Di sini rentangnya diterima
--    sebagai tanggal WIB dan konversinya dikerjakan SQL, sekali, di satu tempat.
--
--    `p_sampai` INKLUSIF — batas atasnya `p_sampai + 1 hari`, setengah terbuka.
--    Rentang 1–31 Agustus benar-benar memuat 31 Agustus sampai tengah malam.
--
--    Karena tanda tangannya berbeda tipe, ini fungsi BARU dengan nama baru,
--    bukan `create or replace` atas fungsi lama. get_pbjt_harian dan kawan-
--    kawannya tetap hidup apa adanya untuk laporan pajak yang sudah memakainya.
--    Menambah overload bertipe date di sebelah versi timestamptz adalah cara
--    tercepat membuat pemanggil memanggil fungsi yang tidak ia kira.
--
-- 2. GATE KECOCOKAN SILANG BERJALAN DI SUMBU `subtotal`, BUKAN `total`.
--    Tiga fungsi ini harus menjumlah ke angka yang sama, dan hanya satu sumbu
--    yang bisa: omzet kotor pra-pajak.
--
--      Harian.omzet_kotor  = sum(orders.subtotal)
--      Detail.subtotal     = orders.subtotal per order
--      Produk.omzet        = sum(order_items.subtotal)
--
--    Ketiganya identik karena `sum(order_items.subtotal) = orders.subtotal`
--    dijaga oleh cara create_order/append_to_order/void_order_item menulisnya.
--
--    `orders.total` TIDAK bisa ikut gate ini dan itu bukan cacat yang bisa
--    diperbaiki: total sudah termasuk PBJT, sedangkan order_items tidak punya
--    pajak sama sekali — pajak dihitung sekali atas subtotal order, tidak
--    pernah per baris (keputusan 2 di 0012). Menjumlahkan total akan selalu
--    lebih tinggi persis sebesar pajaknya. Sumbu `tertagih` (subtotal + pajak)
--    dicocokkan terpisah, antara Harian dan Detail saja.
--
-- 3. DISKON DAN JENIS ORDER TIDAK ADA KOLOMNYA — DAN TIDAK DIKARANG DI SINI.
--    Diskon tidak ada di skema, tidak ada di RPC, tidak ada di UI. Kolom yang
--    isinya nol permanen hanya mengundang pertanyaan tiap bulan, jadi tidak
--    dibuat.
--
--    Jenis order lebih halus jebakannya. Kasir punya switch Meja/Takeaway,
--    tapi `orderKind` hanya state UI (mobile/lib/cart-context.tsx) — yang
--    sampai ke basis data cuma `table_code = 'Takeaway'`, sebuah string
--    literal. Itu konvensi pengetikan, persis kelas yang sama dengan awalan
--    'UJI-' yang 0022 dibuat untuk membuangnya, dengan kelemahan yang sama:
--    satu ejaan berbeda dan barisnya diam-diam salah golong. Jadi Detail
--    mengeluarkan `table_code` apa adanya dan TIDAK mengklaim tahu jenis
--    ordernya. Kolom `order_kind` sungguhan menuntut push_order dan mobile/
--    ikut berubah; itu pekerjaan tersendiri, dicatat di TO_DO.md.
--
-- 4. LAPORAN PRODUK BERGRAIN PER VARIAN, BUKAN PER PRODUK INDUK.
--    Keputusan Heika, dan ini konsekuensi langsung dari tidak adanya tabel
--    varian: tiap varian ADALAH baris produk tersendiri, dan penggabungannya
--    jadi satu kartu murni parsing nama di klien
--    (mobile/lib/product-variants.ts). Logika itu bahkan tidak bisa memutuskan
--    arti "tanpa akhiran" tanpa melihat produk saudaranya — ketiadaan akhiran
--    berarti "panas" di poros suhu tapi "ori" di poros saus. Menirunya di SQL
--    berarti menduplikasi logika yang tidak bisa dijamin cocok dengan yang
--    dilihat kasir di layar, dan angka yang tidak cocok itulah yang merusak
--    kredibilitas seluruh dashboard.
--
--    Gantinya kolom `kategori` dipertahankan sebagai sumbu pengelompokan, dan
--    penjumlahan tingkat induk dikerjakan di tampilan, bukan di basis data.
--
-- 5. ADA DUA JENIS PEMBEBASAN PAJAK, DAN MENGGABUNGKANNYA ADALAH KESALAHAN.
--    Ini nyaris terlewat saat berkas ini ditulis, karena 0019 menambahkan
--    basis pajak yang tidak terlihat dari nama kolomnya:
--
--      a. PEMBEBASAN TINGKAT ORDER — `orders.tax_status = 'exempt'`. Seluruh
--         order tidak dipungut, disetujui seorang pegawai (`tax_approved_by`).
--         Ini keputusan manusia dan itulah yang diaudit.
--
--      b. BUKAN OBJEK PAJAK — rokok. Per BARIS, bukan per order:
--         `categories.taxable = false` di-snapshot ke `order_items.taxable`,
--         dan basis pajaknya jadi `orders.taxable_subtotal`, bukan `subtotal`.
--         Tidak ada persetujuan siapa pun di sini; ini sifat barangnya.
--
--    Karena itu DASAR PENGENAAN PBJT ADALAH `taxable_subtotal`, BUKAN
--    `subtotal`. Order berisi rokok punya taxable_subtotal < subtotal, dan
--    melaporkan subtotal sebagai dasar pengenaan akan melebih-lebihkan pajak
--    terutang tepat sebesar penjualan rokoknya — angka yang tampak wajar,
--    tidak memicu error apa pun, dan salah di laporan pajak daerah.
--
--    Ketiganya karena itu dipisah jadi kolom sendiri-sendiri, dan hubungannya
--    dijamin menjumlah:
--
--      omzet_kotor = dasar_pbjt + omzet_bebas_order + omzet_bukan_objek
--
--    Invariant itu diuji, bukan diasumsikan.

begin;

-- ============================================================ 1. penjualan harian
--
-- Grain: SATU BARIS PER TANGGAL WIB.
--
-- Deret tanggalnya dihasilkan penuh lalu data digabungkan ke situ, bukan
-- sebaliknya. Hari tanpa transaksi WAJIB muncul sebagai nol: kalau hari sepi
-- hilang dari hasil, garis grafik tren melompat dari tanggal 3 ke tanggal 5 dan
-- berbohong tentang bentuk minggunya. Ini yang membedakannya dari
-- get_pbjt_harian, yang hanya mengeluarkan tanggal yang ada isinya.
--
-- Refund digabung pada TANGGAL REFUNDNYA, bukan tanggal order aslinya — uang
-- keluar laci hari itu. Karena deret tanggalnya sudah lengkap, hari yang isinya
-- hanya refund (toko tutup, pelanggan kemarin datang mengembalikan) otomatis
-- punya barisnya sendiri tanpa perlu full outer join seperti di 0018.
--
-- Pecahan metode bayar dihitung dari `total`, bukan `subtotal`: yang dipecah
-- adalah uang yang benar-benar berpindah, dan itu sudah termasuk pajak. Karena
-- itu tunai + non_tunai = omzet_kotor + pbjt, bukan = omzet_kotor.
drop function if exists laporan_penjualan_harian(date, date, boolean);

create function laporan_penjualan_harian(
  p_dari         date,
  p_sampai       date,
  p_include_test boolean default false
)
returns table (
  tanggal            date,
  jumlah_order       bigint,
  omzet_kotor        bigint,   -- sum(orders.subtotal), pra-pajak — sumbu gate
  total_refund       bigint,   -- refunds.amount (pokok + pajak)
  omzet_bersih       bigint,   -- omzet_kotor - refund pokok
  dasar_pbjt         bigint,   -- taxable_subtotal order taxable — basis pajak
  pbjt               bigint,   -- pajak terpungut
  omzet_bebas_order  bigint,   -- subtotal order exempt (disetujui pegawai)
  omzet_bukan_objek  bigint,   -- rokok dsb pada order taxable (per baris)
  tertagih           bigint,   -- omzet_kotor + pbjt = yang masuk laci
  tertagih_tunai     bigint,
  tertagih_non_tunai bigint
)
language sql
stable
as $$
  with batas as (
    -- Satu-satunya tempat WIB diterjemahkan. p_sampai inklusif.
    select (p_dari::timestamp   at time zone 'Asia/Jakarta') as dari,
           ((p_sampai + 1)::timestamp at time zone 'Asia/Jakarta') as sampai
  ),
  deret as (
    select d::date as tanggal
    from generate_series(p_dari, p_sampai, interval '1 day') as d
  ),
  o as (
    select
      (ord.paid_at at time zone 'Asia/Jakarta')::date as tgl,
      count(*)                                                            as n,
      sum(ord.subtotal)                                                   as omzet,
      -- Basis pajaknya taxable_subtotal, bukan subtotal (0019). Lihat
      -- keputusan 5 di kepala berkas.
      sum(ord.taxable_subtotal) filter (where ord.tax_status = 'taxable') as dasar,
      sum(ord.tax_amount)                                                 as pajak,
      sum(ord.subtotal) filter (where ord.tax_status = 'exempt')          as bebas_order,
      -- Selisih basis pada order yang TETAP dipungut pajak: itulah barang yang
      -- bukan objek pajak. Pada order exempt selisih ini tidak dihitung —
      -- seluruh nilainya sudah masuk bebas_order, dan menghitungnya dua kali
      -- akan merusak invariant penjumlahannya.
      sum(ord.subtotal - ord.taxable_subtotal)
        filter (where ord.tax_status = 'taxable')                         as bukan_objek,
      sum(ord.total)                                                      as tertagih,
      sum(ord.total) filter (where ord.payment_method = 'cash')           as tunai,
      sum(ord.total) filter (where ord.payment_method = 'non_cash')       as non_tunai
    from orders ord, batas b
    where ord.status = 'paid'
      and ord.paid_at >= b.dari and ord.paid_at < b.sampai
      and (p_include_test or not ord.is_test_data)
    group by 1
  ),
  -- Join ke orders, bukan hanya rentang tanggal: refund atas order uji adalah
  -- uang uji. Pola yang sama dengan keputusan 3 di 0022.
  r as (
    select
      (rf.created_at at time zone 'Asia/Jakarta')::date as tgl,
      sum(rf.amount)   as jumlah,
      sum(rf.subtotal) as pokok
    from refunds rf
    join orders ord on ord.id = rf.order_id
    cross join batas b
    where rf.created_at >= b.dari and rf.created_at < b.sampai
      and (p_include_test or not ord.is_test_data)
    group by 1
  )
  select
    d.tanggal,
    coalesce(o.n, 0),
    coalesce(o.omzet, 0),
    coalesce(r.jumlah, 0),
    coalesce(o.omzet, 0) - coalesce(r.pokok, 0),
    coalesce(o.dasar, 0),
    coalesce(o.pajak, 0),
    coalesce(o.bebas_order, 0),
    coalesce(o.bukan_objek, 0),
    coalesce(o.tertagih, 0),
    coalesce(o.tunai, 0),
    coalesce(o.non_tunai, 0)
  from deret d
  left join o on o.tgl = d.tanggal
  left join r on r.tgl = d.tanggal
  order by d.tanggal;
$$;

comment on function laporan_penjualan_harian(date, date, boolean) is
  'Grain: satu baris per tanggal WIB, tanggal tanpa transaksi tetap muncul nol. '
  'omzet_kotor adalah sumbu uji kecocokan silang (lihat 0027).';


-- ============================================================ 2. detail penjualan
--
-- Grain: SATU BARIS PER ORDER LUNAS.
--
-- TIDAK ADA ITEM DI SINI, dan itu bukan kelalaian. Satu order punya banyak
-- item; memaksakannya ke satu baris berarti satu baris mewakili dua grain
-- sekaligus, dan tiap penjumlahan atas hasilnya jadi ganda. Rincian item dibuka
-- lewat view investigasi order yang terpisah.
--
-- `total_baris` adalah jumlah baris SEBELUM limit/offset, dibawa sebagai kolom
-- window pada tiap baris. Alternatifnya — fungsi kedua khusus menghitung —
-- berarti dua definisi "baris mana yang masuk" yang harus dijaga sama; kalau
-- suatu saat berbeda, paginasinya menampilkan halaman kosong di ujung tanpa
-- error di mana pun.
--
-- Konsekuensi bentuk ini: halaman kosong (offset melewati akhir) tidak
-- mengembalikan baris sama sekali, jadi total_baris ikut hilang. Pemanggil
-- memperlakukan nol baris sebagai nol, bukan sebagai kegagalan.
--
-- `is_test_data` ikut dikeluarkan sebagai kolom walau baris uji sudah disaring
-- secara bawaan — supaya saat toggle "tampilkan data uji" dinyalakan, barisnya
-- bisa ditandai di layar dan tidak pernah terbaca sebagai omzet biasa.
drop function if exists laporan_penjualan_detail(date, date, int, int, boolean);

create function laporan_penjualan_detail(
  p_dari         date,
  p_sampai       date,
  p_limit        int     default 50,
  p_offset       int     default 0,
  p_include_test boolean default false
)
returns table (
  order_id          uuid,
  nomor_order       text,     -- table_code + urutan pada meja itu
  table_code        text,     -- apa adanya; TIDAK ditafsirkan jadi jenis order
  waktu_bayar       timestamptz,
  waktu_bayar_wib   text,     -- sudah diformat WIB, siap cetak/export
  kasir             text,
  metode_bayar      text,
  subtotal          bigint,   -- sumbu gate
  dasar_pbjt        bigint,   -- taxable_subtotal: basis pajak order ini
  pbjt              bigint,
  total             bigint,   -- subtotal + pbjt, yang ditagih ke pelanggan
  status_pajak      text,     -- 'taxable' | 'exempt'
  alasan_bebas      text,     -- opsional sejak 0026
  disetujui_oleh    text,
  refund_total      bigint,   -- 0 kalau tidak pernah direfund
  ada_refund        boolean,
  is_test_data      boolean,
  total_baris       bigint
)
language sql
stable
as $$
  with batas as (
    select (p_dari::timestamp   at time zone 'Asia/Jakarta') as dari,
           ((p_sampai + 1)::timestamp at time zone 'Asia/Jakarta') as sampai
  ),
  o as (
    select ord.*
    from orders ord, batas b
    where ord.status = 'paid'
      and ord.paid_at >= b.dari and ord.paid_at < b.sampai
      and (p_include_test or not ord.is_test_data)
  ),
  -- Refund dijumlahkan per ORDER tanpa memandang tanggal refundnya: pertanyaan
  -- di baris ini adalah "order ini pernah dikembalikan berapa", bukan "berapa
  -- yang keluar laci periode ini". Yang kedua dijawab laporan harian.
  rf as (
    select r.order_id, sum(r.amount) as jumlah
    from refunds r
    where r.order_id in (select id from o)
    group by 1
  )
  select
    o.id,
    o.table_code || '-' || o.table_seq,
    o.table_code,
    o.paid_at,
    to_char(o.paid_at at time zone 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI'),
    coalesce(e.name, '-'),
    o.payment_method::text,
    o.subtotal,
    o.taxable_subtotal,
    o.tax_amount,
    o.total,
    o.tax_status::text,
    o.tax_exempt_reason,
    ap.name,
    coalesce(rf.jumlah, 0),
    rf.order_id is not null,
    o.is_test_data,
    count(*) over ()
  from o
  left join employees e  on e.id  = o.paid_by
  left join employees ap on ap.id = o.tax_approved_by
  left join rf           on rf.order_id = o.id
  order by o.paid_at desc, o.id
  limit  greatest(coalesce(p_limit, 50), 0)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

comment on function laporan_penjualan_detail(date, date, int, int, boolean) is
  'Grain: satu baris per order lunas. Item sengaja tidak disertakan. '
  'total_baris adalah hitungan sebelum limit/offset (lihat 0027).';


-- ============================================================ 3. laporan produk
--
-- Grain: SATU BARIS PER VARIAN — yaitu per baris produk, karena di skema ini
-- tiap varian memang produk tersendiri. Keputusan Heika; alasannya di kepala
-- berkas, keputusan 4.
--
-- Dikelompokkan berdasarkan `product_code` snapshot, bukan `product_name`.
-- Nama boleh berubah dan snapshot-nya memang sengaja diawetkan supaya struk
-- lama tidak ikut berubah; mengelompokkan berdasarkan nama akan memecah satu
-- produk jadi dua baris begitu ada yang memperbaiki ejaan di tengah bulan.
-- Nama yang DITAMPILKAN adalah snapshot terbaru dalam periode ini, jadi
-- laporannya memakai kata yang sama dengan struk terakhir yang keluar.
--
-- `omzet` di sini KOTOR: refund tidak dikurangkan. refund_items memang punya
-- nama produknya, tapi mengurangkannya di sini memutus gate kecocokan silang
-- terhadap orders.subtotal — dan "berapa yang terjual" adalah pertanyaan yang
-- berbeda dari "berapa yang akhirnya tidak jadi". Yang kedua dijawab
-- get_refund_report.
--
-- `kontribusi_persen` dihitung terhadap total omzet PERIODE, bukan terhadap
-- baris yang tampil. Jadi kolomnya tetap benar berapa pun baris yang dipotong
-- di layar — memotong daftar tidak pernah membuat sisanya melonjak jadi 100.
--
-- Jumlah seluruh barisnya MENDEKATI 100, tidak persis: pembulatan 2 desimal
-- atas ratusan baris menyisakan selisih (121 baris uji menjumlah 99,93). Itu
-- sifat pembulatan per baris dan bukan ketidakcocokan angka uang — gate
-- kecocokan silang berjalan di `omzet`, yang bilangan bulat rupiah dan cocok
-- persis. Kalau kelak ada yang ingin totalnya genap 100 di layar, itu
-- diselesaikan di tampilan (baris terakhir menyerap sisa), bukan dengan
-- mengubah kolom ini — angka per barisnya sendiri sudah benar.
drop function if exists laporan_produk(date, date, boolean);

create function laporan_produk(
  p_dari         date,
  p_sampai       date,
  p_include_test boolean default false
)
returns table (
  product_code      text,
  nama_produk       text,
  kategori          text,
  terjual           bigint,
  omzet             bigint,   -- sumbu gate
  kontribusi_persen numeric
)
language sql
stable
as $$
  with batas as (
    select (p_dari::timestamp   at time zone 'Asia/Jakarta') as dari,
           ((p_sampai + 1)::timestamp at time zone 'Asia/Jakarta') as sampai
  ),
  baris as (
    select
      oi.product_code as kode,
      -- Snapshot terbaru dalam periode. array_agg dengan urutan eksplisit,
      -- bukan max(): yang dicari adalah nama TERAKHIR, bukan nama terbesar
      -- menurut abjad.
      (array_agg(oi.product_name      order by ord.paid_at desc))[1] as nama,
      (array_agg(coalesce(c.name,'-') order by ord.paid_at desc))[1] as kategori,
      sum(oi.quantity)::bigint as terjual,
      sum(oi.subtotal)::bigint as omzet
    from order_items oi
    join orders ord        on ord.id = oi.order_id
    cross join batas b
    left join products p   on p.id = oi.product_id
    left join categories c on c.id = p.category_id
    where ord.status = 'paid'
      and ord.paid_at >= b.dari and ord.paid_at < b.sampai
      and (p_include_test or not ord.is_test_data)
    group by 1
  )
  select
    baris.kode,
    baris.nama,
    baris.kategori,
    baris.terjual,
    baris.omzet,
    -- nullif menahan pembagian nol pada periode tanpa transaksi. Tanpa itu
    -- rentang hari libur meledak alih-alih mengembalikan nol baris.
    round(baris.omzet * 100.0
          / nullif((select sum(x.omzet) from baris x), 0), 2)
  from baris
  order by baris.omzet desc, baris.terjual desc, baris.kode;
$$;

comment on function laporan_produk(date, date, boolean) is
  'Grain: satu baris per varian (satu baris produk). Dikelompokkan per '
  'product_code snapshot; omzet kotor, refund tidak dikurangkan (lihat 0027).';


-- ============================================================ hak akses
--
-- Sepuluh fungsi laporan sebelumnya tidak menuliskan grant sama sekali, dengan
-- alasan hanya service_role yang memanggilnya. Itu benar dalam praktik tapi
-- tidak ditegakkan: Postgres memberi EXECUTE ke PUBLIC secara bawaan pada
-- setiap fungsi baru. Yang menahan anon selama ini adalah lapisan lain — fungsi
-- ini bukan SECURITY DEFINER, jadi hak pemanggil yang berlaku dan anon tidak
-- punya SELECT ke tabel mana pun.
--
-- Bawaan itu tetap dicabut di sini. Bergantung pada dua lapisan ketika satu
-- lapisan bisa dinyatakan eksplisit hanya menyisakan pertanyaan untuk orang
-- berikutnya, dan p_include_test adalah parameter yang tidak boleh bisa
-- disentuh siapa pun dari luar.
revoke execute on function laporan_penjualan_harian(date, date, boolean)      from public, anon, authenticated;
revoke execute on function laporan_penjualan_detail(date, date, int, int, boolean) from public, anon, authenticated;
revoke execute on function laporan_produk(date, date, boolean)                from public, anon, authenticated;

grant execute on function laporan_penjualan_harian(date, date, boolean)       to service_role;
grant execute on function laporan_penjualan_detail(date, date, int, int, boolean) to service_role;
grant execute on function laporan_produk(date, date, boolean)                 to service_role;

commit;
