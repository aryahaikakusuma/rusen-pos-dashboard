import "server-only";

import type { BarisDetail, BarisHarian, BarisProduk } from "./kontrak";
import type { Periode } from "./periode";
import { db } from "./supabase/server";

/**
 * Satu-satunya jalur perhitungan laporan.
 *
 * Tiga fungsi di bawah memanggil tiga fungsi Postgres dari `0027`, satu-ke-satu,
 * tanpa menghitung apa pun sendiri. Layar dan berkas xlsx sama-sama lewat sini,
 * jadi tidak ada dua jalur angka yang bisa berbeda. Kalau bentuk keluarannya
 * kurang untuk sebuah tampilan, yang berubah adalah fungsi Postgres-nya —
 * bukan ditambal dengan query sampingan di TypeScript.
 *
 * Semua kolom bertipe `bigint` di Postgres. PostgREST mengirimnya sebagai angka
 * JSON, dan seluruh nilai di sini rupiah bulat yang jauh di bawah 2^53, jadi
 * `number` aman. Yang akan meleset lebih dulu bukan tipe datanya melainkan
 * omzet Rusen mencapai sembilan kuadriliun rupiah.
 */

export type { BarisDetail, BarisHarian, BarisProduk } from "./kontrak";

export async function laporanHarian(periode: Periode): Promise<BarisHarian[]> {
  const { data, error } = await db.rpc("laporan_penjualan_harian", {
    p_dari: periode.dari,
    p_sampai: periode.sampai,
  });
  if (error) throw new Error(`laporan_penjualan_harian gagal: ${error.message}`);
  return (data ?? []) as BarisHarian[];
}

export interface HasilDetail {
  baris: BarisDetail[];
  totalBaris: number;
}

/**
 * `total_baris` dibawa fungsi Postgres sebagai kolom window pada tiap baris.
 * Halaman kosong (offset melewati akhir) tidak mengembalikan baris sama sekali,
 * sehingga hitungannya ikut hilang — itu bentuk yang disengaja di `0027`, dan
 * di sini nol baris diperlakukan sebagai nol, bukan sebagai kegagalan.
 */
export async function laporanDetail(
  periode: Periode,
  limit: number,
  offset: number
): Promise<HasilDetail> {
  const { data, error } = await db.rpc("laporan_penjualan_detail", {
    p_dari: periode.dari,
    p_sampai: periode.sampai,
    p_limit: limit,
    p_offset: offset,
  });
  if (error) throw new Error(`laporan_penjualan_detail gagal: ${error.message}`);

  const baris = (data ?? []) as BarisDetail[];
  return { baris, totalBaris: baris[0]?.total_baris ?? 0 };
}

export async function laporanProduk(periode: Periode): Promise<BarisProduk[]> {
  const { data, error } = await db.rpc("laporan_produk", {
    p_dari: periode.dari,
    p_sampai: periode.sampai,
  });
  if (error) throw new Error(`laporan_produk gagal: ${error.message}`);
  return (data ?? []) as BarisProduk[];
}

/**
 * Nama outlet untuk identitas laporan.
 *
 * Rusen satu outlet dan tidak ada pemilih outlet di UI, tapi nama itu wajib
 * tercetak di setiap berkas yang beredar. Kalau suatu saat ada cabang kedua,
 * yang berubah adalah pemanggilnya, bukan bentuk fungsi ini.
 */
export async function namaOutlet(): Promise<string> {
  const { data, error } = await db
    .from("outlets")
    .select("name")
    .order("name")
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`Gagal membaca outlet: ${error.message}`);
  return data?.name ?? "Rusen Kopitiam";
}
