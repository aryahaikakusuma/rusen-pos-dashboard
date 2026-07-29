// Login PIN untuk aplikasi mobile.
//
// Aplikasi React Native tidak punya sisi server, jadi logika yang di web tinggal
// di Server Action (`app/login/actions.ts`) dipindahkan ke sini. Keputusan
// keamanannya sengaja disalin apa adanya — pesan error generik, rate limit per
// IP, dan bcrypt yang tidak pernah keluar dari server.
//
// Yang dikembalikan adalah JWT yang ditandatangani dengan JWT secret proyek
// Supabase, sehingga PostgREST memverifikasinya sendiri dan policy RLS bisa
// membaca `auth.uid()`. Aplikasi mobile TIDAK PERNAH memegang service_role key.

import { createClient } from "npm:@supabase/supabase-js@2";
import bcrypt from "npm:bcryptjs@3";
import { SignJWT } from "npm:jose@6";

/** Sama dengan PIN_LENGTH di lib/types.ts. */
const PIN_LENGTH = 6;

/** Sama dengan SESSION_MAX_AGE di lib/session-token.ts — satu shift penuh. */
const SESSION_MAX_AGE = 60 * 60 * 12;

const MAX_FAILED_ATTEMPTS = 5;
const WINDOW_MS = 60_000;

// Pesan yang sama untuk PIN salah maupun pegawai nonaktif — jangan sampai
// balasan error memberi tahu penebak bahwa suatu PIN "hampir benar".
const GENERIC_ERROR = "PIN tidak dikenali. Coba lagi.";
const RATE_LIMIT_ERROR = "Terlalu banyak percobaan. Tunggu sebentar.";

type EmployeeRole = "cashier" | "manager" | "owner";

const db = createClient(
  requireEnv("SUPABASE_URL"),
  requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { persistSession: false, autoRefreshToken: false } }
);

function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Environment variable ${name} belum diisi.`);
  return value;
}

function fail(error: string, status = 401): Response {
  return Response.json({ error }, { status });
}

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return fail("Method tidak diizinkan.", 405);
  }

  let pin = "";
  try {
    const body = await request.json();
    pin = typeof body?.pin === "string" ? body.pin : "";
  } catch {
    return fail(GENERIC_ERROR);
  }

  if (!new RegExp(`^\\d{${PIN_LENGTH}}$`).test(pin)) {
    return fail(GENERIC_ERROR);
  }

  const ip = clientIp(request);
  const since = new Date(Date.now() - WINDOW_MS).toISOString();

  const { count } = await db
    .from("login_attempts")
    .select("id", { count: "exact", head: true })
    .eq("ip", ip)
    .gte("created_at", since);

  if ((count ?? 0) >= MAX_FAILED_ATTEMPTS) {
    return fail(RATE_LIMIT_ERROR, 429);
  }

  // PIN adalah satu-satunya identitas — tidak ada nama pengguna — jadi PIN harus
  // dicocokkan ke setiap pegawai aktif. Dengan segelintir pegawai ini murah.
  const { data: employees } = await db
    .from("employees")
    .select("id, name, role, outlet_id, pin_hash")
    .eq("active", true);

  let matched:
    | { id: string; name: string; role: EmployeeRole; outlet_id: string }
    | null = null;

  for (const employee of employees ?? []) {
    if (await bcrypt.compare(pin, employee.pin_hash)) {
      matched = {
        id: employee.id,
        name: employee.name,
        role: employee.role,
        outlet_id: employee.outlet_id,
      };
      break;
    }
  }

  if (!matched) {
    await db.from("login_attempts").insert({ ip });
    return fail(GENERIC_ERROR);
  }

  await db.from("login_attempts").delete().eq("ip", ip);

  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_MAX_AGE;
  const secret = new TextEncoder().encode(requireEnv("SESSION_JWT_SECRET"));

  // `role: "authenticated"` wajib — PostgREST memakainya untuk SET ROLE.
  // `sub` menjadi auth.uid() di dalam policy RLS.
  const token = await new SignJWT({
    role: "authenticated",
    app_metadata: {
      employee_role: matched.role,
      outlet_id: matched.outlet_id,
    },
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(matched.id)
    .setAudience("authenticated")
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .sign(secret);

  // pin_hash tidak pernah ikut keluar dari fungsi ini.
  return Response.json({
    token,
    expiresAt,
    employee: { id: matched.id, name: matched.name, role: matched.role },
  });
});

function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  return (
    forwarded?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}
