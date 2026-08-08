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

/**
 * Penanda "angka di layar belum sesuai label periode".
 *
 * `useData` sengaja menahan data LAMA selama permintaan baru berjalan, dan
 * alasannya benar: mengosongkannya membuat seluruh halaman berkedip jadi pemuat
 * setiap kali rentang digeser satu hari. Tapi tanpa penanda, akibatnya adalah
 * layar yang utuh dan keliru — label periode sudah berganti sementara tiap
 * angka di bawahnya masih milik periode sebelumnya, tanpa apa pun yang
 * memberitahu.
 *
 * Jadi selama penyegaran, area angka diredupkan DAN dikunci dari interaksi.
 * Meredupkan saja tidak cukup: angka yang sudah diketahui usang tidak boleh
 * bisa diklik, disalin lewat paginasi, atau diekspor seolah-olah masih berlaku.
 *
 * Peredupan tidak ikut tercetak — lembar cetak selalu berisi data yang sudah
 * tiba, karena dialog cetak baru terbuka setelah render.
 */
export function AreaData({
  menyegarkan,
  children,
}: {
  menyegarkan: boolean;
  children: ReactNode;
}) {
  return (
    <div className="relative" aria-busy={menyegarkan}>
      {menyegarkan ? (
        <div className="no-print pointer-events-none sticky top-[76px] z-30 flex justify-center">
          <span className="border-line text-ink-2 flex items-center gap-2 rounded-full border bg-white px-3.5 py-1.5 text-xs font-semibold shadow-[0_2px_8px_rgba(16,24,40,.12)]">
            <span className="border-line border-t-brand h-3.5 w-3.5 animate-spin rounded-full border-2" />
            Memperbarui angka ke periode baru…
          </span>
        </div>
      ) : null}
      <div
        className={
          menyegarkan
            ? "pointer-events-none opacity-40 transition-opacity print:opacity-100"
            : "transition-opacity"
        }
      >
        {children}
      </div>
    </div>
  );
}

export function Kosong({ children }: { children: ReactNode }) {
  return (
    <div className="text-ink-3 px-4 py-14 text-center text-sm">{children}</div>
  );
}
