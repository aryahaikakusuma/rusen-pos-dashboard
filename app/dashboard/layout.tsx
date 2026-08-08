import { Suspense, type ReactNode } from "react";

import Cangkang from "@/components/dashboard/Cangkang";
import { requireSession } from "@/lib/session";

/**
 * `requireSession()` di sini menjaga navigasi halaman. Ia BUKAN yang menjaga
 * datanya — setiap route handler memeriksa sesinya sendiri lewat `jaga()`,
 * karena alamat API bisa dibuka langsung tanpa pernah melewati layout ini.
 *
 * `Suspense` wajib: rangka halaman membaca query string lewat `useSearchParams`
 * untuk mengetahui periode aktif, dan Next menuntut pembatas suspense di atas
 * setiap komponen yang melakukannya.
 */
export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const sesi = await requireSession();

  return (
    <Suspense fallback={<div className="bg-surface min-h-screen" />}>
      <Cangkang email={sesi.email}>{children}</Cangkang>
    </Suspense>
  );
}
