import type { BarisHarian } from "./kontrak";

/**
 * Penjumlahan kolom laporan harian.
 *
 * Ada di satu berkas karena tiga halaman membutuhkannya, dan satu-satunya cara
 * angka di Dashboard, Penjualan Harian, dan Detail Penjualan dijamin cocok
 * adalah kalau ketiganya menjumlahkan dengan kode yang sama persis. Salinan
 * kedua yang kehilangan satu kolom akan menghasilkan selisih yang tidak memicu
 * error di mana pun.
 *
 * Ini penjumlahan, bukan perhitungan: tidak ada rumus pajak, rasio, atau
 * pembulatan di sini. Semua itu sudah selesai di Postgres.
 */

export type TotalHarian = Record<keyof Omit<BarisHarian, "tanggal">, number>;

const KOLOM: (keyof TotalHarian)[] = [
  "jumlah_order",
  "omzet_kotor",
  "total_refund",
  "omzet_bersih",
  "dasar_pbjt",
  "pbjt",
  "omzet_bebas_order",
  "omzet_bukan_objek",
  "tertagih",
  "tertagih_tunai",
  "tertagih_non_tunai",
];

export function totalHarian(baris: BarisHarian[]): TotalHarian {
  const hasil = Object.fromEntries(KOLOM.map((k) => [k, 0])) as TotalHarian;
  for (const b of baris) for (const k of KOLOM) hasil[k] += b[k];
  return hasil;
}
