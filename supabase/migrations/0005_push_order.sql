-- Jalan masuk untuk order yang dibuat di perangkat saat offline.
--
-- Kenapa tidak memakai create_order / pay_order yang sudah ada: keduanya
-- menghitung ulang segalanya di server dan menerbitkan id serta table_seq baru.
-- Untuk order yang sudah terlanjur dibuat di perangkat, angka-angka itu sudah
-- final — pelanggannya sudah dilayani, strukmya sudah dihitung. Server di sini
-- bukan yang memutuskan, hanya yang menerima.
--
-- Kenapa bukan GRANT INSERT biasa pada orders/order_items/payments: siapa pun
-- yang membongkar APK lalu memakai anon key bisa menulis order lunas
-- sekehendaknya. Fungsi security definer ini lubang yang jauh lebih sempit —
-- ia memeriksa outlet, memeriksa keutuhan uang, dan tidak membuka satu pun
-- tabel untuk ditulis langsung.
--
-- Sifat terpenting fungsi ini: IDEMPOTEN pada orders.id. Kegagalan yang paling
-- mungkin terjadi bukan dua perangkat menulis bersamaan, melainkan satu
-- permintaan yang sampai ke server tapi jawabannya hilang di jalan — persis
-- saat sinyal buruk, yaitu keadaan yang seluruh rancangan ini layani. Kalau
-- mengirim ulang bisa menggandakan order, tombol "Kirim ulang" berbahaya di
-- tangan kasir. Karena id dibuat di perangkat, server cukup mengenali id yang
-- sudah pernah masuk dan menjawab "sudah ada" tanpa menulis apa pun.

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
  v_computed bigint;
  v_item     jsonb;
begin
  if v_order_id is null then raise exception 'ORDER_ID_REQUIRED'; end if;

  select * into v_sender from employees where id = (select auth.uid());
  if not found or not v_sender.active then raise exception 'EMPLOYEE_NOT_FOUND'; end if;

  -- Diperiksa SEBELUM apa pun yang lain: kalau id-nya sudah ada, kiriman ini
  -- ulangan dan jawabannya sukses tanpa menulis. Isi payload sengaja tidak
  -- dibandingkan — order yang sudah masuk server adalah kebenarannya, dan
  -- perangkat tidak boleh menimpanya lewat pintu ini.
  if exists (select 1 from orders where id = v_order_id) then
    return jsonb_build_object('order_id', v_order_id, 'inserted', false);
  end if;

  -- Penulisnya boleh berbeda dari pengirimnya. Order yang belum terkirim
  -- bertahan melewati pergantian shift, jadi order buatan Pagi wajar dikirim
  -- saat Sore yang sedang masuk. Yang dijaga hanya: penulisnya pegawai nyata
  -- di outlet yang sama dengan pengirim.
  select * into v_author from employees
  where id = nullif(p_order ->> 'created_by', '')::uuid;
  if not found then raise exception 'EMPLOYEE_NOT_FOUND'; end if;
  if v_author.outlet_id <> v_sender.outlet_id then raise exception 'OUTLET_MISMATCH'; end if;

  v_status := coalesce(nullif(p_order ->> 'status', '')::order_status, 'pending');

  -- Uang tidak pernah dipercayakan pada perangkat. Totalnya dihitung ulang dari
  -- item yang dikirim, dan kalau tidak cocok kiriman ditolak seluruhnya.
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
    coalesce(nullif(p_order ->> 'version', '')::int, 1),
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

  -- Pemeriksaan kedua, dan bukan sekadar sabuk pengaman: pemeriksaan di atas
  -- bisa dilewati dua kiriman bersamaan (tombol ditekan sementara pengiriman
  -- otomatis sedang berjalan). Di sinilah kunci utama benar-benar memutuskan.
  if not found then
    return jsonb_build_object('order_id', v_order_id, 'inserted', false);
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
    );
  end loop;

  if v_payment is not null and v_payment <> 'null'::jsonb then
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

  return jsonb_build_object('order_id', v_order_id, 'inserted', true);
end;
$$;

-- Hanya EXECUTE. Tidak ada satu pun GRANT baru pada tabelnya sendiri, jadi
-- fungsi ini tetap satu-satunya jalan menulis order dari perangkat.
revoke all on function push_order(jsonb) from public;
grant execute on function push_order(jsonb) to authenticated;
