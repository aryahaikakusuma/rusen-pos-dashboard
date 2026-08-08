import "server-only";

import type {
  BarisDetail,
  BarisHarian,
  BarisProduk,
  BarisProdukHarian,
} from "./kontrak";
import { SEPOTONG_KODE } from "./kontrak";
import type { Periode } from "./periode";
import { db } from "./supabase/server";

/**
 * Satu-satunya jalur perhitungan laporan.
 *
 * Tiga fungsi di bawah memanggil tiga fungsi Postgres dari `0027`, satu-ke-satu,
 * tanpa menghitung apa pun sendiri. Layar dan berkas xlsx sama-sama lewat sini,
 * jadi tidak ada dua jalur angka yang bisa berbeda. Kalau bentuk keluarannya
 * kurang untuk sebuah tampilan, yang berubah adalah fungsi Postgres-nya —
 * bukan ditambal dengan query sampingan di TypeScript.
 *
 * Semua kolom bertipe `bigint` di Postgres. PostgREST mengirimnya sebagai angka
 * JSON, dan seluruh nilai di sini rupiah bulat yang jauh di bawah 2^53, jadi
 * `number` aman. Yang akan meleset lebih dulu bukan tipe datanya melainkan
 * omzet Rusen mencapai sembilan kuadriliun rupiah.
 */

export type {
  BarisDetail,
  BarisHarian,
  BarisProduk,
  BarisProdukHarian,
} from "./kontrak";

export async function laporanHarian(periode: Periode): Promise<BarisHarian[]> {
  const { data, error } = await db.rpc("laporan_penjualan_harian", {
    p_dari: periode.dari,
    p_sampai: periode.sampai,
  });
  if (error) throw new Error(`laporan_penjualan_harian gagal: ${error.message}`);
  return (data ?? []) as BarisHarian[];
}

export interface HasilDetail {
  baris: BarisDetail[];
  totalBaris: number;
}

/**
 * `total_baris` dibawa fungsi Postgres sebagai kolom window pada tiap baris.
 * Halaman kosong (offset melewati akhir) tidak mengembalikan baris sama sekali,
 * sehingga hitungannya ikut hilang — itu bentuk yang disengaja di `0027`, dan
 * di sini nol baris diperlakukan sebagai nol, bukan sebagai kegagalan.
 */
export async function laporanDetail(
  periode: Periode,
  limit: number,
  offset: number
): Promise<HasilDetail> {
  const { data, error } = await db.rpc("laporan_penjualan_detail", {
    p_dari: periode.dari,
    p_sampai: periode.sampai,
    p_limit: limit,
    p_offset: offset,
  });
  if (error) throw new Error(`laporan_penjualan_detail gagal: ${error.message}`);

  const baris = (data ?? []) as BarisDetail[];
  return { baris, totalBaris: baris[0]?.total_baris ?? 0 };
}

export async function laporanProduk(periode: Periode): Promise<BarisProduk[]> {
  const { data, error } = await db.rpc("laporan_produk", {
    p_dari: periode.dari,
    p_sampai: periode.sampai,
  });
  if (error) throw new Error(`laporan_produk gagal: ${error.message}`);
  return (data ?? []) as BarisProduk[];
}

export interface HasilProdukHarian {
  baris: BarisProdukHarian[];
  /** Kode yang benar-benar terwakili, urut menurut omzet periode (menurun). */
  kode: string[];
}

/**
 * Deret penjualan per varian per tanggal — `laporan_produk_harian` dari `0028`.
 *
 * DAFTAR KOSONG TIDAK DIISI DI SINI. `p_kode` dibiarkan `null` supaya Postgres
 * yang memilih lima teratas menurut omzet periode. Memeringkatnya di sini
 * berarti memanggil `laporan_produk` lebih dulu hanya untuk tahu produk mana
 * yang diminta — dua perjalanan untuk satu grafik, dan dua daftar yang bisa
 * berasal dari periode berbeda. Itu persis yang ditolak keputusan 3 di `0028`.
 *
 * DIPECAH PER `SEPOTONG_KODE`, DAN TIAP BALASAN DICOCOKKAN DENGAN HITUNGANNYA.
 * PostgREST memotong di 1000 baris tanpa memberi tanda apa pun; yang tersisa
 * hanya selisih antara panjang array dan angka total di header Content-Range.
 * `count: "exact"` meminta header itu, dan selisihnya diangkat jadi galat.
 * Tanpa pemeriksaan ini satu-satunya gejala pemotongan adalah garis yang
 * berhenti di tengah bulan — bentuk yang tidak bisa dibedakan dari produk yang
 * memang berhenti laku.
 */
export async function laporanProdukHarian(
  periode: Periode,
  kode: string[]
): Promise<HasilProdukHarian> {
  const potongan: (string[] | null)[] =
    kode.length === 0 ? [null] : belah(kode, SEPOTONG_KODE);

  const hasil = await Promise.all(
    potongan.map(async (p) => {
      const { data, error, count } = await db.rpc(
        "laporan_produk_harian",
        { p_dari: periode.dari, p_sampai: periode.sampai, p_kode: p },
        { count: "exact" }
      );
      if (error) throw new Error(`laporan_produk_harian gagal: ${error.message}`);

      const baris = (data ?? []) as BarisProdukHarian[];

      // `count` null berarti header tidak terkirim sama sekali. Itu bukan
      // "aman"; itu hilangnya satu-satunya cara mendeteksi pemotongan, jadi ia
      // ikut jadi galat alih-alih dilewati diam-diam.
      if (count === null || count === undefined) {
        throw new Error(
          "laporan_produk_harian: header Content-Range tidak ada, jadi pemotongan balasan tidak bisa dideteksi."
        );
      }
      if (baris.length < count) {
        throw new Error(
          `laporan_produk_harian: balasan terpotong — ${baris.length} baris diterima dari ${count} yang dilaporkan. ` +
            `Kurangi jumlah produk pada grafik.`
        );
      }

      return baris;
    })
  );

  const baris = hasil.flat();

  /**
   * Urutan seri diturunkan dari omzet periode, bukan dari urutan kedatangan.
   *
   * Satu balasan sudah urut menurut omzet — itu bagian dari kontrak `0028` —
   * tapi begitu permintaan dipecah, urutan itu hanya berlaku DI DALAM tiap
   * potongan, dan menggabungkannya begitu saja membuat kode ke-26 muncul di
   * atas kode ke-2. Ini bukan pemeringkatan yang menentukan produk mana yang
   * tampil: produknya sudah ditentukan, yang diurutkan hanya legendanya.
   */
  const total = new Map<string, number>();
  for (const b of baris) {
    total.set(b.product_code, (total.get(b.product_code) ?? 0) + b.omzet);
  }
  const urut = [...total.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([k]) => k);

  return { baris, kode: urut };
}

function belah<T>(daftar: T[], ukuran: number): T[][] {
  const hasil: T[][] = [];
  for (let i = 0; i < daftar.length; i += ukuran) {
    hasil.push(daftar.slice(i, i + ukuran));
  }
  return hasil;
}

/**
 * Nama outlet untuk identitas laporan.
 *
 * Rusen satu outlet dan tidak ada pemilih outlet di UI, tapi nama itu wajib
 * tercetak di setiap berkas yang beredar. Kalau suatu saat ada cabang kedua,
 * yang berubah adalah pemanggilnya, bukan bentuk fungsi ini.
 */
export async function namaOutlet(): Promise<string> {
  const { data, error } = await db
    .from("outlets")
    .select("name")
    .order("name")
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`Gagal membaca outlet: ${error.message}`);
  return data?.name ?? "Rusen Kopitiam";
}
