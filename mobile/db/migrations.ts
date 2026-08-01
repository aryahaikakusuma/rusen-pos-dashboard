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

const DATABASE_VERSION = 8;

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
 * PBJT — cerminan dari supabase/migrations/0012_pbjt_skema.sql.
 *
 * `total` BERUBAH ARTI di sini persis seperti di Postgres: dari "jumlah subtotal
 * item" menjadi "uang yang ditagih ke pelanggan", dan kolom `subtotal` yang
 * memegang jumlah item. Karena itu `cash_covers_total` di V1 tidak perlu
 * disentuh sama sekali — ia membandingkan amount_received dengan `total`, yang
 * memang angka tagihan.
 *
 * TIDAK ADA CONSTRAINT ARITMETIKA PAJAK DI SINI, dan itu keputusan sadar yang
 * menyimpang dari rencana awal. SQLite tidak bisa menambahkan constraint tingkat
 * tabel lewat ALTER, jadi memasangnya menuntut membangun ulang tabel orders —
 * artinya menghapus seluruh histori order di perangkat yang sudah terpasang.
 * Dua alasan menolak itu:
 *
 *  1. Order lunas yang belum terkirim hanya ada di perangkat ini. clearHistory
 *     menolak menghapusnya justru karena itu, dan membangun ulang tabel akan
 *     melanggar prinsip yang sama tanpa syarat.
 *  2. Arah kegagalannya lebih buruk. Dengan constraint lokal, salah hitung
 *     membuat payOrder GAGAL — uang sudah diterima kasir dan tidak ada yang
 *     tercatat. Tanpa constraint lokal, order tetap tercatat lalu ditolak saat
 *     push, muncul sebagai sync_error yang bisa dibaca dan diperbaiki. Catatan
 *     uang yang ada lebih berharga daripada aritmetika yang rapi.
 *
 * Penjaganya tetap ada di dua tempat yang lebih tepat: constraint di Postgres
 * (menahan penulis mana pun) dan push_order (memberi pesan yang berguna).
 *
 * Baris lama di-backfill `subtotal = total`. Itu bukan tebakan: order yang lahir
 * sebelum rilis ini memang tidak pernah dipungut pajak, jadi jumlah itemnya
 * memang sama dengan yang ditagih. Nilainya juga sama persis dengan yang ditulis
 * push_order untuk kiriman tanpa bidang pajak, sehingga perangkat dan server
 * tidak pernah berbeda pendapat soal order yang sama.
 */
const V2 = `
alter table orders add column subtotal          integer not null default 0;
alter table orders add column tax_status        text    not null default 'taxable';
alter table orders add column tax_rate_bps      integer not null default 0;
alter table orders add column tax_amount        integer not null default 0;
alter table orders add column tax_exempt_reason text;
alter table orders add column tax_approved_by   text;

update orders set subtotal = total;

-- Memaksa katalog ditarik ulang sekali.
--
-- Perangkat yang sudah terpasang punya katalog tapi belum punya tarif pajak,
-- sementara penarikan katalog manual. Tanpa baris ini, kasir membuka aplikasi
-- yang tampak normal lalu tertahan di layar pembayaran tanpa tahu sebabnya.
-- Dengan baris ini, petunjuk "katalog belum ditarik" yang sudah ada di aplikasi
-- yang menagih sendiri. Produknya tidak ikut terhapus, jadi tidak ada yang
-- hilang selain satu penanda waktu.
delete from app_state where key = 'catalog_pulled_at';
`;

/**
 * Refund — cerminan dari supabase/migrations/0016_refund.sql.
 *
 * Dua tabel baru, tidak ada tabel lama yang disentuh. Karena tabelnya baru,
 * CHECK aritmetika BOLEH ikut dibawa di sini — berbeda dari keputusan di V2,
 * yang menolak constraint pajak karena memasangnya menuntut membangun ulang
 * tabel orders beserta seluruh histori di perangkat. Di sini tidak ada baris
 * lama yang bisa dirusak dan tidak ada order lunas-belum-terkirim yang
 * terancam, jadi alasan penolakan itu tidak berlaku.
 *
 * `employee_id` tanpa foreign key: perangkat tidak menyimpan tabel employees,
 * sama seperti tax_approved_by.
 *
 * `on delete cascade` ke orders adalah yang membuat clearHistory tetap benar
 * tanpa perubahan apa pun — refund ikut terhapus bersama ordernya. Dan order
 * yang baru direfund otomatis kembali ke sync_status 'pending', yang memang
 * sudah dilindungi clearHistory dari penghapusan.
 */
const V3 = `
create table refunds (
  id          text primary key,
  order_id    text    not null references orders (id) on delete cascade,
  subtotal    integer not null check (subtotal >= 0),
  tax_amount  integer not null check (tax_amount >= 0),
  amount      integer not null check (amount > 0),
  reason      text,
  employee_id text    not null,
  created_at  text    not null,

  check (amount = subtotal + tax_amount)
);
create index refunds_order_idx on refunds (order_id);

create table refund_items (
  id            text primary key,
  refund_id     text    not null references refunds (id) on delete cascade,
  order_item_id text    not null,
  product_name  text    not null,
  quantity      integer not null check (quantity > 0),
  unit_price    integer not null check (unit_price >= 0),
  amount        integer generated always as (quantity * unit_price) stored
);
create index refund_items_refund_idx on refund_items (refund_id);
`;

/**
 * Sif kasir — lokal saja, tidak pernah dikirim ke Postgres. Sengaja begitu:
 * uang sifnya sendiri sudah tersinkron lewat orders/refunds, tabel ini hanya
 * menandai batas waktunya. Kalau nanti perlu naik ke server, itu pekerjaan
 * terpisah (lihat FUTURE_TO_DO.md) yang menuntut migrasi Postgres, RLS, dan
 * perubahan push_order — tidak dipaksakan masuk di sini.
 *
 * Batas sif: opened_at..closed_at (atau opened_at..sekarang selama terbuka).
 * `paid_at`/`created_at` order tersimpan sebagai ISO UTC (lihat db/orders.ts,
 * `now()`), jadi perbandingan string leksikografis dua timestamp ini sudah
 * benar tanpa aritmetika zona waktu — beda dengan ember harian di
 * 0015_laporan_pbjt.sql yang harus menghitung ulang ke WIB.
 *
 * Kolom setelah `closed_at` adalah CUPLIKAN saat sif ditutup: order yang
 * mendasarinya terus bisa berubah (refund boleh masuk kapan pun terhadap
 * order lama), jadi struk yang sudah tercetak harus bisa dicetak ulang persis
 * sama meski data di baliknya sudah bergeser.
 */
const V4 = `
create table shifts (
  id                text    primary key,
  employee_id       text    not null,
  employee_name     text    not null,
  modal_awal        integer not null default 0 check (modal_awal >= 0),
  opened_at         text    not null,
  closed_at         text,

  tunai             integer,
  non_tunai         integer,
  refund            integer,
  pajak             integer,
  transaksi_selesai integer,
  transaksi_pending integer
);
create index shifts_terbuka_idx on shifts (opened_at) where closed_at is null;
`;

/**
 * Selisih kas — rekonsiliasi hitungan fisik terhadap Tutup Kasir.
 *
 * Tiga kolom, semuanya nullable: sif yang sudah tertutup sebelum perubahan
 * ini tidak punya nilainya, dan `null` di situ jujur — `0` akan berbohong
 * bahwa kasnya pernah dihitung dan hasilnya nol.
 *
 * `refund_tunai` BUKAN `shifts.refund`. `refund` (V4) adalah seluruh refund
 * tanpa peduli metode, dan itu tetap benar untuk baris "Refund" serta
 * "Saldo Akhir" yang sudah tercetak — jangan diubah artinya. `refund_tunai`
 * hanya dipakai untuk menghitung "Kas Seharusnya", karena hanya refund yang
 * uangnya keluar dari laci yang relevan bagi hitungan fisik.
 *
 * `alter table add column` aman di SQLite tanpa membangun ulang tabel;
 * constraint tingkat tabel yang tidak bisa (lihat komentar V2 di atas).
 */
const V5 = `
alter table shifts add column refund_tunai integer;
alter table shifts add column kas_fisik    integer;
alter table shifts add column selisih      integer;
`;

/**
 * Kas masuk / kas keluar — uang yang lewat laci tapi BUKAN penjualan.
 *
 * Sebelum ini, kasir yang membeli gas atau es batu memakai uang laci tidak
 * meninggalkan jejak di mana pun, dan satu-satunya tempat uang itu muncul
 * adalah sebagai SELISIH KURANG di Tutup Kasir — bentuknya persis sama dengan
 * salah hitung atau uang hilang. Laporan yang tidak bisa membedakan keduanya
 * akan berhenti dipercaya.
 *
 * Empat hal yang tidak terbaca dari SQL-nya:
 *
 *  1. TERIKAT `shift_id`, BUKAN JENDELA WAKTU. `shiftTotals` mengembar order
 *     lewat `[opened_at, sekarang)` karena order tidak tahu ia milik sif mana.
 *     Entri kas tahu: ia lahir dari sif yang sedang terbuka dan menyimpan
 *     idnya. Efeknya tidak ada pertanyaan zona waktu sama sekali, dan tidak
 *     ada entri yang bisa jatuh ke sif tetangga karena satu detik geser.
 *
 *  2. `voided_at`, BUKAN `delete`. Salah ketik nominal pasti terjadi di papan
 *     angka, jadi pembatalan harus ada. Tapi baris yang dihapus tuntas membuat
 *     "catat 200.000 lalu hapus, uangnya diambil" tidak meninggalkan apa pun.
 *     Entri yang dibatalkan hilang dari total dan dari kertas; barisnya tetap
 *     ada di SQLite. Sejalan dengan tidak adanya grant DELETE untuk satu pun
 *     akun pegawai di server (AGENTS.md).
 *
 *  3. EMPAT KOLOM CUPLIKAN NULLABLE di `shifts`, alasannya sama persis dengan
 *     V5: sif yang ditutup sebelum perubahan ini tidak pernah punya nilainya,
 *     dan `null` di situ jujur sementara `0` berbohong bahwa kasnya pernah
 *     dicatat dan hasilnya nol.
 *
 *  4. JEBAKAN `clearHistory` TIDAK BERLAKU DI SINI. `HISTORY_KEEP_HOURS`
 *     (db/orders.ts) menghapus order lama, dan `refunds` ikut terbawa lewat
 *     `on delete cascade`. `cash_movements` menggantung pada `shifts`, yang
 *     tidak pernah disentuh clearHistory, jadi ia selamat. Ditulis di sini
 *     supaya tidak "diperbaiki" kelak dengan menambahkan cascade ke orders.
 *
 * `employee_id` tanpa foreign key, sama alasannya dengan `shifts.employee_id`:
 * perangkat tidak menyimpan tabel employees.
 */
const V6 = `
create table cash_movements (
  id            text    primary key,
  shift_id      text    not null references shifts (id),
  direction     text    not null check (direction in ('in', 'out')),
  method        text    not null check (method in ('cash', 'non_cash')),
  amount        integer not null check (amount > 0),
  note          text    not null check (length(trim(note)) > 0),
  employee_id   text    not null,
  employee_name text    not null,
  created_at    text    not null,
  voided_at     text
);
create index cash_movements_shift_idx on cash_movements (shift_id, created_at);

alter table shifts add column kas_masuk_tunai      integer;
alter table shifts add column kas_masuk_non_tunai  integer;
alter table shifts add column kas_keluar_tunai     integer;
alter table shifts add column kas_keluar_non_tunai integer;
`;

/**
 * Rokok bebas PBJT — cerminan dari supabase/migrations/0019_rokok_bebas_pbjt.sql.
 *
 * Rokok bukan objek PBJT. Sampai rilis ini perangkat memungutnya juga, karena
 * pajak dihitung atas SELURUH subtotal order.
 *
 * `taxable` integer, bukan boolean: SQLite tidak punya tipe boolean, dan
 * seluruh kolom bendera lain di skema ini (`active`, `sync_status`) sudah
 * memakai 0/1. Sisi TypeScript-lah yang menerjemahkannya.
 *
 * Empat hal yang tidak terbaca dari SQL-nya:
 *
 *  1. BAWAANNYA 1, DAN ITU DISENGAJA UNTUK BARIS LAMA. Sebelum rilis ini rokok
 *     memang dipungut pajak, dan itu yang tercetak di struknya. Menandai baris
 *     lama sebagai bebas pajak surut akan membuat `tax_amount` yang tersimpan
 *     tidak lagi cocok dengan basisnya, dan refund atas order lama akan
 *     menghitung dari angka yang berbeda dari kertas di tangan pelanggan.
 *     Riwayat dibiarkan mengatakan apa yang sebenarnya terjadi.
 *
 *  2. `taxable_subtotal` DI-BACKFILL DARI `subtotal`, alasan yang sama persis
 *     dengan `update orders set subtotal = total` di V2: order lama memang
 *     dipungut pajak atas seluruh subtotalnya, jadi basisnya memang subtotal.
 *     Nilainya juga sama dengan yang ditulis push_order untuk kiriman tanpa
 *     `taxable_subtotal`, sehingga perangkat dan server tidak pernah berbeda
 *     pendapat soal order yang sama.
 *
 *  3. TIDAK ADA CHECK ARITMETIKA DI SINI, mengikuti keputusan V2: memasangnya
 *     pada tabel yang sudah ada menuntut membangun ulang `orders` beserta
 *     seluruh histori di perangkat. Penjaganya tetap di dua tempat yang lebih
 *     tepat — constraint di Postgres dan push_order.
 *
 *  4. KATALOG DIPAKSA DITARIK ULANG. Ini yang paling mudah terlewat: kolom
 *     `categories.taxable` lahir berisi 1 untuk SEMUA kategori, termasuk Rokok,
 *     karena nilainya datang dari server. Tanpa baris terakhir, aplikasi naik
 *     versi, tampak normal, dan terus memungut PBJT atas rokok tanpa satu pun
 *     keluhan — kegagalan yang persis tidak terlihat. Menghapus penanda waktu
 *     membuat petunjuk "katalog belum ditarik" yang sudah ada di aplikasi
 *     menagih sendiri. Produknya tidak ikut terhapus. Preseden: V2.
 */
const V7 = `
alter table categories  add column taxable          integer not null default 1;
alter table order_items add column taxable          integer not null default 1;
alter table orders      add column taxable_subtotal integer not null default 0;

update orders set taxable_subtotal = subtotal;

delete from app_state where key = 'catalog_pulled_at';
`;

/**
 * Data uji — cerminan dari supabase/migrations/0022_data_uji.sql.
 *
 * Menggantikan awalan `UJI-` pada `table_code` sebagai penanda order uji.
 * Awalan itu solusi sementara: tidak menegakkan apa pun secara struktural,
 * salah ketik satu huruf membuat order uji terhitung sebagai pendapatan, dan
 * server tidak pernah tahu tentangnya sama sekali — order uji yang tersinkron
 * masuk ke setiap laporan tanpa satu pun tanda.
 *
 * Empat hal yang tidak terbaca dari SQL-nya:
 *
 *  1. BAWAANNYA 0, dan baris lama di-backfill dari awalan `UJI-`. Berbeda dari
 *     backfill V2 dan V7 yang menebak nilai netral, yang ini memindahkan
 *     penanda yang MEMANG SUDAH ADA ke tempat barunya, jadi tidak ada order
 *     yang berubah artinya. Alasannya diisi penanda retroaktif apa adanya —
 *     mengarang alasan yang terdengar masuk akal untuk order yang kasirnya
 *     tidak pernah mengetik apa pun justru merusak guna jejaknya.
 *
 *  2. TIDAK ADA CHECK "uji wajib beralasan" DI SINI, mengikuti keputusan V2:
 *     memasang constraint tingkat tabel pada `orders` menuntut membangun ulang
 *     tabelnya beserta seluruh histori di perangkat, termasuk order lunas yang
 *     belum terkirim dan cuma ada di ponsel ini. Penjaganya di dua tempat yang
 *     lebih tepat — constraint `test_data_reason` di Postgres (0022) dan
 *     push_order (0023, kode TEST_REASON_REQUIRED). Arah kegagalannya juga
 *     sama seperti V2: order tetap tercatat lalu ditolak saat push sebagai
 *     sync_error yang bisa dibaca, bukan pembayaran yang gagal di depan
 *     pelanggan.
 *
 *  3. INDEKS PARSIAL, BUKAN INDEKS PENUH. Order uji adalah minoritas kecil dan
 *     yang selalu ditanyakan justru kebalikannya ("yang BUKAN uji"), jadi
 *     indeks di sini tidak akan terpakai untuk laporan. Yang dibuat adalah
 *     indeks atas order uji saja — kecil, dan itulah yang dipakai layar Debug
 *     saat membersihkan data uji.
 *
 *  4. KATALOG TIDAK PERLU DITARIK ULANG, berbeda dari V2 dan V7. Perubahan ini
 *     tidak menyentuh satu pun kolom yang datang dari server, jadi katalog yang
 *     ada tetap benar seutuhnya.
 */
const V8 = `
alter table orders add column is_test_data     integer not null default 0;
alter table orders add column test_mode_reason text;

update orders
set is_test_data     = 1,
    test_mode_reason = 'Ditandai retroaktif dari awalan UJI- (V8)'
where table_code like 'UJI-%';

create index orders_uji_idx on orders (created_at desc) where is_test_data = 1;
`;

/**
 * Dipanggil lewat prop `onInit` milik SQLiteProvider. Naikkan DATABASE_VERSION
 * dan tambahkan blok `if` baru untuk setiap perubahan skema — tablet yang sudah
 * terpasang harus ikut naik versi, bukan dipasang ulang dari nol.
 *
 * Setiap blok adalah DELTA, dan blok lama tidak pernah disunting: pemasangan
 * baru menjalankan V1 lalu V2, perangkat lama langsung V2, dan keduanya wajib
 * mendarat di skema yang sama persis. Menambahkan kolom baru ke V1 akan membuat
 * pemasangan baru gagal di V2 dengan "duplicate column".
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

  if (version === 1) {
    await db.execAsync(V2);
    version = 2;
  }

  if (version === 2) {
    await db.execAsync(V3);
    version = 3;
  }

  if (version === 3) {
    await db.execAsync(V4);
    version = 4;
  }

  if (version === 4) {
    await db.execAsync(V5);
    version = 5;
  }

  if (version === 5) {
    await db.execAsync(V6);
    version = 6;
  }

  if (version === 6) {
    await db.execAsync(V7);
    version = 7;
  }

  if (version === 7) {
    await db.execAsync(V8);
    version = 8;
  }

  await db.execAsync(`pragma user_version = ${DATABASE_VERSION}`);
}
