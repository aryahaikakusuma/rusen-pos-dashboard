-- Order paid yang paid_at-nya tidak jatuh di jendela shift MANA PUN pada
-- rentang tanggal yang diminta — pasangan order untuk refund_yatim (0032).
--
-- LATAR: audit manual laporan_shift untuk shift "Pagi" 2026-08-13 menemukan
-- dua order tunai dengan paid_at SETELAH shift itu closed_at, dan tidak ada
-- shift lain (belum dibuka/belum sync) yang jendelanya mencakup waktu itu.
-- Bukan bug pada laporan_shift — windowing-nya terhadap opened_at/closed_at
-- yang ada sudah benar dan penjualan_tunai-nya cocok persis dengan penjumlahan
-- manual. Ini murni celah cakupan: order yang terjadi di luar jendela shift
-- manapun tidak muncul di laporan per-shift manapun, sama seperti refund
-- sebelum 0032 menambahkan refund_yatim.
--
-- Tidak dibatasi payment_method = 'cash', mengikuti pola refund_yatim persis:
-- yatim-nya ada di semua metode, metode_pembayaran ditampilkan sebagai info
-- kolom supaya dashboard yang memutuskan mana yang relevan ke rekonsiliasi
-- kas, bukan fungsi ini yang menyaring duluan.
create or replace function order_yatim(p_dari date, p_sampai date)
returns table (
  order_id            uuid,
  table_code          text,
  waktu               timestamptz,
  total               bigint,
  kasir               text,
  metode_pembayaran   text
)
language sql
security definer
set search_path = public
stable
as $$
  with jendela as (
    select (p_dari::timestamp             at time zone 'Asia/Jakarta') as dari,
           ((p_sampai + 1)::timestamp     at time zone 'Asia/Jakarta') as sampai
  )
  select
    o.id as order_id,
    o.table_code,
    o.paid_at as waktu,
    o.total,
    e.name as kasir,
    o.payment_method::text as metode_pembayaran
  from orders o
  join employees e on e.id = o.paid_by
  cross join jendela j
  where o.status = 'paid'
    and o.paid_at >= j.dari
    and o.paid_at < j.sampai
    and o.is_test_data = false
    and not exists (
      select 1 from shifts s
      where o.paid_at >= s.opened_at
        and o.paid_at < coalesce(s.closed_at, now())
    )
  order by o.paid_at asc;
$$;

revoke all on function order_yatim(date, date) from public, anon, authenticated;
grant execute on function order_yatim(date, date) to service_role;
