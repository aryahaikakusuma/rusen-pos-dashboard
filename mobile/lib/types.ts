/** Disalin dari lib/types.ts aplikasi web supaya kedua klien bicara istilah yang sama. */

export const PIN_LENGTH = 6;

export type EmployeeRole = "cashier" | "manager" | "owner";

/** Status order di database. Perhatikan: TIDAK ada "cart" di sini. */
export type OrderStatus = "pending" | "paid" | "void";

export type PaymentMethod = "cash" | "non_cash";

/**
 * Kanal bayar sungguhan — lebih rinci dari `PaymentMethod`, yang cuma tahu
 * "masuk laci atau tidak". `PaymentMethod` tetap sumber kebenaran untuk itu
 * (dan tidak disentuh oleh penambahan ini); `PaymentChannel` menambah rincian
 * DI ATASNYA, bukan menggantikannya. Konstanta di kode, bukan tabel — nilai
 * baru berarti baris baru di sini, bukan migrasi tabel referensi.
 */
export type PaymentChannel = "cash" | "qris" | "transfer" | "card";

export const PAYMENT_CHANNELS: readonly {
  value: PaymentChannel;
  label: string;
  /** Satu-satunya penanda yang boleh dipakai perhitungan kas laci. */
  masukLaci: boolean;
}[] = [
  { value: "cash", label: "Tunai", masukLaci: true },
  { value: "qris", label: "QRIS", masukLaci: false },
  { value: "transfer", label: "Transfer", masukLaci: false },
  { value: "card", label: "Kartu", masukLaci: false },
];

/**
 * `payment_channel` yang bisa TERBACA dari server tapi TIDAK BOLEH pernah
 * dipilih kasir — hanya `'non_cash_legacy'` sejauh ini (supabase/migrations/
 * 0030_metode_pembayaran.sql), ditulis satu kali oleh backfill untuk order
 * lunas non tunai dari sebelum kolom ini ada, saat kanal sungguhannya tidak
 * pernah tersimpan di mana pun. Sengaja terpisah dari `PAYMENT_CHANNELS`:
 * array itu dipakai `app/pay.tsx` untuk merender tab yang bisa ditekan, jadi
 * menaruh nilai ini di sana akan membuatnya terpilih sebagai kanal baru —
 * persis yang tidak boleh terjadi.
 */
export type PaymentChannelStored = PaymentChannel | "non_cash_legacy";

/** Label tampilan untuk SETIAP nilai yang mungkin ada di `payment_channel`,
 * termasuk yang tidak bisa dipilih. Dipakai layar/laporan mana pun yang
 * menampilkan kanal ke manusia, supaya `'non_cash_legacy'` tidak pernah
 * tercetak mentah. */
export const PAYMENT_CHANNEL_LABELS: Record<PaymentChannelStored, string> = {
  cash: "Tunai",
  qris: "QRIS",
  transfer: "Transfer",
  card: "Kartu",
  non_cash_legacy: "Non-tunai (data lama)",
};

/** `PaymentMethod` diturunkan dari kanal, tidak pernah dipilih terpisah — dua
 * masukan independen untuk satu fakta adalah cara pasti keduanya berselisih. */
export function paymentMethodFor(channel: PaymentChannel): PaymentMethod {
  return channel === "cash" ? "cash" : "non_cash";
}

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
