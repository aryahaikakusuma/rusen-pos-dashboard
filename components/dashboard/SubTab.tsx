"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import { LAPORAN } from "./navigasi";

/**
 * Tiga sub-halaman laporan.
 *
 * Periode dibawa serta saat berpindah tab. Tanpa itu, berpindah dari Penjualan
 * Harian ke Laporan Produk akan mengembalikan rentang ke bawaan — persis pada
 * saat orang sedang membandingkan dua halaman untuk bulan yang sama, yang
 * memang alasan utama ketiganya dipisah.
 */
export default function SubTab() {
  const pathname = usePathname();
  const params = useSearchParams();

  const rentang = new URLSearchParams();
  const dari = params.get("dari");
  const sampai = params.get("sampai");
  if (dari && sampai) {
    rentang.set("dari", dari);
    rentang.set("sampai", sampai);
  }
  const query = rentang.toString();

  return (
    <div className="border-line no-print mb-5 flex gap-1 overflow-x-auto rounded-xl border bg-white p-1">
      {LAPORAN.map((tautan) => {
        const aktif = pathname === tautan.href;
        return (
          <Link
            key={tautan.href}
            href={query ? `${tautan.href}?${query}` : tautan.href}
            className={`rounded-[9px] px-4 py-2.5 text-[13px] font-semibold whitespace-nowrap transition-colors ${
              aktif
                ? "bg-brand-soft text-brand-dark"
                : "text-ink-3 hover:bg-surface"
            }`}
          >
            <span aria-hidden="true">{tautan.ikon}</span> {tautan.label}
          </Link>
        );
      })}
    </div>
  );
}
