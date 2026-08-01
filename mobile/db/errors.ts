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
  | "TAX_EXEMPT_REASON_REQUIRED"
  /**
   * Order mode uji tanpa alasan. Dilempar createOrder di perangkat DAN
   * push_order (0023) — kodenya wajib sama persis di kedua sisi, seperti
   * seluruh kode di daftar ini.
   *
   * Namanya TEST_REASON_REQUIRED, bukan TEST_DATA_REASON_REQUIRED, mengikuti
   * catatan pada blok refund di bawah soal kode yang memuat kode lain.
   */
  | "TEST_REASON_REQUIRED"
  /** Tidak ada di Postgres — khusus klien: katalog belum pernah ditarik. */
  | "CATALOG_NOT_READY"
  /** Tidak ada di Postgres — khusus klien: tarif PBJT belum ditarik. */
  | "TAX_RATE_UNKNOWN"
  | "REFUND_NOT_ALLOWED"
  | "REFUND_EMPTY"
  | "REFUND_LINE_UNKNOWN"
  | "REFUND_QUANTITY_INVALID"
  | "REFUND_EXCEEDS_ORDER"
  /** Hanya dilempar push_order — perangkat tidak pernah menyusun refund yang
   *  rinciannya tidak cocok dengan jumlahnya. Tetap diterjemahkan supaya kalau
   *  itu terjadi, kasir membaca kalimat dan bukan pesan Postgres. */
  | "REFUND_MISMATCH";

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
  TAX_EXEMPT_REASON_REQUIRED:
    "Keterangan bebas pajak wajib diisi. Tulis nama instansi atau alasannya.",
  TEST_REASON_REQUIRED:
    "Alasan mode uji wajib diisi. Tulis untuk apa order uji ini dibuat.",
  CATALOG_NOT_READY:
    "Daftar produk belum tersedia di perangkat ini. Sambungkan ke internet sekali dulu.",
  // Menyebut obatnya, bukan cuma penyakitnya. Kasir yang membaca "tarif tidak
  // ada" tidak punya langkah berikutnya; yang membaca kalimat ini punya.
  TAX_RATE_UNKNOWN:
    "Tarif PBJT belum ditarik ke perangkat ini. Buka Kasir, geser daftar produk dari atas ke bawah.",

  // Refund. Penamaannya menghindari satu jebakan yang mahal: pencocokan galat
  // memakai `includes`, jadi kode yang MEMUAT kode lain akan tertangkap entri
  // yang salah. "REFUND_ITEM_NOT_FOUND" akan selamanya terbaca sebagai
  // ITEM_NOT_FOUND di atas dan kasir membaca kalimat yang keliru — diam-diam.
  // Karena itu namanya REFUND_LINE_UNKNOWN.
  REFUND_NOT_ALLOWED:
    "Refund hanya bisa untuk order yang sudah lunas.",
  REFUND_EMPTY: "Pilih dulu item yang mau direfund.",
  REFUND_LINE_UNKNOWN: "Item ini bukan bagian dari order tersebut.",
  REFUND_QUANTITY_INVALID:
    "Jumlah refund melebihi sisa item yang belum direfund.",
  REFUND_EXCEEDS_ORDER:
    "Total refund melebihi uang yang pernah diterima untuk order ini.",
  REFUND_MISMATCH: "Rincian refund tidak cocok dengan jumlahnya.",
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
