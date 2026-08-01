-- Laporan — refund ikut diperhitungkan.
--
-- Tanpa berkas ini, laporan PBJT melebih-lebihkan pajak terkumpul persis
-- sebesar pajak yang sudah dikembalikan ke pelanggan, dan tidak ada satu pun
-- tanda bahwa itu terjadi. Untuk pelaporan pajak daerah, itu berarti menyetor
-- atas penjualan yang dibatalkan. Kelas kegagalan yang sama sudah dua kali
-- tercatat di MIGRATION.md: angka yang salah tapi tampak wajar.
--
-- get_sales_summary tidak disentuh — ia sudah melaporkan refund_total dan
-- refund_count sejak 0015.
--
-- BRUTO DAN BERSIH DILAPORKAN BERDAMPINGAN, bukan hanya selisihnya. Yang
-- disetorkan ke kas daerah adalah pajak bersih, tapi yang harus bisa
-- dipertanggungjawabkan kalau ditanya adalah keduanya beserta selisihnya.
-- Laporan yang hanya menunjukkan hasil akhir memaksa orang menghitung mundur.
--
-- Refund dikelompokkan menurut KAPAN REFUND-NYA TERJADI, bukan kapan ordernya
-- dibayar. Uang keluar dari laci pada hari refund, dan laporan harian harus
-- cocok dengan laci pada hari itu. Konsekuensinya refund atas transaksi bulan
-- lalu muncul di bulan ini, dan itu memang yang benar secara kas.

begin;

-- Tipe kembaliannya berubah, jadi wajib drop — `create or replace` menolak
-- mengubah daftar kolom OUT. Keduanya tidak punya grant yang perlu dijaga
-- (lihat catatan di kaki berkas).
drop function if exists get_pbjt_summary(timestamptz, timestamptz);
drop function if exists get_pbjt_harian(timestamptz, timestamptz);

create or replace function get_pbjt_summary(p_from timestamptz, p_to timestamptz)
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
  ),
  r as (
    select * from refunds
    where created_at >= p_from and created_at < p_to
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
-- Dengan left join, uang yang keluar hari itu hilang dari laporan.
create or replace function get_pbjt_harian(p_from timestamptz, p_to timestamptz)
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
    group by 1
  ),
  r as (
    select
      to_char(created_at at time zone 'Asia/Jakarta', 'YYYY-MM-DD') as tgl,
      coalesce(sum(subtotal), 0)   as sub,
      coalesce(sum(tax_amount), 0) as pajak
    from refunds
    where created_at >= p_from and created_at < p_to
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

-- Daftar refund, satu baris per refund.
--
-- Alasan boleh kosong — Heika memutuskan alasan bersifat opsional, berbeda dari
-- keterangan bebas pajak yang wajib. Yang selalu ada adalah SIAPA, dan itulah
-- yang dibuka kalau suatu hari ada yang bertanya kenapa uang ini keluar.
create or replace function get_refund_report(p_from timestamptz, p_to timestamptz)
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
  order by r.created_at;
$$;

-- CATATAN yang berlaku untuk SELURUH fungsi laporan, bukan hanya yang di sini:
-- tidak satu pun dari fungsi ini bisa dipanggil oleh akun pegawai. Semuanya
-- `security invoker` tanpa `grant execute`, jadi RLS menolaknya dengan
-- "permission denied for table orders". Hari ini hanya service_role yang bisa
-- membacanya. Itu pekerjaan tersendiri dan disengaja tidak dicampur ke sini.

commit;
