"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";

import type { Periode } from "./kontrak";
import { GRANULARITAS, hariIniWib, type Granularitas } from "./periode";

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

/**
 * `bawaan` menimpa rentang default saat query string kosong — dipakai Kas per
 * Shift, yang bawaannya "7 hari terakhir" alih-alih awal bulan berjalan. Tidak
 * mengubah pemanggil yang sudah ada: parameter opsional, dan tanpanya
 * perilakunya identik dengan sebelumnya.
 */
export function usePeriode(bawaan: () => Periode = periodeBawaan): {
  periode: Periode;
  /**
   * Granularitas tombol yang barusan ditekan, atau `null` kalau rentang saat
   * ini berasal dari kalender/preset bebas, atau dari tautan yang dibagikan
   * tanpa `g`. Dibaca dari query string, bukan dari bentuk rentang — lihat
   * catatan panjang di `granularitas()` di `lib/periode.ts` untuk alasannya:
   * rentang saja tidak selalu cukup untuk membedakan "Harian" dari "Mingguan"
   * pada hari Minggu.
   */
  hintGranularitas: Granularitas | null;
  setPeriode: (periode: Periode, granularitas?: Granularitas | null) => void;
} {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const dari = params.get("dari");
  const sampai = params.get("sampai");
  const g = params.get("g");

  const periode = useMemo<Periode>(() => {
    // Query string yang cacat diperlakukan sebagai tidak ada, bukan sebagai
    // kesalahan. Alamat ini gampang diketik tangan dan disalin setengah; jatuh
    // ke bawaan jauh lebih berguna daripada layar penuh pesan galat.
    if (dari && sampai && POLA.test(dari) && POLA.test(sampai) && dari <= sampai) {
      return { dari, sampai };
    }
    return bawaan();
    // `bawaan` sengaja tidak masuk daftar dependensi: pemanggil yang tidak
    // memoisasinya (fungsi baru tiap render) tidak boleh membuat efek ini
    // berjalan ulang — nilai yang dihasilkan `bawaan()` deterministik untuk
    // hari yang sama, jadi mengabaikannya di sini aman.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dari, sampai]);

  const hintGranularitas = useMemo<Granularitas | null>(() => {
    const ditemukan = GRANULARITAS.find((x) => x.id === g);
    return ditemukan ? ditemukan.id : null;
  }, [g]);

  const setPeriode = useCallback(
    (baru: Periode, granularitas?: Granularitas | null) => {
      const berikut = new URLSearchParams(params);
      berikut.set("dari", baru.dari);
      berikut.set("sampai", baru.sampai);

      // Paginasi tabel di-reset: halaman 7 dari periode lama hampir pasti tidak
      // ada di periode baru, dan hasilnya tabel kosong tanpa sebab yang terlihat.
      berikut.delete("halaman");

      // Pemanggil yang tidak menyebut granularitas (kalender, preset bebas)
      // menghapus `g` lama secara diam-diam — kalau tidak, memilih 3–17
      // Agustus lewat kalender setelah menekan "Bulanan" akan membawa hint
      // "bulanan" yang sudah tidak berlaku ke rentang bebas berikutnya.
      if (granularitas) berikut.set("g", granularitas);
      else berikut.delete("g");

      router.push(`${pathname}?${berikut.toString()}`);
    },
    [params, pathname, router]
  );

  return { periode, hintGranularitas, setPeriode };
}
