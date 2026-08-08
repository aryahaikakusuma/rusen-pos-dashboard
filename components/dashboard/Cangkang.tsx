"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";

import { logout } from "@/app/login/actions";
import { usePeriode } from "@/lib/use-periode";
import {
  LAINNYA,
  LAPORAN,
  MENU,
  judulHalaman,
  pakaiPeriode,
  type Tautan,
} from "./navigasi";

/**
 * Rangka halaman: sidebar tetap di kiri, topbar lengket di atas.
 *
 * Pemilih outlet dari mockup TIDAK ada di sini. Rusen satu outlet; kolom outlet
 * tetap ada di query dan nama outlet tetap tercetak di tiap berkas export, tapi
 * membangun pemilihnya berarti membangun untuk cabang kedua yang belum ada —
 * dan pemilih berisi satu pilihan hanya menimbulkan pertanyaan.
 *
 * Halaman Kasir & Kontrol Fraud juga tidak ada: kasir web sudah dihapus, dan
 * indikator fraud di mockup (diskon manual, selisih kas) tidak punya kolomnya
 * di skema sama sekali.
 */
export default function Cangkang({
  email,
  children,
}: {
  email: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [bukaMenu, setBukaMenu] = useState(false);
  const { periode } = usePeriode();

  const inisial = email.slice(0, 2).toUpperCase();

  /**
   * Periode ikut terbawa saat berpindah laporan lewat sidebar.
   *
   * Ini satu-satunya navigasi antar laporan sekarang — tab di area konten
   * dihapus karena keduanya terlihat kembar tapi hanya tab yang membawa
   * periode, jadi dua kontrol yang sama bentuknya diam-diam menghasilkan angka
   * berbeda. Yang dibawa adalah periode yang sudah diselesaikan `usePeriode`,
   * bukan query string mentah, supaya berpindah dari halaman tanpa rentang
   * (Kelola Produk, Histori) tetap mendarat pada rentang yang sama dengan yang
   * barusan terbaca, bukan pada bawaan yang kebetulan sama.
   */
  const tautanPeriode = (href: string) =>
    pakaiPeriode(href)
      ? `${href}?dari=${periode.dari}&sampai=${periode.sampai}`
      : href;

  return (
    <div className="bg-surface text-ink min-h-screen lg:grid lg:grid-cols-[260px_1fr]">
      <aside
        className={`border-line sticky top-0 z-50 flex h-screen flex-col overflow-y-auto border-r bg-white lg:z-auto ${
          bukaMenu ? "fixed inset-y-0 left-0 w-[260px]" : "hidden lg:flex"
        } no-print`}
      >
        <div className="flex items-center gap-2.5 px-5 pt-5 pb-4">
          <div className="from-brand to-brand-dark grid h-[34px] w-[34px] place-items-center rounded-[10px] bg-gradient-to-br font-extrabold text-white">
            R
          </div>
          <div>
            <p className="font-extrabold tracking-[-0.3px]">Rusen POS</p>
            <p className="text-ink-3 text-[11px] font-medium">Manager Console</p>
          </div>
        </div>

        <nav className="flex flex-col gap-0.5 px-3 pb-2">
          <Label>MENU UTAMA</Label>
          {MENU.map((tautan) => (
            <Item
              key={tautan.href}
              tautan={tautan}
              href={tautanPeriode(tautan.href)}
              aktif={pathname === tautan.href}
              onKlik={() => setBukaMenu(false)}
            />
          ))}

          <Label>LAPORAN PENJUALAN</Label>
          <div className="border-line ml-3 flex flex-col gap-0.5 border-l-2 pl-2.5">
            {LAPORAN.map((tautan) => (
              <Link
                key={tautan.href}
                href={tautanPeriode(tautan.href)}
                onClick={() => setBukaMenu(false)}
                className={`rounded-lg px-3 py-2 text-[13px] transition-colors ${
                  pathname === tautan.href
                    ? "bg-brand-soft text-brand-dark font-bold"
                    : "text-ink-2 hover:bg-surface font-medium"
                }`}
              >
                {tautan.label}
              </Link>
            ))}
          </div>

          <Label>LAINNYA</Label>
          {LAINNYA.map((tautan) => (
            <Item
              key={tautan.href}
              tautan={tautan}
              href={tautanPeriode(tautan.href)}
              aktif={pathname === tautan.href}
              onKlik={() => setBukaMenu(false)}
            />
          ))}
        </nav>

        <div className="border-line mt-auto border-t p-4">
          <p className="text-ink-3 truncate text-[11px] font-medium">{email}</p>
          <form action={logout}>
            <button
              type="submit"
              className="border-line text-ink-2 hover:border-brand hover:text-brand-dark mt-2 w-full cursor-pointer rounded-lg border px-3 py-2 text-[13px] font-semibold transition-colors"
            >
              Keluar
            </button>
          </form>
        </div>
      </aside>

      {bukaMenu ? (
        <button
          type="button"
          aria-label="Tutup menu"
          onClick={() => setBukaMenu(false)}
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
        />
      ) : null}

      <div className="min-w-0">
        <header className="border-line no-print sticky top-0 z-40 flex flex-wrap items-center gap-3.5 border-b bg-white px-5 py-3 lg:px-7">
          <button
            type="button"
            onClick={() => setBukaMenu(true)}
            aria-label="Buka menu"
            className="border-line text-ink-2 cursor-pointer rounded-lg border px-3 py-2 lg:hidden"
          >
            ☰
          </button>

          <h1 className="text-[19px] font-extrabold tracking-[-0.4px]">
            {judulHalaman(pathname)}
          </h1>

          <span className="flex-1" />

          {/* Pemilih rentang TIDAK di sini lagi. Ia pindah ke dalam kartu
              konten tiap halaman (`KontrolPeriode`), tepat di atas angka yang
              dipengaruhinya — di topbar ia terbaca berlaku untuk seluruh
              aplikasi, padahal dua halaman tidak mengenal periode sama sekali
              dan pemilihnya memang menghilang di sana.

              Cetak dan Unduh Excel ikut ke sana: keduanya mengeluarkan RENTANG
              yang sedang dipilih, jadi tempatnya di sebelah pemilih rentang
              itu, bukan di baris yang membentang ke seluruh aplikasi. */}
          <div className="bg-brand-soft text-brand-dark hidden h-9 w-9 place-items-center rounded-full text-xs font-bold sm:grid">
            {inisial}
          </div>
        </header>

        <main className="px-5 pt-6 pb-16 lg:px-7">{children}</main>
      </div>
    </div>
  );
}

function Label({ children }: { children: ReactNode }) {
  return (
    <p className="text-ink-3 px-2.5 pt-3.5 pb-1.5 text-[10px] font-bold tracking-[0.8px]">
      {children}
    </p>
  );
}

function Item({
  tautan,
  href,
  aktif,
  onKlik,
}: {
  tautan: Tautan;
  href: string;
  aktif: boolean;
  onKlik: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onKlik}
      className={`flex items-center gap-2.5 rounded-[10px] px-3 py-2.5 whitespace-nowrap transition-colors ${
        aktif
          ? "bg-brand-soft text-brand-dark font-semibold"
          : "text-ink-2 hover:bg-surface font-medium"
      }`}
    >
      <span className="w-5 flex-none" aria-hidden="true">
        {tautan.ikon}
      </span>
      {tautan.label}
    </Link>
  );
}
