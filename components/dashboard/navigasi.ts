/**
 * Peta navigasi — satu sumber untuk sidebar, judul di topbar, dan sub-tab.
 *
 * Judul halaman ikut di sini, bukan ditulis ulang di tiap halaman: judul di
 * topbar dan label di sidebar yang berbeda satu kata membuat orang mengira
 * mereka berada di halaman lain.
 *
 * Tiap sub-halaman laporan memetakan satu-ke-satu ke satu fungsi Postgres di
 * `0027`. Tidak digabungkan dan tidak dipecah — kalau suatu saat ada yang
 * merasa dua di antaranya "mirip", yang perlu dibaca lebih dulu adalah alasan
 * grain-nya berbeda di kepala migrasi itu.
 */

import type { NamaIkon } from "./Ikon";

export interface Tautan {
  href: string;
  label: string;
  ikon: NamaIkon;
}

export const MENU: Tautan[] = [
  { href: "/dashboard", label: "Dashboard Penjualan", ikon: "grafik" },
  { href: "/dashboard/produk", label: "Kelola Produk", ikon: "produk" },
];

export const LAPORAN: Tautan[] = [
  {
    href: "/dashboard/laporan/harian",
    label: "Penjualan per Periode",
    ikon: "kalender",
  },
  { href: "/dashboard/laporan/detail", label: "Detail Penjualan", ikon: "struk" },
  { href: "/dashboard/laporan/produk", label: "Laporan Produk", ikon: "produk" },
  { href: "/dashboard/laporan/kas-shift", label: "Kas per Shift", ikon: "kas" },
];

export const LAINNYA: Tautan[] = [
  { href: "/history", label: "Histori Transaksi", ikon: "histori" },
];

const JUDUL: Record<string, string> = {
  "/dashboard": "Dashboard Penjualan",
  "/dashboard/produk": "Kelola Produk",
  "/dashboard/laporan/harian": "Penjualan per Periode",
  "/dashboard/laporan/detail": "Detail Penjualan",
  "/dashboard/laporan/produk": "Laporan Produk",
  "/dashboard/laporan/kas-shift": "Kas per Shift",
  "/history": "Histori Transaksi",
};

export function judulHalaman(pathname: string): string {
  return JUDUL[pathname] ?? "Rusen POS";
}

/** Halaman yang tidak punya rentang tanggal tidak perlu pemilihnya di topbar. */
export function pakaiPeriode(pathname: string): boolean {
  return pathname !== "/dashboard/produk" && pathname !== "/history";
}

/**
 * Jenis berkas export milik sebuah halaman, atau `null` kalau halaman itu tidak
 * punya lembar untuk dicetak maupun diunduh.
 *
 * Peta ini yang menentukan munculnya tombol Cetak dan Unduh Excel di topbar,
 * dan namanya sengaja SAMA dengan segmen route `/api/export/[jenis]` — kalau
 * suatu saat ada laporan keempat, satu baris di sini adalah seluruh perubahan
 * yang dibutuhkan di sisi rangka halaman.
 *
 * Nilainya diambil dari path, bukan dari prop yang dioper tiap halaman: topbar
 * dirender oleh layout, jauh di atas halaman, jadi menurunkannya lewat prop
 * berarti setiap halaman baru bisa lupa mengirimnya dan tombolnya hilang tanpa
 * error apa pun.
 */
export function jenisExport(
  pathname: string
): "harian" | "detail" | "produk" | null {
  if (pathname === "/dashboard/laporan/harian") return "harian";
  if (pathname === "/dashboard/laporan/detail") return "detail";
  if (pathname === "/dashboard/laporan/produk") return "produk";
  return null;
}
