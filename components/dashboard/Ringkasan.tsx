import type { ReactNode } from "react";

import { angka, delta, persen, rupiah } from "@/lib/format";
import type { TotalHarian } from "@/lib/ringkas";

/** One comparison surface, rather than six equally prominent cards. */
export function Pendapatan({ total, sebelumnya }: { total: TotalHarian; sebelumnya?: TotalHarian }) {
  const nilai = [
    { label: "Pendapatan tanpa PBJT", jumlah: total.omzet_bersih, lalu: sebelumnya?.omzet_bersih },
    { label: "Penerimaan termasuk PBJT", jumlah: total.tertagih_bersih, lalu: sebelumnya?.tertagih_bersih },
  ];
  return (
    <section aria-label="Pendapatan setelah refund" className="pendapatan border-line mb-4 rounded-xl border bg-white">
      <div className="grid divide-y divide-line sm:grid-cols-2 sm:divide-x sm:divide-y-0">
        {nilai.map((v) => {
          const perubahan = v.lalu === undefined || v.lalu <= 0 ? null : delta(v.jumlah, v.lalu);
          return (
            <div key={v.label} className="min-w-0 px-4 py-3 sm:px-5 sm:py-5">
              <p className="text-ink-2 text-xs font-medium">{v.label}</p>
              <p className="pendapatan-angka mt-1 font-bold tabular-nums">{rupiah(v.jumlah)}</p>
              {perubahan !== null ? (
                <p className="text-ink-2 mt-1 text-xs">
                  {perubahan >= 0 ? "Naik" : "Turun"} {persen(Math.abs(perubahan))} dari periode sebelumnya
                </p>
              ) : null}
            </div>
          );
        })}
      </div>
      <div className="border-line flex flex-wrap gap-x-4 gap-y-1 border-t px-4 py-2.5 text-xs text-ink-2 sm:px-5">
        <span>Setelah refund pada periode ini</span>
        <span>{angka(total.jumlah_order)} transaksi</span>
        <span>Refund {rupiah(total.total_refund)}</span>
      </div>
    </section>
  );
}

export function Fakta({ children }: { children: ReactNode }) {
  return <dl className="fakta grid grid-cols-2 gap-x-4 gap-y-3 text-sm">{children}</dl>;
}

export function Nilai({ label, children }: { label: string; children: ReactNode }) {
  return <div className="min-w-0"><dt className="text-ink-2 text-xs">{label}</dt><dd className="mt-1 break-words font-semibold tabular-nums">{children}</dd></div>;
}

export function Rincian({ judul, children, className = "", polos = false }: { judul: string; children: ReactNode; className?: string; polos?: boolean }) {
  return (
    <details className={`rincian border-line mb-4 ${polos ? "border-b" : "rounded-xl border bg-white"} ${className}`}>
      <summary className="text-ink flex min-h-12 cursor-pointer items-center justify-between gap-3 px-4 py-3 text-sm font-semibold">
        {judul}<span className="rincian-panah text-ink-2" aria-hidden="true">⌄</span>
      </summary>
      <div className="border-line border-t p-4">{children}</div>
    </details>
  );
}

/** Narrow-width counterpart to a table. Uses the same fetched rows. */
export function DaftarMobile({ children }: { children: ReactNode }) {
  return <div className="daftar-mobile divide-line divide-y md:hidden">{children}</div>;
}

export function BarisMobile({ judul, sub, nilai, children }: { judul: ReactNode; sub?: ReactNode; nilai: ReactNode; children: ReactNode }) {
  return (
    <details className="rincian baris-mobile px-4">
      <summary className="flex min-h-16 cursor-pointer flex-wrap items-center justify-between gap-x-3 gap-y-1 py-3 text-sm">
        <span className="min-w-0 flex-1 basis-[45%]"><span className="block break-words font-semibold">{judul}</span>{sub ? <span className="text-ink-2 mt-1 block text-xs">{sub}</span> : null}</span>
        <span className="max-w-full text-right font-semibold tabular-nums">{nilai}<span aria-hidden="true" className="rincian-panah ml-2 inline-block text-ink-2">⌄</span></span>
      </summary>
      <div className="border-line border-t py-3">{children}</div>
    </details>
  );
}
