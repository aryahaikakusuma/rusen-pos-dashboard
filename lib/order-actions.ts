"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";

import { translateRpcError } from "./rpc-errors";
import { requireSession } from "./session";
import { db } from "./supabase/server";
import type {
  ActionResult,
  OrderItemInput,
  PaymentMethod,
  TableConflict,
} from "./types";

function revalidateOrderViews() {
  revalidatePath("/orders");
  revalidatePath("/history");
  revalidatePath("/dashboard");
}

/**
 * Dipanggil sebelum menyimpan keranjang. Kalau kode meja sudah punya order
 * belum lunas, UI menanyakan dulu ke kasir: pelanggan sama atau berbeda.
 */
export async function checkTableCodeAction(
  tableCode: string
): Promise<TableConflict[]> {
  const session = await requireSession();

  const { data, error } = await db.rpc("check_table_code", {
    p_table_code: tableCode.trim(),
    p_employee_id: session.employeeId,
  });

  if (error) {
    console.error("check_table_code gagal:", error.message);
    return [];
  }

  return (data ?? []).map((row: Record<string, unknown>) => ({
    orderId: String(row.order_id),
    tableSeq: Number(row.table_seq),
    total: Number(row.total),
    itemCount: Number(row.item_count),
    version: Number(row.version),
    createdAt: String(row.created_at),
    cashier: String(row.cashier),
  }));
}

/** Simpan keranjang sebagai order baru (pelanggan berbeda, atau meja masih kosong). */
export async function saveNewOrderAction(
  tableCode: string,
  items: OrderItemInput[]
): Promise<ActionResult> {
  const session = await requireSession();

  if (!tableCode.trim()) return { error: "Masukkan kode meja/order." };
  if (items.length === 0) return { error: "Keranjang kosong." };

  const { error } = await db.rpc("create_order", {
    p_order_id: randomUUID(),
    p_table_code: tableCode.trim(),
    p_employee_id: session.employeeId,
    p_items: items,
    p_client_created_at: new Date().toISOString(),
  });

  if (error) return { error: translateRpcError(error.message) };

  revalidateOrderViews();
  return {};
}

/** Tambahkan item ke order pending — untuk "pelanggan sama" maupun edit order. */
export async function appendToOrderAction(
  orderId: string,
  expectedVersion: number,
  items: OrderItemInput[]
): Promise<ActionResult> {
  const session = await requireSession();
  if (items.length === 0) return { error: "Tidak ada item untuk ditambahkan." };

  const { error } = await db.rpc("append_to_order", {
    p_order_id: orderId,
    p_employee_id: session.employeeId,
    p_expected_version: expectedVersion,
    p_items: items,
  });

  if (error) return { error: translateRpcError(error.message) };

  revalidateOrderViews();
  return {};
}

/**
 * Satu-satunya jalan mengurangi item dari order tersimpan.
 * Selalu meninggalkan jejak di laporan void.
 */
export async function voidOrderItemAction(
  orderId: string,
  itemId: string,
  quantity: number,
  reason: string,
  expectedVersion: number
): Promise<ActionResult> {
  const session = await requireSession();

  if (!reason.trim()) {
    return { error: "Alasan pembatalan wajib diisi." };
  }

  const { error } = await db.rpc("void_order_item", {
    p_order_id: orderId,
    p_item_id: itemId,
    p_quantity: quantity,
    p_employee_id: session.employeeId,
    p_reason: reason.trim(),
    p_expected_version: expectedVersion,
  });

  if (error) return { error: translateRpcError(error.message) };

  revalidateOrderViews();
  return {};
}

/** Pelunasan. Total dan kembalian dihitung ulang di Postgres, bukan di sini. */
export async function payOrderAction(
  orderId: string,
  method: PaymentMethod,
  amountReceived: number | null
): Promise<ActionResult> {
  const session = await requireSession();

  const { error } = await db.rpc("pay_order", {
    p_order_id: orderId,
    p_method: method,
    p_amount_received: method === "cash" ? amountReceived : null,
    p_employee_id: session.employeeId,
  });

  if (error) return { error: translateRpcError(error.message) };

  revalidateOrderViews();
  return {};
}
