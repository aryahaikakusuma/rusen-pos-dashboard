-- Query agregasi untuk dashboard dan laporan void.
--
-- Aturan angka yang berlaku di seluruh file ini:
--  * Omzet dihitung HANYA dari order berstatus 'paid'. Pending dan void tidak ikut.
--  * Nilai void TIDAK dikurangkan dari omzet — item yang di-void memang tidak
--    pernah tertagih, jadi ia sudah tidak ada di dalam sum(total). Yang mengurangi
--    omzet hanyalah refund (uang sudah diterima lalu dikembalikan).
--  * Semua pengelompokan tanggal memakai Asia/Jakarta, bukan UTC. Tanpa ini,
--    transaksi di atas jam 17:00 WIB akan jatuh ke tanggal berikutnya.

-- Ringkasan KPI untuk satu periode.
create or replace function get_sales_summary(p_from timestamptz, p_to timestamptz)
returns table (
  omzet        bigint,
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
    coalesce((select sum(total) from orders
              where status = 'paid' and paid_at >= p_from and paid_at < p_to), 0),
    (select count(*) from orders
     where status = 'paid' and paid_at >= p_from and paid_at < p_to),
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
  transaksi bigint
)
language sql
as $$
  select
    case when p_bucket = 'hour'
         then to_char(o.paid_at at time zone 'Asia/Jakarta', 'HH24')
         else to_char(o.paid_at at time zone 'Asia/Jakarta', 'YYYY-MM-DD')
    end,
    sum(o.total),
    count(*)
  from orders o
  where o.status = 'paid' and o.paid_at >= p_from and o.paid_at < p_to
  group by 1
  order by 1;
$$;


-- Produk terlaris. Diurutkan berdasarkan jumlah terjual, bukan omzet —
-- yang ingin dilihat pemilik adalah menu mana yang paling sering dipesan.
create or replace function get_top_products(
  p_from  timestamptz,
  p_to    timestamptz,
  p_limit int default 10
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
  group by 1, 2
  order by 3 desc, 4 desc
  limit p_limit;
$$;


-- Kontribusi omzet per kategori.
create or replace function get_category_contribution(p_from timestamptz, p_to timestamptz)
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
  group by 1
  order by 2 desc;
$$;


-- Laporan void: setiap pembatalan item pada order yang sudah tersimpan.
create or replace function get_void_report(p_from timestamptz, p_to timestamptz)
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
  order by v.created_at desc;
$$;


-- Produk yang paling sering di-void. Angka ini biasanya menandakan menu yang
-- membingungkan atau tombol yang berdekatan di grid, bukan kecurangan.
create or replace function get_top_voided_products(
  p_from  timestamptz,
  p_to    timestamptz,
  p_limit int default 5
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
  where v.created_at >= p_from and v.created_at < p_to
  group by 1
  order by 2 desc, 4 desc
  limit p_limit;
$$;
