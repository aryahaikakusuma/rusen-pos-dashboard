/**
 * Kas masuk / kas keluar di dalam sif — uang yang lewat laci tapi bukan
 * penjualan (beli gas, es batu, galon; setoran pemilik). Lokal saja, mengikuti
 * `shifts`: tidak ada migrasi Postgres dan tidak lewat db/push.ts. Lihat
 * komentar V6 di db/migrations.ts untuk alasan bentuk tabelnya.
 */

import * as Crypto from "expo-crypto";
import type { SQLiteDatabase } from "expo-sqlite";

const now = () => new Date().toISOString();

export type CashDirection = "in" | "out";
export type CashMethod = "cash" | "non_cash";

export interface CashMovement {
  id: string;
  direction: CashDirection;
  method: CashMethod;
  amount: number;
  note: string;
  employeeName: string;
  createdAt: string;
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
 * Catatan dipangkas dan ditolak kalau kosong, begitu juga nominal yang tidak
 * positif — meskipun CHECK di V6 sudah menjaga keduanya. Alasannya bukan
 * kelebihan penjagaan: kalau yang menahan adalah CHECK, yang sampai ke kasir
 * adalah pesan SQLite ("CHECK constraint failed: cash_movements") yang tidak
 * bisa ia baca maupun tindak lanjuti. Penjagaan di sini yang menghasilkan
 * kalimat yang bisa dimengerti; CHECK tetap ada sebagai jaring terakhir bagi
 * penulis lain.
 */
export async function recordCashMovement(
  db: SQLiteDatabase,
  params: {
    shiftId: string;
    direction: CashDirection;
    method: CashMethod;
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

  const id = Crypto.randomUUID();
  await db.runAsync(
    `insert into cash_movements
       (id, shift_id, direction, method, amount, note,
        employee_id, employee_name, created_at)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      params.shiftId,
      params.direction,
      params.method,
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
 */
export async function shiftCashMovements(
  db: SQLiteDatabase,
  shiftId: string
): Promise<CashMovement[]> {
  const rows = await db.getAllAsync<{
    id: string;
    direction: CashDirection;
    method: CashMethod;
    amount: number;
    note: string;
    employee_name: string;
    created_at: string;
  }>(
    `select id, direction, method, amount, note, employee_name, created_at
     from cash_movements
     where shift_id = ? and voided_at is null
     order by created_at asc`,
    [shiftId]
  );

  return rows.map((row) => ({
    id: row.id,
    direction: row.direction,
    method: row.method,
    amount: row.amount,
    note: row.note,
    employeeName: row.employee_name,
    createdAt: row.created_at,
  }));
}

/**
 * Membatalkan satu entri. `voided_at` disetel hanya kalau masih null, jadi
 * menekan Batalkan dua kali tidak menggeser waktu pembatalan yang pertama —
 * baris ini adalah jejak audit, bukan penanda status yang boleh ditimpa.
 */
export async function voidCashMovement(
  db: SQLiteDatabase,
  id: string
): Promise<void> {
  await db.runAsync(
    `update cash_movements set voided_at = ?
     where id = ? and voided_at is null`,
    [now(), id]
  );
}

/**
 * Empat total kas sif, entri yang dibatalkan tidak ikut. Satu query dengan
 * `sum(case ...)` alih-alih empat query terpisah: keempat angka ini selalu
 * dibaca bersama dan harus berasal dari satu potret yang sama.
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
