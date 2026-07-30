// Pengelompokan varian suhu minuman.
//
// Di database, panas dan dingin adalah dua produk terpisah dengan kode dan harga
// masing-masing (mis. "Coklat Panas" Rp 17.000 dan "Coklat Dingin" Rp 20.000).
// Itu benar untuk pencatatan, tapi memaksa kasir memindai dua kartu untuk satu
// menu. Di layar keduanya digabung jadi satu kartu "Coklat"; suhunya baru
// ditanyakan setelah kartu ditekan.
//
// Penanda suhu di daftar menu tidak seragam. Selain "Panas"/"Dingin", kategori
// Kopi memakai akhiran "S" atau "Es" untuk versi dingin, dan versi panasnya
// ditulis tanpa akhiran sama sekali:
//
//   Kopi              Rp 11.000   ← panas
//   Kopi S            Rp 15.000   ← dingin
//   Kopi Susu Panas   Rp 13.000
//   Kopi Susu S       Rp 18.000
//
// Jadi nama tanpa akhiran diperlakukan sebagai kandidat "panas", dan baru benar-
// benar digabung kalau ada saudara dinginnya. Kalau tidak ada, kartunya berdiri
// sendiri persis seperti produk biasa.
//
// Yang dikirim ke server tetap productId asli — pengelompokan ini murni tampilan.
//
// Kembaran berkas ini ada di lib/product-variants.ts (aplikasi web). Keduanya
// harus berubah bersama: kalau berbeda, kasir melihat isi kartu yang berbeda di
// dua perangkat untuk katalog yang sama, dan tidak ada tes yang menangkapnya.

import type { ProductRow } from "../db/types";

export type TemperatureVariant = "panas" | "dingin";

export interface ProductOption {
  product: ProductRow;
  variant: TemperatureVariant;
}

export interface ProductEntry {
  key: string;
  /** Nama yang tampil di kartu: tanpa akhiran suhu kalau kedua varian ada. */
  label: string;
  minPrice: number;
  maxPrice: number;
  /** Lebih dari satu berarti kasir harus memilih suhu dulu. */
  options: ProductOption[];
}

/**
 * Akhiran penanda suhu. "S" dan "Es" hanya dikenali sebagai kata terpisah, jadi
 * "Kopi Milo Susu" (berakhir huruf u) dan "Kopi Susu Pancung" tidak ikut terpotong.
 */
const SUFFIX = /\s+(panas|dingin|es|s)$/i;

function readVariant(name: string): {
  base: string;
  variant: TemperatureVariant;
} {
  const match = SUFFIX.exec(name);
  if (!match) {
    // Tanpa akhiran: kandidat panas, dengan nama utuh sebagai nama dasar.
    return { base: name, variant: "panas" };
  }
  const suffix = match[1].toLowerCase();
  return {
    base: name.slice(0, match.index).trim(),
    variant: suffix === "panas" ? "panas" : "dingin",
  };
}

/**
 * Menggabungkan produk yang namanya hanya berbeda pada penanda suhu.
 * Kunci grup menyertakan kategori supaya menu bernama mirip di kategori berbeda
 * (mis. "Jahe Gula Merah" di JAHE dan "Teh Gula Merah" di TEH) tidak tercampur.
 * Urutan produk masukan dipertahankan.
 */
export function groupProductVariants(products: ProductRow[]): ProductEntry[] {
  const entries: ProductEntry[] = [];
  const byKey = new Map<string, ProductEntry>();

  for (const product of products) {
    const { base, variant } = readVariant(product.name);
    const key = `${product.category_id}:${base.toLowerCase()}`;
    const existing = byKey.get(key);

    // Kalau suhu yang sama sudah terisi, dua produk ini bukan pasangan varian
    // (nama dasarnya kebetulan sama). Biarkan berdiri sendiri daripada
    // memunculkan lembar dengan dua tombol "Panas".
    if (existing && !existing.options.some((o) => o.variant === variant)) {
      existing.options.push({ product, variant });
      existing.minPrice = Math.min(existing.minPrice, product.price);
      existing.maxPrice = Math.max(existing.maxPrice, product.price);
      continue;
    }

    const entry: ProductEntry = {
      key: existing ? product.id : key,
      label: base,
      minPrice: product.price,
      maxPrice: product.price,
      options: [{ product, variant }],
    };
    if (!existing) byKey.set(key, entry);
    entries.push(entry);
  }

  for (const entry of entries) {
    if (entry.options.length > 1) {
      // Panas selalu di kiri supaya posisi tombol tidak berpindah-pindah antar
      // menu — kasir menekan berdasarkan hafalan posisi saat ramai.
      entry.options.sort((a, b) => (a.variant === "panas" ? -1 : 1));
      continue;
    }
    // Hanya satu suhu yang tersedia (mis. "Kopi Cendol S" tanpa versi panas).
    // Namanya dikembalikan utuh supaya kasir tahu ia tidak sedang memilih.
    entry.label = entry.options[0].product.name;
  }

  return entries;
}

export const VARIANT_LABEL: Record<TemperatureVariant, string> = {
  panas: "Panas",
  dingin: "Dingin",
};
