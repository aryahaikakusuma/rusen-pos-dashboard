/**
 * Kas masuk / kas keluar di dalam sif — uang yang lewat laci tapi bukan
 * penjualan (beli gas, es batu, galon; setoran pemilik). Lokal saja, mengikuti
 * `shifts`: tidak ada migrasi Postgres sendiri (dikirim bersama payload sif —
 * lihat supabase/migrations/0029_shift_kas.sql) dan tidak lewat db/push.ts.
 * Lihat komentar V6 di db/migrations.ts untuk alasan bentuk tabelnya.
 */

import * as Crypto from "expo-crypto";
import type { SQLiteDatabase } from "expo-sqlite";

const now = () => new Date().toISOString();

export type CashDirection = "in" | "out";
export type CashMethod = "cash" | "non_cash";

/**
 * Kategori awal, konstanta di kode — bukan tabel yang bisa diedit. Nilainya
 * dibagi antara arah masuk dan keluar; 'lain_lain' muncul di keduanya karena
 * artinya sama di kedua arah dan tidak ada gunanya dua kode berbeda untuk
 * satu makna yang sama.
 */
export type CashCategory =
  | "bahan"
  | "ongkos_kirim"
  | "listrik"
  | "kasbon"
  | "setoran_pemilik"
  | "tambahan_modal"
  | "pengembalian_kasbon"
  | "lain_lain";

export const CASH_CATEGORIES_KELUAR: readonly {
  value: CashCategory;
  label: string;
}[] = [
  { value: "bahan", label: "Stok" },
  { value: "ongkos_kirim", label: "Ongkos Kirim" },
  { value: "listrik", label: "Listrik / Utilitas" },
  { value: "kasbon", label: "Kasbon" },
  { value: "setoran_pemilik", label: "Setoran ke Pemilik" },
  { value: "lain_lain", label: "Lain-lain" },
];

export const CASH_CATEGORIES_MASUK: readonly {
  value: CashCategory;
  label: string;
}[] = [
  { value: "tambahan_modal", label: "Tambahan Modal" },
  { value: "pengembalian_kasbon", label: "Pengembalian Kasbon" },
  { value: "lain_lain", label: "Lain-lain" },
];

export function cashCategoriesFor(
  direction: CashDirection
): readonly { value: CashCategory; label: string }[] {
  return direction === "in" ? CASH_CATEGORIES_MASUK : CASH_CATEGORIES_KELUAR;
}

/** Label per nilai, lepas dari arah — untuk menampilkan entri yang sudah tersimpan. */
export const CASH_CATEGORY_LABELS: Record<CashCategory, string> = {
  bahan: "Stok",
  ongkos_kirim: "Ongkos Kirim",
  listrik: "Listrik / Utilitas",
  kasbon: "Kasbon",
  setoran_pemilik: "Setoran ke Pemilik",
  tambahan_modal: "Tambahan Modal",
  pengembalian_kasbon: "Pengembalian Kasbon",
  lain_lain: "Lain-lain",
};

export interface CashMovement {
  id: string;
  direction: CashDirection;
  method: CashMethod;
  category: CashCategory | null;
  amount: number;
  note: string;
  employeeName: string;
  createdAt: string;
  /** id entri asli kalau baris ini adalah koreksi atasnya, kalau tidak null. */
  reversesId: string | null;
}

export interface CashTotals {
  masukTunai: number;
  masukNonTunai: number;
  keluarTunai: number;
  keluarNonTunai: number;
}

/**
 * Mencatat satu entri kas dan mengembalikan idnya.
 *
 * Kategori WAJIB dan diperiksa cocok dengan arahnya (mis. 'tambahan_modal'
 * hanya sah untuk 'in') di sini, bukan cuma lewat CHECK di SQLite: pasangan
 * arah-kategori adalah aturan lintas kolom, dan pesan yang dihasilkan sebuah
 * CHECK gagal ("CHECK constraint failed: cash_movements") tidak bisa dibaca
 * kasir maupun ditindaklanjuti — sama alasannya dengan pemeriksaan note/amount
 * di bawah.
 *
 * Catatan dipangkas dan ditolak kalau kosong, begitu juga nominal yang tidak
 * positif — meskipun CHECK di V6 sudah menjaga keduanya.
 */
export async function recordCashMovement(
  db: SQLiteDatabase,
  params: {
    shiftId: string;
    direction: CashDirection;
    method: CashMethod;
    category: CashCategory;
    amount: number;
    note: string;
    employeeId: string;
    employeeName: string;
  }
): Promise<string> {
  const note = params.note.trim();
  if (!note) throw new Error("Keterangan wajib diisi.");
  if (!Number.isFinite(params.amount) || params.amount <= 0) {
    throw new Error("Nominal harus lebih dari nol.");
  }
  if (!cashCategoriesFor(params.direction).some((c) => c.value === params.category)) {
    throw new Error("Kategori tidak sesuai dengan arah kas.");
  }

  const id = Crypto.randomUUID();
  await db.runAsync(
    `insert into cash_movements
       (id, shift_id, direction, method, category, amount, note,
        employee_id, employee_name, created_at)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      params.shiftId,
      params.direction,
      params.method,
      params.category,
      params.amount,
      note,
      params.employeeId,
      params.employeeName,
      now(),
    ]
  );
  return id;
}

/**
 * Seluruh entri kas sif ini yang belum dibatalkan, terlama di atas — urutan
 * kejadian, sama seperti yang tercetak di struk. Layar yang ingin terbaru di
 * atas membaliknya sendiri; kertas tidak boleh dibalik.
 *
 * `voided_at is null` dipertahankan sebagai penyaring meskipun jalur menulisnya
 * (voidCashMovement) sudah dibuang: entri yang sempat dibatalkan lewat versi
 * aplikasi sebelumnya harus tetap keluar dari daftar dan totalnya, persis
 * seperti yang berlaku saat kasir membatalkannya waktu itu. Kolomnya
 * dipertahankan apa adanya, bukan dihapus — pola yang sama dengan
 * tax_exempt_reason di 0026_bebas_pajak_tanpa_keterangan.sql.
 */
export async function shiftCashMovements(
  db: SQLiteDatabase,
  shiftId: string
): Promise<CashMovement[]> {
  const rows = await db.getAllAsync<{
    id: string;
    direction: CashDirection;
    method: CashMethod;
    category: CashCategory | null;
    amount: number;
    note: string;
    employee_name: string;
    created_at: string;
    reverses_id: string | null;
  }>(
    `select id, direction, method, category, amount, note, employee_name, created_at, reverses_id
     from cash_movements
     where shift_id = ? and voided_at is null
     order by created_at asc`,
    [shiftId]
  );

  return rows.map((row) => ({
    id: row.id,
    direction: row.direction,
    method: row.method,
    category: row.category,
    amount: row.amount,
    note: row.note,
    employeeName: row.employee_name,
    createdAt: row.created_at,
    reversesId: row.reverses_id,
  }));
}

/**
 * Mengoreksi satu entri kas dengan entri BARU berarah kebalikan, nominal dan
 * metode sama, merujuk id aslinya lewat `reverses_id`. Baris asli TIDAK
 * disentuh — tidak dihapus, tidak ditandai — dan tetap ikut dihitung di total
 * maupun tercetak di struk, persis seperti koreksi kedua di sebelahnya.
 * Jumlah keduanya otomatis nol tanpa kasus khusus di `cashTotals`, karena
 * keduanya masuk penjumlahan yang sama seperti entri lain mana pun.
 *
 * Ini menggantikan `voidCashMovement` (V6): entri yang bisa dihapus atau
 * disembunyikan dari kertas tidak ada gunanya sebagai bukti — lihat kepala
 * berkas ini dan TASK SPEC kas masuk/keluar. Satu entri hanya boleh dikoreksi
 * sekali; percobaan kedua ditolak di sini, bukan di SQLite, supaya pesannya
 * bisa dibaca kasir.
 */
export async function reverseCashMovement(
  db: SQLiteDatabase,
  params: { id: string; employeeId: string; employeeName: string }
): Promise<string> {
  const original = await db.getFirstAsync<{
    id: string;
    shift_id: string;
    direction: CashDirection;
    method: CashMethod;
    category: CashCategory | null;
    amount: number;
    note: string;
  }>(
    `select id, shift_id, direction, method, category, amount, note
     from cash_movements where id = ? and voided_at is null`,
    [params.id]
  );
  if (!original) throw new Error("Entri kas tidak ditemukan.");

  const sudahDikoreksi = await db.getFirstAsync<{ n: number }>(
    `select count(*) as n from cash_movements where reverses_id = ?`,
    [params.id]
  );
  if ((sudahDikoreksi?.n ?? 0) > 0) {
    throw new Error("Entri ini sudah pernah dikoreksi.");
  }

  const id = Crypto.randomUUID();
  await db.runAsync(
    `insert into cash_movements
       (id, shift_id, direction, method, category, amount, note,
        employee_id, employee_name, created_at, reverses_id)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      original.shift_id,
      original.direction === "in" ? "out" : "in",
      original.method,
      original.category,
      original.amount,
      `Koreksi: ${original.note}`,
      params.employeeId,
      params.employeeName,
      now(),
      original.id,
    ]
  );
  return id;
}

/**
 * Empat total kas sif, entri yang dibatalkan (versi lama) tidak ikut. Satu
 * query dengan `sum(case ...)` alih-alih empat query terpisah: keempat angka
 * ini selalu dibaca bersama dan harus berasal dari satu potret yang sama.
 *
 * Entri koreksi ikut terhitung apa adanya di sini — arahnya sudah kebalikan
 * dari aslinya, jadi jumlahnya otomatis saling meniadakan tanpa logika khusus.
 */
export async function cashTotals(
  db: SQLiteDatabase,
  shiftId: string
): Promise<CashTotals> {
  const row = await db.getFirstAsync<{
    masuk_tunai: number;
    masuk_non_tunai: number;
    keluar_tunai: number;
    keluar_non_tunai: number;
  }>(
    `select
       coalesce(sum(case when direction = 'in'  and method = 'cash'     then amount end), 0) as masuk_tunai,
       coalesce(sum(case when direction = 'in'  and method = 'non_cash' then amount end), 0) as masuk_non_tunai,
       coalesce(sum(case when direction = 'out' and method = 'cash'     then amount end), 0) as keluar_tunai,
       coalesce(sum(case when direction = 'out' and method = 'non_cash' then amount end), 0) as keluar_non_tunai
     from cash_movements
     where shift_id = ? and voided_at is null`,
    [shiftId]
  );

  return {
    masukTunai: row?.masuk_tunai ?? 0,
    masukNonTunai: row?.masuk_non_tunai ?? 0,
    keluarTunai: row?.keluar_tunai ?? 0,
    keluarNonTunai: row?.keluar_non_tunai ?? 0,
  };
}
