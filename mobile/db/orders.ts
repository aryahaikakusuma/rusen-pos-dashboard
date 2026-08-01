/**
 * Port lokal dari fungsi RPC di supabase/migrations/0001_init.sql baris 206-469.
 *
 * Ini bukan penulisan ulang, melainkan terjemahan baris demi baris. Setelah
 * langkah 4, order yang sama bisa divalidasi di perangkat DAN di Postgres, dan
 * keduanya wajib memberi jawaban sama. Kalau aturan di sini digeser sedikit
 * saja, sync akan menolak order yang tampak sah di layar kasir.
 *
 * Satu penyimpangan disengaja, ditandai di createOrder/appendToOrder.
 */

import * as Crypto from "expo-crypto";
import type { SQLiteDatabase } from "expo-sqlite";

import { hitungPbjt } from "../lib/tax";
import type { PaymentMethod, TaxStatus } from "../lib/types";
import { taxRateBps } from "./catalog";
import { OrderError } from "./errors";
import type {
  OrderItemInput,
  OrderItemRow,
  OrderRow,
  ProductRow,
  RefundItemInput,
  RefundItemRow,
  RefundRow,
  TableConflict,
} from "./types";

const now = () => new Date().toISOString();

async function requireOutletId(db: SQLiteDatabase): Promise<string> {
  const row = await db.getFirstAsync<{ value: string }>(
    "select value from app_state where key = 'outlet_id'"
  );
  if (!row) throw new OrderError("CATALOG_NOT_READY");
  return row.value;
}

/** Order pending yang sudah memakai kode meja ini — untuk dialog
 *  "pelanggan sama atau berbeda". Setara check_table_code. */
export async function checkTableCode(
  db: SQLiteDatabase,
  tableCode: string
): Promise<TableConflict[]> {
  const rows = await db.getAllAsync<{
    id: string;
    table_seq: number;
    total: number;
    item_count: number;
    version: number;
    created_at: string;
  }>(
    `select o.id, o.table_seq, o.total, o.version, o.created_at,
            coalesce((select sum(oi.quantity) from order_items oi
                      where oi.order_id = o.id), 0) as item_count
     from orders o
     where o.status = 'pending' and o.table_code = ?
     order by o.created_at desc`,
    [tableCode.trim()]
  );

  return rows.map((r) => ({
    orderId: r.id,
    tableSeq: r.table_seq,
    total: r.total,
    itemCount: r.item_count,
    version: r.version,
    createdAt: r.created_at,
  }));
}

/**
 * Simpan keranjang jadi order baru berstatus pending. Setara create_order.
 * Idempoten lewat orderId supaya percobaan ulang tidak menggandakan order.
 *
 * Harga SELALU diambil dari tabel products lokal, tidak pernah dari pemanggil —
 * aturan yang sama dengan versi Postgres, dan alasannya sama: layar kasir tidak
 * boleh bisa menentukan harga.
 */
export async function createOrder(
  db: SQLiteDatabase,
  params: {
    orderId?: string;
    tableCode: string;
    employeeId: string;
    items: OrderItemInput[];
    /**
     * Mode uji. Ditetapkan HANYA di sini — tidak ada satu pun jalur yang
     * mengubahnya sesudah order lahir, dan push_order (0023) menolak
     * menulisnya lewat cabang pembaruan. Alasannya wajib; lihat V8 di
     * db/migrations.ts untuk kenapa SQLite tidak menegakkannya sendiri.
     */
    testMode?: { reason: string };
  }
): Promise<string> {
  const orderId = params.orderId ?? Crypto.randomUUID();
  const tableCode = params.tableCode.trim();
  const testReason = params.testMode?.reason.trim() ?? null;

  const existing = await db.getFirstAsync<{ id: string }>(
    "select id from orders where id = ?",
    [orderId]
  );
  if (existing) return orderId; // sudah pernah masuk, diamkan

  if (!tableCode) throw new OrderError("TABLE_CODE_REQUIRED");
  // Ditolak DI SINI, bukan saat push. Order uji tanpa alasan akan ditolak
  // server dengan TEST_REASON_REQUIRED lalu berhenti sebagai sync_error yang
  // tidak bisa diperbaiki dari mana pun — penandanya tidak boleh diubah sesudah
  // order lahir. Jadi satu-satunya tempat yang berguna untuk menahannya adalah
  // sebelum barisnya ditulis.
  if (params.testMode && !testReason) {
    throw new OrderError("TEST_REASON_REQUIRED");
  }

  const outletId = await requireOutletId(db);
  const timestamp = now();

  await db.withExclusiveTransactionAsync(async (txn) => {
    const seqRow = await txn.getFirstAsync<{ next_seq: number }>(
      `select coalesce(max(table_seq), 0) + 1 as next_seq from orders
       where table_code = ? and status = 'pending'`,
      [tableCode]
    );

    await txn.runAsync(
      `insert into orders
         (id, outlet_id, table_code, table_seq, status, created_by,
          created_at, client_created_at, sync_status,
          is_test_data, test_mode_reason)
       values (?, ?, ?, ?, 'pending', ?, ?, ?, 'pending', ?, ?)`,
      [
        orderId,
        outletId,
        tableCode,
        seqRow?.next_seq ?? 1,
        params.employeeId,
        timestamp,
        timestamp,
        testReason ? 1 : 0,
        testReason,
      ]
    );

    for (const item of params.items) {
      if (item.quantity <= 0) continue;
      const product = await loadProduct(txn, item.productId);
      await txn.runAsync(
        `insert into order_items
           (id, order_id, product_id, product_code, product_name,
            quantity, unit_price, notes, taxable)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          Crypto.randomUUID(),
          orderId,
          product.id,
          product.code,
          product.name,
          item.quantity,
          product.price,
          item.notes ?? "",
          product.taxable,
        ]
      );
    }

    const { subtotal, kena } = await sumItems(txn, orderId);
    if (subtotal <= 0) throw new OrderError("EMPTY_ORDER");

    // Order pending: status pajak belum diputuskan, jadi `subtotal` dan `total`
    // masih sama dan tax_amount tetap 0. Keduanya baru berpisah di payOrder.
    // `taxable_subtotal` sudah diisi sejak sekarang supaya layar bisa
    // menampilkan perkiraan pajak sebelum pelunasan tanpa menghitung ulang.
    await txn.runAsync(
      "update orders set total = ?, subtotal = ?, taxable_subtotal = ? where id = ?",
      [subtotal, subtotal, kena, orderId]
    );
  });

  return orderId;
}

/**
 * Tambah item ke order pending. Setara append_to_order.
 *
 * Item digabung HANYA kalau produk, catatan, dan harga satuannya sama persis.
 * Kalau harga produk sudah berubah, baris baru dibuat terpisah supaya snapshot
 * lama tetap jujur — struk yang sudah dicetak tidak boleh berubah nilainya.
 */
export async function appendToOrder(
  db: SQLiteDatabase,
  params: {
    orderId: string;
    items: OrderItemInput[];
    expectedVersion: number;
  }
): Promise<number> {
  let newVersion = params.expectedVersion;

  await db.withExclusiveTransactionAsync(async (txn) => {
    const order = await requireEditableOrder(
      txn,
      params.orderId,
      params.expectedVersion
    );

    for (const item of params.items) {
      if (item.quantity <= 0) continue;
      const product = await loadProduct(txn, item.productId);

      const match = await txn.getFirstAsync<{ id: string }>(
        `select id from order_items
         where order_id = ? and product_id = ? and notes = ? and unit_price = ?
         limit 1`,
        [order.id, product.id, item.notes ?? "", product.price]
      );

      if (match) {
        await txn.runAsync(
          "update order_items set quantity = quantity + ? where id = ?",
          [item.quantity, match.id]
        );
      } else {
        await txn.runAsync(
          `insert into order_items
             (id, order_id, product_id, product_code, product_name,
              quantity, unit_price, notes, taxable)
           values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            Crypto.randomUUID(),
            order.id,
            product.id,
            product.code,
            product.name,
            item.quantity,
            product.price,
            item.notes ?? "",
            product.taxable,
          ]
        );
      }
    }

    const { subtotal, kena } = await sumItems(txn, order.id);
    newVersion = order.version + 1;

    // sync_status sengaja TIDAK disentuh. Order dikirim sekali saat dibuat dan
    // sekali lagi saat final; menyunting meja yang masih terbuka tidak memicu
    // apa-apa. Dulu baris ini mengembalikannya ke 'pending', dan akibatnya
    // setiap order di tab Daftar selamanya bertanda "Belum terkirim".
    //
    // Yang menanggung selisihnya adalah 0008_push_order_update.sql: push_order
    // memperbarui baris yang sudah ada bila `version` yang masuk lebih tinggi.
    // `version` di bawah ini tetap naik, jadi kiriman saat pelunasan membawa
    // angka tertinggi dan menyusul semua perubahan yang dilewati. Menghapus
    // kenaikan version, atau mengembalikan push_order ke perilaku 0005, akan
    // membuat perubahan ini kehilangan uang tanpa satu pun pesan kesalahan.
    await txn.runAsync(
      "update orders set total = ?, subtotal = ?, taxable_subtotal = ?, version = ? where id = ?",
      [subtotal, subtotal, kena, newVersion, order.id]
    );
  });

  return newVersion;
}

/** Memindahkan order pending ke kode meja lain tanpa mengubah order lunas. */
export async function changeTableCode(
  db: SQLiteDatabase,
  params: { orderId: string; tableCode: string; expectedVersion: number }
): Promise<number> {
  let newVersion = params.expectedVersion;

  await db.withExclusiveTransactionAsync(async (txn) => {
    const order = await requireEditableOrder(
      txn,
      params.orderId,
      params.expectedVersion
    );
    const tableCode = params.tableCode.trim();
    if (!tableCode) throw new OrderError("TABLE_CODE_REQUIRED");
    if (tableCode === order.table_code) {
      newVersion = order.version;
      return;
    }

    const seqRow = await txn.getFirstAsync<{ next_seq: number }>(
      `select coalesce(max(table_seq), 0) + 1 as next_seq from orders
       where table_code = ? and status = 'pending' and id <> ?`,
      [tableCode, order.id]
    );
    newVersion = order.version + 1;
    await txn.runAsync(
      "update orders set table_code = ?, table_seq = ?, version = ? where id = ?",
      [tableCode, seqRow?.next_seq ?? 1, newVersion, order.id]
    );
  });

  return newVersion;
}

/**
 * SATU-SATUNYA jalan mengurangi item dari order tersimpan. Setara
 * void_order_item. Selalu menulis jejak ke order_item_voids supaya laporan void
 * tidak bolong; kalau seluruh item habis, order itu sendiri jadi 'void'.
 */
export async function voidOrderItem(
  db: SQLiteDatabase,
  params: {
    orderId: string;
    itemId: string;
    quantity: number;
    employeeId: string;
    reason: string;
    expectedVersion: number;
  }
): Promise<number> {
  let newVersion = params.expectedVersion;

  await db.withExclusiveTransactionAsync(async (txn) => {
    const order = await requireEditableOrder(
      txn,
      params.orderId,
      params.expectedVersion
    );

    const item = await txn.getFirstAsync<OrderItemRow>(
      "select * from order_items where id = ? and order_id = ?",
      [params.itemId, order.id]
    );
    if (!item) throw new OrderError("ITEM_NOT_FOUND");
    if (params.quantity <= 0 || params.quantity > item.quantity) {
      throw new OrderError("INVALID_VOID_QUANTITY");
    }

    await txn.runAsync(
      `insert into order_item_voids
         (id, order_id, product_code, product_name, quantity, unit_price,
          voided_by, reason, created_at)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        Crypto.randomUUID(),
        order.id,
        item.product_code,
        item.product_name,
        params.quantity,
        item.unit_price,
        params.employeeId,
        params.reason.trim() || null,
        now(),
      ]
    );

    if (params.quantity === item.quantity) {
      await txn.runAsync("delete from order_items where id = ?", [item.id]);
    } else {
      await txn.runAsync(
        "update order_items set quantity = quantity - ? where id = ?",
        [params.quantity, item.id]
      );
    }

    const { subtotal, kena } = await sumItems(txn, order.id);
    const remaining = await txn.getFirstAsync<{ n: number }>(
      "select count(*) as n from order_items where order_id = ?",
      [order.id]
    );
    newVersion = order.version + 1;

    if ((remaining?.n ?? 0) === 0) {
      await txn.runAsync(
        `update orders
         set total = 0, subtotal = 0, taxable_subtotal = 0, version = ?, status = 'void', voided_at = ?,
             voided_by = ?, void_reason = 'Semua item dibatalkan',
             sync_status = 'pending', sync_error = null
         where id = ?`,
        [newVersion, now(), params.employeeId, order.id]
      );
    } else {
      // Void sebagian: order masih terbuka, jadi antreannya tidak disentuh —
      // alasan lengkapnya di appendToOrder. Bandingkan dengan cabang di atas,
      // yang menjadikan order 'void' dan karena itu wajib terkirim.
      await txn.runAsync(
        "update orders set total = ?, subtotal = ?, taxable_subtotal = ?, version = ? where id = ?",
        [subtotal, subtotal, kena, newVersion, order.id]
      );
    }
  });

  return newVersion;
}

/**
 * Membatalkan SELURUH item sekaligus. Hasil akhirnya identik dengan menekan
 * "Batalkan item" satu per satu sampai habis: satu baris jejak per item di
 * order_item_voids, lalu order itu sendiri jadi 'void'.
 *
 * Ini bukan gula sintaksis di atas voidOrderItem. Memanggil voidOrderItem dalam
 * perulangan tidak bisa: setiap panggilan menaikkan `version`, jadi putaran
 * kedua sudah memegang salinan basi dan langsung kena STALE_ORDER kecuali order
 * dibaca ulang tiap putaran. Lebih buruk lagi, perulangan itu bukan satu
 * transaksi — kalau putaran ketiga gagal, order tertinggal separuh terhapus
 * tanpa ada yang memintanya. Satu withExclusiveTransactionAsync menutup
 * keduanya, dan `version` hanya naik satu.
 */
export async function voidAllOrderItems(
  db: SQLiteDatabase,
  params: {
    orderId: string;
    employeeId: string;
    reason: string;
    expectedVersion: number;
  }
): Promise<number> {
  let newVersion = params.expectedVersion;

  await db.withExclusiveTransactionAsync(async (txn) => {
    const order = await requireEditableOrder(
      txn,
      params.orderId,
      params.expectedVersion
    );

    const items = await txn.getAllAsync<OrderItemRow>(
      "select * from order_items where order_id = ?",
      [order.id]
    );
    if (items.length === 0) throw new OrderError("ITEM_NOT_FOUND");

    const stamp = now();
    const reason = params.reason.trim() || null;
    for (const item of items) {
      await txn.runAsync(
        `insert into order_item_voids
           (id, order_id, product_code, product_name, quantity, unit_price,
            voided_by, reason, created_at)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          Crypto.randomUUID(),
          order.id,
          item.product_code,
          item.product_name,
          item.quantity,
          item.unit_price,
          params.employeeId,
          reason,
          stamp,
        ]
      );
    }

    await txn.runAsync("delete from order_items where order_id = ?", [order.id]);

    // Order kosong selalu jadi 'void' dan karena itu WAJIB terkirim — sama
    // dengan cabang penghabis di voidOrderItem, termasuk membangunkan antrean.
    newVersion = order.version + 1;
    await txn.runAsync(
      `update orders
       set total = 0, subtotal = 0, taxable_subtotal = 0, version = ?, status = 'void', voided_at = ?,
           voided_by = ?, void_reason = ?,
           sync_status = 'pending', sync_error = null
       where id = ?`,
      [
        newVersion,
        stamp,
        params.employeeId,
        reason ?? "Semua item dibatalkan",
        order.id,
      ]
    );
  });

  return newVersion;
}

/**
 * Pelunasan. Setara pay_order. Subtotal selalu dihitung ulang dari order_items,
 * bukan dipercaya dari layar. Idempoten kalau order sudah lunas.
 *
 * Pajak dihitung DI SINI, di perangkat, karena pelunasan harus bisa terjadi
 * tanpa sinyal. Tarifnya bukan konstanta di kode: ia dibaca dari app_state,
 * tempat pullCatalog menyimpannya. Kalau belum pernah ditarik, pembayaran
 * ditolak — angka pajak yang ditebak sendiri oleh perangkat adalah angka yang
 * salah tanpa ada yang tahu.
 *
 * Rumus pembulatannya (lib/tax.ts) sama persis dengan yang ada di Postgres.
 * Kalau keduanya menyimpang, push_order menolak dengan TAX_MISMATCH dan order
 * lunas tertahan di antrean — itulah kenapa kedua berkas kembar itu wajib
 * diubah bersamaan.
 */
export async function payOrder(
  db: SQLiteDatabase,
  params: {
    orderId: string;
    method: PaymentMethod;
    amountReceived: number | null;
    employeeId: string;
    taxStatus: TaxStatus;
    /** Wajib, dan wajib tidak kosong, kalau taxStatus 'exempt'. */
    taxExemptReason: string | null;
  }
): Promise<void> {
  const rateBps = await taxRateBps(db);
  if (rateBps === null) throw new OrderError("TAX_RATE_UNKNOWN");

  const reason = params.taxExemptReason?.trim() || null;
  if (params.taxStatus === "exempt" && !reason) {
    throw new OrderError("TAX_EXEMPT_REASON_REQUIRED");
  }

  await db.withExclusiveTransactionAsync(async (txn) => {
    const order = await txn.getFirstAsync<OrderRow>(
      "select * from orders where id = ?",
      [params.orderId]
    );
    if (!order) throw new OrderError("ORDER_NOT_FOUND");
    if (order.status === "paid") return; // idempoten, bukan error
    if (order.status !== "pending") throw new OrderError("ORDER_NOT_PAYABLE");

    const { subtotal, kena } = await sumItems(txn, order.id);
    if (subtotal <= 0) throw new OrderError("EMPTY_ORDER");

    // Basisnya `kena`, bukan `subtotal`. Order yang isinya rokok saja
    // menghasilkan kena = 0 dan karena itu pajak 0 — tapi statusnya TETAP
    // 'taxable', bukan 'exempt', dan tidak ada keterangan yang diminta.
    // Pembebasan adalah keputusan orang yang harus bisa diaudit; ini bukan
    // pembebasan, barangnya memang bukan objek pajak.
    const tax = params.taxStatus === "exempt" ? 0 : hitungPbjt(kena, rateBps);
    const total = subtotal + tax;

    let received: number;
    if (params.method === "cash") {
      if (params.amountReceived === null || params.amountReceived < total) {
        throw new OrderError("INSUFFICIENT_AMOUNT");
      }
      received = params.amountReceived;
    } else {
      received = total;
    }

    const paidAt = now();

    await txn.runAsync(
      `update orders
       set status = 'paid', subtotal = ?, taxable_subtotal = ?, total = ?,
           tax_status = ?, tax_rate_bps = ?, tax_amount = ?,
           tax_exempt_reason = ?, tax_approved_by = ?,
           paid_at = ?, paid_by = ?,
           payment_method = ?, amount_received = ?, change_amount = ?,
           version = version + 1, sync_status = 'pending', sync_error = null
       where id = ?`,
      [
        subtotal,
        kena,
        total,
        params.taxStatus,
        // Tarif di-snapshot juga saat bebas pajak. Tanpa itu, "berapa pajak yang
        // tidak jadi dipungut" tidak bisa dihitung ulang setelah perda berubah.
        rateBps,
        tax,
        params.taxStatus === "exempt" ? reason : null,
        params.taxStatus === "exempt" ? params.employeeId : null,
        paidAt,
        params.employeeId,
        params.method,
        received,
        received - total,
        order.id,
      ]
    );

    await txn.runAsync(
      `insert into payments
         (id, order_id, method, amount, employee_id, created_at, sync_status)
       values (?, ?, ?, ?, ?, ?, 'pending')`,
      [
        Crypto.randomUUID(),
        order.id,
        params.method,
        // Yang masuk laci adalah angka tagihan, termasuk pajaknya. push_order
        // menolak kiriman yang nilainya bukan ini (PAYMENT_AMOUNT_MISMATCH).
        total,
        params.employeeId,
        paidAt,
      ]
    );
  });
}

/**
 * Hapus SELURUH order mode uji, bukan hanya yang dibuat layar uji.
 *
 * Sampai V8 penandanya awalan `UJI-` pada table_code, dan cakupannya memang
 * hanya order buatan DebugScreen. Sekarang penandanya `is_test_data`, yang juga
 * dipasang kasir lewat mode uji di layar kasir — jadi tombol ini membuang
 * keduanya. Itu memang yang diinginkan: order uji tidak pernah jadi catatan
 * uang, jadi tidak ada yang bisa hilang dengan menghapusnya.
 *
 * Berbeda dari clearHistory, TIDAK ada penjagaan "sudah terkirim atau belum"
 * dan itu disengaja. Penjagaan di sana ada karena order lunas yang belum
 * tersinkron adalah catatan uang yang cuma ada di ponsel ini. Order uji bukan
 * catatan uang, dan menahannya sampai terkirim justru memaksa sampah naik ke
 * server dulu sebelum boleh dibuang.
 *
 * order_items, order_item_voids, payments, dan refunds ikut terhapus lewat
 * `on delete cascade` di skema — selama `pragma foreign_keys` menyala, yang
 * disetel saat migrasi dijalankan.
 */
export async function clearTestOrders(db: SQLiteDatabase): Promise<number> {
  const result = await db.runAsync("delete from orders where is_test_data = 1");
  return result.changes;
}

/**
 * Berapa lama sebuah order harus sudah selesai sebelum boleh dibersihkan.
 *
 * Enam jam, diturunkan dari dua belas atas permintaan pemilik: satu sif kasir
 * di sini lebih pendek dari satu hari kerja penuh, dan daftar yang menumpuk
 * sampai malam membuat order yang masih hidup tenggelam di antara yang sudah
 * lunas. Enam jam masih menutupi seluruh sif berjalan — pelanggan yang minta
 * struknya dicetak ulang melakukannya dalam hitungan menit, bukan jam.
 *
 * Angka ini satu-satunya sumber: dialog konfirmasi membaca konstanta yang sama,
 * jadi mengubahnya di sini sudah cukup dan tidak ada kalimat yang perlu diikuti.
 * Yang TIDAK berubah adalah syarat lainnya — order pending tidak pernah ikut
 * terhapus berapa pun umurnya, dan order yang belum sampai ke server dilewati.
 * Memperpendek tenggat memperbesar kemungkinan kasir menekan Bersihkan sebelum
 * antrean kirim sempat kosong, dan penjagaan itulah yang menahannya.
 */
export const HISTORY_KEEP_HOURS = 6;

export interface HistorySweep {
  /** Order yang memenuhi semua syarat dan akan (atau sudah) dihapus. */
  hapus: number;
  /**
   * Order selesai yang sudah cukup tua tapi BELUM sampai ke server, jadi
   * dilewati. Angka ini ditampilkan apa adanya di dialog konfirmasi — ia
   * satu-satunya petunjuk bahwa ada catatan uang yang cuma ada di ponsel ini.
   */
  tahan: number;
}

/**
 * Batas waktu sebagai ISO, dihitung dari saat order SELESAI — bukan saat ia
 * dibuat. Meja yang dibuka jam 9 pagi dan baru dibayar jam 9 malam masih
 * berumur nol menit sebagai histori.
 */
const historyCutoff = () =>
  new Date(Date.now() - HISTORY_KEEP_HOURS * 3600_000).toISOString();

const HISTORY_WHERE = `
  status <> 'pending'
  and coalesce(paid_at, voided_at, created_at) < ?`;

/**
 * Hitungan untuk dialog konfirmasi. Dipisah dari penghapusannya supaya kasir
 * melihat angka sebenarnya sebelum memutuskan, bukan kalimat umum "yakin?".
 */
export async function countClearableHistory(
  db: SQLiteDatabase
): Promise<HistorySweep> {
  const cutoff = historyCutoff();
  const row = await db.getFirstAsync<{ hapus: number; tahan: number }>(
    `select
       sum(case when sync_status =  'synced' then 1 else 0 end) as hapus,
       sum(case when sync_status <> 'synced' then 1 else 0 end) as tahan
     from orders
     where ${HISTORY_WHERE}`,
    [cutoff]
  );
  return { hapus: row?.hapus ?? 0, tahan: row?.tahan ?? 0 };
}

/**
 * Membersihkan histori lokal. Menghapus di ponsel saja — di server tidak ada
 * akun pegawai yang punya izin DELETE, dan itu disengaja.
 *
 * Syarat `sync_status = 'synced'` tidak boleh dilonggarkan. Order lunas yang
 * belum terkirim hanya ada di perangkat ini; menghapusnya membuang catatan uang
 * yang tidak punya salinan di mana pun, dan tidak ada satu pun cara memulihkan
 * — bahkan laporan pun tidak akan tahu ia pernah ada.
 *
 * order_items, order_item_voids, dan payments ikut terhapus lewat
 * `on delete cascade`, selama `pragma foreign_keys` menyala (disetel saat
 * migrasi lokal dijalankan).
 */
export async function clearHistory(db: SQLiteDatabase): Promise<HistorySweep> {
  const before = await countClearableHistory(db);
  const result = await db.runAsync(
    `delete from orders
     where ${HISTORY_WHERE}
       and sync_status = 'synced'`,
    [historyCutoff()]
  );
  return { hapus: result.changes, tahan: before.tahan };
}

/**
 * Satu order beserta itemnya. Layar ubah order harus membacanya ulang setiap
 * kali menulis: appendToOrder dan voidOrderItem menaikkan `version`, dan
 * memakai angka lama pada tulisan berikutnya berujung STALE_ORDER.
 */
export async function getOrder(
  db: SQLiteDatabase,
  orderId: string
): Promise<(OrderRow & { items: OrderItemRow[] }) | null> {
  const order = await db.getFirstAsync<OrderRow>(
    "select * from orders where id = ?",
    [orderId]
  );
  if (!order) return null;

  const items = await db.getAllAsync<OrderItemRow>(
    "select * from order_items where order_id = ? order by rowid",
    [orderId]
  );
  return { ...order, items };
}

/** Order terbaru beserta itemnya. */
export async function listRecentOrders(
  db: SQLiteDatabase,
  limit = 20
): Promise<Array<OrderRow & { items: OrderItemRow[] }>> {
  const orders = await db.getAllAsync<OrderRow>(
    "select * from orders order by created_at desc limit ?",
    [limit]
  );
  if (orders.length === 0) return [];

  // Satu query untuk semua item, bukan satu query per order. Bedanya belum
  // terasa pada sepuluh baris, tapi layar riwayat di langkah 6 akan memuat
  // ratusan, dan pola N+1 di SQLite perangkat mahal harganya.
  const items = await db.getAllAsync<OrderItemRow>(
    `select * from order_items
     where order_id in (${orders.map(() => "?").join(", ")})
     order by rowid`,
    orders.map((o) => o.id)
  );

  const byOrder = new Map<string, OrderItemRow[]>();
  for (const item of items) {
    const list = byOrder.get(item.order_id);
    if (list) list.push(item);
    else byOrder.set(item.order_id, [item]);
  }

  return orders.map((order) => ({
    ...order,
    items: byOrder.get(order.id) ?? [],
  }));
}

// ------------------------------------------------------------------ internal

/**
 * Jumlah item order, beserta bagiannya yang objek PBJT.
 *
 * Mengembalikan objek, bukan angka, dan itu disengaja: sebelum rokok dibebaskan
 * fungsi ini mengembalikan satu angka yang dipakai sekaligus sebagai subtotal
 * DAN sebagai basis pajak. Kedua arti itu kini berbeda, dan bentuk kembalian
 * yang berubah memaksa setiap pemanggil ditinjau ulang alih-alih diam-diam
 * memakai angka yang salah satu di antaranya.
 *
 * `filter` tidak ada di SQLite versi yang dipakai Expo, jadi dipakai
 * `sum(case when ...)` — hasilnya sama dan didukung di mana-mana.
 */
async function sumItems(
  db: SQLiteDatabase,
  orderId: string
): Promise<{ subtotal: number; kena: number }> {
  const row = await db.getFirstAsync<{ total: number; kena: number }>(
    `select coalesce(sum(subtotal), 0) as total,
            coalesce(sum(case when taxable = 1 then subtotal else 0 end), 0) as kena
     from order_items where order_id = ?`,
    [orderId]
  );
  return { subtotal: row?.total ?? 0, kena: row?.kena ?? 0 };
}

async function requireEditableOrder(
  db: SQLiteDatabase,
  orderId: string,
  expectedVersion: number
): Promise<OrderRow> {
  const order = await db.getFirstAsync<OrderRow>(
    "select * from orders where id = ?",
    [orderId]
  );
  if (!order) throw new OrderError("ORDER_NOT_FOUND");
  if (order.status !== "pending") throw new OrderError("ORDER_NOT_EDITABLE");
  if (order.version !== expectedVersion) throw new OrderError("STALE_ORDER");
  return order;
}

// ============================================================ refund
//
// Terjemahan baris demi baris dari create_refund di 0016_refund.sql, aturan yang
// sama persis — termasuk yang paling mudah terlewat: kalau refund ini
// menghabiskan seluruh subtotal order, pajak yang dikembalikan adalah SISA
// tax_amount, bukan hasil rumus. Lihat komentar di refundTax.
//
// ORDER LUNAS TIDAK DIUBAH. Tidak ada satu pun kolom orders yang disentuh selain
// sync_status: `total` adalah yang sudah ditagihkan dan sudah tercetak di struk
// yang dipegang pelanggan. Yang berubah hanyalah adanya baris refund baru.

/** Berapa banyak tiap item yang sudah pernah direfund. Kunci = order_item_id. */
export async function refundedQuantities(
  db: SQLiteDatabase,
  orderId: string
): Promise<Record<string, number>> {
  const rows = await db.getAllAsync<{ order_item_id: string; qty: number }>(
    `select ri.order_item_id, sum(ri.quantity) as qty
     from refund_items ri
     join refunds r on r.id = ri.refund_id
     where r.order_id = ?
     group by ri.order_item_id`,
    [orderId]
  );
  return Object.fromEntries(rows.map((r) => [r.order_item_id, r.qty]));
}

/**
 * Berapa yang sudah dikembalikan per order. Kunci = order_id; order tanpa refund
 * tidak muncul sama sekali.
 *
 * Satu kueri untuk seluruh daftar, bukan satu per kartu — layar Order memakainya
 * untuk tiga hal sekaligus (label badge, angka bersih, dan ada-tidaknya tombol
 * Refund), dan ketiganya WAJIB berasal dari peta yang sama. Dua sumber kebenaran
 * untuk satu pertanyaan adalah persis cara badge dan tombol bisa berbeda
 * pendapat tentang order yang sama.
 */
export async function refundTotalsByOrder(
  db: SQLiteDatabase
): Promise<Record<string, number>> {
  const rows = await db.getAllAsync<{ order_id: string; amount: number }>(
    `select order_id, sum(amount) as amount
     from refunds
     group by order_id`
  );
  return Object.fromEntries(rows.map((row) => [row.order_id, row.amount]));
}

/** Refund sebuah order, terbaru dulu, beserta itemnya. */
export async function listRefunds(
  db: SQLiteDatabase,
  orderId: string
): Promise<Array<RefundRow & { items: RefundItemRow[] }>> {
  const refunds = await db.getAllAsync<RefundRow>(
    "select * from refunds where order_id = ? order by created_at desc",
    [orderId]
  );
  return Promise.all(
    refunds.map(async (refund) => ({
      ...refund,
      items: await db.getAllAsync<RefundItemRow>(
        "select * from refund_items where refund_id = ? order by rowid",
        [refund.id]
      ),
    }))
  );
}

/**
 * Pajak yang dikembalikan. Kembar dari hitung_pajak_refund di 0021.
 *
 * Cabang kedua wajib dan tidak akan terlihat sampai ia salah: begitu seluruh
 * subtotal order habis direfund, yang dikembalikan adalah SISA pajaknya. Tanpa
 * itu, refund yang dipecah dua bisa menyisakan pajak satu-dua rupiah yang tidak
 * pernah bisa dikembalikan dan tidak pernah bisa dijelaskan ke siapa pun.
 *
 * Tarifnya tarif SNAPSHOT milik order (`order.tax_rate_bps`), bukan tarif outlet
 * hari ini — refund atas transaksi bulan lalu harus memakai tarif yang berlaku
 * saat transaksinya terjadi.
 *
 * `subtotal` dan `kena` terpisah sejak rokok dibebaskan: yang pertama seluruh
 * nilai barang yang dikembalikan, yang kedua bagiannya yang objek pajak.
 * Cabang "habis" tetap diukur dengan `subtotal` — yang ditanya adalah apakah
 * seluruh order sudah kembali, dan order baru habis kalau rokoknya ikut
 * kembali. Mengukurnya dengan `kena` akan menyatakan order habis begitu bagian
 * makanannya dikembalikan, lalu mengembalikan seluruh sisa pajak sementara
 * rokoknya masih di tangan pelanggan. Itu bukan pembulatan yang salah, itu uang
 * yang salah.
 */
function refundTax(
  order: OrderRow,
  subtotal: number,
  kena: number,
  sudahSub: number,
  sudahTax: number
): number {
  if (order.tax_status === "exempt") return 0;
  if (sudahSub + subtotal >= order.subtotal) return order.tax_amount - sudahTax;
  return hitungPbjt(kena, order.tax_rate_bps);
}

export async function createRefund(
  db: SQLiteDatabase,
  params: {
    orderId: string;
    employeeId: string;
    /** Opsional. Berbeda dari keterangan bebas pajak yang wajib. */
    reason: string | null;
    items: RefundItemInput[];
  }
): Promise<string> {
  const refundId = Crypto.randomUUID();

  await db.withExclusiveTransactionAsync(async (txn) => {
    const order = await txn.getFirstAsync<OrderRow>(
      "select * from orders where id = ?",
      [params.orderId]
    );
    if (!order) throw new OrderError("ORDER_NOT_FOUND");
    if (order.status !== "paid") throw new OrderError("REFUND_NOT_ALLOWED");

    // Baris digabung per item lebih dulu. Layar tidak seharusnya mengirim item
    // yang sama dua kali, tapi kalau ia melakukannya, keduanya harus dinilai
    // sebagai satu permintaan — kalau tidak, masing-masing melihat sisa yang
    // sama dan keduanya lolos.
    const diminta = new Map<string, number>();
    for (const item of params.items) {
      if (item.quantity > 0) {
        diminta.set(
          item.orderItemId,
          (diminta.get(item.orderItemId) ?? 0) + item.quantity
        );
      }
    }
    if (diminta.size === 0) throw new OrderError("REFUND_EMPTY");

    const sudah = await refundedQuantities(txn as SQLiteDatabase, order.id);

    let subtotal = 0;
    let kena = 0;
    const baris: Array<{ item: OrderItemRow; quantity: number }> = [];

    for (const [orderItemId, quantity] of diminta) {
      const item = await txn.getFirstAsync<OrderItemRow>(
        "select * from order_items where id = ? and order_id = ?",
        [orderItemId, order.id]
      );
      if (!item) throw new OrderError("REFUND_LINE_UNKNOWN");

      const sisa = item.quantity - (sudah[orderItemId] ?? 0);
      if (quantity > sisa) throw new OrderError("REFUND_QUANTITY_INVALID");

      // Harga dari order_items, bukan dari pemanggil. Aturan "harga selalu dari
      // server" berlaku sama untuk uang yang keluar.
      subtotal += quantity * item.unit_price;
      // Dari SNAPSHOT di barisnya, bukan dari kategori produk hari ini. Kalau
      // rokok pernah dipungut pajak sebelum 0019, refundnya harus mengembalikan
      // pajak itu juga — yang berlaku adalah apa yang tercetak di struknya.
      if (item.taxable === 1) kena += quantity * item.unit_price;
      baris.push({ item, quantity });
    }

    const agregat = await txn.getFirstAsync<{ sub: number; pajak: number }>(
      `select coalesce(sum(subtotal), 0) as sub,
              coalesce(sum(tax_amount), 0) as pajak
       from refunds where order_id = ?`,
      [order.id]
    );
    const sudahSub = agregat?.sub ?? 0;
    const sudahTax = agregat?.pajak ?? 0;

    const tax = refundTax(order, subtotal, kena, sudahSub, sudahTax);

    if (
      sudahSub + subtotal > order.subtotal ||
      sudahSub + sudahTax + subtotal + tax > order.total
    ) {
      throw new OrderError("REFUND_EXCEEDS_ORDER");
    }

    const createdAt = now();

    await txn.runAsync(
      `insert into refunds
         (id, order_id, subtotal, tax_amount, amount, reason, employee_id, created_at)
       values (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        refundId,
        order.id,
        subtotal,
        tax,
        subtotal + tax,
        params.reason?.trim() || null,
        params.employeeId,
        createdAt,
      ]
    );

    for (const { item, quantity } of baris) {
      await txn.runAsync(
        `insert into refund_items
           (id, refund_id, order_item_id, product_name, quantity, unit_price)
         values (?, ?, ?, ?, ?, ?)`,
        [
          Crypto.randomUUID(),
          refundId,
          item.id,
          item.product_name,
          quantity,
          item.unit_price,
        ]
      );
    }

    // Order dikembalikan ke antrean kirim, dan versinya WAJIB naik meskipun
    // tidak satu pun kolom uang di baris ini berubah.
    //
    // Sebabnya ada di push_order: cabang pembaruannya memakai `version <
    // v_version` sebagai predikat UPDATE, dan kalau UPDATE itu tidak mengenai
    // baris apa pun, fungsinya LANGSUNG RETURN — itu yang membuat "Kirim ulang"
    // aman untuk kiriman berulang. Tanpa kenaikan versi, kiriman yang membawa
    // refund akan dinilai sebagai ulangan basi dan refundnya tidak pernah
    // tersisip, dengan jawaban sukses. Uang yang keluar hanya tercatat di
    // ponsel, dan tidak ada satu pun tanda bahwa itu terjadi.
    //
    // Baris order ditulis ulang dengan nilai yang sama persis; yang benar-benar
    // baru hanyalah baris refund, yang masuk lewat `on conflict do nothing`
    // atas id buatan perangkat ini sehingga pengiriman berulang tidak pernah
    // menggandakan uang keluar.
    await txn.runAsync(
      `update orders
       set version = version + 1, sync_status = 'pending', sync_error = null
       where id = ?`,
      [order.id]
    );
  });

  return refundId;
}

/**
 * Penyimpangan disengaja dari Postgres: create_order melakukan `join products`,
 * jadi productId yang tidak dikenal DIAM-DIAM hilang dari order. Di server itu
 * hampir mustahil terjadi karena katalognya selalu mutakhir. Di perangkat,
 * katalog lokal bisa basi — item yang hilang tanpa suara berarti pelanggan
 * dilayani tapi tidak ditagih. Jadi di sini kasus itu dilempar sebagai error.
 */
async function loadProduct(
  db: SQLiteDatabase,
  productId: string
): Promise<ProductRow & { taxable: number }> {
  // Sifat kena-pajak ikut dibaca di sini supaya ia bisa di-SNAPSHOT ke
  // order_items saat baris dibuat. `coalesce(c.taxable, 1)`: produk tanpa
  // kategori dipungut pajak — bebas pajak harus selalu keputusan yang tegas,
  // bukan akibat sambungan yang gagal.
  const product = await db.getFirstAsync<ProductRow & { taxable: number }>(
    `select p.*, coalesce(c.taxable, 1) as taxable
     from products p
     left join categories c on c.id = p.category_id
     where p.id = ?`,
    [productId]
  );
  if (!product) throw new OrderError("PRODUCT_NOT_FOUND");
  return product;
}
