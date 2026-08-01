// Next.js 16: konvensi `middleware.ts` sudah deprecated dan berganti nama jadi
// `proxy.ts`, dengan fungsi bernama `proxy`. Runtime-nya nodejs dan tidak bisa
// diubah ke edge.
//
// Ini hanya penjaga navigasi halaman. Otorisasi sesungguhnya tetap dilakukan
// ulang di setiap Server Action lewat requireSession()/requireManager(), karena
// Server Action bisa dipanggil tanpa melewati proxy sama sekali.

import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session-token";

const PROTECTED = ["/history", "/dashboard"];
const MANAGER_ONLY = ["/dashboard"];

const matches = (pathname: string, roots: string[]) =>
  roots.some((root) => pathname === root || pathname.startsWith(`${root}/`));

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await verifySessionToken(token) : null;

  if (pathname === "/login") {
    return session
      ? NextResponse.redirect(new URL("/history", request.url))
      : NextResponse.next();
  }

  if (!matches(pathname, PROTECTED)) return NextResponse.next();

  if (!session) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (matches(pathname, MANAGER_ONLY) && session.role === "cashier") {
    return NextResponse.redirect(new URL("/history", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/login",
    "/history/:path*",
    "/dashboard/:path*",
  ],
};
