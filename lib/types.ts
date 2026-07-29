// Tipe murni yang dipakai bersama oleh Server Component dan Client Component.
// Tidak ada state, tidak ada akses DB — file ini aman di-import dari mana saja.

/** PRODUCT.md menetapkan PIN 6 digit. Dipakai bersama oleh keypad dan validasi server. */
export const PIN_LENGTH = 6;

export type EmployeeRole = "cashier" | "manager" | "owner";

/** Status order di database. Perhatikan: TIDAK ada "cart" di sini. */
export type OrderStatus = "pending" | "paid" | "void";

export type PaymentMethod = "cash" | "non_cash";

export interface Category {
  id: string;
  code: string;
  name: string;
  sortOrder: number;
}

export interface Product {
  id: string;
  categoryId: string;
  code: string;
  name: string;
  price: number;
}

export interface Employee {
  id: string;
  name: string;
  role: EmployeeRole;
}

/** Item pada order yang SUDAH tersimpan di database. */
export interface OrderItem {
  id: string;
  productId: string | null;
  productCode: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  notes: string;
  subtotal: number;
}

export interface Order {
  id: string;
  tableCode: string;
  tableSeq: number;
  status: OrderStatus;
  total: number;
  version: number;
  items: OrderItem[];
  createdAt: string;
  paidAt: string | null;
  createdByName: string;
  paidByName: string | null;
  paymentMethod: PaymentMethod | null;
  amountReceived: number | null;
  changeAmount: number | null;
}

/**
 * Keranjang yang masih hidup di browser dan belum pernah menyentuh database.
 * Sengaja dipisah dari `Order` supaya "cart" tidak pernah bocor jadi status DB.
 */
export interface DraftItem {
  productId: string;
  productCode: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  notes: string;
}

/** Payload item yang dikirim ke RPC create_order / append_to_order. */
export interface OrderItemInput {
  productId: string;
  quantity: number;
  notes: string;
}

/** Balasan seragam dari semua Server Action tulis. */
export interface ActionResult {
  error?: string;
}

/** Order belum lunas yang sudah memakai kode meja yang sama. */
export interface TableConflict {
  orderId: string;
  tableSeq: number;
  total: number;
  itemCount: number;
  version: number;
  createdAt: string;
  cashier: string;
}

/** Label tampilan kode meja: "A3" untuk order pertama, "A3 (2)" untuk berikutnya. */
export function tableLabel(tableCode: string, tableSeq: number): string {
  return tableSeq > 1 ? `${tableCode} (${tableSeq})` : tableCode;
}

export function formatRupiah(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(amount);
}
