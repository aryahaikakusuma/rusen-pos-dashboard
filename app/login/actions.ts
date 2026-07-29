"use server";

// Catatan Next.js 16: di file "use server", SETIAP export wajib berupa fungsi
// async. Konstanta seperti PIN_LENGTH karena itu tinggal di lib/types.ts.

import bcrypt from "bcryptjs";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { db } from "@/lib/supabase/server";
import { clearSessionCookie, setSessionCookie } from "@/lib/session";
import { PIN_LENGTH, type EmployeeRole } from "@/lib/types";

const MAX_FAILED_ATTEMPTS = 5;
const WINDOW_MS = 60_000;

// Pesan yang sama untuk PIN salah maupun pegawai nonaktif — jangan sampai
// balasan error memberi tahu penebak bahwa suatu PIN "hampir benar".
const GENERIC_ERROR = "PIN tidak dikenali. Coba lagi.";

export async function login(pin: string): Promise<{ error: string }> {
  if (!new RegExp(`^\\d{${PIN_LENGTH}}$`).test(pin)) {
    return { error: GENERIC_ERROR };
  }

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

  // PIN adalah satu-satunya identitas — tidak ada nama pengguna — jadi PIN harus
  // dicocokkan ke setiap pegawai aktif. Dengan segelintir pegawai ini murah.
  const { data: employees } = await db
    .from("employees")
    .select("id, name, role, pin_hash")
    .eq("active", true);

  let matched: { id: string; name: string; role: EmployeeRole } | null = null;
  for (const employee of employees ?? []) {
    if (await bcrypt.compare(pin, employee.pin_hash)) {
      matched = { id: employee.id, name: employee.name, role: employee.role };
      break;
    }
  }

  if (!matched) {
    await db.from("login_attempts").insert({ ip });
    return { error: GENERIC_ERROR };
  }

  await db.from("login_attempts").delete().eq("ip", ip);
  await setSessionCookie({
    employeeId: matched.id,
    name: matched.name,
    role: matched.role,
  });

  redirect("/cashier");
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
