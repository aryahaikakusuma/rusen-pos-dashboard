/**
 * Disalin dari lib/rpc-errors.ts milik web. Di web, kode pendek ini dilempar
 * oleh fungsi Postgres; di sini dilempar oleh port lokalnya di db/orders.ts.
 * Kode dan terjemahannya harus tetap sama di kedua sisi — setelah langkah 4,
 * order yang sama bisa ditolak di perangkat maupun di server, dan kasir tidak
 * boleh melihat dua kalimat berbeda untuk sebab yang sama.
 */

export type OrderErrorCode =
  | "ORDER_NOT_FOUND"
  | "ORDER_NOT_PAYABLE"
  | "ORDER_NOT_EDITABLE"
  | "STALE_ORDER"
  | "ITEM_NOT_FOUND"
  | "INVALID_VOID_QUANTITY"
  | "INSUFFICIENT_AMOUNT"
  | "EMPTY_ORDER"
  | "EMPLOYEE_NOT_FOUND"
  | "PRODUCT_NOT_FOUND"
  | "TABLE_CODE_REQUIRED"
  /** Tidak ada di Postgres — khusus klien: katalog belum pernah ditarik. */
  | "CATALOG_NOT_READY";

const MESSAGES: Record<OrderErrorCode, string> = {
  ORDER_NOT_FOUND: "Order tidak ditemukan.",
  ORDER_NOT_PAYABLE: "Order ini sudah lunas atau sudah dibatalkan.",
  ORDER_NOT_EDITABLE: "Order ini sudah lunas dan tidak bisa diubah lagi.",
  STALE_ORDER:
    "Order sudah diubah di perangkat lain. Muat ulang dulu, lalu coba lagi.",
  ITEM_NOT_FOUND: "Item tidak ditemukan di order ini.",
  INVALID_VOID_QUANTITY: "Jumlah yang dibatalkan melebihi jumlah item.",
  INSUFFICIENT_AMOUNT: "Nominal diterima kurang dari total tagihan.",
  EMPTY_ORDER: "Order tidak punya item.",
  EMPLOYEE_NOT_FOUND: "Pegawai tidak dikenali. Silakan login ulang.",
  PRODUCT_NOT_FOUND: "Produk tidak ditemukan.",
  TABLE_CODE_REQUIRED: "Kode meja/order wajib diisi.",
  CATALOG_NOT_READY:
    "Daftar produk belum tersedia di perangkat ini. Sambungkan ke internet sekali dulu.",
};

export class OrderError extends Error {
  readonly code: OrderErrorCode;

  constructor(code: OrderErrorCode) {
    super(code);
    this.name = "OrderError";
    this.code = code;
  }
}

/**
 * Kesalahan tak dikenal sengaja tidak ditampilkan apa adanya — pesan internal
 * SQLite tidak layak muncul di layar kasir saat jam ramai.
 */
export function translateOrderError(error: unknown): string {
  if (error instanceof OrderError) return MESSAGES[error.code];
  console.error("Kesalahan order tidak dikenal:", error);
  return "Terjadi kesalahan. Coba lagi.";
}
