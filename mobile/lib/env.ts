/**
 * Hanya kunci publik yang boleh ada di sini.
 *
 * `EXPO_PUBLIC_*` ikut ter-inline ke dalam bundel JavaScript, jadi siapa pun
 * yang membongkar APK bisa membacanya. Itu tidak apa-apa untuk anon key —
 * memang dirancang publik dan tidak membawa hak apa pun tanpa token. Yang tidak
 * boleh masuk ke sini, dalam bentuk apa pun, adalah service_role key.
 */

function requireEnv(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `${name} belum diisi. Salin mobile/.env.example menjadi mobile/.env, ` +
        `lalu jalankan ulang Metro (variabel EXPO_PUBLIC_* dibaca saat bundling).`
    );
  }
  return value;
}

export const SUPABASE_URL = requireEnv(
  "EXPO_PUBLIC_SUPABASE_URL",
  process.env.EXPO_PUBLIC_SUPABASE_URL
);

export const SUPABASE_ANON_KEY = requireEnv(
  "EXPO_PUBLIC_SUPABASE_ANON_KEY",
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
);
