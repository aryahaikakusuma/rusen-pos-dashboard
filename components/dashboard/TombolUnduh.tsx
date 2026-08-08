"use client";

import { useState } from "react";

import { useToast } from "@/components/Toast";
import { Api } from "@/lib/api-klien";
import type { Periode } from "@/lib/kontrak";

/**
 * Tombol export xlsx.
 *
 * Prosesnya sinkron: tombol berubah jadi status memuat, berkas turun. Tidak ada
 * antrian dan tidak ada job latar — dengan volume data Rusen itu kompleksitas
 * yang tidak dibayar apa pun.
 *
 * Tombol dikunci selama permintaan berjalan. Menekan dua kali pada rentang
 * setahun berarti server menyusun dua workbook sekaligus, dan yang kedua tidak
 * berguna bagi siapa pun.
 */
export default function TombolUnduh({
  jenis,
  periode,
}: {
  jenis: "harian" | "detail" | "produk";
  periode: Periode;
}) {
  const [sedang, setSedang] = useState(false);
  const toast = useToast();

  async function unduh() {
    setSedang(true);
    try {
      await Api.unduh(jenis, periode);
      toast.success("Berkas Excel berhasil diunduh.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Gagal mengunduh berkas."
      );
    } finally {
      setSedang(false);
    }
  }

  return (
    <button
      type="button"
      onClick={unduh}
      disabled={sedang}
      className="bg-brand hover:bg-brand-dark flex cursor-pointer items-center gap-2 rounded-[10px] px-4 py-2.5 text-[13px] font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-60"
    >
      {sedang ? (
        <>
          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          Menyiapkan…
        </>
      ) : (
        <>⬇ Unduh Excel</>
      )}
    </button>
  );
}
