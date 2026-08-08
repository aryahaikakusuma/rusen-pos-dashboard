import type { ReactNode } from "react";

import { persen } from "@/lib/format";

/** Permukaan dasar seluruh dashboard: putih, garis tipis, bayangan sangat halus. */
export function Kartu({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`border-line rounded-2xl border bg-white shadow-[0_1px_2px_rgba(16,24,40,.04),0_8px_24px_rgba(16,24,40,.06)] ${className}`}
    >
      {children}
    </div>
  );
}

export function KepalaKartu({
  judul,
  sub,
  aksi,
}: {
  judul: string;
  sub?: ReactNode;
  aksi?: ReactNode;
}) {
  return (
    <div className="border-line flex items-center justify-between gap-3 border-b px-5 py-4">
      <div className="min-w-0">
        <h3 className="text-ink truncate text-[15px] font-bold">{judul}</h3>
        {sub ? <p className="text-ink-3 mt-0.5 text-xs">{sub}</p> : null}
      </div>
      {aksi}
    </div>
  );
}

export function IsiKartu({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`p-5 ${className}`}>{children}</div>;
}

/**
 * Kartu angka besar.
 *
 * `delta` hanya muncul kalau ada pembandingnya. Nilai `null` berarti periode
 * sebelumnya nol, dan itu ditampilkan sebagai ketiadaan tanda — bukan sebagai
 * "+100%", yang terbaca sebagai kenaikan nyata padahal artinya "dari nol".
 */
export function Kpi({
  label,
  nilai,
  kaki,
  delta: perubahan,
  kecil = false,
}: {
  label: string;
  nilai: string;
  kaki?: string;
  delta?: number | null;
  kecil?: boolean;
}) {
  return (
    <Kartu className="px-[18px] py-4">
      <div className="text-ink-3 flex flex-wrap items-center gap-1.5 text-xs font-medium">
        <span>{label}</span>
        {perubahan !== undefined && perubahan !== null ? (
          <span
            className={`rounded-full px-1.5 py-0.5 text-[11px] font-bold ${
              perubahan >= 0
                ? "bg-good-soft text-good"
                : "bg-danger-soft text-danger"
            }`}
          >
            {perubahan >= 0 ? "▲" : "▼"} {persen(Math.abs(perubahan))}
          </span>
        ) : null}
      </div>
      <p
        className={`text-ink mt-1.5 mb-1 font-extrabold tracking-[-0.7px] ${
          kecil ? "text-base leading-snug" : "text-[23px]"
        }`}
      >
        {nilai}
      </p>
      {kaki ? <p className="text-ink-3 text-[11px]">{kaki}</p> : null}
    </Kartu>
  );
}

export function BarisKpi({ children }: { children: ReactNode }) {
  return (
    <div className="mb-4 grid grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-4">
      {children}
    </div>
  );
}
