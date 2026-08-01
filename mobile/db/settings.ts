/**
 * Setelan yang melekat pada perangkat, bukan pada karyawan.
 *
 * Menumpang di tabel `app_state` yang sudah ada — kunci/nilai, sudah dipakai
 * untuk outlet_id dan catalog_pulled_at — jadi tidak ada kenaikan versi skema
 * hanya untuk menyimpan satu alamat MAC. Tablet yang sudah terpasang tidak
 * perlu bermigrasi sama sekali.
 *
 * Sengaja BUKAN expo-secure-store: itu tempat rahasia (token sesi), dan alamat
 * printer bukan rahasia. Sengaja pula bukan milik sesi: printer melekat pada
 * mesin kasir, jadi pilihannya harus bertahan melewati pergantian sif — kasir
 * berikutnya tidak seharusnya memilih printer lagi setiap pagi.
 */

import type { SQLiteDatabase } from "expo-sqlite";

const PRINTER_ADDRESS = "printer_address";
const PRINTER_NAME = "printer_name";

async function read(db: SQLiteDatabase, key: string): Promise<string | null> {
  const row = await db.getFirstAsync<{ value: string }>(
    "select value from app_state where key = ?",
    [key]
  );
  return row?.value ?? null;
}

async function write(
  db: SQLiteDatabase,
  key: string,
  value: string
): Promise<void> {
  await db.runAsync(
    `insert into app_state (key, value) values (?, ?)
     on conflict(key) do update set value = excluded.value`,
    [key, value]
  );
}

export interface SavedPrinter {
  address: string;
  name: string;
}

/**
 * Namanya ikut disimpan supaya menu bisa menulis "Printer: RPP02N" tanpa
 * menyalakan radio Bluetooth hanya untuk menerjemahkan sebuah alamat MAC
 * menjadi nama.
 */
export async function savedPrinter(
  db: SQLiteDatabase
): Promise<SavedPrinter | null> {
  const address = await read(db, PRINTER_ADDRESS);
  if (!address) return null;
  return { address, name: (await read(db, PRINTER_NAME)) ?? address };
}

export async function savePrinter(
  db: SQLiteDatabase,
  printer: SavedPrinter
): Promise<void> {
  await write(db, PRINTER_ADDRESS, printer.address);
  await write(db, PRINTER_NAME, printer.name);
}

export async function forgetPrinter(db: SQLiteDatabase): Promise<void> {
  await db.runAsync("delete from app_state where key in (?, ?)", [
    PRINTER_ADDRESS,
    PRINTER_NAME,
  ]);
}
