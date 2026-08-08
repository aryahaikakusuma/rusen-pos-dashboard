"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";

import type { Periode } from "./kontrak";
import { hariIniWib } from "./periode";

/**
 * Periode aktif tinggal di URL, bukan di state React.
 *
 * Mockup menyimpannya di objek `State` global, dan itu tidak bisa ditiru di
 * aplikasi bernavigasi: berpindah dari Penjualan Harian ke Laporan Produk akan
 * mengembalikan rentangnya ke bawaan, persis pada saat orang sedang
 * membandingkan dua halaman untuk bulan yang sama.
 *
 * Menaruhnya di query string menyelesaikan itu sekaligus tiga hal lain: tautan
 * bisa dikirim ke orang lain apa adanya, tombol kembali bekerja seperti yang
 * diharapkan, dan muat ulang halaman tidak menghapus pilihan.
 */

const POLA = /^\d{4}-\d{2}-\d{2}$/;

/** Awal bulan berjalan sampai hari ini — bawaan yang sama dengan mockup. */
export function periodeBawaan(): Periode {
  const hariIni = hariIniWib();
  return { dari: `${hariIni.slice(0, 8)}01`, sampai: hariIni };
}

export function usePeriode(): {
  periode: Periode;
  setPeriode: (periode: Periode) => void;
} {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const dari = params.get("dari");
  const sampai = params.get("sampai");

  const periode = useMemo<Periode>(() => {
    // Query string yang cacat diperlakukan sebagai tidak ada, bukan sebagai
    // kesalahan. Alamat ini gampang diketik tangan dan disalin setengah; jatuh
    // ke bawaan jauh lebih berguna daripada layar penuh pesan galat.
    if (dari && sampai && POLA.test(dari) && POLA.test(sampai) && dari <= sampai) {
      return { dari, sampai };
    }
    return periodeBawaan();
  }, [dari, sampai]);

  const setPeriode = useCallback(
    (baru: Periode) => {
      const berikut = new URLSearchParams(params);
      berikut.set("dari", baru.dari);
      berikut.set("sampai", baru.sampai);

      // Paginasi tabel di-reset: halaman 7 dari periode lama hampir pasti tidak
      // ada di periode baru, dan hasilnya tabel kosong tanpa sebab yang terlihat.
      berikut.delete("halaman");

      router.push(`${pathname}?${berikut.toString()}`);
    },
    [params, pathname, router]
  );

  return { periode, setPeriode };
}
