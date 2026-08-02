-- Bebas pajak tanpa keterangan.
--
-- Sampai 0023, memilih "Bebas Pajak" menuntut kasir mengetik alasan. Di lapangan
-- itu berarti papan ketik naik menutupi layar pelunasan tepat sebelum tombol
-- konfirmasi ditekan, untuk sebuah kolom yang isinya nyaris selalu nama instansi
-- yang sama. Kewajiban itu dibuang.
--
-- YANG TIDAK IKUT DIBUANG: `tax_approved_by`. Menghapus keduanya sekaligus akan
-- menyisakan order bebas pajak yang tidak bisa dijawab pertanyaan "siapa yang
-- memutuskan ini tidak dipungut" — satu-satunya hal yang membuat pembebasan bisa
-- diaudit sama sekali. Penyetuju tidak pernah perlu diketik: ia adalah pegawai
-- yang sedang login, dan kedua jalur tulis di bawah sudah memegang id itu.
-- Jadi jejak auditnya bertahan dengan nol friksi di layar — yang hilang cuma
-- kolom teksnya.
--
-- Kolom `tax_exempt_reason` SENGAJA tidak di-drop. Order bebas pajak yang sudah
-- terlanjur punya keterangan tetap menyimpannya, dan constraint baru di bawah
-- membiarkannya lewat. Membuang kolomnya akan menghapus catatan yang sudah
-- benar demi keseragaman yang tidak dibutuhkan siapa pun.
--
-- Tiga tempat harus berubah bersamaan, kalau tidak order bebas pajak ditolak di
-- jalur yang belum disentuh dan kasir tidak punya cara memahami kenapa:
--   1. constraint tax_exempt_fields_consistent (0012) — penjaga terkeras,
--      berlaku untuk penulis mana pun
--   2. pay_order  (terakhir didefinisikan di 0019) — jalur aplikasi web
--   3. push_order (terakhir didefinisikan di 0023) — jalur sinkronisasi ponsel

begin;

-- ================================================ tax_exempt_fields_consistent
--
-- Cabang `else` dipertahankan apa adanya dari 0012, dan alasannya juga tidak
-- berubah: keterangan atau penyetuju yang tertinggal dari pilihan sebelumnya,
-- menempel pada order yang akhirnya DIPUNGUT pajak, adalah jejak audit yang
-- berbohong. Yang dilonggarkan hanya cabang `exempt`, dan hanya bagian
-- keterangannya.
--
-- `drop ... if exists` lalu `add` — itu yang membuat berkas ini idempoten.
-- `add constraint` sendirian gagal pada jalannya yang kedua.
alter table orders
  drop constraint if exists tax_exempt_fields_consistent;

alter table orders
  add constraint tax_exempt_fields_consistent check (
    case
      when tax_status = 'exempt'
        -- Keterangan bebas: boleh null, boleh berisi (baris lama). Penyetuju
        -- tetap wajib.
        then tax_approved_by is not null
      else tax_exempt_reason is null
           and tax_approved_by is null
    end
  );


-- ============================================================ pay_order
--
-- Salinan utuh dari 0019. Satu-satunya perubahan ada di cabang `exempt`:
-- `raise exception 'TAX_EXEMPT_REASON_REQUIRED'` dibuang, dan keterangan yang
-- kosong menjadi null alih-alih menggagalkan pelunasan.
--
-- Tanda tangannya TIDAK berubah, jadi `create or replace` aman di sini — tidak
-- ada fungsi kedua yang terbentuk. `p_tax_exempt_reason` sengaja dipertahankan
-- sebagai parameter walau tidak ada lagi yang wajib mengisinya: membuangnya
-- mengubah tanda tangan, dan setiap pemanggil yang masih mengirim enam argumen
-- akan gagal menemukan fungsinya.
create or replace function pay_order(
  p_order_id          uuid,
  p_method            payment_method,
  p_amount_received   bigint,
  p_employee_id       uuid,
  p_tax_status        tax_status default 'taxable',
  p_tax_exempt_reason text       default null
) returns uuid
language plpgsql
as $$
declare
  v_order    orders;
  v_subtotal bigint;
  v_kena     bigint;
  v_rate     int;
  v_tax      bigint;
  v_total    bigint;
  v_recv     bigint;
  v_reason   text;
  v_approver uuid;
begin
  select * into v_order from orders where id = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;

  if v_order.status = 'paid' then
    return p_order_id;
  end if;
  if v_order.status <> 'pending' then
    raise exception 'ORDER_NOT_PAYABLE';
  end if;

  -- Keduanya dihitung ulang dari order_items, jadi item yang baru ditambah atau
  -- di-void di perangkat lain tetap terhitung benar — termasuk basis pajaknya.
  select coalesce(sum(subtotal), 0),
         coalesce(sum(subtotal) filter (where taxable), 0)
  into v_subtotal, v_kena
  from order_items where order_id = p_order_id;
  if v_subtotal <= 0 then raise exception 'EMPTY_ORDER'; end if;

  select o.tax_rate_bps into v_rate
  from outlets o where o.id = v_order.outlet_id;

  if p_tax_status = 'exempt' then
    -- Keterangan opsional sejak 0026. Yang tetap dicatat adalah penyetujunya,
    -- dan itu tidak diminta dari pemanggil — ia pegawai yang melunasi.
    v_tax      := 0;
    v_reason   := nullif(btrim(coalesce(p_tax_exempt_reason, '')), '');
    v_approver := p_employee_id;
  else
    -- Order yang isinya rokok saja: v_kena = 0, jadi v_tax = 0. Itu BUKAN
    -- 'exempt' — tax_status tetap 'taxable' dan tidak ada keterangan yang
    -- diminta, karena tidak ada yang dibebaskan. Barangnya memang bukan objek
    -- pajak. Membedakan keduanya penting buat laporan: pembebasan adalah
    -- keputusan orang yang harus bisa diaudit, ini bukan.
    v_tax      := (v_kena * v_rate + 5000) / 10000;
    v_reason   := null;
    v_approver := null;
  end if;

  v_total := v_subtotal + v_tax;

  if p_method = 'cash' then
    if p_amount_received is null or p_amount_received < v_total then
      raise exception 'INSUFFICIENT_AMOUNT';
    end if;
    v_recv := p_amount_received;
  else
    v_recv := v_total;
  end if;

  update orders
  set status            = 'paid',
      subtotal          = v_subtotal,
      taxable_subtotal  = v_kena,
      tax_status        = p_tax_status,
      tax_rate_bps      = v_rate,
      tax_amount        = v_tax,
      tax_exempt_reason = v_reason,
      tax_approved_by   = v_approver,
      total             = v_total,
      paid_at           = now(),
      paid_by           = p_employee_id,
      payment_method    = p_method,
      amount_received   = v_recv,
      change_amount     = v_recv - v_total,
      version           = version + 1
  where id = p_order_id;

  insert into payments (order_id, method, amount, employee_id)
  values (p_order_id, p_method, v_total, p_employee_id);

  return p_order_id;
end;
$$;


-- ============================================================ push_order
--
-- Salinan utuh dari 0023. Satu-satunya perubahan: baris
-- `if v_reason is null then raise exception 'TAX_EXEMPT_REASON_REQUIRED'` di
-- cabang exempt dibuang. Pemeriksaan identitas penyetuju TETAP — itu justru
-- satu-satunya yang tersisa yang membuat pembebasan bisa diaudit, dan tanpanya
-- `tax_approved_by` hanyalah UUID apa pun yang ingin dikirim APK.
--
-- `create or replace`, BUKAN drop. Membuang fungsi ini akan ikut membuang
-- `grant execute ... to authenticated` di kaki 0008 dan mematikan sinkronisasi
-- seluruh ponsel.
--
-- APK LAMA: yang masih mengirim keterangan tetap diterima — keterangannya
-- disimpan apa adanya, constraint baru membiarkannya lewat. Yang belum pernah
-- bisa memilih bebas pajak sama sekali tidak terpengaruh.
create or replace function push_order(p_order jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sender     employees%rowtype;
  v_author     employees%rowtype;
  v_approver   employees%rowtype;
  v_order_id   uuid   := nullif(p_order ->> 'id', '')::uuid;
  v_items      jsonb  := coalesce(p_order -> 'items',  '[]'::jsonb);
  v_voids      jsonb  := coalesce(p_order -> 'voids',  '[]'::jsonb);
  v_payment    jsonb  := p_order -> 'payment';
  v_status     order_status;
  v_method     payment_method := nullif(p_order ->> 'payment_method', '')::payment_method;
  v_received   bigint := nullif(p_order ->> 'amount_received', '')::bigint;
  v_change     bigint := nullif(p_order ->> 'change_amount', '')::bigint;
  v_total      bigint := coalesce(nullif(p_order ->> 'total', '')::bigint, 0);
  v_version    int    := coalesce(nullif(p_order ->> 'version', '')::int, 1);
  -- Tanpa bidang pajak (APK lama), subtotal jatuh ke total dan tarifnya 0.
  v_subtotal   bigint := coalesce(nullif(p_order ->> 'subtotal', '')::bigint,
                                  nullif(p_order ->> 'total', '')::bigint, 0);
  -- Tanpa `taxable_subtotal` (APK sebelum 0019), basisnya seluruh subtotal —
  -- perilaku lama, dan konsisten dengan item yang juga tidak menyebut `taxable`.
  v_kena       bigint := coalesce(nullif(p_order ->> 'taxable_subtotal', '')::bigint,
                                  nullif(p_order ->> 'subtotal', '')::bigint,
                                  nullif(p_order ->> 'total', '')::bigint, 0);
  v_kena_calc  bigint;
  v_tax_status tax_status := coalesce(nullif(p_order ->> 'tax_status', '')::tax_status,
                                      'taxable');
  v_rate       int    := coalesce(nullif(p_order ->> 'tax_rate_bps', '')::int, 0);
  v_tax        bigint := coalesce(nullif(p_order ->> 'tax_amount', '')::bigint, 0);
  v_reason     text   := nullif(btrim(coalesce(p_order ->> 'tax_exempt_reason', '')), '');
  v_approved_by uuid  := nullif(p_order ->> 'tax_approved_by', '')::uuid;
  v_computed   bigint;
  v_item       jsonb;
  v_updated    boolean := false;
  v_refunds    jsonb  := coalesce(p_order -> 'refunds', '[]'::jsonb);
  v_refund     jsonb;
  v_tax_ref    bigint;
  v_stored     order_status;
  -- Penulisan ulang item hanya untuk order yang belum lunas di server. Lihat
  -- alasannya di kepala 0023.
  v_rewrite_items boolean := true;
  -- Tanpa bidang ini (APK sebelum 0023), order dianggap biasa — sama dengan
  -- default kolomnya.
  v_is_test    boolean := coalesce((p_order ->> 'is_test_data')::boolean, false);
  v_test_why   text    := nullif(btrim(coalesce(p_order ->> 'test_mode_reason', '')), '');
begin
  if v_order_id is null then raise exception 'ORDER_ID_REQUIRED'; end if;

  select * into v_sender from employees where id = (select auth.uid());
  if not found or not v_sender.active then raise exception 'EMPLOYEE_NOT_FOUND'; end if;

  -- Penulisnya boleh berbeda dari pengirimnya. Order yang belum terkirim
  -- bertahan melewati pergantian shift, jadi order buatan Pagi wajar dikirim
  -- saat Sore yang sedang masuk. Yang dijaga hanya: penulisnya pegawai nyata
  -- di outlet yang sama dengan pengirim.
  select * into v_author from employees
  where id = nullif(p_order ->> 'created_by', '')::uuid;
  if not found then raise exception 'EMPLOYEE_NOT_FOUND'; end if;
  if v_author.outlet_id <> v_sender.outlet_id then raise exception 'OUTLET_MISMATCH'; end if;

  v_status := coalesce(nullif(p_order ->> 'status', '')::order_status, 'pending');

  -- Uang tidak pernah dipercayakan pada perangkat. Dijalankan sebelum
  -- percabangan supaya jalur pembaruan dijaga sama ketatnya dengan penyisipan.
  select coalesce(sum((i ->> 'quantity')::int * (i ->> 'unit_price')::bigint), 0)
  into v_computed
  from jsonb_array_elements(v_items) as i;

  -- Namanya ITEM_SUM_MISMATCH, bukan SUBTOTAL_MISMATCH, dan itu bukan selera.
  -- translateRpcError mencocokkan dengan message.includes(kode) menurut urutan
  -- Object.entries, jadi kode yang menjadi substring kode lain akan tertangkap
  -- entri yang salah dan kasir membaca kalimat yang keliru — diam-diam,
  -- selamanya. "TOTAL_MISMATCH" adalah substring dari "SUBTOTAL_MISMATCH".
  if v_computed <> v_subtotal then raise exception 'ITEM_SUM_MISMATCH'; end if;

  -- Basis pajak diperiksa dengan cara yang sama seperti subtotal: dijumlahkan
  -- ulang dari itemnya, tidak dipercaya begitu saja. `coalesce(taxable, true)`
  -- membuat kiriman APK lama — yang itemnya tidak menyebut `taxable` sama
  -- sekali — menghasilkan v_kena_calc = v_subtotal, cocok dengan v_kena yang
  -- juga jatuh ke subtotal. Lolos, dan memang seharusnya lolos.
  --
  -- Kodenya TAXABLE_SUM_MISMATCH, bukan TAX_SUM_MISMATCH: lihat catatan pada
  -- ITEM_SUM_MISMATCH di atas soal kode yang jadi substring kode lain.
  -- "TAX_MISMATCH" adalah substring dari "TAX_SUM_MISMATCH".
  select coalesce(sum((i ->> 'quantity')::int * (i ->> 'unit_price')::bigint), 0)
  into v_kena_calc
  from jsonb_array_elements(v_items) as i
  where coalesce((i ->> 'taxable')::boolean, true);

  if v_kena_calc <> v_kena then raise exception 'TAXABLE_SUM_MISMATCH'; end if;
  if v_kena > v_subtotal then raise exception 'TAXABLE_SUM_MISMATCH'; end if;

  if v_rate < 0 or v_rate > 10000 then raise exception 'TAX_RATE_INVALID'; end if;

  if v_tax_status = 'exempt' then
    if v_tax <> 0 then raise exception 'TAX_MISMATCH'; end if;

    -- Keterangan tidak lagi diwajibkan (0026). Yang tersisa justru penjagaan
    -- yang benar-benar menopang jejak auditnya: penyetuju pembebasan wajib
    -- pegawai nyata di outlet yang sama, persis seperti created_by di atas.
    -- Identitas adalah satu-satunya hal yang jalur ini memang menegakkan.
    select * into v_approver from employees where id = v_approved_by;
    if not found then raise exception 'EMPLOYEE_NOT_FOUND'; end if;
    if v_approver.outlet_id <> v_sender.outlet_id then raise exception 'OUTLET_MISMATCH'; end if;
  else
    -- Basisnya v_kena, bukan v_subtotal. Ini satu-satunya baris di fungsi ini
    -- yang benar-benar mengubah berapa pajak yang dianggap sah.
    if v_tax <> (v_kena * v_rate + 5000) / 10000 then raise exception 'TAX_MISMATCH'; end if;
    -- Keterangan dan penyetuju yang tertinggal dari pilihan sebelumnya dibuang,
    -- bukan ditolak: constraint tax_exempt_fields_consistent menuntut keduanya
    -- null pada order kena pajak, dan menolak kiriman karena sisa data yang
    -- tidak berbahaya hanya akan memacetkan antrean.
    v_reason      := null;
    v_approved_by := null;
  end if;

  if v_total <> v_subtotal + v_tax then raise exception 'TOTAL_MISMATCH'; end if;

  if v_method = 'cash' and (v_received is null
      or v_received < v_total
      or v_change is distinct from v_received - v_total) then
    raise exception 'INSUFFICIENT_AMOUNT';
  end if;

  -- Celah lama yang kini berbentuk 10%: payments.amount selama ini masuk apa
  -- adanya dari perangkat, tanpa satu pun pemeriksaan. payments adalah tabel
  -- yang akan dibaca laporan rekonsiliasi laci kelak, jadi selisihnya harus
  -- tertangkap di sini, bukan ditemukan berbulan-bulan kemudian.
  if v_payment is not null and v_payment <> 'null'::jsonb
     and coalesce(nullif(v_payment ->> 'amount', '')::bigint, -1) <> v_total then
    raise exception 'PAYMENT_AMOUNT_MISMATCH';
  end if;

  -- Alasan uji WAJIB. Constraint test_data_reason di 0022 menegakkannya juga,
  -- jadi baris ini bukan satu-satunya penjaga — ia yang menentukan APA YANG
  -- TERBACA. Pesan push_order masuk apa adanya ke orders.sync_error dan
  -- ditampilkan ke kasir di layar Order; tanpa baris ini yang muncul di sana
  -- adalah teks constraint Postgres mentah-mentah.
  --
  -- Kodenya TEST_REASON_REQUIRED, bukan TEST_DATA_REASON: lihat catatan pada
  -- ITEM_SUM_MISMATCH di atas soal kode yang menjadi substring kode lain.
  if v_is_test then
    if v_test_why is null then raise exception 'TEST_REASON_REQUIRED'; end if;
  else
    -- Alasan yang tertinggal dari pilihan sebelumnya dibuang, bukan ditolak —
    -- pola yang sama dengan tax_exempt_reason di atas.
    v_test_why := null;
  end if;

  insert into orders (
    id, outlet_id, table_code, table_seq, status, subtotal, taxable_subtotal, total, version,
    tax_status, tax_rate_bps, tax_amount, tax_exempt_reason, tax_approved_by,
    created_by, paid_by, voided_by,
    payment_method, amount_received, change_amount,
    created_at, client_created_at, paid_at, voided_at, void_reason,
    is_test_data, test_mode_reason
  ) values (
    v_order_id,
    v_author.outlet_id,
    p_order ->> 'table_code',
    coalesce(nullif(p_order ->> 'table_seq', '')::int, 1),
    v_status,
    v_subtotal,
    v_kena,
    v_total,
    v_version,
    v_tax_status,
    v_rate,
    v_tax,
    v_reason,
    v_approved_by,
    v_author.id,
    nullif(p_order ->> 'paid_by', '')::uuid,
    nullif(p_order ->> 'voided_by', '')::uuid,
    v_method,
    v_received,
    v_change,
    coalesce(nullif(p_order ->> 'created_at', '')::timestamptz, now()),
    nullif(p_order ->> 'client_created_at', '')::timestamptz,
    nullif(p_order ->> 'paid_at', '')::timestamptz,
    nullif(p_order ->> 'voided_at', '')::timestamptz,
    nullif(btrim(coalesce(p_order ->> 'void_reason', '')), ''),
    -- Ditetapkan sekali, di sini saja. Cabang pembaruan di bawah sengaja tidak
    -- menyentuh keduanya — lihat kepala 0023.
    v_is_test,
    v_test_why
  )
  on conflict (id) do nothing;

  if not found then
    -- Status yang tersimpan dibaca SEBELUM pembaruan menimpanya. Sesudahnya,
    -- status di baris itu sudah menjadi status kiriman dan tidak bisa lagi
    -- menjawab pertanyaan "apakah order ini sudah lunas sebelum kiriman ini".
    select status into v_stored from orders where id = v_order_id;
    v_rewrite_items := v_stored is distinct from 'paid';

    -- Id sudah ada. Kiriman ini pembaruan hanya kalau versinya lebih tinggi.
    -- outlet_id, created_by, created_at, is_test_data, dan test_mode_reason
    -- sengaja TIDAK ikut diperbarui:
    -- kepemilikan dan waktu lahir order ditetapkan sekali, dan membiarkan
    -- perangkat menulis ulang keduanya lewat pintu ini membuka celah yang
    -- justru ditutup fungsi security definer ini.
    update orders set
      table_code        = p_order ->> 'table_code',
      table_seq         = coalesce(nullif(p_order ->> 'table_seq', '')::int, table_seq),
      status            = v_status,
      subtotal          = v_subtotal,
      taxable_subtotal  = v_kena,
      total             = v_total,
      version           = v_version,
      tax_status        = v_tax_status,
      tax_rate_bps      = v_rate,
      tax_amount        = v_tax,
      tax_exempt_reason = v_reason,
      tax_approved_by   = v_approved_by,
      paid_by           = nullif(p_order ->> 'paid_by', '')::uuid,
      voided_by         = nullif(p_order ->> 'voided_by', '')::uuid,
      payment_method    = v_method,
      amount_received   = v_received,
      change_amount     = v_change,
      paid_at           = nullif(p_order ->> 'paid_at', '')::timestamptz,
      voided_at         = nullif(p_order ->> 'voided_at', '')::timestamptz,
      void_reason       = nullif(btrim(coalesce(p_order ->> 'void_reason', '')), '')
    where id = v_order_id
      and version < v_version;

    if not found then
      -- Versi sama atau lebih rendah: ulangan sungguhan, atau kiriman basi yang
      -- sudah didahului. Jawabannya sukses tanpa menulis — itulah yang membuat
      -- "Kirim ulang" aman.
      return jsonb_build_object(
        'order_id', v_order_id, 'inserted', false, 'updated', false
      );
    end if;

    v_updated := true;

    -- Item ditulis ulang seluruhnya, bukan disisipkan yang kurang. Void di
    -- perangkat MENGHAPUS baris order_items atau mengurangi jumlahnya
    -- (mobile/db/orders.ts), jadi penyisipan saja akan meninggalkan item yang
    -- sudah dibatalkan tetap hidup di server dan totalnya tidak lagi cocok
    -- dengan jumlah itemnya sendiri.
    --
    -- refund_items.order_item_id menunjuk order_items TANPA cascade, jadi
    -- penghapusan ini akan ditolak foreign key untuk order yang pernah
    -- di-refund. Penjaganya bukan penambalan atas refund — order lunas memang
    -- tidak boleh berubah isinya.
    if v_rewrite_items then
      delete from order_items where order_id = v_order_id;
    end if;
  end if;

  -- id item ikut dari perangkat, jadi struktur order tetap sama persis dengan
  -- yang dilihat kasir. product_id boleh null: produk bisa dihapus kelak, dan
  -- kolom snapshot-lah yang menjaga struk lama tetap benar.
  for v_item in
    select * from jsonb_array_elements(v_items) where v_rewrite_items
  loop
    insert into order_items (
      id, order_id, product_id, product_code, product_name,
      quantity, unit_price, notes, taxable
    ) values (
      coalesce(nullif(v_item ->> 'id', '')::uuid, gen_random_uuid()),
      v_order_id,
      nullif(v_item ->> 'product_id', '')::uuid,
      v_item ->> 'product_code',
      v_item ->> 'product_name',
      (v_item ->> 'quantity')::int,
      (v_item ->> 'unit_price')::bigint,
      coalesce(v_item ->> 'notes', ''),
      -- Snapshot, sama seperti product_name di sebelahnya: yang berlaku adalah
      -- keadaan kategori saat transaksi, bukan saat kiriman ini sampai.
      coalesce((v_item ->> 'taxable')::boolean, true)
    );
  end loop;

  -- Void bersifat tambah-saja dan id-nya dari perangkat, jadi `do nothing`
  -- sudah cukup: yang sudah ada dibiarkan, yang baru masuk.
  for v_item in select * from jsonb_array_elements(v_voids) loop
    insert into order_item_voids (
      id, order_id, product_code, product_name,
      quantity, unit_price, voided_by, reason, created_at
    ) values (
      coalesce(nullif(v_item ->> 'id', '')::uuid, gen_random_uuid()),
      v_order_id,
      v_item ->> 'product_code',
      v_item ->> 'product_name',
      (v_item ->> 'quantity')::int,
      (v_item ->> 'unit_price')::bigint,
      nullif(v_item ->> 'voided_by', '')::uuid,
      nullif(btrim(coalesce(v_item ->> 'reason', '')), ''),
      coalesce(nullif(v_item ->> 'created_at', '')::timestamptz, now())
    )
    on conflict (id) do nothing;
  end loop;

  -- Satu order satu pembayaran dalam rancangan ini, jadi syaratnya keberadaan
  -- baris untuk order tersebut — bukan id-nya. Perangkat yang mengirim ulang
  -- dengan id pembayaran baru tidak boleh menghasilkan dua baris uang masuk.
  if v_payment is not null and v_payment <> 'null'::jsonb
     and not exists (select 1 from payments where order_id = v_order_id) then
    insert into payments (id, order_id, method, amount, employee_id, created_at)
    values (
      coalesce(nullif(v_payment ->> 'id', '')::uuid, gen_random_uuid()),
      v_order_id,
      (v_payment ->> 'method')::payment_method,
      (v_payment ->> 'amount')::bigint,
      nullif(v_payment ->> 'employee_id', '')::uuid,
      coalesce(nullif(v_payment ->> 'created_at', '')::timestamptz, now())
    );
  end if;

  -- ========================================================== refund
  --
  -- Tambah-saja dan id-nya dari perangkat, jadi `do nothing` sudah cukup —
  -- pola yang sama dengan void. Ini yang membuat "Kirim ulang" tidak pernah
  -- menggandakan uang keluar.
  for v_refund in select * from jsonb_array_elements(v_refunds) loop
    -- Kasirnya harus pegawai nyata di outlet yang sama, sama ketatnya dengan
    -- created_by dan tax_approved_by. Tanpa ini, "siapa yang mengembalikan uang
    -- ini" hanyalah UUID apa pun yang ingin dikirim APK.
    select * into v_approver from employees
    where id = nullif(v_refund ->> 'employee_id', '')::uuid;
    if not found then raise exception 'EMPLOYEE_NOT_FOUND'; end if;
    if v_approver.outlet_id <> v_sender.outlet_id then
      raise exception 'OUTLET_MISMATCH';
    end if;

    -- Aritmetika internal. Uang tidak pernah dipercayakan pada perangkat, dan
    -- refund_arithmetic di 0016 hanya menjaga amount = subtotal + tax_amount —
    -- ia tidak tahu apa-apa tentang daftar itemnya.
    select coalesce(sum((i ->> 'quantity')::int * (i ->> 'unit_price')::bigint), 0)
    into v_computed
    from jsonb_array_elements(coalesce(v_refund -> 'items', '[]'::jsonb)) as i;

    if v_computed <> coalesce(nullif(v_refund ->> 'subtotal', '')::bigint, -1)
       or coalesce(nullif(v_refund ->> 'amount', '')::bigint, -1)
          <> v_computed + coalesce(nullif(v_refund ->> 'tax_amount', '')::bigint, 0)
    then
      raise exception 'REFUND_MISMATCH';
    end if;

    insert into refunds (
      id, order_id, amount, reason, employee_id, subtotal, tax_amount, created_at
    ) values (
      coalesce(nullif(v_refund ->> 'id', '')::uuid, gen_random_uuid()),
      v_order_id,
      (v_refund ->> 'amount')::bigint,
      nullif(btrim(coalesce(v_refund ->> 'reason', '')), ''),
      v_approver.id,
      (v_refund ->> 'subtotal')::bigint,
      coalesce(nullif(v_refund ->> 'tax_amount', '')::bigint, 0),
      coalesce(nullif(v_refund ->> 'created_at', '')::timestamptz, now())
    )
    on conflict (id) do nothing;

    if found then
      insert into refund_items (
        id, refund_id, order_item_id, product_name, quantity, unit_price
      )
      select
        coalesce(nullif(i ->> 'id', '')::uuid, gen_random_uuid()),
        (v_refund ->> 'id')::uuid,
        nullif(i ->> 'order_item_id', '')::uuid,
        i ->> 'product_name',
        (i ->> 'quantity')::int,
        (i ->> 'unit_price')::bigint
      from jsonb_array_elements(coalesce(v_refund -> 'items', '[]'::jsonb)) as i;
    end if;
  end loop;

  -- Batas kumulatif, diperiksa sekali setelah semuanya masuk. Berapa pun urutan
  -- kiriman dan berapa kali pun diulang, uang yang keluar tidak boleh melebihi
  -- yang pernah masuk. Ini penjagaan yang benar-benar melindungi uang; lihat
  -- kepala 0023 untuk kenapa pajak tiap refund tidak dihitung ulang di sini.
  if jsonb_array_length(v_refunds) > 0 then
    select coalesce(sum(subtotal), 0), coalesce(sum(tax_amount), 0)
    into v_computed, v_tax_ref
    from refunds where order_id = v_order_id;

    if v_computed > v_subtotal or v_computed + v_tax_ref > v_total then
      raise exception 'REFUND_EXCEEDS_ORDER';
    end if;
  end if;

  return jsonb_build_object(
    'order_id', v_order_id,
    'inserted', not v_updated,
    'updated', v_updated
  );
end;
$$;

-- Diulang apa adanya dari 0023. `create or replace` mempertahankan grant, jadi
-- baris ini sebetulnya tidak mengubah apa pun pada basis data yang sudah punya
-- 0008 — ia ada supaya berkas ini tetap benar kalau dijalankan pada basis data
-- yang urutannya pernah terganggu.
revoke all on function push_order(jsonb) from public;
grant execute on function push_order(jsonb) to authenticated;

commit;
