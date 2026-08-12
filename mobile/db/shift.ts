/**
 * Sif kasir. Dibuka saat kasir mengisi Modal Awal (gerbang wajib sebelum bisa
 * melayani), ditutup saat Tutup Kasir dicetak. Lokal saja — lihat komentar V4
 * di db/migrations.ts untuk kenapa tabel ini tidak ikut sinkron ke server.
 */

import * as Crypto from "expo-crypto";
import type { SQLiteDatabase } from "expo-sqlite";

import { cashTotals } from "./cash";

const now = () => new Date().toISOString();

export type ShiftLabel = "pagi" | "sore";

export interface OpenShift {
  id: string;
  employeeId: string;
  employeeName: string;
  modalAwal: number;
  openedAt: string;
  label: ShiftLabel | null;
}

export interface ShiftTotals {
  tunai: number;
  nonTunai: number;
  /** Rincian penjualan non tunai per kanal — lihat PAYMENT_CHANNELS di lib/types.ts. */
  qris: number;
  transfer: number;
  kartu: number;
  refund: number;
  /** Refund atas order tunai saja — dipakai menghitung Kas Seharusnya. */
  refundTunai: number;
  pajak: number;
  transaksiSelesai: number;
  transaksiPending: number;
  /** Kas non-penjualan sif ini — lihat db/cash.ts. */
  kasMasukTunai: number;
  kasMasukNonTunai: number;
  kasKeluarTunai: number;
  kasKeluarNonTunai: number;
}

/**
 * Sif yang sedang terbuka, kalau ada. `null` berarti belum ada Modal Awal
 * yang diisi sejak sif terakhir ditutup (atau ini pemasangan baru) — layar
 * pemanggil menampilkan gerbang Modal Awal untuk kasus ini.
 */
export async function currentShift(
  db: SQLiteDatabase
): Promise<OpenShift | null> {
  const row = await db.getFirstAsync<{
    id: string;
    employee_id: string;
    employee_name: string;
    modal_awal: number;
    opened_at: string;
    label: ShiftLabel | null;
  }>(
    `select id, employee_id, employee_name, modal_awal, opened_at, label
     from shifts where closed_at is null
     order by opened_at desc limit 1`
  );
  if (!row) return null;
  return {
    id: row.id,
    employeeId: row.employee_id,
    employeeName: row.employee_name,
    modalAwal: row.modal_awal,
    openedAt: row.opened_at,
    label: row.label,
  };
}

/**
 * Menolak kalau sudah ada sif berstatus open — jaminan "satu sif open per
 * perangkat" di level fungsi, bukan cuma di gerbang UI (tombol menu yang
 * berganti "Mulai Shift" / "Tutup Kasir" berdasar `aktif`). Gerbang UI cukup
 * untuk alur normal tapi tidak menolak pemanggilan lain ke fungsi ini.
 */
export async function openShift(
  db: SQLiteDatabase,
  params: {
    employeeId: string;
    employeeName: string;
    modalAwal: number;
    label: ShiftLabel;
  }
): Promise<string> {
  const existing = await currentShift(db);
  if (existing) {
    throw new Error("Masih ada sif yang terbuka. Tutup sif itu dulu.");
  }

  const id = Crypto.randomUUID();
  await db.runAsync(
    `insert into shifts (id, employee_id, employee_name, modal_awal, opened_at, label)
     values (?, ?, ?, ?, ?, ?)`,
    [id, params.employeeId, params.employeeName, params.modalAwal, now(), params.label]
  );
  return id;
}

/**
 * Uang dan hitungan dari orders (bukan payments — payments tidak punya tipe
 * TS maupun pembaca hari ini, dan satu tabel ini sudah memuat ketiga angka).
 *
 * Tidak disaring menurut siapa yang membayar order (`paid_by`): laci berisi
 * semua uang yang lewat perangkat ini selama sif, siapa pun yang menekan
 * tombolnya. Menyaring per pegawai bisa membuat satu order lenyap dari setiap
 * laporan tanpa jejak.
 *
 * `is_test_data = 0` membuang order mode uji — termasuk yang dibuat DebugScreen.
 * Sampai V8 penandanya adalah awalan `UJI-` pada table_code; kolom ini yang
 * menggantikannya, dan ia satu-satunya definisi "order uji" sekarang. Kalau
 * saringan ini terlewat di satu query saja, uang yang tidak pernah ada akan
 * muncul di Tutup Kasir sebagai selisih LEBIH.
 *
 * Kas non-penjualan dikembar dengan aturan yang BERBEDA: menurut `shift_id`,
 * bukan jendela `[openedAt, sampai)` seperti order di atas. Itu bukan
 * ketidakkonsistenan yang perlu dirapikan. Order tidak tahu ia milik sif mana,
 * jadi waktu adalah satu-satunya alat yang tersedia; entri kas lahir dari sif
 * tertentu dan membawa idnya sejak baris pertama. Ikatan yang lebih kuat
 * dipakai di tempat yang punya — akibatnya tidak ada pertanyaan zona waktu
 * pada kas, dan tidak ada entri yang bisa jatuh ke sif tetangga.
 */
export async function shiftTotals(
  db: SQLiteDatabase,
  shift: OpenShift
): Promise<ShiftTotals> {
  const sampai = now();

  const uang = await db.getFirstAsync<{
    tunai: number;
    non_tunai: number;
    qris: number;
    transfer: number;
    kartu: number;
    pajak: number;
    transaksi_selesai: number;
  }>(
    `select
       coalesce(sum(case when payment_method = 'cash' then total else 0 end), 0) as tunai,
       coalesce(sum(case when payment_method = 'non_cash' then total else 0 end), 0) as non_tunai,
       -- Rincian kanal, murni untuk struk — TIDAK dipakai kas laci. Yang
       -- menentukan "masuk laci atau tidak" tetap payment_method di atas,
       -- persis seperti sebelum kolom payment_channel ada.
       coalesce(sum(case when payment_channel = 'qris' then total else 0 end), 0) as qris,
       coalesce(sum(case when payment_channel = 'transfer' then total else 0 end), 0) as transfer,
       coalesce(sum(case when payment_channel = 'card' then total else 0 end), 0) as kartu,
       coalesce(sum(tax_amount), 0) as pajak,
       count(*) as transaksi_selesai
     from orders
     where status = 'paid'
       and paid_at >= ? and paid_at < ?
       and is_test_data = 0`,
    [shift.openedAt, sampai]
  );

  const pending = await db.getFirstAsync<{ n: number }>(
    `select count(*) as n from orders
     where status = 'pending'
       and created_at >= ? and created_at < ?
       and is_test_data = 0`,
    [shift.openedAt, sampai]
  );

  // Refund di-ember menurut refunds.created_at (refund yang DIKELUARKAN pada
  // sif ini) — sama seperti get_sales_summary di 0015_laporan_pbjt.sql, dan
  // bisa berbeda hari dari paid_at order yang direfund.
  const refund = await db.getFirstAsync<{ amount: number }>(
    `select coalesce(sum(r.amount), 0) as amount
     from refunds r
     join orders o on o.id = r.order_id
     where r.created_at >= ? and r.created_at < ?
       and o.is_test_data = 0`,
    [shift.openedAt, sampai]
  );

  // Hanya refund atas order TUNAI — itu yang uangnya benar-benar keluar dari
  // laci. `refunds` tidak punya kolom metode bayar sendiri, jadi ini menebak
  // dari metode bayar order yang direfund. Batasnya: refund atas order non
  // tunai yang pada praktiknya dibayar pakai uang laci tidak akan terhitung
  // di sini, dan akan muncul sebagai selisih KURANG yang terlihat persis
  // seperti salah hitung. Data yang ada tidak bisa membedakan keduanya —
  // obatnya kolom metode di `refunds`, pekerjaan terpisah (TO_DO.md).
  const refundTunai = await db.getFirstAsync<{ amount: number }>(
    `select coalesce(sum(r.amount), 0) as amount
     from refunds r
     join orders o on o.id = r.order_id
     where r.created_at >= ? and r.created_at < ?
       and o.payment_method = 'cash'
       and o.is_test_data = 0`,
    [shift.openedAt, sampai]
  );

  const kas = await cashTotals(db, shift.id);

  return {
    tunai: uang?.tunai ?? 0,
    nonTunai: uang?.non_tunai ?? 0,
    qris: uang?.qris ?? 0,
    transfer: uang?.transfer ?? 0,
    kartu: uang?.kartu ?? 0,
    pajak: uang?.pajak ?? 0,
    transaksiSelesai: uang?.transaksi_selesai ?? 0,
    transaksiPending: pending?.n ?? 0,
    refund: refund?.amount ?? 0,
    refundTunai: refundTunai?.amount ?? 0,
    kasMasukTunai: kas.masukTunai,
    kasMasukNonTunai: kas.masukNonTunai,
    kasKeluarTunai: kas.keluarTunai,
    kasKeluarNonTunai: kas.keluarNonTunai,
  };
}

/**
 * Menutup sif dan menyimpan cuplikan totalnya. Panggil ini SESUDAH struk
 * berhasil tercetak, tidak sebelum — kalau pencetakan gagal, sif harus tetap
 * terbuka supaya kasir bisa mengulang tanpa mengingat balik totalnya.
 *
 * `kasFisik` adalah hasil hitung fisik yang diketik kasir, dan `selisih`
 * sudah dihitung oleh pemanggil (kasFisik - kasSeharusnya) — disimpan apa
 * adanya, bukan dihitung ulang di sini, supaya angka yang tersimpan sama
 * persis dengan yang sudah tercetak di kertas.
 */
export async function closeShift(
  db: SQLiteDatabase,
  shiftId: string,
  totals: ShiftTotals,
  kasFisik: number,
  selisih: number
): Promise<void> {
  await db.runAsync(
    `update shifts
     set closed_at = ?, tunai = ?, non_tunai = ?, refund = ?, pajak = ?,
         transaksi_selesai = ?, transaksi_pending = ?,
         refund_tunai = ?, kas_fisik = ?, selisih = ?,
         kas_masuk_tunai = ?, kas_masuk_non_tunai = ?,
         kas_keluar_tunai = ?, kas_keluar_non_tunai = ?
     where id = ?`,
    [
      now(),
      totals.tunai,
      totals.nonTunai,
      totals.refund,
      totals.pajak,
      totals.transaksiSelesai,
      totals.transaksiPending,
      totals.refundTunai,
      kasFisik,
      selisih,
      totals.kasMasukTunai,
      totals.kasMasukNonTunai,
      totals.kasKeluarTunai,
      totals.kasKeluarNonTunai,
      shiftId,
    ]
  );
}
