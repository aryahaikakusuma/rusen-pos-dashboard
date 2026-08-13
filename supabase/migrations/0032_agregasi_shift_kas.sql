-- Fungsi baca untuk dashboard histori kas per shift. HANYA fungsi baru — tidak
-- ada tabel, kolom, atau data yang diubah. Membaca shifts/cash_movements
-- (0029_shift_kas.sql) dan refunds/orders (0001_init.sql, 0012_pbjt_skema.sql
-- dst) langsung, sama seperti laporan_penjualan_harian dkk (0027) membaca
-- orders langsung tanpa tabel ringkasan sendiri.
--
-- ATURAN PENYELARASAN: setiap formula di sini WAJIB identik dengan yang
-- dihitung device di mobile/db/shift.ts dan mobile/lib/receipt.ts
-- (kasSeharusnya). Di titik mana pun instruksi pembuatan migrasi ini berbeda
-- dari device, yang dipakai adalah device — dicatat di komentar pada titik
-- itu, bukan diselaraskan diam-diam ke "yang lebih benar secara akuntansi".
-- Struk kertas yang sudah dicetak adalah kebenaran yang dipegang kasir.
--
-- PENYIMPANGAN PALING PENTING dari draf instruksi: kas_masuk dan kas_keluar
-- di laporan_shift() HANYA menjumlahkan cash_movements bermetode 'cash'.
-- Draf instruksi menyebut "sum cash_movements direction 'in'" tanpa syarat
-- metode, tapi kasSeharusnya di receipt.ts memakai kasMasukTunai/
-- kasKeluarTunai — hasil cashTotals() yang sudah dipilah metode, BUKAN total
-- seluruh arah. Kas masuk/keluar non tunai (mis. setoran lewat transfer) ada
-- di tabel dan tetap muncul di detail_kas_shift(), tapi tidak pernah masuk ke
-- kas_seharusnya, persis seperti di perangkat.

-- ============================================================ Fungsi 1

-- Satu baris per shift. Jendela filter memakai opened_at, bukan closed_at,
-- supaya shift yang menyeberang tengah malam tetap terhitung pada tanggal
-- kasir membukanya — pola waktu WIB yang sama dengan laporan_penjualan_harian
-- dkk di 0027 (p_sampai inklusif, diterjemahkan sekali lewat CTE jendela).
--
-- CATATAN SKEMA: shifts.closed_at berstatus NOT NULL di server (0029) dan
-- komentarnya eksplisit — "sif terbuka tidak pernah dikirim". Artinya, pada
-- data yang ada hari ini, TIDAK ADA dan TIDAK BISA ADA baris shifts dengan
-- closed_at null: p_sertakan_terbuka tidak berpengaruh apa pun, dan
-- masih_terbuka akan selalu false. Cabang ini tetap ditulis sesuai spesifikasi
-- instruksi (bukan disederhanakan/dihapus sepihak) supaya fungsi tetap benar
-- kalau constraint NOT NULL itu suatu saat dilonggarkan di sisi push_shift;
-- lihat TEMUAN PENTING pada laporan audit untuk detailnya.
create or replace function laporan_shift(
  p_dari              date,
  p_sampai            date,
  p_sertakan_terbuka  boolean default false
)
returns table (
  shift_id              text,
  dibuka_pada           timestamptz,
  ditutup_pada          timestamptz,
  kasir                 text,
  modal_awal            bigint,
  penjualan_tunai       bigint,
  kas_masuk             bigint,
  kas_keluar            bigint,
  refund_tunai          bigint,
  kas_seharusnya        bigint,
  kas_aktual            bigint,
  -- Dua kolom selisih yang SENGAJA tidak diselaraskan satu sama lain di dalam
  -- fungsi ini (Instruksi Lanjutan Bagian C). selisih_tersimpan adalah angka
  -- yang sudah tercetak di kertas (shifts.selisih, dihitung device dari
  -- kasSeharusnya versi device). selisih_hitung_server dihitung ulang di sini
  -- dari kas_fisik dan kas_seharusnya versi SQL di atas. Kalau device dan
  -- server pernah berbeda formula, kedua kolom ini akan berbeda dan itu justru
  -- informasi yang harus sampai ke dashboard, bukan disembunyikan dengan
  -- memilih salah satunya sebagai satu-satunya "selisih".
  selisih_tersimpan     bigint,
  selisih_hitung_server bigint,
  -- true kalau kedua angka sama, null kalau salah satu null (shift masih
  -- terbuka atau selisih_tersimpan belum pernah diisi karena sif lama sebelum
  -- V5/V6 mobile/db/migrations.ts) — BUKAN false, supaya "tidak diketahui"
  -- tidak tertukar dengan "diketahui, dan menyimpang".
  formula_cocok         boolean,
  masih_terbuka         boolean
)
language sql
security definer
set search_path = public
stable
as $$
  with jendela as (
    -- Satu-satunya tempat WIB diterjemahkan, sama seperti 0027. p_sampai
    -- inklusif; batas atas sebenarnya p_sampai + 1 hari, setengah terbuka.
    select (p_dari::timestamp             at time zone 'Asia/Jakarta') as dari,
           ((p_sampai + 1)::timestamp     at time zone 'Asia/Jakarta') as sampai
  ),
  dasar as (
    select
      s.id, s.opened_at, s.closed_at, s.employee_name, s.modal_awal, s.kas_fisik,
      s.selisih as selisih_tersimpan,
      -- Batas atas jendela order/refund shift ini: closed_at kalau sudah
      -- tutup, now() kalau (secara hipotetis) masih terbuka.
      coalesce(s.closed_at, now()) as batas_atas
    from shifts s, jendela j
    where s.opened_at >= j.dari and s.opened_at < j.sampai
      and (p_sertakan_terbuka or s.closed_at is not null)
  ),
  -- Replikasi persis blok `uang` di shiftTotals (mobile/db/shift.ts): dari
  -- orders bukan payments, status paid, payment_method cash, jendela paid_at,
  -- is_test_data = false.
  penjualan as (
    select
      d.id as shift_id,
      coalesce(sum(o.total), 0) as penjualan_tunai
    from dasar d
    left join orders o
      on o.status = 'paid'
     and o.payment_method = 'cash'
     and o.is_test_data = false
     and o.paid_at >= d.opened_at
     and o.paid_at < d.batas_atas
    group by d.id
  ),
  -- Replikasi persis query `refundTunai` di shiftTotals: refunds join orders,
  -- hanya order payment_method cash, jendela refunds.created_at (BUKAN
  -- paid_at order aslinya — refund bisa jatuh di hari/shift lain dari
  -- penjualannya, disengaja, lihat komentar shift.ts).
  refund as (
    select
      d.id as shift_id,
      coalesce(sum(case when o.payment_method = 'cash' then r.amount else 0 end), 0)
        as refund_tunai
    from dasar d
    left join refunds r
      on r.created_at >= d.opened_at
     and r.created_at < d.batas_atas
    left join orders o
      on o.id = r.order_id
     and o.is_test_data = false
    group by d.id
  ),
  -- Replikasi persis cashTotals (mobile/db/cash.ts), dipersempit ke method
  -- 'cash' saja karena hanya itu yang masuk kasSeharusnya di receipt.ts.
  kas as (
    select
      d.id as shift_id,
      coalesce(sum(case when cm.direction = 'in'  and cm.method = 'cash' then cm.amount else 0 end), 0)
        as kas_masuk,
      coalesce(sum(case when cm.direction = 'out' and cm.method = 'cash' then cm.amount else 0 end), 0)
        as kas_keluar
    from dasar d
    left join cash_movements cm
      on cm.shift_id = d.id
     and cm.voided_at is null
    group by d.id
  )
  select
    d.id as shift_id,
    d.opened_at as dibuka_pada,
    d.closed_at as ditutup_pada,
    d.employee_name as kasir,
    d.modal_awal,
    p.penjualan_tunai,
    k.kas_masuk,
    k.kas_keluar,
    rf.refund_tunai,
    -- Persis kasSeharusnya (mobile/lib/receipt.ts):
    -- modalAwal + tunai - refundTunai + kasMasukTunai - kasKeluarTunai
    (d.modal_awal + p.penjualan_tunai - rf.refund_tunai + k.kas_masuk - k.kas_keluar)
      as kas_seharusnya,
    case when d.closed_at is null then null else d.kas_fisik end as kas_aktual,
    -- selisih_tersimpan: apa adanya dari shifts.selisih (kolom kas_aktual di
    -- atas sudah menutup kasus shift terbuka dengan null; kolom shifts.selisih
    -- sendiri juga nullable untuk sif lama sebelum V5 mobile/db/migrations.ts
    -- — TIDAK di-coalesce, null tetap null).
    d.selisih_tersimpan,
    -- selisih_hitung_server: dihitung ulang dari kas_fisik dan kas_seharusnya
    -- versi SQL, TIDAK dibaca dari shifts.selisih. Null otomatis kalau
    -- kas_fisik null (shift terbuka).
    case when d.closed_at is null then null
         else d.kas_fisik
              - (d.modal_awal + p.penjualan_tunai - rf.refund_tunai + k.kas_masuk - k.kas_keluar)
    end as selisih_hitung_server,
    case
      when d.selisih_tersimpan is null or d.closed_at is null then null
      else d.selisih_tersimpan =
           (d.kas_fisik - (d.modal_awal + p.penjualan_tunai - rf.refund_tunai + k.kas_masuk - k.kas_keluar))
    end as formula_cocok,
    (d.closed_at is null) as masih_terbuka
  from dasar d
  join penjualan p on p.shift_id = d.id
  join refund    rf on rf.shift_id = d.id
  join kas       k on k.shift_id = d.id
  order by d.opened_at desc;
$$;

-- security definer + membaca shifts/cash_movements (RLS aktif, nol policy).
-- EXECUTE default PUBLIC dicabut eksplisit sebelum grant, pola persis
-- laporan_penjualan_harian dkk di 0027 — bukan kosmetik: anon key tertanam di
-- APK, dan tanpa revoke ini anon bisa memanggil fungsi ini langsung dan
-- membaca seluruh riwayat kas tanpa lewat RLS sama sekali.
revoke all on function laporan_shift(date, date, boolean) from public, anon, authenticated;
grant execute on function laporan_shift(date, date, boolean) to service_role;


-- ============================================================ Fungsi 2

-- Daftar gabungan movement satu shift, urut waktu naik. UNION dari
-- cash_movements dan refunds — refunds TIDAK punya shift_id (keterbatasan
-- desain 0029, bukan sesuatu yang diperbaiki di sini), jadi dikaitkan lewat
-- jendela waktu shift yang sama seperti Fungsi 1.
--
-- CATATAN TIPE: parameter memakai `text`, bukan `uuid` seperti draf instruksi
-- — shifts.id bertipe `text` di 0029 ("dari device, BUKAN gen_random_uuid()"),
-- sama seperti cash_movements.id. Ini penyesuaian tipe kolom yang nyata dan
-- tanpa ambiguitas (satu-satunya tipe yang cocok dengan primary key aslinya),
-- dicatat di sini dan di laporan alih-alih diam-diam menaruh `uuid`.
create or replace function detail_kas_shift(p_shift_id text)
returns table (
  waktu         timestamptz,
  jenis         text,
  keterangan    text,
  nomor_order   uuid,
  kasir         text,
  nominal       bigint
)
language sql
security definer
set search_path = public
stable
as $$
  with batas as (
    select opened_at, coalesce(closed_at, now()) as sampai
    from shifts
    where id = p_shift_id
  )
  select
    cm.created_at as waktu,
    case cm.direction when 'in' then 'masuk' else 'keluar' end as jenis,
    cm.note as keterangan,
    null::uuid as nomor_order,
    cm.employee_name as kasir,
    case cm.direction when 'in' then cm.amount else -cm.amount end as nominal
  from cash_movements cm
  where cm.shift_id = p_shift_id
    and cm.voided_at is null

  union all

  -- SEMUA refund pada jendela ini disertakan, bukan hanya yang tunai —
  -- disengaja per instruksi: refund_tunai di Fungsi 1 hanya menghitung yang
  -- tunai untuk kas_seharusnya, tapi daftar detail ini menunjukkan semuanya,
  -- ditandai metodenya di keterangan supaya jelas mana yang benar-benar
  -- mengurangi laci fisik.
  select
    r.created_at as waktu,
    'refund' as jenis,
    trim(both ' ' from coalesce(r.reason, '') || ' (metode order: ' || coalesce(o.payment_method::text, '?') || ')')
      as keterangan,
    r.order_id as nomor_order,
    e.name as kasir,
    -r.amount as nominal
  from refunds r
  join orders o on o.id = r.order_id
  join employees e on e.id = r.employee_id
  cross join batas b
  where r.created_at >= b.opened_at
    and r.created_at < b.sampai
    and o.is_test_data = false

  order by waktu asc;
$$;

revoke all on function detail_kas_shift(text) from public, anon, authenticated;
grant execute on function detail_kas_shift(text) to service_role;


-- ============================================================ Fungsi 3

-- Refund yang created_at-nya tidak jatuh di jendela shift MANA PUN pada
-- rentang tanggal yang diminta — hilang total dari laporan per-shift kalau
-- tidak ditampilkan terpisah. Jendela WIB sama seperti Fungsi 1.
create or replace function refund_yatim(p_dari date, p_sampai date)
returns table (
  refund_id           uuid,
  nomor_order         uuid,
  waktu               timestamptz,
  nominal             bigint,
  alasan              text,
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
    r.id as refund_id,
    r.order_id as nomor_order,
    r.created_at as waktu,
    r.amount as nominal,
    r.reason as alasan,
    e.name as kasir,
    o.payment_method::text as metode_pembayaran
  from refunds r
  join orders o on o.id = r.order_id
  join employees e on e.id = r.employee_id
  cross join jendela j
  where r.created_at >= j.dari
    and r.created_at < j.sampai
    and o.is_test_data = false
    and not exists (
      select 1 from shifts s
      where r.created_at >= s.opened_at
        and r.created_at < coalesce(s.closed_at, now())
    )
  order by r.created_at asc;
$$;

revoke all on function refund_yatim(date, date) from public, anon, authenticated;
grant execute on function refund_yatim(date, date) to service_role;
