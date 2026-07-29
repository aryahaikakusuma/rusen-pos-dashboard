/**
 * Antrean kirim. Bukan sync engine.
 *
 * Yang sengaja TIDAK ada di sini: pemantau koneksi latar, tarik-turun dari
 * server, dan penyelesaian konflik. Untuk satu outlet dengan hotspot sebagai
 * cadangan, jendela offline-nya hitungan detik sampai menit, dan dua perangkat
 * menulis order yang sama di rentang itu praktis tidak terjadi.
 *
 * Yang justru dijaga adalah kegagalan yang benar-benar mungkin: satu kiriman
 * sampai ke server tapi jawabannya hilang. Penangkalnya ada di sisi Postgres —
 * push_order idempoten pada orders.id, dan id itu dibuat di perangkat. Karena
 * itulah mengirim ulang tidak pernah menggandakan order, dan tombol "Kirim
 * ulang" aman diserahkan ke kasir.
 */

import type { SQLiteDatabase } from "expo-sqlite";

import { supabase } from "../lib/supabase";
import type { OrderItemRow, OrderRow } from "./types";

export interface PushResult {
  sent: number;
  failed: number;
  /** Sisa yang masih belum terkirim setelah percobaan ini. */
  remaining: number;
}

interface VoidRow {
  id: string;
  order_id: string;
  product_code: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  voided_by: string;
  reason: string | null;
  created_at: string;
}

interface PaymentRow {
  id: string;
  order_id: string;
  method: string;
  amount: number;
  employee_id: string;
  created_at: string;
}

/** Berapa order yang belum sampai ke server. Ditopang indeks orders_sync_idx. */
export async function countUnsent(db: SQLiteDatabase): Promise<number> {
  const row = await db.getFirstAsync<{ n: number }>(
    "select count(*) as n from orders where sync_status <> 'synced'"
  );
  return row?.n ?? 0;
}

/**
 * Mengirim setiap order yang tertunda, satu per satu.
 *
 * Satu order gagal tidak boleh menghentikan sisanya: kegagalan yang paling
 * mungkin justru bersifat per-order (misalnya penulisnya sudah dinonaktifkan),
 * dan kalau antreannya berhenti di situ, semua order sesudahnya ikut tersandera
 * oleh satu baris rusak.
 */
export async function pushPending(db: SQLiteDatabase): Promise<PushResult> {
  const orders = await db.getAllAsync<OrderRow>(
    "select * from orders where sync_status <> 'synced' order by created_at"
  );

  let sent = 0;
  let failed = 0;

  for (const order of orders) {
    try {
      const payload = await buildPayload(db, order);
      const { error } = await supabase.rpc("push_order", { p_order: payload });
      if (error) throw new Error(error.message);

      await markSynced(db, order.id);
      sent += 1;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Gagal mengirim order";
      await db.runAsync(
        "update orders set sync_status = 'error', sync_error = ? where id = ?",
        [message, order.id]
      );
      failed += 1;
    }
  }

  return { sent, failed, remaining: await countUnsent(db) };
}

async function buildPayload(db: SQLiteDatabase, order: OrderRow) {
  const [items, voids, payment] = await Promise.all([
    db.getAllAsync<OrderItemRow>(
      "select * from order_items where order_id = ?",
      [order.id]
    ),
    db.getAllAsync<VoidRow>(
      "select * from order_item_voids where order_id = ?",
      [order.id]
    ),
    db.getFirstAsync<PaymentRow>(
      "select * from payments where order_id = ? order by created_at limit 1",
      [order.id]
    ),
  ]);

  return {
    id: order.id,
    table_code: order.table_code,
    table_seq: order.table_seq,
    status: order.status,
    total: order.total,
    version: order.version,
    created_by: order.created_by,
    paid_by: order.paid_by,
    voided_by: order.voided_by,
    payment_method: order.payment_method,
    amount_received: order.amount_received,
    change_amount: order.change_amount,
    created_at: order.created_at,
    client_created_at: order.client_created_at ?? order.created_at,
    paid_at: order.paid_at,
    voided_at: order.voided_at,
    void_reason: order.void_reason,
    // outlet_id sengaja tidak dikirim. Server mengambilnya dari baris employees
    // penulisnya, jadi perangkat tidak bisa menitipkan order ke outlet lain.
    items: items.map((item) => ({
      id: item.id,
      product_id: item.product_id,
      product_code: item.product_code,
      product_name: item.product_name,
      quantity: item.quantity,
      unit_price: item.unit_price,
      notes: item.notes,
    })),
    voids: voids.map((entry) => ({
      id: entry.id,
      product_code: entry.product_code,
      product_name: entry.product_name,
      quantity: entry.quantity,
      unit_price: entry.unit_price,
      voided_by: entry.voided_by,
      reason: entry.reason,
      created_at: entry.created_at,
    })),
    payment: payment
      ? {
          id: payment.id,
          method: payment.method,
          amount: payment.amount,
          employee_id: payment.employee_id,
          created_at: payment.created_at,
        }
      : null,
  };
}

/**
 * Order, item void, dan pembayarannya dikirim sebagai satu payload, jadi
 * penandaannya juga harus satu paket — kalau tidak, sebuah order bisa berakhir
 * "synced" sementara jejak void-nya masih "pending" dan ikut terkirim lagi.
 */
async function markSynced(db: SQLiteDatabase, orderId: string): Promise<void> {
  const now = new Date().toISOString();
  await db.withExclusiveTransactionAsync(async (txn) => {
    await txn.runAsync(
      `update orders
       set sync_status = 'synced', sync_error = null, synced_at = ?
       where id = ?`,
      [now, orderId]
    );
    await txn.runAsync(
      `update order_item_voids
       set sync_status = 'synced', sync_error = null, synced_at = ?
       where order_id = ?`,
      [now, orderId]
    );
    await txn.runAsync(
      `update payments
       set sync_status = 'synced', sync_error = null, synced_at = ?
       where order_id = ?`,
      [now, orderId]
    );
  });
}
