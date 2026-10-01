"use client";

import TombolUnduh from "./TombolUnduh";
import Ikon from "./Ikon";
import type { Periode } from "@/lib/kontrak";

/**
 * Cetak / PDF dan Unduh Excel — sepasang, di ujung kanan baris kontrol periode.
 *
 * DULU KEDUANYA DUDUK DI DALAM HALAMAN, dan tempatnya berbeda-beda: di
 * Penjualan per Periode ia satu baris sendiri, di Laporan Produk ia menempel di
 * ujung baris pencarian, di Detail Penjualan ia sendirian dengan sebuah pengisi
 * kosong di sebelah kiri hanya untuk mendorongnya ke kanan. Tiga tata letak
 * untuk dua tombol yang sama, dan posisinya bergeser setiap kali kontrol di
 * baris itu bertambah.
 *
 * Di baris kontrol periode keduanya berada di tempat yang sama pada ketiga
 * laporan, tepat di sebelah pemilih rentang yang menentukan isi berkasnya —
 * nama berkas XLSX-nya memuat tanggal rentang itu. Pindahnya juga mengembalikan
 * satu baris penuh ruang di atas kartu KPI.
 *
 * Baris kontrol periode bertanda `no-print`, jadi tombol Cetak tidak ikut
 * tercetak.
 */
export default function AksiLaporan({
  jenis,
  periode,
}: {
  jenis: "harian" | "detail" | "produk";
  periode: Periode;
}) {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => window.print()}
        title="Cetak halaman ini atau simpan sebagai PDF"
        aria-label="Cetak atau simpan PDF"
        className="border-line text-ink-2 hover:border-brand hover:text-brand-dark flex cursor-pointer items-center rounded-lg border bg-white px-3 py-2 text-[13px] font-medium transition-colors sm:px-4 sm:py-2.5"
      >
        <Ikon nama="cetak" />
        <span className="ml-1.5 hidden sm:inline">Cetak / PDF</span>
      </button>
      <TombolUnduh jenis={jenis} periode={periode} />
    </div>
  );
}
