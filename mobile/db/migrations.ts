/**
 * Skema SQLite lokal — cerminan dari supabase/migrations/0001_init.sql.
 *
 * Nama kolom sengaja dibuat identik dengan Postgres (snake_case), bukan
 * camelCase seperti tipe TypeScript, supaya payload sync di langkah 4 nyaris
 * salinan langsung dan tidak perlu tabel pemetaan nama.
 *
 * Aturan yang dibawa apa adanya dari Postgres:
 *  * Uang = INTEGER rupiah utuh.
 *  * product_code / product_name / unit_price pada order_items adalah SNAPSHOT.
 *  * subtotal / amount kolom generated, supaya invariannya tidak bisa dilanggar
 *    dari kode aplikasi.
 *  * version dipertahankan walau satu perangkat tak bisa balapan dengan dirinya
 *    sendiri — langkah 4 memerlukannya untuk tahu server sudah bergerak.
 *
 * Yang ditambahkan khusus untuk offline: sync_status pada setiap tabel yang
 * ditulis di perangkat. Tabel master (categories, products) tidak punya kolom
 * itu karena arahnya satu arah, selalu ditarik dari server.
 */

import type { SQLiteDatabase } from "expo-sqlite";

const DATABASE_VERSION = 1;

/** enum Postgres tidak ada di SQLite, jadi TEXT + CHECK. */
const V1 = `
-- Di Postgres, outlet_id sebuah order diambil dari baris employees. Perangkat
-- tidak menyimpan tabel employees (pin_hash tidak boleh ikut turun), jadi
-- outlet_id disimpan di sini saat katalog ditarik. Sekaligus tempat menaruh
-- penanda sync nanti.
create table app_state (
  key   text primary key,
  value text not null
);

create table categories (
  id         text primary key,
  outlet_id  text    not null,
  code       text    not null,
  name       text    not null,
  sort_order integer not null default 0,
  active     integer not null default 1
);

create table products (
  id          text primary key,
  outlet_id   text    not null,
  category_id text    not null,
  code        text    not null,
  name        text    not null,
  price       integer not null check (price >= 0),
  active      integer not null default 1
);
create index products_category_idx on products (category_id);

create table orders (
  id         text    primary key,
  outlet_id  text    not null,
  table_code text    not null,
  table_seq  integer not null default 1,
  status     text    not null default 'pending' check (status in ('pending', 'paid', 'void')),
  total      integer not null default 0 check (total >= 0),
  version    integer not null default 1,

  created_by text not null,
  paid_by    text,
  voided_by  text,

  payment_method  text check (payment_method is null or payment_method in ('cash', 'non_cash')),
  amount_received integer,
  change_amount   integer,

  created_at        text not null,
  client_created_at text,
  paid_at           text,
  voided_at         text,
  void_reason       text,

  sync_status text not null default 'pending' check (sync_status in ('pending', 'synced', 'error')),
  sync_error  text,
  synced_at   text,

  constraint paid_fields_consistent check (
    status <> 'paid'
    or (paid_at is not null and payment_method is not null and paid_by is not null)
  ),
  constraint cash_covers_total check (
    payment_method is not 'cash'
    or (amount_received >= total and change_amount = amount_received - total)
  )
);
create index orders_queue_idx  on orders (status, created_at desc);
create index orders_sync_idx   on orders (sync_status) where sync_status <> 'synced';

create table order_items (
  id           text primary key,
  order_id     text    not null references orders (id) on delete cascade,
  product_id   text,
  product_code text    not null,
  product_name text    not null,
  quantity     integer not null check (quantity > 0),
  unit_price   integer not null check (unit_price >= 0),
  notes        text    not null default '',
  subtotal     integer generated always as (quantity * unit_price) stored
);
create index order_items_order_idx on order_items (order_id);

create table order_item_voids (
  id           text primary key,
  order_id     text    not null references orders (id) on delete cascade,
  product_code text    not null,
  product_name text    not null,
  quantity     integer not null check (quantity > 0),
  unit_price   integer not null,
  amount       integer generated always as (quantity * unit_price) stored,
  voided_by    text    not null,
  reason       text,
  created_at   text    not null,

  sync_status text not null default 'pending' check (sync_status in ('pending', 'synced', 'error')),
  sync_error  text,
  synced_at   text
);
create index order_item_voids_created_idx on order_item_voids (created_at desc);

create table payments (
  id          text primary key,
  order_id    text    not null references orders (id) on delete cascade,
  method      text    not null check (method in ('cash', 'non_cash')),
  amount      integer not null check (amount > 0),
  employee_id text    not null,
  created_at  text    not null,

  sync_status text not null default 'pending' check (sync_status in ('pending', 'synced', 'error')),
  sync_error  text,
  synced_at   text
);
create index payments_order_idx on payments (order_id);
`;

/**
 * Dipanggil lewat prop `onInit` milik SQLiteProvider. Naikkan DATABASE_VERSION
 * dan tambahkan blok `if` baru untuk setiap perubahan skema — tablet yang sudah
 * terpasang harus ikut naik versi, bukan dipasang ulang dari nol.
 */
export async function migrateDbIfNeeded(db: SQLiteDatabase): Promise<void> {
  // WAL: baca tidak memblokir tulis. Foreign key di SQLite mati secara default.
  await db.execAsync("pragma journal_mode = WAL; pragma foreign_keys = ON;");

  const row = await db.getFirstAsync<{ user_version: number }>(
    "pragma user_version"
  );
  let version = row?.user_version ?? 0;

  if (version >= DATABASE_VERSION) return;

  if (version === 0) {
    await db.execAsync(V1);
    version = 1;
  }

  await db.execAsync(`pragma user_version = ${DATABASE_VERSION}`);
}
