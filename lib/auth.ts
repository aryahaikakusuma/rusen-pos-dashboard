import "server-only";

/**
 * Verifikasi email + password ke Supabase Auth.
 *
 * Dipanggil dengan `fetch` mentah, bukan lewat `supabase-js`, karena satu-satunya
 * klien Supabase di aplikasi ini memakai service_role (lihat
 * `lib/supabase/server.ts`) dan klien itu memasang header `Authorization:
 * Bearer <service_role>` pada setiap permintaan. Pada endpoint token, header itu
 * membuat GoTrue melihat permintaan yang membawa dua identitas sekaligus, dan
 * perilakunya bergantung versi. Permintaan mentah di bawah hanya membawa
 * `apikey`, persis seperti login dari browser, jadi jalurnya sama dengan yang
 * ditempuh Supabase Auth setiap hari.
 *
 * Password TIDAK PERNAH menyentuh basis data aplikasi ini. `employees.pin_hash`
 * tetap milik aplikasi kasir di HP dan tidak dipakai di sini.
 */

export interface AuthUser {
  id: string;
  email: string;
}

export async function verifyPassword(
  email: string,
  password: string
): Promise<AuthUser | null> {
  const url = requireEnv("SUPABASE_URL");
  const key = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

  let response: Response;
  try {
    response = await fetch(`${url}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: key, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
      cache: "no-store",
    });
  } catch (cause) {
    throw new Error("Tidak bisa menghubungi Supabase Auth.", { cause });
  }

  if (!response.ok) return null;

  const body = (await response.json()) as { user?: { id?: string; email?: string } };
  const user = body.user;
  if (!user?.id || !user.email) return null;

  return { id: user.id, email: user.email };
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Environment variable ${name} belum diisi. Salin .env.example ke .env.local.`
    );
  }
  return value;
}
