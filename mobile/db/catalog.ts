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
  pulledAt: string;
}

export async function pullCatalog(
  db: SQLiteDatabase
): Promise<CatalogPullResult> {
  const [categories, products] = await Promise.all([
    supabase.from("categories").select("id, outlet_id, code, name, sort_order, active"),
    supabase.from("products").select("id, outlet_id, category_id, code, name, price, active"),
  ]);

  if (categories.error) throw new Error(categories.error.message);
  if (products.error) throw new Error(products.error.message);

  const categoryRows = (categories.data ?? []) as CategoryRow[];
  const productRows = (products.data ?? []) as ProductRow[];
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
      ["id", "outlet_id", "code", "name", "sort_order", "active"],
      categoryRows.map((c) => [
        c.id,
        c.outlet_id,
        c.code,
        c.name,
        c.sort_order,
        c.active ? 1 : 0,
      ])
    );

    await upsertChunked(
      txn,
      "products",
      ["id", "outlet_id", "category_id", "code", "name", "price", "active"],
      productRows.map((p) => [
        p.id,
        p.outlet_id,
        p.category_id,
        p.code,
        p.name,
        p.price,
        p.active ? 1 : 0,
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

    await txn.runAsync(
      `insert into app_state (key, value) values ('catalog_pulled_at', ?)
       on conflict(key) do update set value = excluded.value`,
      [pulledAt]
    );
  });

  return {
    categories: categoryRows.length,
    products: productRows.length,
    pulledAt,
  };
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

export async function listProducts(
  db: SQLiteDatabase
): Promise<ProductRow[]> {
  return db.getAllAsync<ProductRow>(
    "select * from products where active = 1 order by code"
  );
}
