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

/** Tanggal 1 pada bulan yang memuat `tanggal`. */
export const awalBulan = (tanggal: string) => `${tanggal.slice(0, 8)}01`;

/** Tanggal terakhir bulan ke-`geser` relatif terhadap bulan `tanggal`. */
export function akhirBulan(tanggal: string, geser = 0): string {
  const [y, m] = tanggal.split("-").map(Number);
  return new Date(Date.UTC(y, m + geser, 0)).toISOString().slice(0, 10);
}

/** Tanggal 1 bulan ke-`jumlah` relatif terhadap bulan `tanggal`. */
export function geserBulan(tanggal: string, jumlah: number): string {
  const [y, m] = tanggal.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + jumlah, 1)).toISOString().slice(0, 10);
}

/** Hari Minggu pekan yang memuat `tanggal` — pekan Indonesia dimulai Minggu. */
export function awalPekan(tanggal: string): string {
  return geserHari(tanggal, -new Date(`${tanggal}T00:00:00Z`).getUTCDay());
}

/** Tidak pernah melewati hari ini — lihat catatan granularitas di bawah. */
const jangan_ke_depan = (batas: string, hariIni: string) =>
  batas > hariIni ? hariIni : batas;

export type Granularitas = "harian" | "mingguan" | "bulanan";

export const GRANULARITAS: { id: Granularitas; label: string }[] = [
  { id: "harian", label: "Harian" },
  { id: "mingguan", label: "Mingguan" },
  { id: "bulanan", label: "Bulanan" },
];

/**
 * Rentang satu satuan granularitas yang memuat `patokan`.
 *
 * UJUNGNYA DIPOTONG DI HARI INI, sama seperti preset di `RentangTanggal`, dan
 * alasannya sama: fungsi laporan menerbitkan deret tanggal penuh, jadi minggu
 * berjalan yang dibiarkan menjulur ke Sabtu depan menghasilkan hari nol untuk
 * hari yang belum terjadi — dan setiap grafik terjun bebas ke kanan.
 */
export function rentangGranular(
  granularitas: Granularitas,
  patokan: string,
  hariIni: string
): Periode {
  // PATOKANNYA yang dipotong lebih dulu, bukan cuma ujung rentangnya.
  //
  // Memotong ujung saja gagal justru pada satuan yang seluruhnya di masa depan:
  // pekan yang memuat 31 Agustus dimulai 30 Agustus, dan ujungnya dipotong ke
  // hari ini (8 Agustus) — hasilnya rentang TERBALIK, 30 Agustus sampai 8
  // Agustus. `bacaPeriode` menolaknya sebagai 400, tapi baru di server, setelah
  // permintaan berangkat. Ini pernah lolos uji sampai kasus lintas bulan diuji.
  const dasar = jangan_ke_depan(patokan, hariIni);

  if (granularitas === "harian") return { dari: dasar, sampai: dasar };

  const dari = granularitas === "mingguan" ? awalPekan(dasar) : awalBulan(dasar);
  const penuh =
    granularitas === "mingguan" ? geserHari(dari, 6) : akhirBulan(dari);
  return { dari, sampai: jangan_ke_depan(penuh, hariIni) };
}

/**
 * Granularitas yang PERSIS diwakili rentang ini, atau `null` kalau ia rentang
 * bebas.
 *
 * Diturunkan dari rentangnya, tidak disimpan terpisah. Menyimpannya di state
 * atau query string berarti ada dua sumber untuk satu fakta, dan yang satu
 * bisa berbohong: tombol "Bulanan" tetap menyala setelah orang memilih 3–17
 * Agustus lewat kalender.
 *
 * Satuan berjalan yang terpotong di hari ini tetap dikenali — itu bentuk yang
 * `rentangGranular` hasilkan, jadi ia harus bisa dibaca balik.
 */
export function granularitas(
  periode: Periode,
  hariIni: string
): Granularitas | null {
  for (const { id } of GRANULARITAS) {
    const setara = rentangGranular(id, periode.dari, hariIni);
    if (setara.dari === periode.dari && setara.sampai === periode.sampai) {
      return id;
    }
  }
  return null;
}

/**
 * Geser satu satuan ke belakang (`-1`) atau ke depan (`+1`).
 *
 * Rentang bebas digeser sepanjang dirinya sendiri, konsisten dengan
 * `periodeSebelumnya` — mundur dari 1–8 Agustus mendarat di 24–31 Juli, bukan
 * di bulan Juli utuh.
 */
export function geserPeriode(
  periode: Periode,
  arah: -1 | 1,
  hariIni: string
): Periode {
  const g = granularitas(periode, hariIni);
  if (g === "harian") {
    return rentangGranular("harian", geserHari(periode.dari, arah), hariIni);
  }
  if (g === "mingguan") {
    return rentangGranular("mingguan", geserHari(periode.dari, arah * 7), hariIni);
  }
  if (g === "bulanan") {
    return rentangGranular("bulanan", geserBulan(periode.dari, arah), hariIni);
  }
  const n = jumlahHari(periode);
  return {
    dari: geserHari(periode.dari, arah * n),
    sampai: geserHari(periode.sampai, arah * n),
  };
}

/**
 * Apakah panah maju masih punya tujuan.
 *
 * DUA SYARAT, dan keduanya menutup lubang yang berbeda.
 *
 * `dari` harus benar-benar bergerak. Pada satuan berjalan, `rentangGranular`
 * memotong patokannya ke hari ini, jadi "bulan berikutnya" memantul kembali ke
 * bulan ini — tanpa syarat ini panahnya terlihat hidup dan tidak pernah
 * mengubah apa pun saat ditekan.
 *
 * `sampai` tidak boleh melewati hari ini. Yang dijaga syarat ini adalah rentang
 * BEBAS, yang digeser sepanjang dirinya sendiri dan tidak lewat pemotongan sama
 * sekali: 1–15 Agustus maju jadi 16–30 Agustus, dua puluh dua hari yang belum
 * terjadi terbit sebagai baris nol. Mematikan tombolnya lebih jujur daripada
 * memendekkan rentangnya diam-diam — panjang rentang adalah yang barusan
 * dipilih orangnya sendiri.
 */
export function bisaMaju(periode: Periode, hariIni: string): boolean {
  const berikut = geserPeriode(periode, 1, hariIni);
  return berikut.dari > periode.dari && berikut.sampai <= hariIni;
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

/**
 * Saat sebuah angka tiba, sampai DETIK.
 *
 * Detiknya bukan hiasan: menekan panah mundur lalu maju lagi dalam sepuluh
 * detik menghasilkan dua pengambilan berbeda yang, pada presisi menit, terbaca
 * sebagai waktu yang sama persis — dan penanda "ini angka kapan" berhenti
 * menjawab apa pun.
 */
export function waktuWib(saat: Date): string {
  const f = new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(saat);
  return `${f} WIB`;
}
