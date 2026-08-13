import type { BarisShift, Periode } from "./kontrak";
import { geserHari, tanggalWib } from "./periode";

/**
 * Pengelompokan shift per hari untuk halaman Kas per Shift.
 *
 * Pengecualian sadar terhadap aturan "agregasi di Postgres selalu": grain
 * per-hari dihitung di sini dari hasil `laporan_shift` yang sudah datang,
 * bukan lewat migrasi baru. Alasannya operasional — jumlah shift per hari
 * kecil (maksimal dua sekarang), jadi menjumlahkan array pendek di JS tidak
 * butuh fungsi Postgres baru. JANGAN perluas pola ini ke perhitungan lain;
 * lihat `lib/api-klien.ts` untuk kenapa agregasi biasanya wajib di Postgres.
 */

/**
 * Tanggal WIB shift pertama yang pernah tersinkron ke hosted
 * (`select min(opened_at) from shifts`, dibaca 2026-08-13; hasilnya
 * `2026-08-12T23:22:49.134+00:00` UTC = 13 Agustus 2026 06:22 WIB).
 *
 * Sebelum tanggal ini sistem shift belum dipakai di lapangan, jadi order/refund
 * "yatim" pada rentang itu adalah fakta historis (hampir semua order memang
 * yatim), bukan anomali yang perlu diperingatkan.
 */
export const TANGGAL_MULAI_SHIFT = "2026-08-13";

export interface BarisHari {
  /** `YYYY-MM-DD` WIB — patokan tanggal BUKA shift, bukan tanggal tutup. */
  tanggal: string;
  shifts: BarisShift[];
  jumlahShift: number;
  /** Nama kasir unik, dipisah koma, urut kemunculan pertama. */
  kasir: string;
  penjualanTunai: number;
  kasMasuk: number;
  kasKeluar: number;
  /** Banyaknya shift dengan `selisih_tersimpan` bukan nol DAN bukan null. */
  shiftBermasalah: number;
  /**
   * Selisih (bertanda) dari shift bermasalah dengan nilai absolut terbesar.
   * `null` kalau tidak ada shift bermasalah.
   */
  selisihTerbesar: number | null;
  /** Ada shift di hari ini yang `formula_cocok === false` — perlu ikon di lapis 1. */
  adaFormulaTidakCocok: boolean;
  /**
   * Ada shift di hari ini dengan `selisih_tersimpan === null` (shift terbuka,
   * atau sif lama sebelum V5/V6 yang tidak pernah mengisi `shifts.selisih`).
   * Tidak dihitung sebagai `shiftBermasalah` — null bukan "diketahui menyimpang"
   * — tapi juga tidak boleh diam-diam terbaca sebagai "Sesuai" kalau tidak ada
   * shift bermasalah. Lapis 1 menampilkan "Tidak Diketahui" untuk kasus ini.
   */
  adaTidakDiketahui: boolean;
  /** `tanggal < TANGGAL_MULAI_SHIFT` — hari sebelum sistem shift dipakai. */
  diLuarCakupan: boolean;
}

function baris_ke_BarisHari(tanggal: string, shifts: BarisShift[]): BarisHari {
  const kasirUnik: string[] = [];
  for (const s of shifts) {
    if (!kasirUnik.includes(s.kasir)) kasirUnik.push(s.kasir);
  }

  const bermasalah = shifts.filter(
    (s) => s.selisih_tersimpan !== null && s.selisih_tersimpan !== 0
  );
  const terbesar = bermasalah.reduce<BarisShift | null>((a, s) => {
    if (!a) return s;
    return Math.abs(s.selisih_tersimpan!) > Math.abs(a.selisih_tersimpan!) ? s : a;
  }, null);

  return {
    tanggal,
    shifts,
    jumlahShift: shifts.length,
    kasir: kasirUnik.join(", "),
    penjualanTunai: shifts.reduce((a, s) => a + s.penjualan_tunai, 0),
    kasMasuk: shifts.reduce((a, s) => a + s.kas_masuk, 0),
    kasKeluar: shifts.reduce((a, s) => a + s.kas_keluar, 0),
    shiftBermasalah: bermasalah.length,
    selisihTerbesar: terbesar ? terbesar.selisih_tersimpan : null,
    adaFormulaTidakCocok: shifts.some((s) => s.formula_cocok === false),
    adaTidakDiketahui: shifts.some((s) => s.selisih_tersimpan === null),
    diLuarCakupan: tanggal < TANGGAL_MULAI_SHIFT,
  };
}

/**
 * Satu baris per tanggal WIB, urut terbaru di atas, zero-fill sepanjang
 * `periode`.
 *
 * Tanggal di luar rentang yang diminta tapi tetap muncul di `baris` (batas
 * WIB yang tidak persis sejajar dengan `periode.dari`/`sampai`) TETAP
 * disertakan — bukan dibuang — supaya baris hari ini tidak pernah kehilangan
 * shift yang sudah dijawab server.
 */
export function kelompokkanPerHari(baris: BarisShift[], periode: Periode): BarisHari[] {
  const perTanggal = new Map<string, BarisShift[]>();
  for (const b of baris) {
    const tanggal = tanggalWib(new Date(b.dibuka_pada));
    const daftar = perTanggal.get(tanggal);
    if (daftar) daftar.push(b);
    else perTanggal.set(tanggal, [b]);
  }

  const tanggalSemua = new Set<string>(perTanggal.keys());
  for (let t = periode.dari; t <= periode.sampai; t = geserHari(t, 1)) {
    tanggalSemua.add(t);
  }

  return [...tanggalSemua]
    .sort((a, b) => (a < b ? 1 : -1))
    .map((tanggal) => baris_ke_BarisHari(tanggal, perTanggal.get(tanggal) ?? []));
}

/** "1 shift, +Rp804.500" / "2 shift, terbesar -Rp120.000" / null kalau tidak ada masalah. */
export function labelStatusSelisih(
  hari: Pick<BarisHari, "shiftBermasalah" | "selisihTerbesar">,
  rupiah: (nilai: number) => string
): string | null {
  if (hari.shiftBermasalah === 0 || hari.selisihTerbesar === null) return null;
  const tanda = hari.selisihTerbesar > 0 ? "+" : "";
  const nilai = `${tanda}${rupiah(hari.selisihTerbesar)}`;
  return hari.shiftBermasalah === 1
    ? `1 shift, ${nilai}`
    : `${hari.shiftBermasalah} shift, terbesar ${nilai}`;
}
