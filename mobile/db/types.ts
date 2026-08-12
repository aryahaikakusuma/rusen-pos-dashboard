/**
 * Bentuk baris seperti yang keluar dari SQLite — snake_case, boolean sebagai
 * 0/1, timestamp sebagai teks ISO. Sengaja dipisah dari lib/types.ts yang berisi
 * tipe domain camelCase untuk UI; pemetaan antara keduanya dilakukan eksplisit
 * supaya tidak ada baris mentah yang bocor ke layar.
 */

import type {
  OrderStatus,
  PaymentChannel,
  PaymentMethod,
  TaxStatus,
} from "../lib/types";

export type SyncStatus = "pending" | "synced" | "error";

export interface CategoryRow {
  id: string;
  outlet_id: string;
  code: string;
  name: string;
  sort_order: number;
  active: number;
  /**
   * 0 kalau kategori ini bukan objek PBJT (Rokok). Nullable dari sisi server:
   * basis data yang belum menjalankan 0019 tidak punya kolomnya.
   */
  taxable: number | null;
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
  /** Jumlah subtotal item, sebelum pajak. */
  subtotal: number;
  /**
   * Bagian dari `subtotal` yang objek PBJT — basis perhitungan pajaknya.
   * Sama dengan `subtotal` pada order tanpa rokok, dan 0 pada order yang
   * isinya rokok saja. Disimpan, bukan diturunkan, karena constraint
   * `tax_arithmetic` di Postgres memeriksanya pada baris ini juga.
   */
  taxable_subtotal: number;
  /**
   * Uang yang ditagih ke pelanggan: subtotal + pajak.
   *
   * Selama order masih `pending`, status pajaknya belum diputuskan, jadi nilai
   * ini masih sama dengan `subtotal`. Keduanya baru berpisah saat pelunasan.
   */
  total: number;
  tax_status: TaxStatus;
  /** Tarif saat transaksi, basis point. Di-snapshot juga saat bebas pajak. */
  tax_rate_bps: number;
  tax_amount: number;
  tax_exempt_reason: string | null;
  tax_approved_by: string | null;
  version: number;
  created_by: string;
  paid_by: string | null;
  voided_by: string | null;
  payment_method: PaymentMethod | null;
  payment_channel: PaymentChannel | null;
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
  /**
   * 1 kalau order ini dibuat dalam mode uji: ia TIDAK dihitung sebagai
   * pendapatan di laporan mana pun, di perangkat maupun di server. Menggantikan
   * awalan `UJI-` pada `table_code` (lihat V8 di db/migrations.ts).
   *
   * Ditetapkan sekali saat order dibuat dan tidak pernah berubah sesudahnya —
   * push_order (0023) menolak menulisnya lewat cabang pembaruan.
   */
  is_test_data: number;
  /** Wajib terisi kalau `is_test_data` 1. Ditegakkan Postgres, bukan SQLite. */
  test_mode_reason: string | null;
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
  /**
   * SNAPSHOT, sama seperti product_name dan unit_price di atasnya: apakah
   * barang ini objek PBJT SAAT transaksi terjadi. Memindahkan produk ke
   * kategori lain kelak tidak boleh mengubah pajak order yang sudah lewat —
   * struknya sudah tercetak dan refund dihitung dari angka ini.
   */
  taxable: number;
}

/**
 * Pengembalian uang atas order yang sudah lunas. Cerminan tabel `refunds` di
 * Postgres.
 *
 * `subtotal` dan `tax_amount` dipisah karena laporan pajak daerah harus tahu
 * berapa dari uang yang keluar itu adalah PBJT yang batal dipungut. `amount`
 * selalu jumlah keduanya — dijaga CHECK, di sini maupun di Postgres.
 */
export interface RefundRow {
  id: string;
  order_id: string;
  subtotal: number;
  tax_amount: number;
  amount: number;
  /** Opsional, berbeda dari keterangan bebas pajak yang wajib. */
  reason: string | null;
  employee_id: string;
  created_at: string;
}

export interface RefundItemRow {
  id: string;
  refund_id: string;
  order_item_id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  amount: number;
}

/** Satu baris pilihan kasir di layar refund. Harga TIDAK ikut — diambil dari
 *  order_items, sama seperti createOrder tidak pernah menerima harga. */
export interface RefundItemInput {
  orderItemId: string;
  quantity: number;
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
