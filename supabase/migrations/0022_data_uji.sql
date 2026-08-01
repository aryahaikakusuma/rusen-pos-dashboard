-- Data uji dipisahkan di tingkat basis data, bukan lagi lewat awalan table_code.
--
-- SEBELUM INI: satu-satunya penanda order uji adalah awalan 'UJI-' pada
-- table_code (TEST_TABLE_PREFIX di mobile/db/orders.ts), dan awalan itu
-- diperiksa di EMPAT tempat — semuanya di mobile/db/shift.ts. Tidak ada satu
-- pun dari sepuluh fungsi laporan di server yang memeriksanya. Artinya setiap
-- order uji yang sempat tersinkron langsung terhitung sebagai omzet dan sebagai
-- PBJT terutang, tanpa tanda apa pun.
--
-- Saat migrasi ini ditulis, hitungannya di basis data hosted: 98 order, 0
-- di antaranya berawalan 'UJI-'. Jadi backfill di bawah TIDAK mengubah satu
-- angka laporan pun hari ini. Itu bukan alasan untuk menundanya — nol hanya
-- berarti 0011 sudah menghapus jejak lama dan belum ada self-test baru yang
-- terkirim. Celahnya tetap terbuka untuk order uji berikutnya.
--
-- KENAPA KOLOM, BUKAN AWALAN. Awalan pada table_code tidak menegakkan apa pun
-- secara struktural: satu salah ketik ('UJl-', 'uji-') dan order itu diam-diam
-- jadi omzet. Kolom boolean tidak bisa salah ketik, ikut di setiap payload
-- sinkron, dan bisa dipasangi CHECK.
--
-- KEPUTUSAN 1 — test_mode_reason WAJIB, bukan opsional.
-- created_by sudah menjawab SIAPA, jadi kolom pegawai kedua mubazir. Yang tidak
-- bisa dijawab created_by adalah KENAPA: "cek fitur topping baru" berbeda
-- jauh dari "demo ke calon karyawan" kalau suatu hari ada yang menelusuri.
-- Ditegakkan CHECK, bukan konvensi — persis alasan yang sama dengan
-- tax_arithmetic di 0012: konvensi hanya berlaku sampai ada penulis baru.
-- Perhatikan arahnya SATU ARAH: alasan wajib ada kalau is_test_data, tapi
-- tidak dilarang ada pada order biasa. Melarangnya akan membuat order yang
-- keliru ditandai uji lalu dikoreksi menjadi mustahil diperbaiki.
--
-- KEPUTUSAN 2 — p_include_test default false pada setiap fungsi laporan.
-- Pemanggil yang tidak tahu apa-apa tentang data uji tetap benar tanpa
-- mengubah apa pun. Ini pola yang sama dengan mempertahankan arti orders.total
-- di 0012: yang aman harus jadi perilaku bawaan, karena yang terlewat pasti
-- ada. Kebalikannya — p_exclude_test default false — akan membuat setiap
-- pemanggil yang lupa melaporkan data uji sebagai uang.
--
-- KEPUTUSAN 3 — refunds dan order_item_voids ikut disaring lewat join ke orders.
-- Ini yang paling mudah terlewat. get_sales_summary menjumlahkan refunds dan
-- order_item_voids dalam subquery yang TIDAK menyentuh orders sama sekali, dan
-- get_top_voided_products juga tidak. Menyaring orders saja meninggalkan
-- refund dan void atas order uji tetap masuk laporan — angka yang salah,
-- tampak wajar, tanpa error. Ketiganya diberi join di sini.
--
-- KEPUTUSAN 4 — DROP dulu, baru CREATE, untuk setiap fungsi yang bertambah
-- parameternya. `create or replace` dengan daftar argumen yang berbeda TIDAK
-- mengganti fungsi lama; ia membuat OVERLOAD baru di sebelahnya, dan setiap
-- pemanggil dua-argumen yang ada akan tetap memanggil versi lama yang tanpa
-- filter. Kegagalannya senyap dan persis kebalikan dari maksud berkas ini.
--
-- Gerbang owner/manager untuk toggle "tampilkan data uji" TIDAK ada di sini.
-- Fungsi-fungsi laporan tidak punya `grant execute` sama sekali — hanya
-- service_role yang bisa memanggilnya, yaitu Next.js dari sisi server. Jadi
-- pemeriksaan peran ada di sesi aplikasi, di tempat peran itu memang diketahui.
-- Menaruh pemeriksaan peran di SQL akan menuntut membuka fungsi ini ke
-- authenticated, yang justru memperluas permukaannya.
--
-- push_order menyusul di 0023, terpisah karena menuntut menyalin utuh badan
-- fungsi 0020 dan itu kelas risiko yang berbeda. Sampai 0023 jalan, kolom ini
-- selalu terisi default false pada order yang masuk dari ponsel — aman, hanya
-- belum berguna.

begin;

-- ============================================================ skema

alter table orders add column if not exists is_test_data    boolean not null default false;
alter table orders add column if not exists test_mode_reason text;

alter table orders drop constraint if exists test_data_reason;
alter table orders add constraint test_data_reason check (
  not is_test_data or btrim(coalesce(test_mode_reason, '')) <> ''
);

-- Parsial: barisnya sedikit sekali menurut rancangan, dan yang selalu dicari
-- justru "yang bukan uji". Indeks parsial ini yang dipakai saat menelusuri
-- data uji lewat toggle, bukan saat laporan normal berjalan.
create index if not exists orders_test_data_idx on orders (created_at desc)
  where is_test_data;

comment on column orders.is_test_data is
  'Order uji — dikecualikan dari semua laporan kecuali p_include_test true. '
  'Menggantikan awalan UJI- pada table_code (lihat 0022).';
comment on column orders.test_mode_reason is
  'Wajib saat is_test_data. Alasan yang diketik kasir di dialog konfirmasi.';

-- ============================================================ backfill
--
-- Idempoten: dijalankan dua kali, yang kedua tidak mengubah baris mana pun
-- karena is_test_data sudah true. Alasan diisi penanda yang jujur — order ini
-- ditandai secara retroaktif, kasirnya tidak pernah mengetik alasan apa pun,
-- dan mengarang alasan yang terdengar masuk akal justru merusak gunanya jejak.
update orders
set is_test_data     = true,
    test_mode_reason = coalesce(nullif(btrim(test_mode_reason), ''),
                                'Ditandai retroaktif dari awalan UJI- (0022)')
where table_code like 'UJI-%'
  and not is_test_data;

-- ============================================================ laporan
--
-- Sepuluh fungsi. Urutannya mengikuti berkas asalnya: 0002, lalu 0015, lalu
-- 0018 — dan yang didefinisikan ulang di berkas belakangan hanya ditulis
-- sekali di sini, dalam bentuk terakhirnya.

drop function if exists get_sales_summary(timestamptz, timestamptz);
drop function if exists get_sales_trend(timestamptz, timestamptz, text);
drop function if exists get_top_products(timestamptz, timestamptz, int);
drop function if exists get_category_contribution(timestamptz, timestamptz);
drop function if exists get_void_report(timestamptz, timestamptz);
drop function if exists get_top_voided_products(timestamptz, timestamptz, int);
drop function if exists get_pbjt_summary(timestamptz, timestamptz);
drop function if exists get_pbjt_harian(timestamptz, timestamptz);
drop function if exists get_pbjt_exempt_report(timestamptz, timestamptz);
drop function if exists get_refund_report(timestamptz, timestamptz);


-- Ringkasan KPI untuk satu periode. Bentuk 0015, ditambah saringan data uji.
--   omzet     — sebelum pajak (dasar pengenaan + yang dibebaskan)
--   pajak     — PBJT yang terpungut
--   tertagih  — yang benar-benar masuk laci: omzet + pajak
create or replace function get_sales_summary(
  p_from         timestamptz,
  p_to           timestamptz,
  p_include_test boolean default false
)
returns table (
  omzet        bigint,
  pajak        bigint,
  tertagih     bigint,
  transaksi    bigint,
  rata_rata    bigint,
  refund_total bigint,
  refund_count bigint,
  void_total   bigint,
  void_count   bigint
)
language sql
as $$
  with o as (
    select * from orders
    where status = 'paid' and paid_at >= p_from and paid_at < p_to
      and (p_include_test or not is_test_data)
  ),
  -- Join ke orders, bukan hanya rentang tanggal: refund atas order uji adalah
  -- uang uji. Tanpa join ini menyaring orders saja tidak menahan apa pun.
  r as (
    select rf.* from refunds rf
    join orders ord on ord.id = rf.order_id
    where rf.created_at >= p_from and rf.created_at < p_to
      and (p_include_test or not ord.is_test_data)
  ),
  v as (
    select vd.* from order_item_voids vd
    join orders ord on ord.id = vd.order_id
    where vd.created_at >= p_from and vd.created_at < p_to
      and (p_include_test or not ord.is_test_data)
  )
  select
    coalesce((select sum(subtotal)   from o), 0),
    coalesce((select sum(tax_amount) from o), 0),
    coalesce((select sum(total)      from o), 0),
    (select count(*) from o),
    -- Rata-rata per struk dihitung dari angka tagihan, bukan dari omzet:
    -- yang dibandingkan orang dengan ingatannya adalah nominal yang dibayar.
    coalesce((select round(avg(total))::bigint from o), 0),
    coalesce((select sum(amount) from r), 0),
    (select count(*) from r),
    coalesce((select sum(amount) from v), 0),
    (select count(*) from v)
  from (select 1) as satu_baris;
$$;


-- Tren omzet. p_bucket: 'day' (grafik per hari) atau 'hour' (pola jam ramai).
create or replace function get_sales_trend(
  p_from         timestamptz,
  p_to           timestamptz,
  p_bucket       text default 'day',
  p_include_test boolean default false
)
returns table (
  bucket    text,
  omzet     bigint,
  pajak     bigint,
  tertagih  bigint,
  transaksi bigint
)
language sql
as $$
  select
    case when p_bucket = 'hour'
         then to_char(o.paid_at at time zone 'Asia/Jakarta', 'HH24')
         else to_char(o.paid_at at time zone 'Asia/Jakarta', 'YYYY-MM-DD')
    end,
    sum(o.subtotal),
    sum(o.tax_amount),
    sum(o.total),
    count(*)
  from orders o
  where o.status = 'paid' and o.paid_at >= p_from and o.paid_at < p_to
    and (p_include_test or not o.is_test_data)
  group by 1
  order by 1;
$$;


-- Produk terlaris. Diurutkan berdasarkan jumlah terjual, bukan omzet —
-- yang ingin dilihat pemilik adalah menu mana yang paling sering dipesan.
create or replace function get_top_products(
  p_from         timestamptz,
  p_to           timestamptz,
  p_limit        int default 10,
  p_include_test boolean default false
)
returns table (
  product_name text,
  kategori     text,
  terjual      bigint,
  omzet        bigint
)
language sql
as $$
  select oi.product_name,
         coalesce(c.name, '-'),
         sum(oi.quantity),
         sum(oi.subtotal)
  from order_items oi
  join orders o          on o.id = oi.order_id
  left join products p   on p.id = oi.product_id
  left join categories c on c.id = p.category_id
  where o.status = 'paid' and o.paid_at >= p_from and o.paid_at < p_to
    and (p_include_test or not o.is_test_data)
  group by 1, 2
  order by 3 desc, 4 desc
  limit p_limit;
$$;


-- Kontribusi omzet per kategori.
create or replace function get_category_contribution(
  p_from         timestamptz,
  p_to           timestamptz,
  p_include_test boolean default false
)
returns table (
  kategori text,
  omzet    bigint,
  terjual  bigint
)
language sql
as $$
  select coalesce(c.name, '-'),
         sum(oi.subtotal),
         sum(oi.quantity)
  from order_items oi
  join orders o          on o.id = oi.order_id
  left join products p   on p.id = oi.product_id
  left join categories c on c.id = p.category_id
  where o.status = 'paid' and o.paid_at >= p_from and o.paid_at < p_to
    and (p_include_test or not o.is_test_data)
  group by 1
  order by 2 desc;
$$;


-- Laporan void: setiap pembatalan item pada order yang sudah tersimpan.
create or replace function get_void_report(
  p_from         timestamptz,
  p_to           timestamptz,
  p_include_test boolean default false
)
returns table (
  waktu        timestamptz,
  table_code   text,
  table_seq    int,
  product_name text,
  quantity     int,
  amount       bigint,
  reason       text,
  oleh         text
)
language sql
as $$
  select v.created_at, o.table_code, o.table_seq, v.product_name,
         v.quantity, v.amount, v.reason, e.name
  from order_item_voids v
  join orders o    on o.id = v.order_id
  join employees e on e.id = v.voided_by
  where v.created_at >= p_from and v.created_at < p_to
    and (p_include_test or not o.is_test_data)
  order by v.created_at desc;
$$;


-- Produk yang paling sering di-void. Angka ini biasanya menandakan menu yang
-- membingungkan atau tombol yang berdekatan di grid, bukan kecurangan.
--
-- Join ke orders BARU di 0022 — versi 0002 tidak menyentuh orders sama sekali,
-- jadi void atas order uji ikut terhitung di sini sementara laporan void di
-- sebelahnya sudah bersih. Dua angka tentang hal yang sama, tidak cocok.
create or replace function get_top_voided_products(
  p_from         timestamptz,
  p_to           timestamptz,
  p_limit        int default 5,
  p_include_test boolean default false
)
returns table (
  product_name text,
  kejadian     bigint,
  qty          bigint,
  nilai        bigint
)
language sql
as $$
  select v.product_name, count(*), sum(v.quantity), sum(v.amount)
  from order_item_voids v
  join orders o on o.id = v.order_id
  where v.created_at >= p_from and v.created_at < p_to
    and (p_include_test or not o.is_test_data)
  group by 1
  order by 2 desc, 4 desc
  limit p_limit;
$$;


-- Ringkasan pajak satu periode. Bentuk 0018 (refund ikut), ditambah saringan.
--
-- `pajak_tidak_ditagih` hanya bisa dihitung karena tarif ikut di-snapshot pada
-- order bebas pajak (keputusan 3 di 0012).
create or replace function get_pbjt_summary(
  p_from         timestamptz,
  p_to           timestamptz,
  p_include_test boolean default false
)
returns table (
  omzet_kena_pajak      bigint,
  omzet_bebas_pajak     bigint,
  pajak_terkumpul       bigint,
  pajak_tidak_ditagih   bigint,
  transaksi_kena_pajak  bigint,
  transaksi_bebas_pajak bigint,
  refund_omzet          bigint,
  refund_pajak          bigint,
  omzet_bersih          bigint,
  pajak_bersih          bigint
)
language sql
as $$
  with o as (
    select * from orders
    where status = 'paid' and paid_at >= p_from and paid_at < p_to
      and (p_include_test or not is_test_data)
  ),
  r as (
    select rf.* from refunds rf
    join orders ord on ord.id = rf.order_id
    where rf.created_at >= p_from and rf.created_at < p_to
      and (p_include_test or not ord.is_test_data)
  )
  -- Subquery skalar, bukan cross join ke agregat refund. Dengan cross join,
  -- periode tanpa satu pun order menghasilkan NOL BARIS alih-alih satu baris
  -- berisi nol — dan pemanggil yang membaca baris pertama akan pecah pada hari
  -- toko libur, bukan pada hari yang diuji.
  select
    coalesce((select sum(subtotal) filter (where tax_status = 'taxable') from o), 0),
    coalesce((select sum(subtotal) filter (where tax_status = 'exempt')  from o), 0),
    coalesce((select sum(tax_amount) from o), 0),
    coalesce((select sum((subtotal * tax_rate_bps + 5000) / 10000)
                     filter (where tax_status = 'exempt') from o), 0),
    (select count(*) filter (where tax_status = 'taxable') from o),
    (select count(*) filter (where tax_status = 'exempt')  from o),
    coalesce((select sum(subtotal)   from r), 0),
    coalesce((select sum(tax_amount) from r), 0),
    coalesce((select sum(subtotal)   from o), 0) - coalesce((select sum(subtotal)   from r), 0),
    coalesce((select sum(tax_amount) from o), 0) - coalesce((select sum(tax_amount) from r), 0)
  from (select 1) as satu_baris;
$$;


-- Deret harian. Pengelompokan Asia/Jakarta, bukan UTC — tanpa itu transaksi di
-- atas jam 17:00 WIB jatuh ke tanggal berikutnya dan pelaporan pajak harian
-- salah hari. Berlaku sama untuk tanggal refund.
--
-- full outer join, bukan left join: hari yang isinya HANYA refund (toko tutup,
-- pelanggan kemarin datang mengembalikan) tetap harus punya barisnya sendiri.
create or replace function get_pbjt_harian(
  p_from         timestamptz,
  p_to           timestamptz,
  p_include_test boolean default false
)
returns table (
  tanggal               text,
  omzet_kena_pajak      bigint,
  omzet_bebas_pajak     bigint,
  pajak_terkumpul       bigint,
  transaksi_kena_pajak  bigint,
  transaksi_bebas_pajak bigint,
  refund_omzet          bigint,
  refund_pajak          bigint,
  pajak_bersih          bigint
)
language sql
as $$
  with o as (
    select
      to_char(paid_at at time zone 'Asia/Jakarta', 'YYYY-MM-DD') as tgl,
      coalesce(sum(subtotal) filter (where tax_status = 'taxable'), 0) as kena,
      coalesce(sum(subtotal) filter (where tax_status = 'exempt'),  0) as bebas,
      coalesce(sum(tax_amount), 0)                                    as pajak,
      count(*) filter (where tax_status = 'taxable')                  as n_kena,
      count(*) filter (where tax_status = 'exempt')                   as n_bebas
    from orders
    where status = 'paid' and paid_at >= p_from and paid_at < p_to
      and (p_include_test or not is_test_data)
    group by 1
  ),
  r as (
    select
      to_char(rf.created_at at time zone 'Asia/Jakarta', 'YYYY-MM-DD') as tgl,
      coalesce(sum(rf.subtotal), 0)   as sub,
      coalesce(sum(rf.tax_amount), 0) as pajak
    from refunds rf
    join orders ord on ord.id = rf.order_id
    where rf.created_at >= p_from and rf.created_at < p_to
      and (p_include_test or not ord.is_test_data)
    group by 1
  )
  select
    coalesce(o.tgl, r.tgl),
    coalesce(o.kena, 0),
    coalesce(o.bebas, 0),
    coalesce(o.pajak, 0),
    coalesce(o.n_kena, 0),
    coalesce(o.n_bebas, 0),
    coalesce(r.sub, 0),
    coalesce(r.pajak, 0),
    coalesce(o.pajak, 0) - coalesce(r.pajak, 0)
  from o full outer join r on r.tgl = o.tgl
  order by 1;
$$;


-- Daftar transaksi bebas pajak, satu baris per order.
--
-- Inilah yang dibuka kalau suatu hari ada yang bertanya kenapa satu transaksi
-- tidak dipungut pajak.
create or replace function get_pbjt_exempt_report(
  p_from         timestamptz,
  p_to           timestamptz,
  p_include_test boolean default false
)
returns table (
  waktu      timestamptz,
  table_code text,
  table_seq  int,
  nilai      bigint,
  keterangan text,
  disetujui  text
)
language sql
as $$
  select o.paid_at, o.table_code, o.table_seq, o.subtotal,
         o.tax_exempt_reason, e.name
  from orders o
  left join employees e on e.id = o.tax_approved_by
  where o.status = 'paid'
    and o.tax_status = 'exempt'
    and o.paid_at >= p_from and o.paid_at < p_to
    and (p_include_test or not o.is_test_data)
  order by o.paid_at desc;
$$;


-- Daftar refund, satu baris per refund.
--
-- Alasan boleh kosong — Heika memutuskan alasan refund bersifat opsional,
-- berbeda dari keterangan bebas pajak dan dari test_mode_reason yang wajib.
-- Yang selalu ada adalah SIAPA.
create or replace function get_refund_report(
  p_from         timestamptz,
  p_to           timestamptz,
  p_include_test boolean default false
)
returns table (
  waktu      timestamptz,
  table_code text,
  item       text,
  pokok      bigint,
  pajak      bigint,
  jumlah     bigint,
  alasan     text,
  kasir      text
)
language sql
as $$
  select
    r.created_at,
    o.table_code,
    -- Nama item digabung jadi satu kolom teks: laporan ini dibaca berdampingan
    -- dengan struk dan buku kas, bukan diolah lagi.
    (select string_agg(ri.quantity || 'x ' || ri.product_name, ', '
                       order by ri.product_name)
     from refund_items ri where ri.refund_id = r.id),
    r.subtotal,
    r.tax_amount,
    r.amount,
    r.reason,
    e.name
  from refunds r
  join orders o    on o.id = r.order_id
  join employees e on e.id = r.employee_id
  where r.created_at >= p_from and r.created_at < p_to
    and (p_include_test or not o.is_test_data)
  order by r.created_at;
$$;

commit;

-- Tidak ada `grant execute` di sini, dan itu disengaja — sama seperti 0018.
-- Fungsi laporan hanya dipanggil service_role dari sisi server Next.js. Yang
-- memutuskan boleh-tidaknya p_include_test true adalah peran pada sesi di
-- lapisan itu, bukan SQL.
