"use server";

// Catatan Next.js 16: di file "use server", SETIAP export wajib berupa fungsi
// async.

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { verifyPassword } from "@/lib/auth";
import { db } from "@/lib/supabase/server";
import { clearSessionCookie, setSessionCookie } from "@/lib/session";

const MAX_FAILED_ATTEMPTS = 8;
const WINDOW_MS = 60_000;

// Pesan yang sama untuk email tidak dikenal maupun password salah — jangan
// sampai balasan error memberi tahu penebak bahwa suatu email terdaftar.
const GENERIC_ERROR = "Email atau password salah.";

export async function login(
  _previous: { error: string } | null,
  formData: FormData
): Promise<{ error: string }> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Email dan password wajib diisi." };
  }

  // Pembatasan laju tetap dipertahankan dari login PIN yang lama. Alamat web
  // bisa dihantam robot terus-menerus, dan Supabase Auth punya batasnya sendiri
  // tapi per proyek, bukan per alamat IP.
  const ip = await clientIp();
  const since = new Date(Date.now() - WINDOW_MS).toISOString();

  const { count } = await db
    .from("login_attempts")
    .select("id", { count: "exact", head: true })
    .eq("ip", ip)
    .gte("created_at", since);

  if ((count ?? 0) >= MAX_FAILED_ATTEMPTS) {
    return { error: "Terlalu banyak percobaan. Tunggu sebentar." };
  }

  const user = await verifyPassword(email, password);

  if (!user) {
    await db.from("login_attempts").insert({ ip });
    return { error: GENERIC_ERROR };
  }

  await db.from("login_attempts").delete().eq("ip", ip);
  await setSessionCookie({ userId: user.id, email: user.email });

  redirect("/dashboard");
}

export async function logout(): Promise<void> {
  await clearSessionCookie();
  redirect("/login");
}

async function clientIp(): Promise<string> {
  const headerList = await headers();
  const forwarded = headerList.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || headerList.get("x-real-ip") || "unknown";
}
