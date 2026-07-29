import "server-only";

import { createClient } from "@supabase/supabase-js";

/**
 * Satu-satunya jalur akses database.
 *
 * Memakai service_role key, jadi ia MELEWATI RLS — ini disengaja. Keamanan
 * ditegakkan di lapisan Server Action (cek sesi + role), bukan di RLS.
 * RLS tetap aktif sebagai jaring pengaman kalau suatu saat ada koneksi lain.
 *
 * `import "server-only"` di atas membuat build gagal keras kalau modul ini
 * sampai ter-import ke dalam bundle klien.
 */
export const db = createClient(
  requireEnv("SUPABASE_URL"),
  requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { persistSession: false, autoRefreshToken: false } }
);

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Environment variable ${name} belum diisi. Salin .env.example ke .env.local.`
    );
  }
  return value;
}
