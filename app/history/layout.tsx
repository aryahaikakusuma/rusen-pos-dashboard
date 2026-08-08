import { Suspense, type ReactNode } from "react";

import Cangkang from "@/components/dashboard/Cangkang";
import { requireSession } from "@/lib/session";

/**
 * Histori Transaksi memakai rangka yang sama dengan dashboard.
 *
 * Halaman ini lebih tua dari dashboard dan tidak termasuk struktur navigasi
 * yang diminta, tapi ia satu-satunya tempat rincian ITEM per order bisa
 * dilihat — Detail Penjualan sengaja berhenti di tingkat order (satu order
 * punya banyak item, dan mencampur dua grain membuat setiap penjumlahan jadi
 * ganda). Jadi ia dipertahankan, bukan diganti.
 */
export default async function HistoryLayout({
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
