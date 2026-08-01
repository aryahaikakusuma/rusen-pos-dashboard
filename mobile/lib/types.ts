/** Disalin dari lib/types.ts aplikasi web supaya kedua klien bicara istilah yang sama. */

export const PIN_LENGTH = 6;

export type EmployeeRole = "cashier" | "manager" | "owner";

/** Status order di database. Perhatikan: TIDAK ada "cart" di sini. */
export type OrderStatus = "pending" | "paid" | "void";

export type PaymentMethod = "cash" | "non_cash";

/** Status PBJT satu order. Cerminan enum `tax_status` di Postgres. */
export type TaxStatus = "taxable" | "exempt";

export interface Employee {
  id: string;
  name: string;
  role: EmployeeRole;
}

/**
 * Bentuknya mengikuti `Session` di lib/session-token.ts milik web, ditambah
 * token dan waktu kedaluwarsanya — di web keduanya tersembunyi di dalam cookie
 * httpOnly, di sini aplikasi harus memegangnya sendiri.
 */
export interface Session {
  employeeId: string;
  name: string;
  role: EmployeeRole;
  token: string;
  /** Detik epoch, sama dengan klaim `exp` pada token. */
  expiresAt: number;
}

/** Item di keranjang yang belum menyentuh database sama sekali. */
export interface DraftItem {
  productId: string;
  productCode: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  notes: string;
}

/**
 * Identitas satu baris keranjang.
 *
 * Bukan productId saja. Sejak Indomie Kuah punya pilihan jenis kuah yang tidak
 * mengubah harga, dua baris bisa menunjuk produk yang sama dan hanya berbeda di
 * `notes` — dan keduanya harus tetap bisa dinaikkan, diturunkan, dan dihapus
 * sendiri-sendiri. Dengan productId saja, menekan "−" pada yang Soto juga
 * menurunkan yang Ayam Spesial, dan React melihat dua anak berkunci sama.
 */
export function draftLineKey(item: DraftItem): string {
  return `${item.productId} ${item.notes}`;
}

export function tableLabel(tableCode: string, tableSeq: number): string {
  return tableSeq > 1 ? `${tableCode} (${tableSeq})` : tableCode;
}

/**
 * Sama persis dengan web. Hermes membawa Intl penuh sejak React Native 0.73,
 * jadi locale id-ID tersedia tanpa polyfill.
 */
export function formatRupiah(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(amount);
}
