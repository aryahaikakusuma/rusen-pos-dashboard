import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  signSessionToken,
  verifySessionToken,
  type Session,
} from "./session-token";

export type { Session };

export async function setSessionCookie(session: Session): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, await signSessionToken(session), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
}

export async function clearSessionCookie(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}

export async function getSession(): Promise<Session | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return token ? verifySessionToken(token) : null;
}

/**
 * Untuk dipakai di Server Component dan Server Action.
 *
 * `proxy.ts` sudah menyaring lebih dulu, tapi pengecekan di sini tetap wajib:
 * proxy hanya menjaga navigasi halaman, sedangkan Server Action bisa dipanggil
 * langsung tanpa pernah melewatinya.
 */
export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

/**
 * Versi untuk Route Handler: MENGEMBALIKAN `null`, tidak redirect.
 *
 * Route handler yang di-redirect ke /login akan membalas HTML halaman login
 * dengan status 200, dan `fetch` di browser membacanya sebagai keberhasilan lalu
 * gagal mem-parse JSON — pesan errornya menyesatkan. Yang benar 401, dan
 * pemanggilnya yang memutuskan mau mengarahkan ke mana.
 */
export async function apiSession(): Promise<Session | null> {
  return getSession();
}

/** Balasan seragam untuk route yang dipanggil tanpa sesi sah. */
export function unauthorized(): Response {
  return Response.json(
    { error: "Sesi tidak ditemukan atau sudah berakhir. Silakan masuk lagi." },
    { status: 401 }
  );
}
