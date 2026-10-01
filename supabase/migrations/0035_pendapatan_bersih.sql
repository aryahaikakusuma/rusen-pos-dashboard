-- Pendapatan sesudah refund, pada tanggal uang dikembalikan (WIB).
-- v1 tetap kompatibel; satu sumber perhitungan di v2. Tidak mengubah order.
begin;

create or replace function laporan_penjualan_harian_v2(
  p_dari date, p_sampai date, p_include_test boolean default false
)
returns table (
  tanggal date, jumlah_order bigint, omzet_kotor bigint, total_refund bigint,
  omzet_bersih bigint, dasar_pbjt bigint, pbjt bigint, omzet_bebas_order bigint,
  omzet_bukan_objek bigint, tertagih bigint, tertagih_tunai bigint,
  tertagih_non_tunai bigint, tertagih_bersih bigint, refund_pbjt bigint,
  pbjt_bersih bigint
)
language sql stable security invoker
as $$
  with batas as (
    select p_dari::timestamp at time zone 'Asia/Jakarta' as dari,
      (p_sampai + 1)::timestamp at time zone 'Asia/Jakarta' as sampai
  ), deret as (
    select p_dari + n as tanggal
    from generate_series(0, p_sampai - p_dari) as n
  ), o as (
    select (ord.paid_at at time zone 'Asia/Jakarta')::date as tgl,
      count(*) as n, sum(ord.subtotal) as omzet,
      sum(ord.taxable_subtotal) filter (where ord.tax_status = 'taxable') as dasar,
      sum(ord.tax_amount) as pajak,
      sum(ord.subtotal) filter (where ord.tax_status = 'exempt') as bebas_order,
      sum(ord.subtotal - ord.taxable_subtotal)
        filter (where ord.tax_status = 'taxable') as bukan_objek,
      sum(ord.total) as tertagih,
      sum(ord.total) filter (where ord.payment_method = 'cash') as tunai,
      sum(ord.total) filter (where ord.payment_method = 'non_cash') as non_tunai
    from orders ord cross join batas b
    where ord.status = 'paid' and ord.paid_at >= b.dari and ord.paid_at < b.sampai
      and (p_include_test or not ord.is_test_data)
    group by 1
  ), r as (
    select (rf.created_at at time zone 'Asia/Jakarta')::date as tgl,
      sum(rf.amount) as jumlah, sum(rf.subtotal) as pokok,
      sum(rf.tax_amount) as pajak
    from refunds rf join orders ord on ord.id = rf.order_id cross join batas b
    where rf.created_at >= b.dari and rf.created_at < b.sampai
      and (p_include_test or not ord.is_test_data)
    group by 1
  )
  select d.tanggal, coalesce(o.n,0), coalesce(o.omzet,0), coalesce(r.jumlah,0),
    coalesce(o.omzet,0) - coalesce(r.pokok,0), coalesce(o.dasar,0),
    coalesce(o.pajak,0), coalesce(o.bebas_order,0), coalesce(o.bukan_objek,0),
    coalesce(o.tertagih,0), coalesce(o.tunai,0), coalesce(o.non_tunai,0),
    coalesce(o.tertagih,0) - coalesce(r.jumlah,0), coalesce(r.pajak,0),
    coalesce(o.pajak,0) - coalesce(r.pajak,0)
  from deret d left join o on o.tgl = d.tanggal left join r on r.tgl = d.tanggal
  order by d.tanggal;
$$;

create or replace function laporan_penjualan_harian(
  p_dari date, p_sampai date, p_include_test boolean default false
)
returns table (
  tanggal date, jumlah_order bigint, omzet_kotor bigint, total_refund bigint,
  omzet_bersih bigint, dasar_pbjt bigint, pbjt bigint, omzet_bebas_order bigint,
  omzet_bukan_objek bigint, tertagih bigint, tertagih_tunai bigint,
  tertagih_non_tunai bigint
)
language sql stable security invoker
as $$
  select tanggal,jumlah_order,omzet_kotor,total_refund,omzet_bersih,dasar_pbjt,
    pbjt,omzet_bebas_order,omzet_bukan_objek,tertagih,tertagih_tunai,tertagih_non_tunai
  from laporan_penjualan_harian_v2(p_dari,p_sampai,p_include_test);
$$;

revoke execute on function laporan_penjualan_harian_v2(date,date,boolean) from public, anon, authenticated;
grant execute on function laporan_penjualan_harian_v2(date,date,boolean) to service_role;
comment on function laporan_penjualan_harian_v2(date,date,boolean) is
  'Pendapatan bersih per tanggal WIB. Refund memakai tanggal pengembalian; pajak refund memakai snapshot tersimpan, tidak dihitung ulang.';
notify pgrst, 'reload schema';
commit;
