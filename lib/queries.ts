import "server-only";

import { db } from "./supabase/server";
import type { Order, OrderItem } from "./types";

const ORDER_SELECT = `
  id, table_code, table_seq, status, subtotal, taxable_subtotal, total, version,
  tax_status, tax_rate_bps, tax_amount, tax_exempt_reason,
  created_at, paid_at, payment_method, amount_received, change_amount,
  created_by_employee:employees!orders_created_by_fkey (name),
  paid_by_employee:employees!orders_paid_by_fkey (name),
  tax_approved_by_employee:employees!orders_tax_approved_by_fkey (name),
  order_items (
    id, product_id, product_code, product_name,
    quantity, unit_price, notes, subtotal, taxable
  )
`;

export async function getPaidOrders(limit = 100): Promise<Order[]> {
  const { data, error } = await db
    .from("orders")
    .select(ORDER_SELECT)
    .eq("status", "paid")
    .order("paid_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Gagal memuat histori: ${error.message}`);
  return (data ?? []).map(mapOrder);
}

export async function getOrderById(orderId: string): Promise<Order | null> {
  const { data, error } = await db
    .from("orders")
    .select(ORDER_SELECT)
    .eq("id", orderId)
    .maybeSingle();

  if (error) throw new Error(`Gagal memuat order: ${error.message}`);
  return data ? mapOrder(data) : null;
}

// PostgREST mengembalikan relasi many-to-one kadang sebagai objek, kadang
// sebagai array satu elemen, tergantung bentuk query. Ratakan keduanya.
function relationName(value: unknown): string | null {
  const row = Array.isArray(value) ? value[0] : value;
  if (row && typeof row === "object" && "name" in row) {
    return String((row as { name: unknown }).name);
  }
  return null;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function mapOrder(row: any): Order {
  const items: OrderItem[] = (row.order_items ?? []).map((item: any) => ({
    id: item.id,
    productId: item.product_id,
    productCode: item.product_code,
    productName: item.product_name,
    quantity: item.quantity,
    unitPrice: item.unit_price,
    notes: item.notes,
    subtotal: item.subtotal,
    taxable: item.taxable ?? true,
  }));

  // Urutan item dari PostgREST tidak dijamin; kunci ke nama supaya tampilan
  // tidak berubah-ubah tiap kali halaman dimuat ulang.
  items.sort((a, b) => a.productName.localeCompare(b.productName));

  return {
    id: row.id,
    tableCode: row.table_code,
    tableSeq: row.table_seq,
    status: row.status,
    subtotal: row.subtotal,
    taxableSubtotal: row.taxable_subtotal ?? row.subtotal,
    total: row.total,
    taxStatus: row.tax_status,
    taxRateBps: row.tax_rate_bps,
    taxAmount: row.tax_amount,
    taxExemptReason: row.tax_exempt_reason,
    taxApprovedByName: relationName(row.tax_approved_by_employee),
    version: row.version,
    items,
    createdAt: row.created_at,
    paidAt: row.paid_at,
    createdByName: relationName(row.created_by_employee) ?? "-",
    paidByName: relationName(row.paid_by_employee),
    paymentMethod: row.payment_method,
    amountReceived: row.amount_received,
    changeAmount: row.change_amount,
  };
}
