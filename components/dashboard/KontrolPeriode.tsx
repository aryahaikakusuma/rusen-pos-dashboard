"use client";

import { usePathname } from "next/navigation";
import { useMemo } from "react";

import type { Periode } from "@/lib/kontrak";
import { usePeriode } from "@/lib/use-periode";
import {
  GRANULARITAS,
  bisaMaju,
  geserPeriode,
  granularitas,
  hariIniWib,
  jumlahHari,
  labelPeriode,
  rentangGranular,
  waktuWib,
} from "@/lib/periode";
import AksiLaporan from "./AksiLaporan";
import { jenisExport } from "./navigasi";
import RentangTanggal from "./RentangTanggal";

/**
 * Kontrol periode — satu baris, di dalam kartu konten yang isinya ia pengaruhi.
 *
 * DULU IA DI TOPBAR, DAN DI SANA IA BERBOHONG. Topbar membentang di seluruh
 * aplikasi, jadi pemilih rentang yang duduk di sana terbaca berlaku global —
 * padahal Kelola Produk dan Histori Transaksi tidak peduli periode sama sekali,
 * dan pemilihnya memang disembunyikan di dua halaman itu. Kontrol yang kadang
 * ada kadang tidak, di tempat yang menjanjikan "berlaku di mana-mana", lebih
 * membingungkan daripada kontrol yang jelas-jelas milik satu blok data.
 *
 * TIGA TOMBOL GRANULARITAS LANGSUNG MENGUBAH RENTANG, bukan cuma satuan
 * geseran panah. Kalau ia hanya mengubah satuan, tombolnya jadi state tak
 * terlihat: menekan "Bulanan" tidak mengubah apa pun di layar, dan baru
 * ketahuan artinya setelah panah ditekan. Label "Harian" harus menggambarkan
 * apa yang SEDANG tampil, bukan apa yang akan terjadi nanti.
 *
 * Keadaan aktifnya diturunkan dari rentang (`granularitas()`), DIBANTU hint
 * `g` di query string yang mengingat tombol mana yang barusan ditekan — lihat
 * catatan panjang di `granularitas()` (`lib/periode.ts`) untuk alasannya:
 * pada tanggal 1 atau tanggal 7 bulan berjalan, "Bulanan" menghasilkan rentang
 * yang identik dengan "Harian" atau "Mingguan", jadi bentuk rentang saja
 * tidak cukup untuk membedakan keduanya. Rentang tetap sumber kebenaran untuk
 * SAH-TIDAKNYA granularitas; `g` cuma
 * memilih di antara pembacaan yang sama-sama sah. Memilih 3–17 Agustus lewat
 * kalender tetap mematikan ketiganya — `RentangTanggal` memanggil `setPeriode`
 * tanpa hint, yang menghapus `g` lama, dan rentang itu memang bukan hari,
 * pekan, atau bulan apa pun.
 *
 * Label di antara dua panah membuka `RentangTanggal` yang sudah ada, lengkap
 * dengan seluruh presetnya. Ia dipakai ulang lewat prop `pemicu`, bukan ditulis
 * ulang.
 */
export default function KontrolPeriode({
  waktuData,
  bawaan,
}: {
  /** Kapan angka yang sedang tampil tiba. `null` selama pengambilan pertama. */
  waktuData: number | null;
  /**
   * Rentang bawaan saat query string kosong. `undefined` memakai bawaan
   * `usePeriode` (awal bulan berjalan) — satu-satunya pemanggil yang
   * membutuhkan yang lain sejauh ini adalah Kas per Shift (7 hari terakhir).
   * WAJIB referensi stabil (fungsi di luar komponen), bukan closure baru tiap
   * render — lihat catatan di `usePeriode`.
   */
  bawaan?: () => Periode;
}) {
  const { periode, hintGranularitas, setPeriode } = usePeriode(bawaan);
  const pathname = usePathname();

  /**
   * Cetak dan Unduh Excel duduk di baris ini, bukan di topbar.
   *
   * Keduanya mengeluarkan RENTANG yang sedang dipilih — nama berkasnya bahkan
   * memuat tanggalnya. Di topbar mereka berdiri jauh dari pemilih rentang yang
   * menentukan isinya, dan tidak ada apa pun di layar yang menghubungkan
   * keduanya; di sini hubungan itu jadi tata letaknya sendiri.
   *
   * `null` untuk halaman yang tidak punya lembar export (Dashboard). Kontrol
   * periodenya tetap ada, tombolnya saja yang tidak.
   */
  const jenis = jenisExport(pathname);

  // Dihitung sekali per pemasangan. `hariIniWib()` di badan render membuat
  // rentang bergeser diam-diam kalau halaman dibiarkan terbuka melewati tengah
  // malam, dan itu perubahan yang tidak pernah diminta siapa pun.
  const hariIni = useMemo(() => hariIniWib(), []);

  const aktif = granularitas(periode, hariIni, hintGranularitas);
  const maju = bisaMaju(periode, hariIni, aktif);

  return (
    <div className="no-print border-line mb-3 rounded-xl border bg-white px-3 py-2.5 sm:mb-4 sm:px-4 sm:py-3">
      <div className="grid min-w-0 grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:items-center sm:gap-3">
        <div
          className="bg-surface grid grid-cols-3 gap-0.5 rounded-[10px] p-0.5 sm:flex"
          role="group"
          aria-label="Granularitas periode"
        >
          {GRANULARITAS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              aria-pressed={aktif === id}
              onClick={() =>
                setPeriode(rentangGranular(id, periode.sampai, hariIni), id)
              }
              className={`cursor-pointer rounded-lg px-3.5 py-2 text-[13px] transition-colors ${
                aktif === id
                  ? "text-brand-dark bg-brand-soft font-semibold"
                  : "text-ink-2 hover:text-ink font-medium"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="grid min-w-0 grid-cols-[44px_minmax(0,1fr)_44px] items-center gap-1 sm:flex">
          <Panah
            arah={-1}
            label="Periode sebelumnya"
            onKlik={() =>
              setPeriode(geserPeriode(periode, -1, hariIni, aktif), aktif)
            }
          />

          <RentangTanggal
            periode={periode}
            onPilih={setPeriode}
            arah="kiri"
            pemicu={(buka, terbuka) => (
              <button
                type="button"
                onClick={buka}
                aria-expanded={terbuka}
                aria-haspopup="dialog"
                className="border-line text-ink hover:border-brand flex w-full min-w-0 cursor-pointer items-center justify-center gap-1 rounded-[10px] border bg-white px-2 py-2 text-xs font-semibold transition-colors sm:w-auto sm:px-3.5 sm:text-[13px]"
              >
                <span>{labelPeriode(periode)}</span>
                <span className="text-ink-3 hidden font-medium sm:inline">
                  · {jumlahHari(periode)} hari
                </span>
                <span className="text-ink-3 text-[10px]" aria-hidden="true">
                  ▾
                </span>
              </button>
            )}
          />

          {/* Panah maju diuji lewat AWAL rentang berikutnya, bukan ujungnya:
              ujung satuan berjalan selalu dipotong di hari ini, jadi menguji
              ujung membuat tombol ini terlihat hidup tapi tidak pernah
              mengubah apa pun saat ditekan. */}
          <Panah
            arah={1}
            label="Periode berikutnya"
            mati={!maju}
            onKlik={() =>
              setPeriode(geserPeriode(periode, 1, hariIni, aktif), aktif)
            }
          />
        </div>

        <span className="hidden flex-1 sm:block" />

        {/* Sebaris dengan pemilih rentang, di ujung kanan. Sempat diletakkan
            SESUDAH dua keterangan di bawah, dan di layar biasa hasilnya membungkus
            ke baris kedua: keduanya ikut mendorong, jadi tombolnya terlihat
            berpindah-pindah tergantung panjang label tanggal. Keterangan itu
            sekarang punya barisnya sendiri, dan kedua tombol ini tidak lagi
            bergantung pada panjang teks apa pun untuk tetap di tempatnya. */}
        {jenis ? <AksiLaporan jenis={jenis} periode={periode} /> : null}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        {/* Menjawab "ini angka kapan" tanpa menggulir ke kop dokumen di bawah.
            Yang ditampilkan adalah waktu tibanya angka YANG SEDANG TAMPIL —
            jadi selama penyegaran ia tetap menunjuk data lama, sejalan dengan
            penanda usang di `AreaData`. */}
        <p className="text-ink-3 text-[11px] font-medium tabular-nums">
          {waktuData === null
            ? "Memuat data…"
            : `Data per ${waktuWib(new Date(waktuData))}`}
        </p>
      </div>
    </div>
  );
}

function Panah({
  arah,
  label,
  onKlik,
  mati = false,
}: {
  arah: -1 | 1;
  label: string;
  onKlik: () => void;
  mati?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onKlik}
      disabled={mati}
      aria-label={label}
      title={label}
      className="border-line text-ink-2 hover:border-brand hover:text-brand-dark grid h-11 w-11 shrink-0 cursor-pointer place-items-center rounded-[10px] border bg-white text-base transition-colors disabled:cursor-not-allowed disabled:border-[#E6EAE9] disabled:text-[#C9CFCD] disabled:hover:border-[#E6EAE9]"
    >
      <span aria-hidden="true">{arah === -1 ? "‹" : "›"}</span>
    </button>
  );
}
