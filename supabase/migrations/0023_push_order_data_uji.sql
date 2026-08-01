-- Data uji — antrean kirim dari ponsel.
--
-- Berkas ini adalah 0020 dengan TIGA perubahan. Sisanya disalin utuh dari
-- berkas itu — bukan diketik ulang — termasuk seluruh komentarnya, supaya
-- perbedaannya bisa dibaca dengan `diff` alih-alih dipercaya begitu saja.
-- Seluruh bagian bertanda "====" di bawah ini diwarisi apa adanya dan masih
-- berlaku; yang baru hanya yang tiga ini.
--
--   1. `is_test_data` dan `test_mode_reason` diterima dan ditulis saat
--      PENYISIPAN.
--   2. Penjaga baru TEST_REASON_REQUIRED: order uji wajib membawa alasan.
--   3. Cabang PEMBARUAN sengaja tidak menyentuh kedua kolom itu. Alasannya di
--      bawah.
--
-- ============================================================================
-- KENAPA PENANDA UJI DITETAPKAN SEKALI, TIDAK PERNAH DIPERBARUI
-- ============================================================================
--
-- Kolom ini menentukan apakah sebuah order dihitung sebagai pendapatan. Kalau
-- cabang pembaruan boleh menulisnya, maka apa pun yang bisa mengirim sebagai
-- pegawai bisa mengubah order lunas yang nyata menjadi uji hanya dengan
-- menaikkan `version` — dan uangnya lenyap dari setiap laporan tanpa satu pun
-- galat, tanpa baris yang hilang, tanpa apa pun yang terlihat ganjil. Itu
-- persis kelas kegagalan yang sudah dua kali tercatat di MIGRATION.md: angka
-- yang salah tapi tampak wajar.
--
-- Membekukannya tidak menghilangkan satu kasus pun yang nyata. Penanda ini
-- dipilih kasir SEBELUM order dibuat, jadi ia sudah ada pada baris SQLite sejak
-- baris itu lahir dan ikut pada kiriman pertama — baik order itu terkirim saat
-- masih `pending` lalu dibayar belakangan, maupun dibuat dan dibayar seluruhnya
-- saat offline lalu terkirim sekali dalam keadaan lunas. Tidak ada alur di
-- perangkat yang mengubahnya di tengah jalan.
--
-- Perlakuannya sama dengan `outlet_id`, `created_by`, dan `created_at` di
-- cabang pembaruan di bawah, dan alasannya sama: hal yang ditetapkan sekali
-- saat order lahir tidak boleh bisa ditulis ulang lewat pintu ini.
--
-- Akibat yang harus dikatakan terang-terangan: order uji yang salah ditandai
-- TIDAK bisa dibetulkan dari ponsel. Perbaikannya adalah `update` manual di
-- server oleh yang punya akses. Itu memang disengaja — memperbaikinya jarang,
-- sedangkan lubangnya akan terbuka setiap hari.
--
-- ============================================================================
-- APK LAMA TETAP BISA MENGIRIM
-- ============================================================================
--
-- Kiriman tanpa `is_test_data` jatuh ke false, yaitu default kolomnya, yaitu
-- order biasa. Itu jawaban yang benar: APK yang belum tahu soal mode uji juga
-- tidak punya cara membuat order uji.
--
-- ============================================================================
-- APK LAMA TETAP BISA MENGIRIM, DAN ITU BUKAN LUBANG
-- ============================================================================
--
-- Kiriman tanpa `taxable_subtotal` jatuh ke `subtotal`, dan item tanpa
-- `taxable` dianggap kena pajak. Hasilnya persis perilaku sebelum 0019: pajak
-- atas seluruh subtotal. Kiriman semacam itu lolos semua penjaga, karena
-- memang konsisten dengan dirinya sendiri.
--
-- Konsekuensinya harus dikatakan terang-terangan: **APK yang belum diperbarui
-- akan terus memungut PBJT atas rokok**, dan tidak akan mengeluh sama sekali.
-- Server tidak bisa membetulkannya, dan tidak boleh mencoba — menghitung ulang
-- pajak dari katalog akan menolak order offline yang dibuat sebelum kategori
-- diubah, dan order yang macet di antrean adalah catatan uang yang cuma ada di
-- satu ponsel. Jalan keluarnya operasional, bukan teknis: pastikan setiap HP
-- kasir sudah memakai APK/OTA sesudah perubahan ini sebelum rokok dijual lagi.
--
-- ============================================================================
-- KENAPA ITEM ORDER LUNAS TIDAK BOLEH DITULIS ULANG
-- ============================================================================
--
-- 0014 menulis ulang seluruh order_items pada tiap pembaruan, dan komentarnya
-- di bawah sudah meramalkan masalah ini sebagai "catatan untuk langkah 6":
-- refund_items.order_item_id menunjuk order_items TANPA cascade, jadi begitu
-- sebuah order pernah di-refund, `delete from order_items` untuk order itu akan
-- ditolak foreign key. Ini langkah 6, dan inilah jawabannya.
--
-- Penulisan ulang itu ada untuk satu keperluan saja: penyuntingan order
-- `pending`, yang di perangkat menghapus baris atau mengurangi jumlahnya
-- sehingga penyisipan-saja akan meninggalkan item hantu. Order yang sudah lunas
-- tidak pernah berubah isinya — itu aturan yang sudah dipegang seluruh sistem
-- dan yang membuat refund harus berupa baris baru, bukan koreksi baris lama.
-- Jadi melewatinya untuk order lunas bukan pengecualian demi refund; ia justru
-- menyelaraskan fungsi ini dengan aturan yang sudah berlaku.
--
-- Status yang menentukan adalah status yang TERSIMPAN DI SERVER sebelum
-- pembaruan, bukan status di payload. Order yang baru pertama kali sampai dalam
-- keadaan lunas (dibuat dan dibayar saat offline) tetap lewat cabang penyisipan
-- dan itemnya tetap ditulis.
--
-- ============================================================================
-- APA YANG DIVALIDASI PADA REFUND, DAN APA YANG TIDAK
-- ============================================================================
--
-- Yang ditegakkan: aritmetika internal tiap refund (amount = subtotal +
-- tax_amount, dan subtotal = jumlah itemnya), identitas kasirnya, dan yang
-- terpenting — kumulatifnya tidak boleh melewati apa yang pernah dibayar.
--
-- Yang TIDAK: server tidak menghitung ulang pajak tiap refund dari nol.
-- Alasannya sama persis dengan kenapa tarif snapshot tidak dipaksakan (lihat
-- 0014): perangkat menghitung offline dengan rumus yang identik, dan
-- pemeriksaan yang benar harus memutar ulang seluruh riwayat refund dalam
-- urutan aslinya — yang tidak bisa dijamin oleh antrean kirim yang boleh
-- mengulang. Batas kumulatif di bawah adalah penjagaan yang benar-benar
-- melindungi uang: berapa pun urutannya, jumlah yang keluar tidak akan pernah
-- melebihi jumlah yang masuk.
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
  -- alasannya di kepala berkas.
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
    if v_reason is null then raise exception 'TAX_EXEMPT_REASON_REQUIRED'; end if;

    -- Identitas, bukan harga: penyetuju pembebasan wajib pegawai nyata di
    -- outlet yang sama, persis seperti created_by di atas.
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

  -- Alasan uji WAJIB, sama seperti keterangan bebas pajak. Constraint
  -- test_data_reason di 0022 menegakkannya juga, jadi baris ini bukan satu-
  -- satunya penjaga — ia yang menentukan APA YANG TERBACA. Pesan push_order
  -- masuk apa adanya ke orders.sync_error dan ditampilkan ke kasir di layar
  -- Order; tanpa baris ini yang muncul di sana adalah teks constraint Postgres
  -- mentah-mentah.
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
    -- menyentuh keduanya — lihat kepala berkas.
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
    -- Catatan langkah 6 dari 0014 dijawab di sini: refund_items.order_item_id
    -- menunjuk order_items TANPA cascade, jadi penghapusan ini akan ditolak
    -- foreign key untuk order yang pernah di-refund. Penjaganya bukan
    -- penambalan atas refund — order lunas memang tidak boleh berubah isinya.
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
  -- kepala berkas untuk kenapa pajak tiap refund tidak dihitung ulang di sini.
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

revoke all on function push_order(jsonb) from public;
grant execute on function push_order(jsonb) to authenticated;
