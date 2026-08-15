/**
 * Tarik katalog dari Supabase ke SQLite lokal. Satu arah saja — perangkat tidak
 * pernah menulis balik ke categories/products, dan migrasi 0004 memang hanya
 * memberi hak SELECT.
 *
 * Ini BUKAN sync engine langkah 4. Order yang dibuat di perangkat masih belum
 * dikirim ke mana pun; sync_status-nya tetap 'pending' selamanya sampai langkah
 * itu dikerjakan.
 */

import type { SQLiteDatabase } from "expo-sqlite";

import { supabase } from "../lib/supabase";
import type { CategoryRow, ProductRow } from "./types";

export interface CatalogPullResult {
  categories: number;
  products: number;
  taxRateBps: number;
  pulledAt: string;
}

export async function pullCatalog(
  db: SQLiteDatabase
): Promise<CatalogPullResult> {
  const [categories, products, outlets] = await Promise.all([
    // `taxable` menentukan kategori mana yang bukan objek PBJT (0019). Ikut
    // ditarik di sini, bukan ditebak dari kode kategori: perangkat menghitung
    // pajak saat offline, dan kode yang mencocokkan nama akan diam-diam salah
    // begitu kategori diganti namanya.
    supabase
      .from("categories")
      .select("id, outlet_id, code, name, sort_order, active, taxable"),
    // `taxable` sejak 0034 otoritatif untuk pajak, lepas dari kategorinya —
    // sama alasannya dengan categories.taxable di atas: perangkat menghitung
    // pajak saat offline, jadi nilainya harus ikut ditarik, bukan diasumsikan
    // sama dengan kategori.
    supabase
      .from("products")
      .select("id, outlet_id, category_id, code, name, price, active, taxable"),
    // Tarif PBJT ikut ditarik di sini supaya perangkat bisa menghitung pajak
    // saat offline. 0012 memberi hak SELECT tingkat kolom pada outlets —
    // alamat outlet tidak ikut turun.
    supabase.from("outlets").select("id, tax_rate_bps").limit(1).maybeSingle(),
  ]);

  if (categories.error) throw new Error(categories.error.message);
  if (products.error) throw new Error(products.error.message);
  // Dilempar sama kerasnya dengan dua di atas, bukan didiamkan. Tarikan
  // separuh jadi yang meninggalkan tarif basi di samping katalog baru adalah
  // cacat uang, dan diamnya jauh lebih mahal daripada gagalnya.
  if (outlets.error) throw new Error(outlets.error.message);

  const categoryRows = (categories.data ?? []) as CategoryRow[];
  const productRows = (products.data ?? []) as ProductRow[];
  const taxRateBps = (outlets.data as { tax_rate_bps: number } | null)?.tax_rate_bps;
  if (typeof taxRateBps !== "number") {
    throw new Error("Tarif PBJT tidak terbaca dari server.");
  }
  const pulledAt = new Date().toISOString();

  await db.withExclusiveTransactionAsync(async (txn) => {
    // Upsert, bukan hapus-lalu-isi. Menghapus dulu akan membuat perangkat
    // sempat tidak punya katalog sama sekali kalau prosesnya mati di tengah.
    //
    // Ditulis berkelompok, bukan satu baris satu perintah. Katalognya 293
    // produk; satu runAsync per baris berarti 300-an lintasan JS ke native di
    // dalam satu transaksi eksklusif, dan di ponsel itu terasa seperti aplikasi
    // menggantung. Berkelompok menekannya jadi segelintir perintah.
    await upsertChunked(
      txn,
      "categories",
      ["id", "outlet_id", "code", "name", "sort_order", "active", "taxable"],
      categoryRows.map((c) => [
        c.id,
        c.outlet_id,
        c.code,
        c.name,
        c.sort_order,
        c.active ? 1 : 0,
        // `?? true` bukan hiasan: server yang belum menjalankan 0019 tidak
        // mengirim kolom ini sama sekali, dan kena pajak adalah bawaan yang
        // aman. Bebas pajak harus selalu berupa pernyataan yang tegas.
        (c.taxable ?? 1) ? 1 : 0,
      ])
    );

    await upsertChunked(
      txn,
      "products",
      ["id", "outlet_id", "category_id", "code", "name", "price", "active", "taxable"],
      productRows.map((p) => [
        p.id,
        p.outlet_id,
        p.category_id,
        p.code,
        p.name,
        p.price,
        p.active ? 1 : 0,
        // `?? true`: server yang belum menjalankan 0034 tidak mengirim kolom
        // ini sama sekali. Kena pajak adalah bawaan yang aman, sama pola
        // dengan categories.taxable di atas.
        (p.taxable ?? true) ? 1 : 0,
      ])
    );

    // outlet_id dipakai createOrder. Di Postgres nilainya diambil dari baris
    // employees; perangkat tidak menyimpan tabel itu, jadi diambil dari katalog.
    const outletId = productRows[0]?.outlet_id ?? categoryRows[0]?.outlet_id;
    if (outletId) {
      await txn.runAsync(
        `insert into app_state (key, value) values ('outlet_id', ?)
         on conflict(key) do update set value = excluded.value`,
        [outletId]
      );
    }

    // Ditulis di transaksi yang sama dengan katalognya. Tarif dan harga harus
    // berasal dari satu tarikan yang sama; keduanya terpisah berarti pajak
    // dihitung dari tarif satu zaman atas harga zaman lain.
    await txn.runAsync(
      `insert into app_state (key, value) values ('tax_rate_bps', ?)
       on conflict(key) do update set value = excluded.value`,
      [String(taxRateBps)]
    );

    await txn.runAsync(
      `insert into app_state (key, value) values ('catalog_pulled_at', ?)
       on conflict(key) do update set value = excluded.value`,
      [pulledAt]
    );
  });

  return {
    categories: categoryRows.length,
    products: productRows.length,
    taxRateBps,
    pulledAt,
  };
}

/**
 * Tarif PBJT yang tersimpan di perangkat, basis point — null kalau katalog
 * belum pernah ditarik sejak rilis ini.
 *
 * Sengaja TIDAK ada nilai bawaan kalau null. Angka pajak yang ditebak sendiri
 * oleh perangkat adalah angka yang salah tanpa ada yang tahu; menolak melayani
 * pembayaran sampai tarifnya ditarik jauh lebih jujur, dan obatnya satu ketukan.
 */
export async function taxRateBps(db: SQLiteDatabase): Promise<number | null> {
  const row = await db.getFirstAsync<{ value: string }>(
    "select value from app_state where key = 'tax_rate_bps'"
  );
  if (!row) return null;
  const parsed = Number(row.value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Upsert banyak baris dengan sesedikit mungkin perintah. Dipecah per kelompok
 * karena SQLite membatasi jumlah parameter dalam satu pernyataan; 100 baris
 * dikali 7 kolom masih jauh di bawah batas itu.
 */
async function upsertChunked(
  db: SQLiteDatabase,
  table: string,
  columns: string[],
  rows: Array<Array<string | number>>,
  chunkSize = 100
): Promise<void> {
  if (rows.length === 0) return;

  // Semua kolom kecuali id ditimpa nilai baru.
  const updates = columns
    .filter((c) => c !== "id")
    .map((c) => `${c} = excluded.${c}`)
    .join(", ");
  const placeholder = `(${columns.map(() => "?").join(", ")})`;

  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    await db.runAsync(
      `insert into ${table} (${columns.join(", ")})
       values ${chunk.map(() => placeholder).join(", ")}
       on conflict(id) do update set ${updates}`,
      chunk.flat()
    );
  }
}

/** Kapan katalog terakhir ditarik — null kalau belum pernah. */
export async function catalogPulledAt(
  db: SQLiteDatabase
): Promise<string | null> {
  const row = await db.getFirstAsync<{ value: string }>(
    "select value from app_state where key = 'catalog_pulled_at'"
  );
  return row?.value ?? null;
}

export async function listCategories(
  db: SQLiteDatabase
): Promise<CategoryRow[]> {
  return db.getAllAsync<CategoryRow>(
    "select * from categories where active = 1 order by sort_order, name"
  );
}

/**
 * Seluruh produk aktif sekaligus. 293 baris teks pendek — menahannya di memori
 * jauh lebih murah daripada menembak SQLite tiap kali kasir mengganti kategori
 * atau mengetik satu huruf di kolom pencarian.
 */
export async function listProducts(
  db: SQLiteDatabase
): Promise<ProductRow[]> {
  return db.getAllAsync<ProductRow>(
    "select * from products where active = 1 order by code"
  );
}
