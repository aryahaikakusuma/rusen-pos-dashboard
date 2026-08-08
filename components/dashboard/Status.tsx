import type { ReactNode } from "react";

import { Kartu } from "./Kartu";

/**
 * Tiga keadaan yang harus selalu punya tampilannya sendiri: memuat, gagal, dan
 * kosong. Yang paling sering dilupakan adalah yang ketiga — tabel kosong tanpa
 * keterangan terbaca sebagai kerusakan, padahal artinya cuma hari itu toko
 * tutup.
 */

export function SedangMemuat({ tinggi = "h-64" }: { tinggi?: string }) {
  return (
    <Kartu className={`${tinggi} grid place-items-center`}>
      <div className="flex items-center gap-3">
        <span className="border-line border-t-brand h-5 w-5 animate-spin rounded-full border-2" />
        <span className="text-ink-3 text-sm">Memuat…</span>
      </div>
    </Kartu>
  );
}

export function Gagal({ pesan, coba }: { pesan: string; coba?: () => void }) {
  return (
    <Kartu className="border-danger/30 bg-danger-soft/40 p-6">
      <p className="text-danger text-sm font-semibold">Gagal memuat data</p>
      <p className="text-ink-2 mt-1 text-sm">{pesan}</p>
      {coba ? (
        <button
          type="button"
          onClick={coba}
          className="border-line text-ink-2 hover:border-brand hover:text-brand-dark mt-4 cursor-pointer rounded-lg border bg-white px-4 py-2 text-sm font-semibold"
        >
          Coba lagi
        </button>
      ) : null}
    </Kartu>
  );
}

export function Kosong({ children }: { children: ReactNode }) {
  return (
    <div className="text-ink-3 px-4 py-14 text-center text-sm">{children}</div>
  );
}
