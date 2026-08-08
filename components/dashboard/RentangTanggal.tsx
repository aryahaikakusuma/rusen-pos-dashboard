"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type { Periode } from "@/lib/kontrak";
import {
  geserHari,
  hariIniWib,
  jumlahHari,
  labelPeriode,
  tanggalPanjang,
} from "@/lib/periode";

/**
 * Pemilih rentang tanggal.
 *
 * DUA HAL YANG BERBEDA DARI MOCKUP, KEDUANYA DISENGAJA
 *
 * 1. TIDAK ADA PEMILIH JAM. Mockup punya "DARI PUKUL" dan "HINGGA PUKUL", tapi
 *    fungsi laporan di `0027` menerima `date` WIB dan bukan `timestamptz` —
 *    justru supaya konversi zona waktu tidak pernah dikerjakan pemanggil.
 *    Menyediakan kotak jam yang nilainya dibuang diam-diam lebih buruk daripada
 *    tidak menyediakannya.
 *
 * 2. PRESET YANG MENJULUR KE MASA DEPAN DIPOTONG DI HARI INI. "Bulan Ini" di
 *    mockup berarti tanggal 1 sampai akhir bulan kalender. Karena laporan
 *    harian menerbitkan deret tanggal penuh — hari tanpa transaksi wajib muncul
 *    sebagai nol supaya garis tren tidak berbohong — pilihan itu akan
 *    menghasilkan dua puluh baris nol untuk hari yang belum terjadi, dan
 *    grafiknya terjun bebas ke kanan setiap awal bulan.
 *
 * Seluruh aritmetika tanggal di sini berjalan atas string `YYYY-MM-DD`. Tidak
 * ada satu pun `new Date()` yang dipakai untuk berhitung, karena `Date` bekerja
 * di zona waktu mesin yang membuka halaman, dan dashboard ini hanya mengenal
 * satu zona waktu: WIB.
 */

interface Preset {
  id: string;
  label: string;
  hitung: (hariIni: string) => Periode;
}

/** Tanggal 1 pada bulan yang memuat `tanggal`. */
const awalBulan = (tanggal: string) => `${tanggal.slice(0, 8)}01`;

/** Tanggal terakhir bulan ke-`geser` relatif terhadap bulan `tanggal`. */
function akhirBulan(tanggal: string, geser = 0): string {
  const [y, m] = tanggal.split("-").map(Number);
  const akhir = new Date(Date.UTC(y, m + geser, 0));
  return akhir.toISOString().slice(0, 10);
}

function geserBulan(tanggal: string, jumlah: number): string {
  const [y, m] = tanggal.split("-").map(Number);
  const dasar = new Date(Date.UTC(y, m - 1 + jumlah, 1));
  return dasar.toISOString().slice(0, 10);
}

/** Hari Minggu pekan yang memuat `tanggal` — pekan Indonesia dimulai Minggu. */
function awalPekan(tanggal: string): string {
  const hari = new Date(`${tanggal}T00:00:00Z`).getUTCDay();
  return geserHari(tanggal, -hari);
}

/** Tidak pernah melewati hari ini. Lihat catatan 2 di kepala berkas. */
const sampaiHariIni = (batas: string, hariIni: string) =>
  batas > hariIni ? hariIni : batas;

const PRESET: Preset[] = [
  { id: "hari-ini", label: "Hari Ini", hitung: (h) => ({ dari: h, sampai: h }) },
  {
    id: "kemarin",
    label: "Kemarin",
    hitung: (h) => ({ dari: geserHari(h, -1), sampai: geserHari(h, -1) }),
  },
  {
    id: "7-hari",
    label: "7 Hari Terakhir",
    hitung: (h) => ({ dari: geserHari(h, -6), sampai: h }),
  },
  {
    id: "pekan-ini",
    label: "Minggu Ini",
    hitung: (h) => ({ dari: awalPekan(h), sampai: h }),
  },
  {
    id: "pekan-lalu",
    label: "Minggu Lalu",
    hitung: (h) => ({
      dari: geserHari(awalPekan(h), -7),
      sampai: geserHari(awalPekan(h), -1),
    }),
  },
  {
    id: "30-hari",
    label: "30 Hari Terakhir",
    hitung: (h) => ({ dari: geserHari(h, -29), sampai: h }),
  },
  {
    id: "bulan-ini",
    label: "Bulan Ini",
    hitung: (h) => ({ dari: awalBulan(h), sampai: sampaiHariIni(akhirBulan(h), h) }),
  },
  {
    id: "bulan-lalu",
    label: "Bulan Lalu",
    hitung: (h) => ({
      dari: awalBulan(geserBulan(h, -1)),
      sampai: akhirBulan(h, -1),
    }),
  },
  {
    id: "kuartal-ini",
    label: "Kuartal Ini",
    hitung: (h) => {
      const bulan = Number(h.slice(5, 7));
      const mulai = Math.floor((bulan - 1) / 3) * 3 + 1;
      const dari = `${h.slice(0, 4)}-${String(mulai).padStart(2, "0")}-01`;
      return { dari, sampai: sampaiHariIni(akhirBulan(dari, 3), h) };
    },
  },
  {
    id: "kuartal-lalu",
    label: "Kuartal Lalu",
    hitung: (h) => {
      const bulan = Number(h.slice(5, 7));
      const mulai = Math.floor((bulan - 1) / 3) * 3 + 1;
      const awal = `${h.slice(0, 4)}-${String(mulai).padStart(2, "0")}-01`;
      const dari = geserBulan(awal, -3);
      return { dari, sampai: akhirBulan(dari, 3) };
    },
  },
  {
    id: "tahun-ini",
    label: "Tahun Ini",
    hitung: (h) => ({
      dari: `${h.slice(0, 4)}-01-01`,
      sampai: sampaiHariIni(`${h.slice(0, 4)}-12-31`, h),
    }),
  },
];

const NAMA_BULAN = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];
const DOW = ["M", "S", "S", "R", "K", "J", "S"];

/** Kisi kalender satu bulan: 42 sel, sel di luar bulan bernilai null. */
function kisiBulan(patokan: string): (string | null)[] {
  const [y, m] = patokan.split("-").map(Number);
  const jumlahHariBulan = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const hariPertama = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();

  const sel: (string | null)[] = Array(hariPertama).fill(null);
  for (let d = 1; d <= jumlahHariBulan; d++) {
    sel.push(`${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  }
  while (sel.length % 7 !== 0) sel.push(null);
  return sel;
}

export default function RentangTanggal({
  periode,
  onPilih,
}: {
  periode: Periode;
  onPilih: (periode: Periode) => void;
}) {
  const [buka, setBuka] = useState(false);
  const [dari, setDari] = useState(periode.dari);
  const [sampai, setSampai] = useState<string | null>(periode.sampai);
  const [patokan, setPatokan] = useState(awalBulan(periode.dari));
  const wadah = useRef<HTMLDivElement>(null);

  const hariIni = useMemo(() => hariIniWib(), []);

  /**
   * Panel dibuka dengan keadaan yang sedang berlaku, bukan dengan sisa pilihan
   * terakhir yang batal — kalau tidak, menekan Batal lalu membuka lagi
   * menampilkan rentang yang tidak pernah jadi dipakai.
   *
   * Penyetelan ulangnya dikerjakan DI SINI, di penangan klik, bukan di dalam
   * `useEffect` yang mengamati `buka`. Menyetel state di dalam efek membuat
   * React merender dua kali setiap panel dibuka: sekali dengan nilai lama, lalu
   * sekali lagi dengan nilai barunya. Yang terlihat adalah kalender berkedip ke
   * rentang sebelumnya sepersekian detik sebelum melompat ke yang benar.
   */
  function bukaPanel() {
    setDari(periode.dari);
    setSampai(periode.sampai);
    setPatokan(awalBulan(periode.dari));
    setBuka(true);
  }

  useEffect(() => {
    if (!buka) return;

    const klikLuar = (event: MouseEvent) => {
      if (!wadah.current?.contains(event.target as Node)) setBuka(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setBuka(false);
    };

    document.addEventListener("mousedown", klikLuar);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", klikLuar);
      document.removeEventListener("keydown", escape);
    };
  }, [buka]);

  const presetAktif = PRESET.find((p) => {
    const hasil = p.hitung(hariIni);
    return hasil.dari === periode.dari && hasil.sampai === periode.sampai;
  });

  function klikTanggal(tanggal: string) {
    // Klik pertama menetapkan awal; klik kedua menutup rentang. Klik yang jatuh
    // sebelum awal memulai rentang baru alih-alih menghasilkan rentang terbalik.
    if (sampai !== null || tanggal < dari) {
      setDari(tanggal);
      setSampai(null);
      return;
    }
    setSampai(tanggal);
  }

  function terapkan() {
    onPilih({ dari, sampai: sampai ?? dari });
    setBuka(false);
  }

  const pratinjau: Periode = { dari, sampai: sampai ?? dari };

  return (
    <div className="relative" ref={wadah}>
      <button
        type="button"
        onClick={() => (buka ? setBuka(false) : bukaPanel())}
        aria-expanded={buka}
        className="border-line text-ink-2 hover:border-brand flex cursor-pointer items-center gap-2.5 rounded-[10px] border bg-white px-3.5 py-2.5 text-sm font-semibold transition-colors"
      >
        <span className="text-brand" aria-hidden="true">
          📅
        </span>
        <span>{presetAktif ? presetAktif.label : labelPeriode(periode)}</span>
        <span className="text-ink-3 text-xs" aria-hidden="true">
          ▾
        </span>
      </button>

      {buka ? (
        <div className="border-line absolute top-full right-0 z-60 mt-2 w-[min(92vw,780px)] overflow-hidden rounded-2xl border bg-white shadow-[0_24px_64px_rgba(16,24,40,.18)]">
          <div className="grid grid-cols-1 lg:grid-cols-[180px_1fr]">
            <div className="border-line flex max-h-[420px] flex-row flex-wrap gap-0.5 overflow-auto border-b p-2 lg:flex-col lg:flex-nowrap lg:border-r lg:border-b-0">
              {PRESET.map((preset) => {
                const hasil = preset.hitung(hariIni);
                const aktif = presetAktif?.id === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => {
                      onPilih(hasil);
                      setBuka(false);
                    }}
                    className={`cursor-pointer rounded-lg px-3 py-2 text-left text-[13px] transition-colors ${
                      aktif
                        ? "bg-brand-soft text-brand-dark font-bold"
                        : "text-ink-2 hover:bg-surface font-medium"
                    }`}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>

            <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2">
              {[0, 1].map((geser) => {
                const bulan = geserBulan(patokan, geser);
                const [y, m] = bulan.split("-").map(Number);
                return (
                  <div key={geser}>
                    <div className="mb-2.5 flex items-center justify-between">
                      {geser === 0 ? (
                        <button
                          type="button"
                          onClick={() => setPatokan(geserBulan(patokan, -1))}
                          aria-label="Bulan sebelumnya"
                          className="text-ink-2 hover:bg-surface grid h-7 w-7 cursor-pointer place-items-center rounded-lg"
                        >
                          ‹
                        </button>
                      ) : (
                        <span className="h-7 w-7" />
                      )}
                      <b className="text-sm font-bold">
                        {NAMA_BULAN[m - 1]} {y}
                      </b>
                      {geser === 1 ? (
                        <button
                          type="button"
                          onClick={() => setPatokan(geserBulan(patokan, 1))}
                          aria-label="Bulan berikutnya"
                          className="text-ink-2 hover:bg-surface grid h-7 w-7 cursor-pointer place-items-center rounded-lg"
                        >
                          ›
                        </button>
                      ) : (
                        <span className="h-7 w-7" />
                      )}
                    </div>

                    <div className="grid grid-cols-7 gap-0.5">
                      {DOW.map((d, i) => (
                        <div
                          key={i}
                          className="text-ink-3 py-1 text-center text-[10px] font-bold"
                        >
                          {d}
                        </div>
                      ))}

                      {kisiBulan(bulan).map((tanggal, i) => {
                        if (!tanggal) return <span key={i} className="h-[30px]" />;

                        const akhir = sampai ?? dari;
                        const diDalam = tanggal > dari && tanggal < akhir;
                        const tepi = tanggal === dari || tanggal === akhir;
                        const depan = tanggal > hariIni;

                        return (
                          <button
                            key={i}
                            type="button"
                            disabled={depan}
                            onClick={() => klikTanggal(tanggal)}
                            className={`h-[30px] cursor-pointer text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:text-[#C9CFCD] ${
                              tepi
                                ? "bg-brand rounded-lg font-bold text-white"
                                : diDalam
                                  ? "bg-brand-soft text-brand-dark font-semibold"
                                  : "text-ink hover:bg-surface rounded-lg"
                            }`}
                          >
                            {Number(tanggal.slice(8))}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="border-line flex flex-wrap items-center gap-3 border-t bg-[#FAFBFB] px-4 py-3">
            <span className="text-[13px] font-bold">
              {sampai === null ? (
                <span className="text-ink-3 font-medium">
                  Mulai {tanggalPanjang(dari)} — pilih tanggal akhir
                </span>
              ) : (
                <>
                  {labelPeriode(pratinjau)}{" "}
                  <span className="text-ink-3 font-medium">
                    · {jumlahHari(pratinjau)} hari
                  </span>
                </>
              )}
            </span>
            <span className="flex-1" />
            <button
              type="button"
              onClick={() => setBuka(false)}
              className="border-line text-ink-2 hover:border-brand hover:text-brand-dark cursor-pointer rounded-[10px] border bg-white px-4 py-2 text-[13px] font-semibold"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={terapkan}
              className="bg-brand hover:bg-brand-dark cursor-pointer rounded-[10px] px-4 py-2 text-[13px] font-semibold text-white"
            >
              Proses
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
