-- Memperbaiki cacat uang: order yang terkirim sebelum final membeku di server
-- dalam keadaan itu, dan pembayarannya tidak pernah sampai.
--
-- Versi 0005 hanya punya satu perilaku untuk id yang sudah dikenal: tolak,
-- jawab inserted=false. Itu benar sebagai perisai duplikat — kegagalan yang
-- paling mungkin adalah satu kiriman sampai tapi jawabannya hilang, dan tanpa
-- perisai itu tombol "Kirim ulang" berbahaya di tangan kasir. Yang salah bukan
-- penolakannya, melainkan bahwa itu satu-satunya perilaku yang ada.
--
-- Sementara itu setiap penulisan lokal — bayar, tambah item, void — menyetel
-- ulang sync_status jadi 'pending', sehingga order masuk antrean lagi. Server
-- menjawab inserted=false, pushPending tidak melihat error, lalu menandainya
-- 'synced'. Server memegang status dan total lama selamanya. Laporan penjualan
-- kurang uang, tanpa satu pun pesan kesalahan.
--
-- Yang membedakan ulangan dari pembaruan adalah `version`, yang sudah dinaikkan
-- di setiap penulisan lokal. Pembeda itu dipasang sebagai syarat pada UPDATE-nya
-- sendiri (`where version < masuk`), bukan sebagai pemeriksaan terpisah lebih
-- dulu: dua kiriman bersamaan — tombol ditekan saat pengiriman otomatis sedang
-- berjalan — akan saling mendahului di antara pemeriksaan dan penulisan. Sebagai
-- syarat UPDATE, keduanya satu operasi atomik dan kunci baris yang memutuskan.
--
-- Uang tetap tidak dipercayakan pada perangkat: total dihitung ulang dari item
-- dan kecukupan tunai diperiksa SEBELUM percabangan, jadi jalur pembaruan
-- dijaga persis seketat jalur penyisipan.

create or replace function push_order(p_order jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sender   employees%rowtype;
  v_author   employees%rowtype;
  v_order_id uuid   := nullif(p_order ->> 'id', '')::uuid;
  v_items    jsonb  := coalesce(p_order -> 'items',  '[]'::jsonb);
  v_voids    jsonb  := coalesce(p_order -> 'voids',  '[]'::jsonb);
  v_payment  jsonb  := p_order -> 'payment';
  v_status   order_status;
  v_method   payment_method := nullif(p_order ->> 'payment_method', '')::payment_method;
  v_received bigint := nullif(p_order ->> 'amount_received', '')::bigint;
  v_change   bigint := nullif(p_order ->> 'change_amount', '')::bigint;
  v_total    bigint := coalesce(nullif(p_order ->> 'total', '')::bigint, 0);
  v_version  int    := coalesce(nullif(p_order ->> 'version', '')::int, 1);
  v_computed bigint;
  v_item     jsonb;
  v_updated  boolean := false;
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

  if v_computed <> v_total then raise exception 'TOTAL_MISMATCH'; end if;

  if v_method = 'cash' and (v_received is null
      or v_received < v_total
      or v_change is distinct from v_received - v_total) then
    raise exception 'INSUFFICIENT_AMOUNT';
  end if;

  insert into orders (
    id, outlet_id, table_code, table_seq, status, total, version,
    created_by, paid_by, voided_by,
    payment_method, amount_received, change_amount,
    created_at, client_created_at, paid_at, voided_at, void_reason
  ) values (
    v_order_id,
    v_author.outlet_id,
    p_order ->> 'table_code',
    coalesce(nullif(p_order ->> 'table_seq', '')::int, 1),
    v_status,
    v_total,
    v_version,
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
      table_code      = p_order ->> 'table_code',
      table_seq       = coalesce(nullif(p_order ->> 'table_seq', '')::int, table_seq),
      status          = v_status,
      total           = v_total,
      version         = v_version,
      paid_by         = nullif(p_order ->> 'paid_by', '')::uuid,
      voided_by       = nullif(p_order ->> 'voided_by', '')::uuid,
      payment_method  = v_method,
      amount_received = v_received,
      change_amount   = v_change,
      paid_at         = nullif(p_order ->> 'paid_at', '')::timestamptz,
      voided_at       = nullif(p_order ->> 'voided_at', '')::timestamptz,
      void_reason     = nullif(btrim(coalesce(p_order ->> 'void_reason', '')), '')
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
    -- sedang diperbaiki di sini, yang hilang tanpa suara.
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
