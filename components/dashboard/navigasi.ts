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

export interface Tautan {
  href: string;
  label: string;
  ikon: string;
}

export const MENU: Tautan[] = [
  { href: "/dashboard", label: "Dashboard Penjualan", ikon: "📊" },
  { href: "/dashboard/produk", label: "Kelola Produk", ikon: "📦" },
];

export const LAPORAN: Tautan[] = [
  { href: "/dashboard/laporan/harian", label: "Penjualan Harian", ikon: "📅" },
  { href: "/dashboard/laporan/detail", label: "Detail Penjualan", ikon: "🧾" },
  { href: "/dashboard/laporan/produk", label: "Laporan Produk", ikon: "📦" },
];

export const LAINNYA: Tautan[] = [
  { href: "/history", label: "Histori Transaksi", ikon: "🕘" },
];

const JUDUL: Record<string, string> = {
  "/dashboard": "Dashboard Penjualan",
  "/dashboard/produk": "Kelola Produk",
  "/dashboard/laporan/harian": "Laporan Penjualan Harian",
  "/dashboard/laporan/detail": "Detail Penjualan",
  "/dashboard/laporan/produk": "Laporan Produk",
  "/history": "Histori Transaksi",
};

export function judulHalaman(pathname: string): string {
  return JUDUL[pathname] ?? "Rusen POS";
}

/** Halaman yang tidak punya rentang tanggal tidak perlu pemilihnya di topbar. */
export function pakaiPeriode(pathname: string): boolean {
  return pathname !== "/dashboard/produk" && pathname !== "/history";
}
