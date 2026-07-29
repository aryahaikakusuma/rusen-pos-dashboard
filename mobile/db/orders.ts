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

import type { PaymentMethod } from "../lib/types";
import { OrderError } from "./errors";
import type {
  OrderItemInput,
  OrderItemRow,
  OrderRow,
  ProductRow,
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
  }
): Promise<string> {
  const orderId = params.orderId ?? Crypto.randomUUID();
  const tableCode = params.tableCode.trim();

  const existing = await db.getFirstAsync<{ id: string }>(
    "select id from orders where id = ?",
    [orderId]
  );
  if (existing) return orderId; // sudah pernah masuk, diamkan

  if (!tableCode) throw new OrderError("TABLE_CODE_REQUIRED");

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
          created_at, client_created_at, sync_status)
       values (?, ?, ?, ?, 'pending', ?, ?, ?, 'pending')`,
      [
        orderId,
        outletId,
        tableCode,
        seqRow?.next_seq ?? 1,
        params.employeeId,
        timestamp,
        timestamp,
      ]
    );

    for (const item of params.items) {
      if (item.quantity <= 0) continue;
      const product = await loadProduct(txn, item.productId);
      await txn.runAsync(
        `insert into order_items
           (id, order_id, product_id, product_code, product_name,
            quantity, unit_price, notes)
         values (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          Crypto.randomUUID(),
          orderId,
          product.id,
          product.code,
          product.name,
          item.quantity,
          product.price,
          item.notes ?? "",
        ]
      );
    }

    const total = await sumItems(txn, orderId);
    if (total <= 0) throw new OrderError("EMPTY_ORDER");

    await txn.runAsync("update orders set total = ? where id = ?", [
      total,
      orderId,
    ]);
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
              quantity, unit_price, notes)
           values (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            Crypto.randomUUID(),
            order.id,
            product.id,
            product.code,
            product.name,
            item.quantity,
            product.price,
            item.notes ?? "",
          ]
        );
      }
    }

    const total = await sumItems(txn, order.id);
    newVersion = order.version + 1;

    await txn.runAsync(
      `update orders set total = ?, version = ?, sync_status = 'pending',
                         sync_error = null
       where id = ?`,
      [total, newVersion, order.id]
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

    const total = await sumItems(txn, order.id);
    const remaining = await txn.getFirstAsync<{ n: number }>(
      "select count(*) as n from order_items where order_id = ?",
      [order.id]
    );
    newVersion = order.version + 1;

    if ((remaining?.n ?? 0) === 0) {
      await txn.runAsync(
        `update orders
         set total = 0, version = ?, status = 'void', voided_at = ?,
             voided_by = ?, void_reason = 'Semua item dibatalkan',
             sync_status = 'pending', sync_error = null
         where id = ?`,
        [newVersion, now(), params.employeeId, order.id]
      );
    } else {
      await txn.runAsync(
        `update orders set total = ?, version = ?, sync_status = 'pending',
                           sync_error = null
         where id = ?`,
        [total, newVersion, order.id]
      );
    }
  });

  return newVersion;
}

/**
 * Pelunasan. Setara pay_order. Total selalu dihitung ulang dari order_items,
 * bukan dipercaya dari layar. Idempoten kalau order sudah lunas.
 */
export async function payOrder(
  db: SQLiteDatabase,
  params: {
    orderId: string;
    method: PaymentMethod;
    amountReceived: number | null;
    employeeId: string;
  }
): Promise<void> {
  await db.withExclusiveTransactionAsync(async (txn) => {
    const order = await txn.getFirstAsync<OrderRow>(
      "select * from orders where id = ?",
      [params.orderId]
    );
    if (!order) throw new OrderError("ORDER_NOT_FOUND");
    if (order.status === "paid") return; // idempoten, bukan error
    if (order.status !== "pending") throw new OrderError("ORDER_NOT_PAYABLE");

    const total = await sumItems(txn, order.id);
    if (total <= 0) throw new OrderError("EMPTY_ORDER");

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
       set status = 'paid', total = ?, paid_at = ?, paid_by = ?,
           payment_method = ?, amount_received = ?, change_amount = ?,
           version = version + 1, sync_status = 'pending', sync_error = null
       where id = ?`,
      [
        total,
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
        total,
        params.employeeId,
        paidAt,
      ]
    );
  });
}

/**
 * Awalan kode meja yang dipakai layar uji langkah 3. Order sungguhan tidak
 * pernah memakainya, jadi ini aman jadi penanda data buangan.
 */
export const TEST_TABLE_PREFIX = "UJI-";

/**
 * Hapus order yang dibuat layar uji. Setiap kali uji dijalankan ia membuat
 * order baru — kalau tidak dibersihkan, daftar order lokal cepat penuh sampah
 * dan hasil uji berikutnya jadi sulit dibaca.
 *
 * order_items, order_item_voids, dan payments ikut terhapus lewat
 * `on delete cascade` di skema — selama `pragma foreign_keys` menyala, yang
 * disetel saat migrasi dijalankan.
 */
export async function clearTestOrders(db: SQLiteDatabase): Promise<number> {
  const result = await db.runAsync(
    "delete from orders where table_code like ?",
    [`${TEST_TABLE_PREFIX}%`]
  );
  return result.changes;
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

async function sumItems(db: SQLiteDatabase, orderId: string): Promise<number> {
  const row = await db.getFirstAsync<{ total: number }>(
    "select coalesce(sum(subtotal), 0) as total from order_items where order_id = ?",
    [orderId]
  );
  return row?.total ?? 0;
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
): Promise<ProductRow> {
  const product = await db.getFirstAsync<ProductRow>(
    "select * from products where id = ?",
    [productId]
  );
  if (!product) throw new OrderError("PRODUCT_NOT_FOUND");
  return product;
}
