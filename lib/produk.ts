import "server-only";

import { KesalahanMasukan } from "./errors";
import type { Kategori, Produk } from "./kontrak";
import { db } from "./supabase/server";

/**
 * Kelola produk.
 *
 * TIGA HAL YANG MEMBENTUK FILE INI
 *
 * 1. TIDAK ADA TABEL VARIAN. "Kopi Susu Panas" dan "Kopi Susu S" adalah dua
 *    BARIS PRODUK, bukan satu produk dengan dua pilihan. Penggabungannya jadi
 *    satu kartu di aplikasi kasir murni parsing nama di klien
 *    (`mobile/lib/product-variants.ts`). Konsekuensinya untuk halaman ini:
 *    menambah "varian" berarti menambah satu baris produk lagi, dan nama yang
 *    diketik menentukan apakah ia bergabung ke kartu yang sudah ada atau berdiri
 *    sendiri. Tidak ada yang bisa dilakukan file ini untuk mengubah itu.
 *
 * 2. TIDAK ADA STOK, dan pajak melekat di KATEGORI. Skema `products` hanya punya
 *    kode, nama, kategori, harga, aktif. `categories.taxable` yang menentukan
 *    objek PBJT atau bukan, dan itu sifat barangnya (rokok), bukan pilihan per
 *    produk.
 *
 * 3. "HAPUS" ADALAH MENONAKTIFKAN. `order_items.product_id` menunjuk ke baris
 *    produk, jadi penghapusan sungguhan akan ditolak kunci asing begitu produk
 *    itu pernah terjual — dan kalaupun bisa, riwayat transaksi akan kehilangan
 *    tautannya. Struk lama tetap benar karena `order_items` menyimpan snapshot
 *    `product_code` dan `product_name`, tapi produknya sendiri tidak boleh
 *    lenyap dari basis data.
 */

export type { Kategori, Produk } from "./kontrak";

export interface MasukanProduk {
  code: string;
  name: string;
  price: number;
  category_id: string;
  active: boolean;
}

export async function daftarKategori(): Promise<Kategori[]> {
  const { data, error } = await db
    .from("categories")
    .select("id, code, name, taxable, sort_order, active")
    .order("sort_order")
    .order("name");

  if (error) throw new Error(`Gagal membaca kategori: ${error.message}`);
  return (data ?? []) as Kategori[];
}

export async function daftarProduk(): Promise<Produk[]> {
  const { data, error } = await db
    .from("products")
    .select("id, code, name, price, active, category_id, categories (name, taxable)")
    .order("name");

  if (error) throw new Error(`Gagal membaca produk: ${error.message}`);

  return (data ?? []).map((baris) => {
    // PostgREST mengembalikan relasi many-to-one kadang sebagai objek, kadang
    // sebagai array satu elemen, tergantung bentuk query. Ratakan keduanya.
    const relasi = baris.categories as unknown;
    const kategori = (Array.isArray(relasi) ? relasi[0] : relasi) as
      | { name: string; taxable: boolean }
      | null;

    return {
      id: baris.id,
      code: baris.code,
      name: baris.name,
      price: baris.price,
      active: baris.active,
      category_id: baris.category_id,
      kategori: kategori?.name ?? "-",
      kategori_taxable: kategori?.taxable ?? true,
    };
  });
}

/**
 * Validasi masukan.
 *
 * Kode produk sengaja diminta eksplisit dan tidak dibuatkan otomatis. Kode di
 * Rusen berasal dari ekspor spreadsheet dan berserakan di `K1xx`, `K2xx`,
 * `R0xx`, serta beberapa string seadanya — tidak ada deret yang bisa
 * dilanjutkan tanpa menebak. Pernah terjadi tabrakan kode yang hanya ketahuan
 * lewat hitungan duplikat. Yang aman adalah menyusulkan huruf pada kode induk
 * (`K134` → `K134A`), dan itu keputusan manusia yang tahu produknya, bukan
 * keputusan penghitung.
 */
function periksa(masukan: unknown): MasukanProduk {
  if (typeof masukan !== "object" || masukan === null) {
    throw new KesalahanMasukan("Isian tidak terbaca.");
  }
  const m = masukan as Record<string, unknown>;

  const code = String(m.code ?? "").trim().toUpperCase();
  const name = String(m.name ?? "").trim();
  const category_id = String(m.category_id ?? "").trim();
  const active = m.active !== false;

  if (!code) throw new KesalahanMasukan("Kode produk wajib diisi.");
  if (!/^[A-Z0-9-]{1,20}$/.test(code)) {
    throw new KesalahanMasukan(
      "Kode produk hanya boleh huruf, angka, dan tanda hubung (maksimal 20 karakter)."
    );
  }
  if (!name) throw new KesalahanMasukan("Nama produk wajib diisi.");
  if (name.length > 80) throw new KesalahanMasukan("Nama produk maksimal 80 karakter.");
  if (!category_id) throw new KesalahanMasukan("Kategori wajib dipilih.");

  const price = Number(m.price);
  if (!Number.isInteger(price) || price < 0) {
    throw new KesalahanMasukan("Harga harus bilangan bulat rupiah, minimal 0.");
  }
  if (price > 100_000_000) {
    throw new KesalahanMasukan("Harga di luar batas wajar.");
  }

  return { code, name, price, category_id, active };
}

async function outletDariKategori(category_id: string): Promise<string> {
  const { data, error } = await db
    .from("categories")
    .select("outlet_id")
    .eq("id", category_id)
    .maybeSingle();

  if (error) throw new Error(`Gagal membaca kategori: ${error.message}`);
  if (!data) throw new KesalahanMasukan("Kategori tidak ditemukan.");
  return data.outlet_id;
}

export async function buatProduk(masukan: unknown): Promise<Produk> {
  const bersih = periksa(masukan);

  // outlet_id diambil dari kategorinya, bukan diterima dari browser: satu-satunya
  // cara produk bisa mendarat di outlet yang berbeda dari kategorinya adalah
  // kalau nilainya datang dari luar.
  const outlet_id = await outletDariKategori(bersih.category_id);

  const { data, error } = await db
    .from("products")
    .insert({ ...bersih, outlet_id })
    .select("id")
    .single();

  if (error) throw terjemahkan(error, bersih.code);
  return (await satuProduk(data.id))!;
}

export async function ubahProduk(id: string, masukan: unknown): Promise<Produk> {
  const bersih = periksa(masukan);
  const outlet_id = await outletDariKategori(bersih.category_id);

  const { data, error } = await db
    .from("products")
    .update({ ...bersih, outlet_id })
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) throw terjemahkan(error, bersih.code);
  if (!data) throw new KesalahanMasukan("Produk tidak ditemukan.");
  return (await satuProduk(id))!;
}

/**
 * Menonaktifkan, bukan menghapus. Lihat catatan 3 di kepala berkas.
 * Produk nonaktif hilang dari menu kasir dan tetap utuh di seluruh riwayat.
 */
export async function nonaktifkanProduk(id: string): Promise<Produk> {
  const { data, error } = await db
    .from("products")
    .update({ active: false })
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) throw new Error(`Gagal menonaktifkan produk: ${error.message}`);
  if (!data) throw new KesalahanMasukan("Produk tidak ditemukan.");
  return (await satuProduk(id))!;
}

async function satuProduk(id: string): Promise<Produk | null> {
  const semua = await daftarProduk();
  return semua.find((p) => p.id === id) ?? null;
}

function terjemahkan(error: { code?: string; message: string }, code: string): Error {
  // 23505 = unique_violation pada (outlet_id, code). Pesan mentah PostgREST
  // menyebut nama constraint, yang tidak berarti apa-apa bagi pemakainya.
  if (error.code === "23505") {
    return new KesalahanMasukan(
      `Kode ${code} sudah dipakai produk lain. Coba susulkan huruf, misalnya ${code}A.`
    );
  }
  return new Error(`Gagal menyimpan produk: ${error.message}`);
}
