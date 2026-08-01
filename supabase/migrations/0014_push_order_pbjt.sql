-- PBJT — antrean kirim dari ponsel.
--
-- `create or replace`, BUKAN drop. Membuang fungsi ini akan ikut membuang
-- `grant execute ... to authenticated` di kaki 0008 dan mematikan sinkronisasi
-- seluruh ponsel. (pay_order di 0013 memang di-drop, tapi itu karena tanda
-- tangannya berubah dan ia tidak punya grant yang perlu dijaga.)
--
-- ============================================================================
-- KENAPA SERVER TIDAK MEMAKSA TARIF SNAPSHOT SAMA DENGAN TARIF OUTLET SEKARANG
-- ============================================================================
--
-- Godaan pertama adalah menghitung ulang pajaknya sendiri dari
-- outlets.tax_rate_bps dan menolak kalau berbeda. Itu salah karena dua hal.
--
-- Yang praktis: order yang dibuat offline sebelum perda mengubah tarif tidak
-- akan pernah bisa disinkronkan lagi. Ia terjebak di antrean selamanya, dan
-- satu-satunya cara mengeluarkannya adalah menghapus catatan uang.
--
-- Yang lebih mendasar: penjagaan itu tidak akan berarti apa-apa. push_order
-- SUDAH menerima `unit_price` apa adanya dari perangkat — lihat penjaga di
-- bawah, yang membandingkan jumlah item dengan subtotal dan tidak pernah
-- menyentuh tabel products. Otoritas harga memang tidak pernah ditegakkan di
-- jalur ini, dan secara struktur tidak bisa: order offline justru diberi harga
-- dari katalog lokal yang mungkin sudah basi. Mengunci tarif pajak sementara
-- harga dibiarkan terbuka sama dengan mengunci satu jendela di rumah yang
-- pintunya terbuka.
--
-- Yang benar-benar ditegakkan push_order adalah KEPEMILIKAN, IDEMPOTENSI, dan
-- ARITMETIKA INTERNAL. Validasi pajak di bawah diletakkan tepat di kategori
-- ketiga — dan satu penjagaan identitas ditambahkan di kategori pertama:
-- tax_approved_by wajib pegawai nyata di outlet yang sama, persis seperti
-- created_by. Tanpa itu, "siapa yang menyetujui pembebasan" hanyalah UUID apa
-- pun yang ingin dikirim APK, dan seluruh jejak audit di balik kewajiban
-- keterangan itu tidak ada nilainya.
--
-- ============================================================================
-- APK LAMA TETAP BISA MENGIRIM
-- ============================================================================
--
-- Kiriman tanpa satu pun bidang pajak diperlakukan sebagai: subtotal = total,
-- tarif 0, pajak 0, status 'taxable'. Itu memenuhi constraint tax_arithmetic
-- dan jujur — tarif 0 yang tercatat memang berarti tidak ada pajak yang
-- dikenakan, bukan pajak yang hilang.
--
-- Alternatifnya, menolak kiriman lama, membuat setiap order di ponsel yang
-- belum diperbarui macet di antrean sampai APK-nya diganti. Order yang macet
-- adalah catatan uang yang cuma ada di satu ponsel, dan itu risiko yang jauh
-- lebih besar daripada beberapa transaksi tercatat tanpa pajak selama masa
-- peralihan. Yang perlu diawasi memang itu: APK lama yang masih dipakai akan
-- terus menerima pembayaran tanpa PBJT tanpa mengeluh sama sekali.

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
  v_tax_status tax_status := coalesce(nullif(p_order ->> 'tax_status', '')::tax_status,
                                      'taxable');
  v_rate       int    := coalesce(nullif(p_order ->> 'tax_rate_bps', '')::int, 0);
  v_tax        bigint := coalesce(nullif(p_order ->> 'tax_amount', '')::bigint, 0);
  v_reason     text   := nullif(btrim(coalesce(p_order ->> 'tax_exempt_reason', '')), '');
  v_approved_by uuid  := nullif(p_order ->> 'tax_approved_by', '')::uuid;
  v_computed   bigint;
  v_item       jsonb;
  v_updated    boolean := false;
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

  if v_rate < 0 or v_rate > 10000 then raise exception 'TAX_RATE_INVALID'; end if;

  if v_tax_status = 'exempt' then
    if v_tax <> 0 then raise exception 'TAX_MISMATCH'; end if;
    if v_reason is null then raise exception 'TAX_EXEMPT_REASON_REQUIRED'; end if;

    -- Identitas, bukan harga: penyetuju pembebasan wajib pegawai nyata di
    -- outlet yang sama, persis seperti created_by di atas.
    select * into v_approver from employees where id = v_approved_by;
    if not found then raise exception 'EMPLOYEE_NOT_FOUND'; end if;
    if v_approver.outlet_id <> v_sender.outlet_id then raise exception 'OUTLET_MISMATCH'; end if;
  else
    if v_tax <> (v_subtotal * v_rate + 5000) / 10000 then raise exception 'TAX_MISMATCH'; end if;
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

  insert into orders (
    id, outlet_id, table_code, table_seq, status, subtotal, total, version,
    tax_status, tax_rate_bps, tax_amount, tax_exempt_reason, tax_approved_by,
    created_by, paid_by, voided_by,
    payment_method, amount_received, change_amount,
    created_at, client_created_at, paid_at, voided_at, void_reason
  ) values (
    v_order_id,
    v_author.outlet_id,
    p_order ->> 'table_code',
    coalesce(nullif(p_order ->> 'table_seq', '')::int, 1),
    v_status,
    v_subtotal,
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
    nullif(btrim(coalesce(p_order ->> 'void_reason', '')), '')
  )
  on conflict (id) do nothing;

  if not found then
    -- Id sudah ada. Kiriman ini pembaruan hanya kalau versinya lebih tinggi.
    -- outlet_id, created_by, dan created_at sengaja TIDAK ikut diperbarui:
    -- kepemilikan dan waktu lahir order ditetapkan sekali, dan membiarkan
    -- perangkat menulis ulang keduanya lewat pintu ini membuka celah yang
    -- justru ditutup fungsi security definer ini.
    update orders set
      table_code        = p_order ->> 'table_code',
      table_seq         = coalesce(nullif(p_order ->> 'table_seq', '')::int, table_seq),
      status            = v_status,
      subtotal          = v_subtotal,
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
    -- Catatan untuk langkah 6: refund_items.order_item_id mereferensikan
    -- order_items TANPA cascade. Begitu refund dipakai, penghapusan ini akan
    -- ditolak foreign key untuk order yang sudah pernah di-refund. Gagal
    -- terang-terangan seperti itu masih jauh lebih baik daripada cacat yang
    -- diperbaiki di 0008, yang hilang tanpa suara.
    delete from order_items where order_id = v_order_id;
  end if;

  -- id item ikut dari perangkat, jadi struktur order tetap sama persis dengan
  -- yang dilihat kasir. product_id boleh null: produk bisa dihapus kelak, dan
  -- kolom snapshot-lah yang menjaga struk lama tetap benar.
  for v_item in select * from jsonb_array_elements(v_items) loop
    insert into order_items (
      id, order_id, product_id, product_code, product_name,
      quantity, unit_price, notes
    ) values (
      coalesce(nullif(v_item ->> 'id', '')::uuid, gen_random_uuid()),
      v_order_id,
      nullif(v_item ->> 'product_id', '')::uuid,
      v_item ->> 'product_code',
      v_item ->> 'product_name',
      (v_item ->> 'quantity')::int,
      (v_item ->> 'unit_price')::bigint,
      coalesce(v_item ->> 'notes', '')
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

  return jsonb_build_object(
    'order_id', v_order_id,
    'inserted', not v_updated,
    'updated', v_updated
  );
end;
$$;

revoke all on function push_order(jsonb) from public;
grant execute on function push_order(jsonb) to authenticated;
