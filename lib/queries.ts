import "server-only";

import { db } from "./supabase/server";
import type { Category, Order, OrderItem, Product } from "./types";

const ORDER_SELECT = `
  id, table_code, table_seq, status, total, version,
  created_at, paid_at, payment_method, amount_received, change_amount,
  created_by_employee:employees!orders_created_by_fkey (name),
  paid_by_employee:employees!orders_paid_by_fkey (name),
  order_items (
    id, product_id, product_code, product_name,
    quantity, unit_price, notes, subtotal
  )
`;

export async function getCategories(): Promise<Category[]> {
  const { data, error } = await db
    .from("categories")
    .select("id, code, name, sort_order")
    .eq("active", true)
    .order("sort_order");

  if (error) throw new Error(`Gagal memuat kategori: ${error.message}`);

  return (data ?? []).map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    sortOrder: row.sort_order,
  }));
}

export async function getProducts(): Promise<Product[]> {
  const { data, error } = await db
    .from("products")
    .select("id, category_id, code, name, price")
    .eq("active", true)
    .order("code");

  if (error) throw new Error(`Gagal memuat produk: ${error.message}`);

  return (data ?? []).map((row) => ({
    id: row.id,
    categoryId: row.category_id,
    code: row.code,
    name: row.name,
    price: row.price,
  }));
}

/** Antrean "Daftar Order": belum lunas dulu, lalu yang sudah lunas hari ini. */
export async function getOrderQueue(): Promise<Order[]> {
  const { data, error } = await db
    .from("orders")
    .select(ORDER_SELECT)
    .in("status", ["pending", "paid"])
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) throw new Error(`Gagal memuat daftar order: ${error.message}`);

  const orders = (data ?? []).map(mapOrder);
  // Belum lunas selalu di atas — itulah yang butuh tindakan kasir.
  return orders.sort((a, b) => {
    if (a.status !== b.status) return a.status === "pending" ? -1 : 1;
    return b.createdAt.localeCompare(a.createdAt);
  });
}

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
  }));

  // Urutan item dari PostgREST tidak dijamin; kunci ke nama supaya tampilan
  // tidak berubah-ubah tiap kali halaman dimuat ulang.
  items.sort((a, b) => a.productName.localeCompare(b.productName));

  return {
    id: row.id,
    tableCode: row.table_code,
    tableSeq: row.table_seq,
    status: row.status,
    total: row.total,
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
