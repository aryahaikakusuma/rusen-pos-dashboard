"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import { logout } from "@/app/login/actions";
import { usePeriode } from "@/lib/use-periode";
import Ikon from "./Ikon";
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

  useEffect(() => {
    if (!bukaMenu) return;
    const tutup = (event: KeyboardEvent) => {
      if (event.key === "Escape") setBukaMenu(false);
    };
    window.addEventListener("keydown", tutup);
    return () => window.removeEventListener("keydown", tutup);
  }, [bukaMenu]);

  useEffect(() => {
    let tertutup: HTMLDetailsElement[] = [];
    let mencetak = false;
    const sebelum = () => {
      if (mencetak) return;
      mencetak = true;
      tertutup = Array.from(document.querySelectorAll<HTMLDetailsElement>("details:not([open])"));
      tertutup.forEach((d) => { d.open = true; });
    };
    const sesudah = () => { tertutup.forEach((d) => { d.open = false; }); tertutup = []; mencetak = false; };
    window.addEventListener("beforeprint", sebelum);
    window.addEventListener("afterprint", sesudah);
    return () => { window.removeEventListener("beforeprint", sebelum); window.removeEventListener("afterprint", sesudah); };
  }, []);

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
    <div className="dashboard-app bg-surface text-ink min-h-screen lg:grid lg:grid-cols-[260px_1fr]">
      <aside
        aria-label="Navigasi utama"
        className={`dashboard-sidebar top-0 z-50 flex h-screen flex-col overflow-y-auto bg-navigation text-white lg:sticky lg:z-auto ${
          bukaMenu ? "fixed inset-y-0 left-0 w-[260px]" : "hidden lg:flex"
        } no-print`}
      >
        <div className="flex items-center gap-2.5 px-5 pt-5 pb-4">
          <div className="grid h-9 w-9 place-items-center rounded-lg border border-white/40 font-semibold text-white">
            R
          </div>
          <div>
            <p className="text-base font-semibold">Rusen POS</p>
            <p className="text-navigation-muted text-xs">Rusen Kopitiam</p>
          </div>
          <button type="button" aria-label="Tutup navigasi" onClick={() => setBukaMenu(false)} className="ml-auto grid w-11 shrink-0 cursor-pointer place-items-center rounded-lg hover:bg-navigation-active lg:hidden"><Ikon nama="tutup" /></button>
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
          <div className="flex flex-col gap-0.5">
            {LAPORAN.map((tautan) => (
              <Link
                key={tautan.href}
                href={tautanPeriode(tautan.href)}
                onClick={() => setBukaMenu(false)}
                aria-current={pathname === tautan.href ? "page" : undefined}
                className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] transition-colors ${
                  pathname === tautan.href
                    ? "bg-navigation-active text-white font-semibold"
                    : "text-white hover:bg-navigation-active font-medium"
                }`}
              >
                <Ikon nama={tautan.ikon} className="shrink-0" />{tautan.label}
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

        <div className="mt-auto border-t border-white/20 p-4">
          <p className="text-navigation-muted truncate text-xs">{email}</p>
          <form action={logout}>
            <button
              type="submit"
              className="mt-2 w-full cursor-pointer rounded-lg border border-white/40 px-3 py-2 text-[13px] font-medium text-white transition-colors hover:bg-navigation-active"
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
        <header className="border-line no-print sticky top-0 z-40 flex items-center gap-3 border-b bg-white px-4 py-2 lg:px-7 lg:py-3">
          <button
            type="button"
            onClick={() => setBukaMenu(true)}
            aria-label="Buka menu"
            className="border-line text-ink-2 cursor-pointer rounded-lg border px-3 py-2 lg:hidden"
          >
            <Ikon nama="menu" />
          </button>

          <h1 className="min-w-0 text-base font-semibold sm:text-[19px]">
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

        <main className="min-w-0 px-3 pt-3 pb-10 sm:px-5 sm:pt-5 lg:px-7">{children}</main>
      </div>
    </div>
  );
}

function Label({ children }: { children: ReactNode }) {
  return (
    <p className="text-navigation-muted px-3 pt-5 pb-2 text-[11px] font-medium">
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
      aria-current={aktif ? "page" : undefined}
      className={`flex items-center gap-2.5 rounded-[10px] px-3 py-2.5 whitespace-nowrap transition-colors ${
        aktif
          ? "bg-navigation-active text-white font-semibold"
          : "text-white hover:bg-navigation-active font-medium"
      }`}
    >
      <Ikon nama={tautan.ikon} className="shrink-0" />
      {tautan.label}
    </Link>
  );
}
