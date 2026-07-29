// Penandatanganan dan verifikasi token sesi.
//
// Sengaja TIDAK meng-import `next/headers` maupun `server-only`, supaya file ini
// bisa dipakai bersama oleh Server Action dan oleh `proxy.ts` (yang membaca
// cookie lewat `request.cookies`, bukan lewat `cookies()`).

import { SignJWT, jwtVerify } from "jose";
import type { EmployeeRole } from "./types";

export const SESSION_COOKIE = "rusen_session";

/** 12 jam — cukup untuk satu shift penuh, tapi tidak menginap. */
export const SESSION_MAX_AGE = 60 * 60 * 12;

export interface Session {
  employeeId: string;
  name: string;
  role: EmployeeRole;
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
  return new SignJWT({ name: session.name, role: session.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(session.employeeId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(secretKey());
}

/** Mengembalikan null untuk token apa pun yang tidak sah — kedaluwarsa, palsu, atau cacat. */
export async function verifySessionToken(token: string): Promise<Session | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey());
    if (!payload.sub || typeof payload.name !== "string" || typeof payload.role !== "string") {
      return null;
    }
    return {
      employeeId: payload.sub,
      name: payload.name,
      role: payload.role as EmployeeRole,
    };
  } catch {
    return null;
  }
}
