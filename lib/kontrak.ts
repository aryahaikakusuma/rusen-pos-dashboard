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

/** Satu baris per varian per tanggal WIB — keluaran `laporan_produk_harian` (0028). */
export interface BarisProdukHarian {
  product_code: string;
  nama_produk: string;
  /** `YYYY-MM-DD`, WIB. Tanggal tanpa penjualan tetap muncul, bernilai nol. */
  tanggal: string;
  terjual: number;
  /** sum(order_items.subtotal), pra-pajak, KOTOR — refund tidak dikurangkan. */
  omzet: number;
}

/**
 * Batas keras jumlah seri pada grafik tren produk.
 *
 * BUKAN angka selera. PostgREST memotong balasan di 1000 baris tanpa galat apa
 * pun — tanpa header aneh, tanpa status berbeda, hanya array yang lebih pendek.
 * Grain `laporan_produk_harian` adalah seri × tanggal, jadi 32 seri pada bulan
 * 31 hari sudah 992 baris dan tinggal sejengkal dari pemotongan itu. Melewati
 * batas berarti grafik menggambar garis dari data terpotong, dan garis yang
 * putus di tanggal 28 terbaca sebagai "produk ini berhenti laku", bukan sebagai
 * kegagalan pengambilan data.
 *
 * Dua pertahanan berlapis menjaganya: permintaan dipecah per `SEPOTONG` kode
 * sehingga tiap balasan jauh di bawah 1000 baris, DAN tiap balasan dicocokkan
 * dengan Content-Range-nya sendiri. Batas ini adalah pertahanan ketiga, yang
 * membuat jumlah serinya sendiri tidak pernah tumbuh tanpa batas.
 */
export const MAKS_SERI_PRODUK = 32;

/**
 * Berapa kode produk per permintaan ke Postgres.
 *
 * 25 kode × 31 hari = 775 baris, dan angka itu bukan hitungan di atas kertas:
 * ia ukuran yang sudah terbukti bekerja saat 0028 divalidasi terhadap data
 * Agustus. Batas 32 seri di atas tetap ditegakkan terpisah — pemecahan ini
 * menjaga tiap BALASAN kecil, bukan menjaga grafiknya tetap terbaca.
 */
export const SEPOTONG_KODE = 25;

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

export interface BalasanProdukHarian {
  periode: Periode;
  outlet: string;
  /**
   * Kode yang benar-benar terwakili di `baris`, urut menurut omzet periode.
   *
   * Dikembalikan karena permintaan tanpa kode dijawab dengan N teratas yang
   * dipilih Postgres — tanpa kolom ini klien tidak punya cara tahu produk mana
   * yang datang selain menebaknya ulang dari baris, dan menebak ulang berarti
   * memeringkat di klien, persis yang dihindari 0028 keputusan 3.
   */
  kode: string[];
  /** `true` saat daftar di atas dipilih Postgres, bukan diminta klien. */
  bawaan: boolean;
  baris: BarisProdukHarian[];
}

export interface BalasanKatalog {
  produk: Produk[];
  kategori: Kategori[];
}

/* ------------------------------------------------------------ kas per shift */

/**
 * Satu baris per shift — keluaran `laporan_shift` (`0032`).
 *
 * `kas_aktual`, `selisih_tersimpan`, dan `selisih_hitung_server` bisa `null`:
 * shift terbuka tidak punya `kas_fisik`, dan sif lama sebelum V5/V6
 * `mobile/db/migrations.ts` tidak pernah mengisi `shifts.selisih`. `formula_cocok`
 * bertiga-nilai dengan alasan yang sama — `null` berarti "tidak diketahui",
 * BUKAN "diketahui cocok" atau "diketahui menyimpang".
 */
export interface BarisShift {
  shift_id: string;
  dibuka_pada: string;
  ditutup_pada: string | null;
  kasir: string;
  modal_awal: number;
  penjualan_tunai: number;
  kas_masuk: number;
  kas_keluar: number;
  refund_tunai: number;
  kas_seharusnya: number;
  kas_aktual: number | null;
  /** Apa adanya dari `shifts.selisih` — angka yang tercetak di struk kasir. */
  selisih_tersimpan: number | null;
  /** Dihitung ulang di Postgres, TIDAK dibaca dari `shifts.selisih`. */
  selisih_hitung_server: number | null;
  formula_cocok: boolean | null;
  masih_terbuka: boolean;
}

/** Satu baris movement — keluaran `detail_kas_shift`. `nominal` sudah bertanda arah. */
export interface BarisDetailKasShift {
  waktu: string;
  jenis: "masuk" | "keluar" | "refund";
  keterangan: string | null;
  nomor_order: string | null;
  kasir: string;
  nominal: number;
}

/** Order lunas yang `paid_at`-nya tidak jatuh di jendela shift manapun — `order_yatim`. */
export interface BarisOrderYatim {
  order_id: string;
  table_code: string;
  waktu: string;
  total: number;
  kasir: string;
  metode_pembayaran: string;
}

/** Refund yang `created_at`-nya tidak jatuh di jendela shift manapun — `refund_yatim`. */
export interface BarisRefundYatim {
  refund_id: string;
  nomor_order: string;
  waktu: string;
  nominal: number;
  alasan: string | null;
  kasir: string;
  metode_pembayaran: string;
}

export interface BalasanShift {
  periode: Periode;
  sertakanTerbuka: boolean;
  baris: BarisShift[];
  orderYatim: BarisOrderYatim[];
  refundYatim: BarisRefundYatim[];
}

/**
 * Paginasi di sini TIDAK datang dari argumen fungsi Postgres — `detail_kas_shift`
 * tidak menerima `p_limit`/`p_offset` seperti `laporan_penjualan_detail`.
 * `totalBaris` berasal dari header `Content-Range` PostgREST (`count: "exact"`
 * + `.range()`), bukan dari kolom window. Lihat `lib/laporan.ts`.
 */
export interface BalasanDetailKasShift {
  shiftId: string;
  halaman: number;
  limit: number;
  totalBaris: number;
  baris: BarisDetailKasShift[];
}
