-- Deret penjualan per produk per hari — sumbu waktu untuk Laporan Produk.
--
-- `laporan_produk` (0027) mengagregasi seluruh periode menjadi SATU baris per
-- varian. Itu bentuk yang benar untuk tabel peringkat, dan bentuk yang tidak
-- bisa dipakai sama sekali untuk grafik multi-seri: tidak ada kolom tanggal di
-- dalamnya. Fungsi ini menambahkan sumbu itu tanpa menyentuh fungsi lama.
--
-- ============================================================================
-- LIMA KEPUTUSAN
-- ============================================================================
--
-- 1. FUNGSI BARU, BUKAN PARAMETER TAMBAHAN PADA `laporan_produk`.
--    Menambah parameter lewat `create or replace` tidak mengganti fungsi lama —
--    Postgres membuat OVERLOAD baru, dan pemanggil lama diam-diam tetap
--    mengikat ke tanda tangan lama. Dua fungsi bernama sama dengan grain
--    berbeda adalah persis jebakan yang dijelaskan keputusan 1 di 0027, dan
--    biayanya baru terlihat saat angka dua halaman berselisih tanpa error.
--
--    Halaman Laporan Produk yang ada sekarang tidak perlu berubah sama sekali.
--
-- 2. DAFTAR KODE PRODUK ADALAH PEMBATAS UKURAN, BUKAN KENYAMANAN.
--    Tanpa `p_kode`, rentang satu bulan dikali ratusan varian yang laku
--    menghasilkan puluhan ribu baris — balasan yang tidak layak dikirim ke
--    peramban, dan grafik yang tidak mungkin dibaca. Pembatasnya karena itu ada
--    di fungsi, bukan di klien: klien yang memotong hasil tetap membayar
--    seluruh ongkos pemindaian dan transfernya.
--
-- 3. DAFTAR KOSONG BERARTI N TERATAS, DIHITUNG DI SINI. BAWAANNYA LIMA.
--    Grafik harus langsung menampilkan sesuatu yang berguna saat halaman
--    dibuka. Kalau lima teratas ditentukan klien, klien harus memanggil
--    `laporan_produk` lebih dulu hanya untuk tahu produk mana yang diminta —
--    dua perjalanan bolak-balik untuk satu grafik, dan peluang kedua daftar itu
--    berasal dari periode yang berbeda.
--
--    Jumlahnya diangkat jadi parameter `p_teratas` alih-alih ditanam sebagai
--    angka 5 di dalam kueri, dan itu diputuskan SEKARANG justru karena belum
--    ada satu pun pemanggil. Menambah parameter setelah fungsi ini dipakai
--    berarti `create or replace` yang melahirkan OVERLOAD — pemanggil lama diam-
--    diam tetap terikat ke tanda tangan lama, persis jebakan yang dilarang
--    keputusan 1 di bawah. Bawaannya tetap 5, jadi pemanggil yang tidak peduli
--    tidak perlu tahu parameter ini ada.
--
--    Peringkatnya memakai OMZET, bukan unit terjual. Keduanya menghasilkan
--    daftar yang berbeda dan tidak sedikit: es teh terjual jauh lebih banyak
--    daripada apa pun di menu tanpa pernah menjadi penyumbang omzet terbesar.
--    Grafik ini menjawab "uangnya dari mana", jadi sumbunya omzet.
--
-- 4. TANGGAL KOSONG DIISI NOL, POLA `laporan_penjualan_harian`.
--    Deret tanggal dihasilkan penuh lalu data digabungkan ke situ. Hari sepi
--    yang hilang dari hasil membuat garis melompat dari tanggal 3 ke tanggal 5
--    dan berbohong tentang bentuk minggunya — pada grafik multi-seri lebih
--    buruk lagi, karena tiap seri melompat di tanggal yang berbeda dan
--    perbandingan antar produk jadi tidak berarti apa-apa.
--
--    Yang TIDAK diisi adalah produknya: varian yang tidak laku sama sekali
--    sepanjang periode tidak muncul, bukan muncul sebagai deret nol penuh.
--    Seri yang datar di nol hanya menghabiskan warna legenda.
--
-- 5. OMZET KOTOR — REFUND TIDAK DIKURANGKAN. Ini BUKAN keputusan baru; ia
--    disalin dari `laporan_produk` supaya kedua laporan tidak berselisih:
--
--      comment on function laporan_produk(...) is
--        '... omzet kotor, refund tidak dikurangkan (lihat 0027).'
--
--    Alasannya juga sudah tertulis di catatan halaman Laporan Produk: "berapa
--    yang terjual" adalah pertanyaan yang berbeda dari "berapa yang akhirnya
--    tidak jadi". Ada alasan struktural di baliknya: `refund_items` mengurangi
--    pada TANGGAL REFUNDNYA, sedangkan baris ini duduk pada tanggal order
--    aslinya, jadi menguranginya di sini akan menghasilkan hari bernilai
--    negatif pada produk yang dikembalikan keesokan harinya.
--
--    Konsekuensi yang harus dinyatakan di layar: grafik ini kotor. Kalau suatu
--    saat versi bersih dibutuhkan, ia fungsi ketiga dengan grain refund yang
--    dinyatakan sendiri — bukan pengurangan diam-diam di sini.

begin;

-- Idempoten: drop lebih dulu dengan tanda tangan lengkap, pola 0022–0023.
-- Menyebut tipe parameternya membuat drop ini tidak pernah salah sasaran kalau
-- suatu saat ada overload.
drop function if exists laporan_produk_harian(date, date, text[], int, boolean);
-- Tanda tangan tanpa p_teratas tidak pernah sampai ke basis data mana pun —
-- `p_teratas` ditambahkan sebelum migrasi ini pertama kali diterapkan. Barisnya
-- tetap ada supaya salinan kerja yang sempat memuatnya lebih dulu tidak
-- meninggalkan overload yatim.
drop function if exists laporan_produk_harian(date, date, text[], boolean);

create function laporan_produk_harian(
  p_dari         date,
  p_sampai       date,
  p_kode         text[] default null,   -- null / array kosong = p_teratas teratas
  p_teratas      int     default 5,     -- hanya berlaku saat p_kode kosong
  p_include_test boolean default false
)
returns table (
  product_code text,
  nama_produk  text,
  tanggal      date,
  terjual      bigint,
  omzet        bigint    -- sum(order_items.subtotal), pra-pajak, kotor
)
language sql
stable
as $$
  with batas as (
    -- Satu-satunya tempat WIB diterjemahkan, sama seperti 0027. p_sampai
    -- INKLUSIF: batas atasnya p_sampai + 1 hari, setengah terbuka.
    select (p_dari::timestamp         at time zone 'Asia/Jakarta') as dari,
           ((p_sampai + 1)::timestamp at time zone 'Asia/Jakarta') as sampai
  ),
  baris as (
    select
      oi.product_code as kode,
      (ord.paid_at at time zone 'Asia/Jakarta')::date as tgl,
      -- Snapshot nama terakhir pada hari itu. array_agg dengan urutan
      -- eksplisit, bukan max(): yang dicari nama TERAKHIR, bukan nama terbesar
      -- menurut abjad. Sama persis dengan laporan_produk.
      (array_agg(oi.product_name order by ord.paid_at desc))[1] as nama_hari,
      sum(oi.quantity)::bigint as terjual,
      sum(oi.subtotal)::bigint as omzet
    from order_items oi
    join orders ord on ord.id = oi.order_id
    cross join batas b
    where ord.status = 'paid'
      and ord.paid_at >= b.dari and ord.paid_at < b.sampai
      and (p_include_test or not ord.is_test_data)
    group by 1, 2
  ),
  -- Nilai seluruh periode per varian: dipakai untuk memilih lima teratas DAN
  -- untuk mengurutkan seri pada hasil akhir.
  total as (
    select
      kode,
      sum(omzet)   as omzet,
      sum(terjual) as terjual,
      -- Nama terakhir dalam periode, diturunkan dari nama harian. Identik
      -- hasilnya dengan laporan_produk karena urutannya sama-sama menurun
      -- menurut waktu bayar.
      (array_agg(nama_hari order by tgl desc))[1] as nama
    from baris
    group by 1
  ),
  dipilih as (
    select t.kode, t.nama, t.omzet as omzet_periode
    from total t
    where coalesce(cardinality(p_kode), 0) = 0
       or t.kode = any (p_kode)
    order by t.omzet desc, t.terjual desc, t.kode
    -- `limit null` berarti tanpa batas di Postgres. Jadi batasnya hanya berlaku
    -- saat daftar kode tidak diberikan; daftar yang diminta eksplisit
    -- dikembalikan seutuhnya, berapa pun panjangnya.
    --
    -- greatest(...,0) menahan p_teratas negatif, yang membuat LIMIT melempar
    -- galat alih-alih mengembalikan kosong. Nol dibiarkan berarti nol baris:
    -- itu jawaban yang jujur atas permintaan nol seri, bukan kasus tepi.
    limit (
      case
        when coalesce(cardinality(p_kode), 0) = 0
          then greatest(coalesce(p_teratas, 5), 0)
        else null
      end
    )
  ),
  deret as (
    select d::date as tgl
    from generate_series(p_dari, p_sampai, interval '1 day') as d
  )
  select
    s.kode,
    s.nama,
    d.tgl,
    coalesce(b.terjual, 0)::bigint,
    coalesce(b.omzet, 0)::bigint
  from dipilih s
  cross join deret d
  left join baris b on b.kode = s.kode and b.tgl = d.tgl
  -- Seri diurutkan menurut nilainya, titik menurut tanggal. Urutan seri ikut
  -- menentukan urutan legenda dan warna di grafik, jadi ia bagian dari kontrak
  -- fungsi ini, bukan kebetulan.
  order by s.omzet_periode desc, s.kode, d.tgl;
$$;

comment on function laporan_produk_harian(date, date, text[], int, boolean) is
  'Grain: satu baris per varian per tanggal WIB. Tanggal kosong diisi nol; '
  'varian tanpa penjualan sepanjang periode tidak muncul. p_kode kosong = '
  'p_teratas (bawaan 5) varian teratas menurut omzet periode. Omzet kotor, '
  'refund TIDAK dikurangkan — sama dengan laporan_produk, supaya keduanya tidak '
  'berselisih (lihat 0028).';


-- ============================================================ hak akses
--
-- Pola 0027: bawaan Postgres memberi EXECUTE ke PUBLIC pada setiap fungsi baru,
-- dan p_include_test adalah parameter yang tidak boleh bisa disentuh siapa pun
-- dari luar.
revoke execute on function laporan_produk_harian(date, date, text[], int, boolean)
  from public, anon, authenticated;

grant execute on function laporan_produk_harian(date, date, text[], int, boolean)
  to service_role;

commit;
