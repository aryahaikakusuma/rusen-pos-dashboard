// Next.js 16: konvensi `middleware.ts` sudah deprecated dan berganti nama jadi
// `proxy.ts`, dengan fungsi bernama `proxy`. Runtime-nya nodejs dan tidak bisa
// diubah ke edge.
//
// Ini hanya penjaga navigasi halaman. Otorisasi sesungguhnya tetap dilakukan
// ulang di setiap Server Action lewat requireSession() dan di setiap Route
// Handler lewat apiSession(), karena keduanya bisa dipanggil tanpa melewati
// proxy sama sekali. Kalau baris di file ini dihapus, tidak ada satu pun data
// yang bocor; kalau pengecekan di route yang dihapus, seluruh data penjualan
// terbuka. Yang di sini kenyamanan, yang di sana keamanan.

import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session-token";

const PROTECTED = ["/history", "/dashboard", "/api"];

const matches = (pathname: string, roots: string[]) =>
  roots.some((root) => pathname === root || pathname.startsWith(`${root}/`));

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await verifySessionToken(token) : null;

  if (pathname === "/login") {
    return session
      ? NextResponse.redirect(new URL("/dashboard", request.url))
      : NextResponse.next();
  }

  if (!matches(pathname, PROTECTED)) return NextResponse.next();

  if (!session) {
    // Permintaan data dibalas 401, bukan diarahkan ke halaman login: pengarahan
    // membuat `fetch` menerima HTML berstatus 200 dan gagal mem-parse JSON
    // dengan pesan yang tidak ada hubungannya dengan sebab sebenarnya.
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Belum masuk." }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/login", "/history/:path*", "/dashboard/:path*", "/api/:path*"],
};
