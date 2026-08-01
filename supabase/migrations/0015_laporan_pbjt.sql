-- PBJT — agregasi laporan.
--
-- Tidak ada layar laporan di aplikasi mana pun hari ini; fungsi-fungsi di 0002
-- belum punya satu pun pemanggil. Yang dibangun di sini adalah datanya, supaya
-- angka pajak sudah benar sejak transaksi pertama — bukan dihitung ulang
-- belakangan dari data yang tidak menyimpannya.
--
-- ============================================================================
-- BAGIAN PERTAMA WAJIB, BUKAN PILIHAN: MEMBETULKAN 0002
-- ============================================================================
--
-- get_sales_summary dan get_sales_trend menjumlahkan `total`. Sejak 0012,
-- `total` berarti angka tagihan — sudah termasuk pajak. Dibiarkan begitu, angka
-- omzet pemilik naik 10% dalam semalam tanpa apa pun yang menjelaskan, dan
-- itulah momen "laporan tidak cocok dengan laci" yang paling mungkin lahir dari
-- seluruh perubahan ini.
--
-- Karena belum ada pemakainya, sekarang waktu termurah untuk membetulkannya:
-- `omzet` menjadi sum(subtotal) — omzet sebelum pajak, yang memang arti omzet
-- dalam pelaporan — dan pajak serta angka tagihannya dipisah jadi kolom
-- sendiri. get_top_products dan get_category_contribution sudah membaca
-- oi.subtotal dan tidak berubah sama sekali.
--
-- Tipe kembalian berubah, jadi keduanya harus di-DROP dulu; `create or replace`
-- tidak bisa menambah kolom OUT.

begin;

drop function if exists get_sales_summary(timestamptz, timestamptz);
drop function if exists get_sales_trend(timestamptz, timestamptz, text);

-- Ringkasan KPI untuk satu periode.
--   omzet     — sebelum pajak (dasar pengenaan + yang dibebaskan)
--   pajak     — PBJT yang terpungut
--   tertagih  — yang benar-benar masuk laci: omzet + pajak
create or replace function get_sales_summary(p_from timestamptz, p_to timestamptz)
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
  select
    coalesce((select sum(subtotal) from orders
              where status = 'paid' and paid_at >= p_from and paid_at < p_to), 0),
    coalesce((select sum(tax_amount) from orders
              where status = 'paid' and paid_at >= p_from and paid_at < p_to), 0),
    coalesce((select sum(total) from orders
              where status = 'paid' and paid_at >= p_from and paid_at < p_to), 0),
    (select count(*) from orders
     where status = 'paid' and paid_at >= p_from and paid_at < p_to),
    -- Rata-rata per struk dihitung dari angka tagihan, bukan dari omzet:
    -- yang dibandingkan orang dengan ingatannya adalah nominal yang dibayar.
    coalesce((select round(avg(total))::bigint from orders
              where status = 'paid' and paid_at >= p_from and paid_at < p_to), 0),
    coalesce((select sum(amount) from refunds
              where created_at >= p_from and created_at < p_to), 0),
    (select count(*) from refunds where created_at >= p_from and created_at < p_to),
    coalesce((select sum(amount) from order_item_voids
              where created_at >= p_from and created_at < p_to), 0),
    (select count(*) from order_item_voids
     where created_at >= p_from and created_at < p_to);
$$;


-- Tren omzet. p_bucket: 'day' (grafik per hari) atau 'hour' (pola jam ramai).
create or replace function get_sales_trend(
  p_from   timestamptz,
  p_to     timestamptz,
  p_bucket text default 'day'
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
  group by 1
  order by 1;
$$;


-- ============================================================================
-- LAPORAN PBJT
-- ============================================================================

-- Ringkasan pajak satu periode.
--
-- `pajak_tidak_ditagih` hanya bisa dihitung karena tarif ikut di-snapshot pada
-- order bebas pajak (keputusan 3 di 0012). Kalau kelak ada yang tergoda
-- membiarkan tax_rate_bps nol pada baris bebas pajak, kolom inilah yang diam-
-- diam berubah jadi nol dan tidak ada yang memberi tahu.
create or replace function get_pbjt_summary(p_from timestamptz, p_to timestamptz)
returns table (
  omzet_kena_pajak      bigint,
  omzet_bebas_pajak     bigint,
  pajak_terkumpul       bigint,
  pajak_tidak_ditagih   bigint,
  transaksi_kena_pajak  bigint,
  transaksi_bebas_pajak bigint
)
language sql
as $$
  select
    coalesce(sum(subtotal)   filter (where tax_status = 'taxable'), 0),
    coalesce(sum(subtotal)   filter (where tax_status = 'exempt'),  0),
    coalesce(sum(tax_amount), 0),
    coalesce(sum((subtotal * tax_rate_bps + 5000) / 10000)
             filter (where tax_status = 'exempt'), 0),
    count(*) filter (where tax_status = 'taxable'),
    count(*) filter (where tax_status = 'exempt')
  from orders
  where status = 'paid' and paid_at >= p_from and paid_at < p_to;
$$;


-- Deret harian dari angka yang sama. Pengelompokan Asia/Jakarta, bukan UTC —
-- tanpa itu transaksi di atas jam 17:00 WIB jatuh ke tanggal berikutnya, dan
-- pelaporan pajak harian jadi salah hari.
create or replace function get_pbjt_harian(p_from timestamptz, p_to timestamptz)
returns table (
  tanggal               text,
  omzet_kena_pajak      bigint,
  omzet_bebas_pajak     bigint,
  pajak_terkumpul       bigint,
  transaksi_kena_pajak  bigint,
  transaksi_bebas_pajak bigint
)
language sql
as $$
  select
    to_char(paid_at at time zone 'Asia/Jakarta', 'YYYY-MM-DD'),
    coalesce(sum(subtotal) filter (where tax_status = 'taxable'), 0),
    coalesce(sum(subtotal) filter (where tax_status = 'exempt'),  0),
    coalesce(sum(tax_amount), 0),
    count(*) filter (where tax_status = 'taxable'),
    count(*) filter (where tax_status = 'exempt')
  from orders
  where status = 'paid' and paid_at >= p_from and paid_at < p_to
  group by 1
  order by 1;
$$;


-- Daftar transaksi bebas pajak, satu baris per order.
--
-- Tidak diminta secara eksplisit, dan tetap ditulis: mewajibkan keterangan dan
-- penyetuju tidak ada gunanya kalau tidak ada satu pun cara membacanya kembali.
-- Inilah yang dibuka kalau suatu hari ada yang bertanya kenapa satu transaksi
-- tidak dipungut pajak.
create or replace function get_pbjt_exempt_report(p_from timestamptz, p_to timestamptz)
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
  order by o.paid_at desc;
$$;

commit;
