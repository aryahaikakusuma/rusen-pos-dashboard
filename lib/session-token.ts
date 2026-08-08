// Penandatanganan dan verifikasi token sesi dashboard.
//
// Sengaja TIDAK meng-import `next/headers` maupun `server-only`, supaya file ini
// bisa dipakai bersama oleh Server Action dan oleh `proxy.ts` (yang membaca
// cookie lewat `request.cookies`, bukan lewat `cookies()`).
//
// KENAPA COOKIE SENDIRI, PADAHAL LOGIN LEWAT SUPABASE AUTH
//
// Yang memverifikasi email + password adalah Supabase Auth (lihat
// `lib/auth.ts`) — itu yang menyimpan hash password dan yang menahan tebakan.
// Yang disimpan di browser setelah itu adalah token pendek buatan sendiri,
// bukan access/refresh token Supabase, karena:
//
//   1. Access token Supabase berumur satu jam dan harus di-refresh. Menyimpannya
//      di cookie berarti membangun daur ulang token di setiap permintaan; salah
//      sedikit, sesi putus di tengah pekerjaan tanpa pesan yang bisa dimengerti.
//   2. Token ini tidak pernah dipakai untuk berbicara ke Supabase. Seluruh
//      query jalan lewat service_role di server (`lib/supabase/server.ts`),
//      jadi token di browser tidak perlu punya wewenang apa pun — ia hanya
//      menjawab "sesi ini sudah login atau belum".
//
// Konsekuensi yang diterima sadar: menghapus user di Supabase Auth tidak
// langsung memutus sesi yang sedang berjalan; sesi itu mati paling lama 12 jam
// kemudian. Untuk satu akun owner, itu pertukaran yang wajar.

import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "rusen_session";

/** 12 jam — cukup untuk satu hari kerja, tapi tidak menginap. */
export const SESSION_MAX_AGE = 60 * 60 * 12;

export interface Session {
  /** `auth.users.id` di Supabase. */
  userId: string;
  email: string;
}

function secretKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "SESSION_SECRET belum diisi atau kurang dari 32 karakter. Lihat .env.example."
    );
  }
  return new TextEncoder().encode(secret);
}

export async function signSessionToken(session: Session): Promise<string> {
  return new SignJWT({ email: session.email })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(session.userId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(secretKey());
}

/** Mengembalikan null untuk token apa pun yang tidak sah — kedaluwarsa, palsu, atau cacat. */
export async function verifySessionToken(token: string): Promise<Session | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey());
    if (!payload.sub || typeof payload.email !== "string") return null;
    return { userId: payload.sub, email: payload.email };
  } catch {
    return null;
  }
}
