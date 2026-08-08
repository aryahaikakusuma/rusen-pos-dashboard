/**
 * Rentang tanggal WIB.
 *
 * Fungsi laporan di `0027` menerima `date` WIB dan mengerjakan konversi zona
 * waktunya sendiri di SQL — lihat keputusan 1 di kepala migrasi itu. Jadi yang
 * berpindah dari browser ke server hanya dua string `YYYY-MM-DD`, tidak pernah
 * `Date` maupun timestamp. Tidak ada satu pun tempat di lapisan TypeScript ini
 * yang boleh menggeser jam.
 *
 * File ini tidak meng-import `server-only`: halaman klien memakainya untuk
 * menghitung preset ("Bulan Ini") dan menampilkan label tanggal.
 */

import { KesalahanMasukan } from "./errors";
import type { Periode } from "./kontrak";

export type { Periode };

const POLA_TANGGAL = /^\d{4}-\d{2}-\d{2}$/;

/** Tanggal hari ini menurut WIB, apa pun zona waktu mesin yang menjalankannya. */
export function hariIniWib(): string {
  return tanggalWib(new Date());
}

/** `YYYY-MM-DD` untuk sebuah instant, dibaca di zona Asia/Jakarta. */
export function tanggalWib(saat: Date): string {
  // en-CA memberi format YYYY-MM-DD; ini cara termurah menghindari perhitungan
  // offset manual yang gagal setiap kali ada yang mengubah zona waktu server.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(saat);
}

/**
 * Aritmetika tanggal murni kalender — tanpa zona waktu sama sekali.
 *
 * Memakai `Date` lokal untuk menggeser hari akan meleset satu hari di sekitar
 * pergantian bulan bagi siapa pun yang membuka dashboard dari zona waktu lain.
 */
export function geserHari(tanggal: string, jumlah: number): string {
  const [y, m, d] = tanggal.split("-").map(Number);
  const dasar = Date.UTC(y, m - 1, d) + jumlah * 86_400_000;
  return new Date(dasar).toISOString().slice(0, 10);
}

/** Selisih hari inklusif: 1–31 Agustus = 31. */
export function jumlahHari({ dari, sampai }: Periode): number {
  const ms = Date.parse(`${sampai}T00:00:00Z`) - Date.parse(`${dari}T00:00:00Z`);
  return Math.round(ms / 86_400_000) + 1;
}

/**
 * Periode dengan panjang sama persis, tepat sebelum periode ini.
 *
 * Dipakai kartu KPI untuk membandingkan "periode setara sebelumnya". Panjangnya
 * disamakan dalam hari, bukan disamakan bulan kalender — Februari dibanding
 * Januari lewat bulan kalender akan selalu terlihat turun 10%.
 */
export function periodeSebelumnya(periode: Periode): Periode {
  const n = jumlahHari(periode);
  return {
    dari: geserHari(periode.dari, -n),
    sampai: geserHari(periode.dari, -1),
  };
}

/**
 * Membaca periode dari query string dan menolak yang tidak masuk akal.
 *
 * Melempar `KesalahanMasukan`; `jaga()` mengubahnya jadi 400. Rentang terbalik
 * ditolak alih-alih ditukar diam-diam: kalau UI mengirim urutan yang salah, itu
 * bug yang harus terlihat, bukan dirapikan sampai tidak pernah ketahuan.
 */
export function bacaPeriode(params: URLSearchParams): Periode {
  const dari = params.get("dari") ?? "";
  const sampai = params.get("sampai") ?? "";

  if (!POLA_TANGGAL.test(dari) || !POLA_TANGGAL.test(sampai)) {
    throw new KesalahanMasukan(
      "Parameter `dari` dan `sampai` wajib berformat YYYY-MM-DD."
    );
  }
  if (
    Number.isNaN(Date.parse(`${dari}T00:00:00Z`)) ||
    Number.isNaN(Date.parse(`${sampai}T00:00:00Z`))
  ) {
    throw new KesalahanMasukan("Tanggal tidak valid.");
  }
  if (dari > sampai) {
    throw new KesalahanMasukan("Tanggal awal tidak boleh setelah tanggal akhir.");
  }

  // Batas atas yang murah hati tapi bukan tak terhingga: rentang sepuluh tahun
  // membuat laporan harian mengembalikan ribuan baris deret tanggal kosong.
  if (jumlahHari({ dari, sampai }) > 732) {
    throw new KesalahanMasukan("Rentang maksimal dua tahun.");
  }

  return { dari, sampai };
}

const NAMA_BULAN = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

const NAMA_HARI = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];

/** "7 Agustus 2026" */
export function tanggalPanjang(tanggal: string): string {
  const [y, m, d] = tanggal.split("-").map(Number);
  return `${d} ${NAMA_BULAN[m - 1]} ${y}`;
}

/** "07 Agu 2026" */
export function tanggalPendek(tanggal: string): string {
  const [y, m, d] = tanggal.split("-").map(Number);
  return `${String(d).padStart(2, "0")} ${NAMA_BULAN[m - 1].slice(0, 3)} ${y}`;
}

/** "Jum" — dihitung dari kalender, bukan dari `Date` lokal. */
export function namaHari(tanggal: string): string {
  return NAMA_HARI[new Date(`${tanggal}T00:00:00Z`).getUTCDay()];
}

/** "1 – 31 Agustus 2026", diringkas kalau bulan/tahunnya sama. */
export function labelPeriode({ dari, sampai }: Periode): string {
  if (dari === sampai) return tanggalPanjang(dari);
  const [ya, ma, da] = dari.split("-").map(Number);
  const [yb, mb, db] = sampai.split("-").map(Number);
  if (ya === yb && ma === mb) return `${da} – ${db} ${NAMA_BULAN[ma - 1]} ${ya}`;
  if (ya === yb) return `${da} ${NAMA_BULAN[ma - 1]} – ${db} ${NAMA_BULAN[mb - 1]} ${ya}`;
  return `${tanggalPanjang(dari)} – ${tanggalPanjang(sampai)}`;
}

/** Waktu pembuatan berkas/laporan, selalu dalam WIB dan selalu diberi labelnya. */
export function sekarangWib(): string {
  const f = new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    dateStyle: "long",
    timeStyle: "short",
  }).format(new Date());
  return `${f} WIB`;
}
