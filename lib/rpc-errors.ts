// Fungsi Postgres melempar kode pendek (STALE_ORDER, INSUFFICIENT_AMOUNT, ...).
// Di sinilah kode itu diterjemahkan jadi kalimat yang bisa dibaca kasir.
// Kode yang tidak dikenal sengaja tidak ditampilkan apa adanya — pesan internal
// Postgres tidak layak muncul di layar kasir saat jam ramai.

const MESSAGES: Record<string, string> = {
  ORDER_NOT_FOUND: "Order tidak ditemukan.",
  ORDER_NOT_PAYABLE: "Order ini sudah lunas atau sudah dibatalkan.",
  ORDER_NOT_EDITABLE: "Order ini sudah lunas dan tidak bisa diubah lagi.",
  STALE_ORDER:
    "Order sudah diubah di perangkat lain. Muat ulang halaman dulu, lalu coba lagi.",
  ITEM_NOT_FOUND: "Item tidak ditemukan di order ini.",
  INVALID_VOID_QUANTITY: "Jumlah yang dibatalkan melebihi jumlah item.",
  INSUFFICIENT_AMOUNT: "Nominal diterima kurang dari total tagihan.",
  EMPTY_ORDER: "Order tidak punya item.",
  EMPLOYEE_NOT_FOUND: "Pegawai tidak dikenali. Silakan login ulang.",
  PRODUCT_NOT_FOUND: "Produk tidak ditemukan.",
  TABLE_CODE_REQUIRED: "Kode meja/order wajib diisi.",
};

export function translateRpcError(message: string | undefined): string {
  if (!message) return "Terjadi kesalahan. Coba lagi.";
  for (const [code, text] of Object.entries(MESSAGES)) {
    if (message.includes(code)) return text;
  }
  console.error("RPC error tidak dikenal:", message);
  return "Terjadi kesalahan. Coba lagi.";
}
