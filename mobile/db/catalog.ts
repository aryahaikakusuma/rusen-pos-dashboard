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
    for (const c of categoryRows) {
      await txn.runAsync(
        `insert into categories (id, outlet_id, code, name, sort_order, active)
         values (?, ?, ?, ?, ?, ?)
         on conflict(id) do update set
           outlet_id = excluded.outlet_id, code = excluded.code,
           name = excluded.name, sort_order = excluded.sort_order,
           active = excluded.active`,
        [c.id, c.outlet_id, c.code, c.name, c.sort_order, c.active ? 1 : 0]
      );
    }

    for (const p of productRows) {
      await txn.runAsync(
        `insert into products
           (id, outlet_id, category_id, code, name, price, active)
         values (?, ?, ?, ?, ?, ?, ?)
         on conflict(id) do update set
           outlet_id = excluded.outlet_id, category_id = excluded.category_id,
           code = excluded.code, name = excluded.name,
           price = excluded.price, active = excluded.active`,
        [
          p.id,
          p.outlet_id,
          p.category_id,
          p.code,
          p.name,
          p.price,
          p.active ? 1 : 0,
        ]
      );
    }

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
