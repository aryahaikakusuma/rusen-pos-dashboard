"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Pengambil data sekali pakai untuk satu halaman.
 *
 * Sengaja sekecil ini dan bukan pustaka pengambil data: aplikasi ini punya lima
 * halaman, masing-masing memanggil satu route, dan tidak ada satu pun yang
 * butuh cache lintas halaman, revalidasi latar, atau mutasi optimistis.
 *
 * DUA HAL YANG TIDAK SEPELE DAN KARENA ITU DITANGANI DI SINI
 *
 * 1. BALASAN YANG DATANG TERLAMBAT. Mengganti rentang tanggal dua kali dengan
 *    cepat membuat dua permintaan berjalan bersamaan, dan yang pertama
 *    berangkat bisa tiba belakangan. Tanpa penanda `batal`, layar akan
 *    menampilkan hasil rentang yang sudah tidak dipilih lagi — tanpa error,
 *    tanpa indikasi apa pun, dan angkanya kelihatan masuk akal.
 *
 * 2. STATUS MEMUAT DITURUNKAN, BUKAN DISETEL. Cara yang biasa dipakai adalah
 *    `setMemuat(true)` di awal efek, dan itu memicu render berantai: satu render
 *    untuk menyalakan penanda, satu lagi saat datanya tiba. Di sini hasil
 *    disimpan bersama KUNCI permintaan yang menghasilkannya, dan "sedang
 *    memuat" cukup berarti "kunci hasil belum sama dengan kunci yang diminta".
 *    Tidak ada setState di dalam badan efek sama sekali.
 *
 * Selama pemuatan, data LAMA tetap dikembalikan. Itu disengaja: mengosongkannya
 * membuat seluruh halaman berkedip jadi pemuat setiap kali rentang digeser satu
 * hari. Pemanggil membedakan keduanya lewat `memuat && !data`.
 */
export function useData<T>(
  ambil: () => Promise<T>,
  deps: unknown[]
): { data: T | null; memuat: boolean; galat: string | null; muatUlang: () => void } {
  const [tanda, setTanda] = useState(0);
  const kunci = `${tanda}|${JSON.stringify(deps)}`;

  const [hasil, setHasil] = useState<{
    kunci: string;
    data: T | null;
    galat: string | null;
  } | null>(null);

  const muatUlang = useCallback(() => setTanda((n) => n + 1), []);

  useEffect(() => {
    let batal = false;

    ambil()
      .then((data) => {
        if (!batal) setHasil({ kunci, data, galat: null });
      })
      .catch((error: unknown) => {
        if (batal) return;
        setHasil({
          kunci,
          data: null,
          galat: error instanceof Error ? error.message : "Gagal memuat data.",
        });
      });

    return () => {
      batal = true;
    };
    // `ambil` sengaja tidak masuk daftar dependensi: ia closure baru setiap
    // render, dan memasukkannya membuat efek ini berjalan tanpa henti.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kunci]);

  const terkini = hasil?.kunci === kunci;

  return {
    data: hasil?.data ?? null,
    memuat: !terkini,
    // Galat dari permintaan lama tidak boleh menempel pada rentang baru.
    galat: terkini ? (hasil?.galat ?? null) : null,
    muatUlang,
  };
}
