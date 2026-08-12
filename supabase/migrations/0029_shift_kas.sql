-- Shift dan kas di server — cerminan `shifts`/`cash_movements` dari
-- mobile/db/migrations.ts (V4, V5, V6), dikirim sekali saat sif SUDAH TERTUTUP.
--
-- Ini BUKAN sinkronisasi dua arah dan bukan sumber kebenaran baru: angka di sini
-- adalah SNAPSHOT yang sudah tercetak di kertas saat kasir menutup sif di
-- perangkat. Server tidak menghitung ulang lalu menimpanya — penghitungan ulang
-- versi server (kalau nanti dibutuhkan untuk rekonsiliasi silang-sif) adalah
-- fungsi agregasi terpisah, membaca orders/refunds langsung, bukan tabel ini.
--
-- Outlet tunggal: tidak ada kolom outlet_id, sama seperti keputusan yang sudah
-- berlaku di seluruh skema ini sampai ada outlet kedua sungguhan.
--
-- Mode Uji tidak menyentuh tabel ini sama sekali. is_test_data ada di orders;
-- pemfilteran data uji untuk laporan kas terjadi nanti di fungsi agregasi lewat
-- orders.is_test_data, bukan lewat kolom di shifts/cash_movements.
--
-- ============================================================ bentuk payload
--
-- push_shift menerima SATU shift beserta SELURUH cash_movements miliknya dalam
-- satu panggilan — kas tidak pernah dikirim sendirian, karena cash_movements
-- tanpa shift induknya di server adalah baris yatim yang tidak bisa direkonsiliasi.
--
-- select push_shift(p_shift := '{
--   "id": "9c3e2f2a-8b3f-4e29-9c9a-4e6a1a2b3c4d",
--   "employee_id": "b1a2c3d4-e5f6-4789-9abc-def012345678",
--   "employee_name": "Siti",
--   "modal_awal": 200000,
--   "opened_at": "2026-08-11T00:00:00.000Z",
--   "closed_at": "2026-08-11T08:00:00.000Z",
--   "label": "pagi",
--   "tunai": 1500000,
--   "non_tunai": 900000,
--   "refund": 50000,
--   "refund_tunai": 30000,
--   "pajak": 110000,
--   "kas_masuk_tunai": 0,
--   "kas_masuk_non_tunai": 0,
--   "kas_keluar_tunai": 100000,
--   "kas_keluar_non_tunai": 0,
--   "kas_fisik": 1570000,
--   "selisih": 0,
--   "transaksi_selesai": 42,
--   "transaksi_pending": 0,
--   "cash_movements": [
--     {
--       "id": "d4c3b2a1-1111-4222-8333-444455556666",
--       "shift_id": "9c3e2f2a-8b3f-4e29-9c9a-4e6a1a2b3c4d",
--       "direction": "out",
--       "method": "cash",
--       "category": "bahan",
--       "amount": 100000,
--       "note": "Beli gas 3kg",
--       "employee_id": "b1a2c3d4-e5f6-4789-9abc-def012345678",
--       "employee_name": "Siti",
--       "created_at": "2026-08-11T03:00:00.000Z",
--       "voided_at": null,
--       "reverses_id": null
--     }
--   ]
-- }'::jsonb);
--
-- ============================================================ tabel shifts
--
-- Dicek sebelum migrasi ini ditulis bahwa belum ada tabel bernama `shifts` di
-- Postgres manapun (lokal maupun hosted) — `create table if not exists` di sini
-- murni untuk membuat penerapan ulang aman, bukan penanda bahwa tabrakan nama
-- pernah ditemukan.

create table if not exists shifts (
  id                text primary key,   -- dari device, BUKAN gen_random_uuid()

  employee_id       uuid not null references employees (id),
  employee_name     text not null,      -- snapshot nama saat sif ditutup, meski ada FK

  modal_awal        bigint not null check (modal_awal >= 0),
  opened_at         timestamptz not null,
  closed_at         timestamptz not null,   -- not null di server: sif terbuka tidak pernah dikirim
  label             text check (label is null or label in ('pagi', 'sore')),

  tunai                bigint,
  non_tunai            bigint,
  refund               bigint,
  refund_tunai         bigint,
  pajak                bigint,
  kas_masuk_tunai      bigint,
  kas_masuk_non_tunai  bigint,
  kas_keluar_tunai     bigint,
  kas_keluar_non_tunai bigint,
  kas_fisik            bigint,
  selisih              bigint,

  transaksi_selesai integer,
  transaksi_pending integer,

  synced_at         timestamptz not null default now(),   -- kolom server saja, jeda kirim vs terima

  constraint shifts_closed_after_opened check (closed_at >= opened_at)
);

create index if not exists shifts_closed_at_idx on shifts (closed_at desc);


-- ============================================================ tabel cash_movements

create table if not exists cash_movements (
  id            text primary key,   -- dari device
  shift_id      text not null references shifts (id),

  direction     text not null check (direction in ('in', 'out')),
  -- text + CHECK, bukan enum: nilainya kebetulan mirip payment_method tapi
  -- maknanya berbeda (arah uang di laci, bukan cara pelanggan bayar).
  method        text not null check (method in ('cash', 'non_cash')),
  -- Konstanta di kode (mobile/db/cash.ts), bukan tabel referensi. Pasangan
  -- arah-kategori (mis. 'tambahan_modal' cuma sah untuk 'in') divalidasi di
  -- recordCashMovement, bukan di CHECK ini — aturan lintas kolom, dan server
  -- ini hanya menyimpan snapshot yang sudah lolos validasi di perangkat.
  category      text check (category is null or category in (
                  'bahan', 'ongkos_kirim', 'listrik', 'kasbon', 'setoran_pemilik',
                  'tambahan_modal', 'pengembalian_kasbon', 'lain_lain'
                )),

  amount        bigint not null check (amount > 0),
  note          text not null check (length(trim(note)) > 0),

  employee_id   uuid not null references employees (id),
  employee_name text not null,

  created_at    timestamptz not null,
  voided_at     timestamptz,
  -- Entri koreksi menunjuk entri yang dikoreksinya (mobile/db/cash.ts,
  -- reverseCashMovement). Tanpa foreign key: baris yang ditunjuknya ada di
  -- tabel yang sama dan selalu dikirim dalam payload sif yang sama, jadi
  -- integritasnya sudah dijamin push_shift menulis keduanya sekaligus.
  reverses_id   text
);

create index if not exists cash_movements_shift_idx on cash_movements (shift_id, created_at);


-- ============================================================ RLS
--
-- Aktif tanpa satu pun policy, termasuk SELECT. Ini disengaja, bukan langkah
-- yang belum selesai: satu-satunya pembaca kedua tabel ini sampai saat ini
-- adalah dashboard web, yang selalu memakai service_role (melewati RLS —
-- lihat 0001_init.sql). Satu-satunya penulis adalah push_shift di bawah, yang
-- security definer sehingga tidak bergantung pada GRANT/policy tabel sama
-- sekali. Kalau kelak ada klien yang perlu membaca lewat role authenticated
-- (mis. layar di perangkat yang menampilkan riwayat sif), policy SELECT
-- ditambahkan saat itu juga — menambahkannya sekarang, sebelum ada pembaca
-- nyata, hanya menebak predikat peran yang belum pernah dipakai di skema ini.

alter table shifts         enable row level security;
alter table cash_movements enable row level security;


-- ============================================================ RPC push_shift
--
-- Menerima satu shift beserta seluruh cash_movements miliknya. Shift yang
-- sudah masuk server tidak pernah berubah — tidak ada kolom version, tidak ada
-- jalur update. Kiriman ulang dengan payload sama harus sukses lagi tanpa
-- mengubah apa pun, itulah yang membuat "kirim ulang" aman dipencet kasir.
create or replace function push_shift(p_shift jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sender        employees%rowtype;
  v_owner         employees%rowtype;
  v_shift_id      text        := nullif(p_shift ->> 'id', '');
  v_employee_id   uuid        := nullif(p_shift ->> 'employee_id', '')::uuid;
  v_opened_at     timestamptz := nullif(p_shift ->> 'opened_at', '')::timestamptz;
  v_closed_at     timestamptz := nullif(p_shift ->> 'closed_at', '')::timestamptz;
  v_movements     jsonb       := coalesce(p_shift -> 'cash_movements', '[]'::jsonb);
  v_movement      jsonb;
  v_mov_shift_id  text;
  v_inserted      boolean;
  v_movements_in  int := 0;
begin
  if v_shift_id is null then raise exception 'SHIFT_ID_REQUIRED'; end if;

  -- Pengirim: siapa yang sedang menekan "Kirim" di perangkat.
  select * into v_sender from employees where id = (select auth.uid());
  if not found or not v_sender.active then raise exception 'EMPLOYEE_NOT_FOUND'; end if;

  -- Pemilik sif: pegawai yang tercantum sebagai pemegang sif di payload. Tidak
  -- harus sama dengan pengirim — sif Pagi wajar dikirim oleh Sore yang baru
  -- masuk, sama seperti created_by vs pengirim pada push_order.
  if v_employee_id is null then raise exception 'EMPLOYEE_NOT_FOUND'; end if;
  select * into v_owner from employees where id = v_employee_id;
  if not found then raise exception 'EMPLOYEE_NOT_FOUND'; end if;

  if v_opened_at is null then raise exception 'SHIFT_OPENED_AT_REQUIRED'; end if;
  if v_closed_at is null then raise exception 'SHIFT_NOT_CLOSED'; end if;
  if v_closed_at < v_opened_at then raise exception 'SHIFT_CLOSED_BEFORE_OPENED'; end if;

  -- Validasi shift_id tiap elemen cash_movements SEBELUM menulis apa pun, agar
  -- satu elemen yang salah alamat membatalkan seluruh transaksi, bukan
  -- menyisipkan sisanya lalu gagal separuh jalan.
  for v_movement in select * from jsonb_array_elements(v_movements) loop
    v_mov_shift_id := nullif(v_movement ->> 'shift_id', '');
    if v_mov_shift_id is null or v_mov_shift_id <> v_shift_id then
      raise exception 'CASH_MOVEMENT_SHIFT_MISMATCH';
    end if;
  end loop;

  insert into shifts (
    id, employee_id, employee_name,
    modal_awal, opened_at, closed_at, label,
    tunai, non_tunai, refund, refund_tunai, pajak,
    kas_masuk_tunai, kas_masuk_non_tunai, kas_keluar_tunai, kas_keluar_non_tunai,
    kas_fisik, selisih,
    transaksi_selesai, transaksi_pending
  ) values (
    v_shift_id, v_owner.id, p_shift ->> 'employee_name',
    coalesce(nullif(p_shift ->> 'modal_awal', '')::bigint, 0),
    v_opened_at, v_closed_at, nullif(p_shift ->> 'label', ''),
    nullif(p_shift ->> 'tunai', '')::bigint,
    nullif(p_shift ->> 'non_tunai', '')::bigint,
    nullif(p_shift ->> 'refund', '')::bigint,
    nullif(p_shift ->> 'refund_tunai', '')::bigint,
    nullif(p_shift ->> 'pajak', '')::bigint,
    nullif(p_shift ->> 'kas_masuk_tunai', '')::bigint,
    nullif(p_shift ->> 'kas_masuk_non_tunai', '')::bigint,
    nullif(p_shift ->> 'kas_keluar_tunai', '')::bigint,
    nullif(p_shift ->> 'kas_keluar_non_tunai', '')::bigint,
    nullif(p_shift ->> 'kas_fisik', '')::bigint,
    nullif(p_shift ->> 'selisih', '')::bigint,
    nullif(p_shift ->> 'transaksi_selesai', '')::int,
    nullif(p_shift ->> 'transaksi_pending', '')::int
  )
  on conflict (id) do nothing;

  v_inserted := found;

  -- id dari perangkat, tambah-saja: `do nothing` sudah cukup untuk membuat
  -- kiriman ulang aman, sama seperti void/refund pada push_order.
  for v_movement in select * from jsonb_array_elements(v_movements) loop
    insert into cash_movements (
      id, shift_id, direction, method, category, amount, note,
      employee_id, employee_name, created_at, voided_at, reverses_id
    ) values (
      v_movement ->> 'id',
      v_movement ->> 'shift_id',
      v_movement ->> 'direction',
      v_movement ->> 'method',
      nullif(v_movement ->> 'category', ''),
      (v_movement ->> 'amount')::bigint,
      v_movement ->> 'note',
      nullif(v_movement ->> 'employee_id', '')::uuid,
      v_movement ->> 'employee_name',
      (v_movement ->> 'created_at')::timestamptz,
      nullif(v_movement ->> 'voided_at', '')::timestamptz,
      nullif(v_movement ->> 'reverses_id', '')
    )
    on conflict (id) do nothing;

    if found then
      v_movements_in := v_movements_in + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'id', v_shift_id,
    'inserted', v_inserted,
    'already_existed', not v_inserted,
    'cash_movements_inserted', v_movements_in
  );
end;
$$;

revoke all on function push_shift(jsonb) from public;
grant execute on function push_shift(jsonb) to authenticated;
