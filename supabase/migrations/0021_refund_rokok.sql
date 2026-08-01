-- Rokok bebas PBJT — refund.
--
-- Tanpa berkas ini, mengembalikan sebungkus rokok akan mengembalikan pajak yang
-- tidak pernah dipungut atasnya. `hitung_pajak_refund` di 0016 menghitung
-- pajaknya dari SELURUH subtotal refund, dan sesudah 0019 itu tidak lagi benar.
-- Kesalahannya kecil per transaksi dan searah — uang keluar lebih banyak dari
-- yang masuk — jadi ia tidak akan pernah menimbulkan error, hanya selisih laci
-- yang tidak bisa dijelaskan.
--
-- Dua perubahan, dan yang kedua adalah yang menuntut berkas ini ada:
--
--   1. `hitung_pajak_refund` menerima basis kena pajak refund ini, terpisah
--      dari subtotalnya.
--   2. `create_refund` menghitung basis itu dari `order_items.taxable`.
--
-- ============================================================================
-- KENAPA CABANG "HABIS" TETAP DIUKUR DENGAN SUBTOTAL, BUKAN BASIS KENA PAJAK
-- ============================================================================
--
-- Cabang kedua di 0016 mengembalikan SISA tax_amount begitu refund menghabiskan
-- order, supaya pembulatan tidak menyisakan rupiah yang terjebak. Ukurannya
-- tetap `subtotal`, bukan `taxable_subtotal`, dan itu disengaja: yang ingin
-- dijawab adalah "apakah seluruh order sudah dikembalikan", dan order baru
-- habis kalau semua barangnya kembali — termasuk rokoknya. Memakai basis kena
-- pajak akan menyatakan order habis begitu bagian makanannya dikembalikan,
-- lalu mengembalikan seluruh sisa pajak sementara rokoknya masih di tangan
-- pelanggan. Itu bukan pembulatan yang salah, itu uang yang salah.
--
-- Order yang isinya rokok saja: taxable_subtotal = 0 dan tax_amount = 0, jadi
-- kedua cabang menghasilkan 0. Benar tanpa perlakuan khusus.

begin;

-- ============================================ hitung_pajak_refund
--
-- WAJIB DROP, BUKAN `create or replace`. Postgres meng-overload berdasarkan
-- tipe argumen, jadi menambah satu parameter lewat `create or replace` hanya
-- membuat fungsi KEDUA — dan versi tujuh-argumen yang lama tetap bisa dipanggil,
-- terus mengembalikan pajak atas rokok tanpa satu pun keluhan. Jebakan yang
-- sama persis dengan pay_order di 0013; tanda tangannya ditulis lengkap supaya
-- perintah ini idempoten.
drop function if exists hitung_pajak_refund(text, bigint, bigint, int, bigint, bigint, bigint);

create or replace function hitung_pajak_refund(
  p_tax_status     text,
  p_order_subtotal bigint,
  p_order_tax      bigint,
  p_rate_bps       int,
  p_subtotal       bigint,   -- seluruh nilai barang yang dikembalikan
  p_kena           bigint,   -- bagiannya yang objek pajak
  p_sudah_sub      bigint,
  p_sudah_tax      bigint
) returns bigint
language sql
immutable
as $$
  select case
    when p_tax_status = 'exempt' then 0
    -- Habis diukur dengan subtotal. Lihat kepala berkas.
    when p_sudah_sub + p_subtotal >= p_order_subtotal
      then p_order_tax - p_sudah_tax
    -- Pembagian bilangan bulat, memotong ke bawah. Sama persis dengan
    -- Math.floor((subtotal * rateBps + 5000) / 10000) di lib/tax.ts.
    else (p_kena * p_rate_bps + 5000) / 10000
  end;
$$;


-- ============================================================ create_refund
--
-- Disalin utuh dari 0016, termasuk komentarnya, dengan TIGA baris berubah:
-- `joined` ikut membawa oi.taxable, v_kena dijumlahkan darinya, dan v_kena
-- diteruskan ke hitung_pajak_refund. Sisanya sengaja tidak disentuh supaya
-- perbedaannya bisa dibaca dengan `diff` terhadap 0016.
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
  v_kena      bigint := 0;
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
    select i.item_id, i.qty, oi.unit_price, oi.quantity as dipesan, oi.taxable
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
    coalesce(sum(j.qty * j.unit_price), 0),
    -- Baris asing punya taxable null (left join gagal), jadi filter ini
    -- mengeluarkannya — tapi itu tidak menyembunyikan apa pun: v_asing di atas
    -- sudah menghitungnya dan REFUND_LINE_UNKNOWN dilempar sebelum v_kena dipakai.
    coalesce(sum(j.qty * j.unit_price) filter (where j.taxable), 0)
  into v_asing, v_salah, v_subtotal, v_kena
  from joined j
  left join sudah s on s.order_item_id = j.item_id;

  if v_asing > 0 then raise exception 'REFUND_LINE_UNKNOWN'; end if;
  if v_salah > 0 then raise exception 'REFUND_QUANTITY_INVALID'; end if;

  select coalesce(sum(subtotal), 0), coalesce(sum(tax_amount), 0)
  into v_sudah_sub, v_sudah_tax
  from refunds where order_id = p_order_id;

  v_tax := hitung_pajak_refund(
    v_order.tax_status::text, v_order.subtotal, v_order.tax_amount,
    v_order.tax_rate_bps, v_subtotal, v_kena, v_sudah_sub, v_sudah_tax
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
