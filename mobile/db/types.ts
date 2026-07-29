/**
 * Bentuk baris seperti yang keluar dari SQLite — snake_case, boolean sebagai
 * 0/1, timestamp sebagai teks ISO. Sengaja dipisah dari lib/types.ts yang berisi
 * tipe domain camelCase untuk UI; pemetaan antara keduanya dilakukan eksplisit
 * supaya tidak ada baris mentah yang bocor ke layar.
 */

import type { OrderStatus, PaymentMethod } from "../lib/types";

export type SyncStatus = "pending" | "synced" | "error";

export interface CategoryRow {
  id: string;
  outlet_id: string;
  code: string;
  name: string;
  sort_order: number;
  active: number;
}

export interface ProductRow {
  id: string;
  outlet_id: string;
  category_id: string;
  code: string;
  name: string;
  price: number;
  active: number;
}

export interface OrderRow {
  id: string;
  outlet_id: string;
  table_code: string;
  table_seq: number;
  status: OrderStatus;
  total: number;
  version: number;
  created_by: string;
  paid_by: string | null;
  voided_by: string | null;
  payment_method: PaymentMethod | null;
  amount_received: number | null;
  change_amount: number | null;
  created_at: string;
  client_created_at: string | null;
  paid_at: string | null;
  voided_at: string | null;
  void_reason: string | null;
  sync_status: SyncStatus;
  sync_error: string | null;
  synced_at: string | null;
}

export interface OrderItemRow {
  id: string;
  order_id: string;
  product_id: string | null;
  product_code: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  notes: string;
  subtotal: number;
}

/** Payload item yang masuk ke createOrder / appendToOrder. Sama dengan
 *  `OrderItemInput` di web: harga TIDAK pernah datang dari pemanggil. */
export interface OrderItemInput {
  productId: string;
  quantity: number;
  notes: string;
}

/** Order belum lunas yang sudah memakai kode meja yang sama. */
export interface TableConflict {
  orderId: string;
  tableSeq: number;
  total: number;
  itemCount: number;
  version: number;
  createdAt: string;
}
