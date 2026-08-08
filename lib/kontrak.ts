/**
 * Kontrak data antara server dan browser.
 *
 * Berkas ini TIDAK meng-import `server-only`, dan itulah alasannya ada: bentuk
 * baris laporan dibutuhkan oleh komponen klien maupun oleh penyusun xlsx di
 * server. Kalau tipe-tipe ini tinggal di `lib/laporan.ts`, setiap komponen
 * klien yang menyebutnya akan meng-import modul yang membawa service_role key
 * di dekatnya — `import type` memang terhapus saat kompilasi, tapi bergantung
 * pada penghapusan itu berarti satu `import` yang lupa diberi `type` cukup
 * untuk menggagalkan build dengan pesan yang jauh dari sebabnya.
 *
 * Bentuknya mengikuti keluaran tiga fungsi Postgres di `0027` satu-ke-satu.
 * Kalau salah satu fungsi itu berubah, berkas ini yang pertama harus menyusul.
 *
 * Semua kolom uang bertipe `bigint` di Postgres dan dikirim PostgREST sebagai
 * angka JSON. Seluruhnya rupiah bulat jauh di bawah 2^53.
 */

export interface BarisHarian {
  tanggal: string;
  jumlah_order: number;
  /** sum(orders.subtotal), pra-pajak — sumbu uji kecocokan silang. */
  omzet_kotor: number;
  total_refund: number;
  omzet_bersih: number;
  /** taxable_subtotal order taxable — basis pengenaan PBJT, bukan subtotal. */
  dasar_pbjt: number;
  pbjt: number;
  /** Order yang dibebaskan seorang pegawai. */
  omzet_bebas_order: number;
  /** Rokok dsb pada order yang tetap dipungut — per baris, bukan per order. */
  omzet_bukan_objek: number;
  tertagih: number;
  tertagih_tunai: number;
  tertagih_non_tunai: number;
}

export interface BarisDetail {
  order_id: string;
  nomor_order: string;
  /** Apa adanya; TIDAK ditafsirkan jadi jenis order. */
  table_code: string;
  waktu_bayar: string;
  waktu_bayar_wib: string;
  kasir: string;
  metode_bayar: "cash" | "non_cash";
  subtotal: number;
  dasar_pbjt: number;
  pbjt: number;
  total: number;
  status_pajak: "taxable" | "exempt";
  alasan_bebas: string | null;
  disetujui_oleh: string | null;
  refund_total: number;
  ada_refund: boolean;
  is_test_data: boolean;
  total_baris: number;
}

export interface BarisProduk {
  product_code: string;
  nama_produk: string;
  kategori: string;
  terjual: number;
  omzet: number;
  kontribusi_persen: number | null;
}

export interface Kategori {
  id: string;
  code: string;
  name: string;
  /** Sifat barangnya, bukan pilihan per produk. Rokok = false sejak `0019`. */
  taxable: boolean;
  sort_order: number;
  active: boolean;
}

export interface Produk {
  id: string;
  code: string;
  name: string;
  price: number;
  active: boolean;
  category_id: string;
  kategori: string;
  kategori_taxable: boolean;
}

/* ----------------------------------------------------- balasan route handler */

export interface Periode {
  /** `YYYY-MM-DD`, WIB, inklusif. */
  dari: string;
  /** `YYYY-MM-DD`, WIB, INKLUSIF — tanggal ini ikut terhitung. */
  sampai: string;
}

export interface BalasanHarian {
  periode: Periode;
  outlet: string;
  baris: BarisHarian[];
  /** Periode setara sebelumnya, hanya saat diminta `bandingkan=1`. */
  sebelumnya: BarisHarian[] | null;
}

export interface BalasanDetail {
  periode: Periode;
  outlet: string;
  halaman: number;
  limit: number;
  totalBaris: number;
  baris: BarisDetail[];
}

export interface BalasanProduk {
  periode: Periode;
  outlet: string;
  baris: BarisProduk[];
}

export interface BalasanKatalog {
  produk: Produk[];
  kategori: Kategori[];
}
