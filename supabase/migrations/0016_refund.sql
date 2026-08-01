-- Refund — pengembalian uang atas order yang SUDAH lunas.
--
-- Sampai migrasi ini, tidak ada satu pun cara memperbaiki transaksi lunas:
-- void_order_item menolak apa pun yang statusnya bukan 'pending', jadi begitu
-- kasir menekan Pelunasan, kesalahan apa pun terkunci selamanya. Tabel refunds
-- dan refund_items sudah ada sejak 0001_init.sql, kosong, dan belum pernah
-- ditulis siapa pun. Migrasi ini yang memakainya.
--
-- REFUND BUKAN VOID, dan keduanya sengaja tidak digabung:
--
--   void   — pembatalan SEBELUM uang berpindah. order_item_voids, status 'void'.
--   refund — uang sudah diterima lalu dikembalikan. refunds + refund_items.
--
-- ORDER LUNAS TIDAK PERNAH DIUBAH. Godaan terbesarnya adalah mengurangi
-- orders.subtotal/tax_amount/total saat direfund. Jangan: `total` adalah yang
-- ditagihkan dan sudah dibayar, dan struk yang sudah keluar mencetak angka itu.
-- Menguranginya membuat sistem tidak lagi cocok dengan kertas yang dipegang
-- pelanggan, dan membuat payments.amount — yang oleh push_order divalidasi
-- harus sama dengan total — ikut jadi bohong. Refund adalah baris baru, bukan
-- koreksi baris lama. Omzet bersih = orders.total - sum(refunds.amount).
--
-- Status order tetap 'paid'. Enum order_status tidak ditambah nilai baru: itu
-- perubahan tipe yang menyentuh setiap pembaca status di dua aplikasi demi satu
-- label. Badge "Diretur" dihitung di tampilan dari ada-tidaknya baris refund.

begin;

-- ============================================================ kolom
--
-- refunds sudah punya id, order_id, amount, reason, employee_id, created_at.
-- Yang kurang adalah pemisahan uangnya: laporan pajak daerah harus tahu berapa
-- dari refund itu pokok dan berapa pajak, dan menghitungnya ulang belakangan
-- dari proporsi akan menghasilkan angka yang berbeda dengan yang benar-benar
-- dikembalikan ke tangan pelanggan.
alter table refunds
  add column if not exists subtotal   bigint not null default 0 check (subtotal >= 0),
  add column if not exists tax_amount bigint not null default 0 check (tax_amount >= 0);

-- Sama seperti tax_arithmetic di 0012: dijaga constraint, bukan konvensi, jadi
-- basis data secara fisik tidak bisa menyimpan refund yang tidak menjumlah.
-- Karena constraint ini berlaku sejak baris pertama ditulis, create_refund di
-- bawah baru menyisipkan barisnya SETELAH seluruh angkanya lengkap — tidak ada
-- baris sementara ber-amount palsu.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'refund_arithmetic'
  ) then
    alter table refunds add constraint refund_arithmetic
      check (amount = subtotal + tax_amount);
  end if;
end;
$$;

-- refund_items tidak berubah: product_name, quantity, unit_price sudah
-- di-snapshot dan amount sudah kolom generated, persis pola order_items.

-- ============================================================ pajak refund
--
-- Fungsinya sendiri karena push_order (0017) menerapkan aturan yang sama persis
-- atas refund yang dihitung perangkat saat offline. Dua penulis, satu rumus —
-- pola yang sama dengan tax_arithmetic.
--
-- Tarifnya adalah tarif SNAPSHOT milik order itu, bukan tarif outlet hari ini:
-- refund atas transaksi bulan lalu harus memakai tarif yang berlaku saat
-- transaksinya terjadi, bukan tarif perda yang baru.
--
-- Cabang kedua wajib, dan tidak akan terlihat sampai ia salah: kalau refund ini
-- menghabiskan seluruh subtotal order, pajak yang dikembalikan adalah SISA
-- tax_amount, bukan hasil rumus. Tanpa itu, refund yang dipecah dua bisa
-- menyisakan pajak satu-dua rupiah yang tidak pernah bisa dikembalikan dan
-- tidak pernah bisa dijelaskan ke siapa pun.
create or replace function hitung_pajak_refund(
  p_tax_status text,
  p_order_subtotal bigint,
  p_order_tax      bigint,
  p_rate_bps       int,
  p_subtotal       bigint,
  p_sudah_sub      bigint,
  p_sudah_tax      bigint
) returns bigint
language sql
immutable
as $$
  select case
    when p_tax_status = 'exempt' then 0
    when p_sudah_sub + p_subtotal >= p_order_subtotal
      then p_order_tax - p_sudah_tax
    -- Pembagian bilangan bulat, memotong ke bawah. Sama persis dengan
    -- Math.floor((subtotal * rateBps + 5000) / 10000) di lib/tax.ts.
    else (p_subtotal * p_rate_bps + 5000) / 10000
  end;
$$;

-- ============================================================ create_refund
--
-- Dipakai aplikasi web (langsung) dan aturannya divalidasi ulang oleh
-- push_order untuk refund yang datang dari ponsel.
--
-- p_items berbentuk [{"order_item_id": uuid, "quantity": int}, ...]. Harga
-- TIDAK diterima dari pemanggil — diambil dari order_items. Aturan "harga
-- selalu dari server" di AGENTS.md berlaku sama untuk uang yang keluar.
create or replace function create_refund(
  p_order_id    uuid,
  p_employee_id uuid,
  p_reason      text,
  p_items       jsonb
) returns uuid
language plpgsql
as $$
declare
  v_order     orders;
  v_refund_id uuid;
  v_subtotal  bigint := 0;
  v_tax       bigint;
  v_sudah_sub bigint;
  v_sudah_tax bigint;
  v_asing     int;
  v_salah     int;
begin
  select * into v_order from orders where id = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if v_order.status <> 'paid' then raise exception 'REFUND_NOT_ALLOWED'; end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'REFUND_EMPTY';
  end if;

  -- Baris dijumlahkan per item lebih dulu (group by di CTE `input`). Payload
  -- yang menyebut item yang sama dua kali harus dinilai sebagai satu
  -- permintaan; kalau tidak, masing-masing baris melihat sisa yang sama dan
  -- keduanya lolos.
  --
  -- Tanpa tabel sementara: temp table di dalam fungsi RPC hidup sepanjang sesi,
  -- dan sesi di balik connection pooler Supabase dipakai bergantian oleh
  -- permintaan yang tidak saling kenal.
  with input as (
    select (e->>'order_item_id')::uuid as item_id,
           sum((e->>'quantity')::int)  as qty
    from jsonb_array_elements(p_items) e
    group by 1
  ),
  -- left join, bukan join: baris yang bukan milik order ini harus TERLIHAT
  -- sebagai baris ber-unit_price null, bukan hilang tanpa jejak.
  joined as (
    select i.item_id, i.qty, oi.unit_price, oi.quantity as dipesan
    from input i
    left join order_items oi
      on oi.id = i.item_id and oi.order_id = p_order_id
  ),
  sudah as (
    select ri.order_item_id, sum(ri.quantity) as qty
    from refund_items ri
    join refunds r on r.id = ri.refund_id
    where r.order_id = p_order_id
    group by 1
  )
  select
    count(*) filter (where j.unit_price is null),
    -- Sisa yang boleh direfund: jumlah item dikurangi yang sudah pernah
    -- direfund. Tanpa ini satu item bisa dikembalikan berkali-kali dan uang
    -- keluar melebihi yang pernah masuk.
    count(*) filter (
      where j.unit_price is not null
        and (j.qty is null or j.qty <= 0
             or j.qty > j.dipesan - coalesce(s.qty, 0))
    ),
    coalesce(sum(j.qty * j.unit_price), 0)
  into v_asing, v_salah, v_subtotal
  from joined j
  left join sudah s on s.order_item_id = j.item_id;

  if v_asing > 0 then raise exception 'REFUND_LINE_UNKNOWN'; end if;
  if v_salah > 0 then raise exception 'REFUND_QUANTITY_INVALID'; end if;

  select coalesce(sum(subtotal), 0), coalesce(sum(tax_amount), 0)
  into v_sudah_sub, v_sudah_tax
  from refunds where order_id = p_order_id;

  v_tax := hitung_pajak_refund(
    v_order.tax_status::text, v_order.subtotal, v_order.tax_amount,
    v_order.tax_rate_bps, v_subtotal, v_sudah_sub, v_sudah_tax
  );

  if v_sudah_sub + v_subtotal > v_order.subtotal
     or v_sudah_sub + v_sudah_tax + v_subtotal + v_tax > v_order.total then
    raise exception 'REFUND_EXCEEDS_ORDER';
  end if;

  insert into refunds (order_id, amount, reason, employee_id, subtotal, tax_amount)
  values (p_order_id, v_subtotal + v_tax,
          nullif(btrim(coalesce(p_reason, '')), ''), p_employee_id,
          v_subtotal, v_tax)
  returning id into v_refund_id;

  -- Nama produk di-snapshot dari order_items, sama seperti order_items sendiri
  -- men-snapshot dari products: mengganti nama menu tidak boleh mengubah bunyi
  -- catatan refund yang sudah terjadi.
  insert into refund_items
    (refund_id, order_item_id, product_name, quantity, unit_price)
  select v_refund_id, oi.id, oi.product_name, i.qty, oi.unit_price
  from (
    select (e->>'order_item_id')::uuid as item_id,
           sum((e->>'quantity')::int)  as qty
    from jsonb_array_elements(p_items) e
    group by 1
  ) i
  join order_items oi on oi.id = i.item_id and oi.order_id = p_order_id;

  return v_refund_id;
end;
$$;

commit;
