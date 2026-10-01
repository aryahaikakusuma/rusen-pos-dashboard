import type { SVGProps } from "react";

export type NamaIkon = "grafik" | "produk" | "kalender" | "struk" | "kas" | "histori" | "menu" | "tutup" | "cetak" | "unduh";

const garis: Record<NamaIkon, string> = {
  grafik: "M4 4v16h16M8 16v-5m5 5V7m5 9v-3",
  produk: "m12 3 9 5-9 5-9-5 9-5Zm-9 5v9l9 5 9-5V8M12 13v9M7.5 5.5l9 5",
  kalender: "M8 3v4m8-4v4M4 10h16M5 5h14a1 1 0 0 1 1 1v14H4V6a1 1 0 0 1 1-1Z",
  struk: "M6 3h12v18l-3-2-3 2-3-2-3 2V3Zm3 5h6m-6 4h6m-6 4h3",
  kas: "M3 6h18v12H3V6Zm0 4h3m12 4h3M14 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z",
  histori: "M3 11a9 9 0 1 1 2.7 7M3 4v7h7m2-4v5l3 2",
  menu: "M4 6h16M4 12h16M4 18h16",
  tutup: "m6 6 12 12M6 18 18 6",
  cetak: "M7 8V3h10v5M7 16H4V9h16v7h-3M7 13h10v8H7v-8Z",
  unduh: "M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5",
};

export default function Ikon({ nama, ...props }: SVGProps<SVGSVGElement> & { nama: NamaIkon }) {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}><path d={garis[nama]} /></svg>;
}
