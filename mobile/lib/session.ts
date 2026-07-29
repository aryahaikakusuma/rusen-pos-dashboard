import * as SecureStore from "expo-secure-store";

import type { Session } from "./types";

/**
 * Penyimpanan sesi.
 *
 * Memakai expo-secure-store, bukan AsyncStorage: token ini setara dengan cookie
 * sesi di web dan tidak boleh tergeletak sebagai teks biasa di penyimpanan
 * aplikasi.
 *
 * Selain disimpan ke disk, token juga ditahan di memori supaya klien Supabase
 * bisa mengambilnya tanpa membaca disk setiap kali ada request.
 */

const SESSION_KEY = "rusen_session";

let activeToken: string | null = null;

/** Dipanggil klien Supabase lewat opsi `accessToken`. */
export function getActiveToken(): string | null {
  return activeToken;
}

function isExpired(session: Session): boolean {
  return session.expiresAt <= Math.floor(Date.now() / 1000);
}

export async function saveSession(session: Session): Promise<void> {
  activeToken = session.token;
  await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(session));
}

export async function clearSession(): Promise<void> {
  activeToken = null;
  await SecureStore.deleteItemAsync(SESSION_KEY);
}

/**
 * Mengembalikan null untuk sesi yang tidak ada, kedaluwarsa, atau cacat —
 * ketiganya sama-sama berarti "harus login lagi". Sesi kedaluwarsa sekalian
 * dihapus supaya tidak dibaca berulang kali.
 */
export async function loadSession(): Promise<Session | null> {
  const raw = await SecureStore.getItemAsync(SESSION_KEY);
  if (!raw) return null;

  let session: Session;
  try {
    session = JSON.parse(raw) as Session;
  } catch {
    await clearSession();
    return null;
  }

  if (!session?.token || !session.employeeId || isExpired(session)) {
    await clearSession();
    return null;
  }

  activeToken = session.token;
  return session;
}
