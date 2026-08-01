// Pengelompokan varian produk.
//
// Di database, tiap varian adalah produk terpisah dengan kode dan harga
// masing-masing (mis. "Coklat Panas" Rp 17.000 dan "Coklat Dingin" Rp 20.000).
// Itu benar untuk pencatatan, tapi memaksa kasir memindai beberapa kartu untuk
// satu menu. Di layar mereka digabung jadi satu kartu "Coklat"; variannya baru
// ditanyakan setelah kartu ditekan.
//
// Ada TIGA poros varian, dan ketiganya tidak boleh dicampur dalam satu kartu:
//
//   suhu    — panas / dingin, untuk minuman.
//   saus    — ori / mayonnaise / bangkok / mentega / lada hitam / teriyaki,
//             untuk nasi paket goreng tepung.
//   topping — sayur / telur / sosis dalam segala kombinasi, untuk Indomie.
//
// Penanda suhu di daftar menu tidak seragam. Selain "Panas"/"Dingin", kategori
// Kopi memakai akhiran "S" atau "Es" untuk versi dingin, dan versi panasnya
// ditulis tanpa akhiran sama sekali:
//
//   Kopi              Rp 11.000   ← panas
//   Kopi S            Rp 15.000   ← dingin
//   Kopi Susu Panas   Rp 13.000
//   Kopi Susu S       Rp 18.000
//
// Poros saus punya bentuk yang sama: varian Ori ditulis tanpa akhiran apa pun.
//
//   Nasi Paket Ayam Goreng Tepung             Rp 25.000  ← ori
//   Nasi Paket Ayam Goreng Tepung Teriyaki    Rp 27.000
//
// Poros topping justru satu-satunya yang penandanya SELALU ditulis, termasuk
// untuk pilihan dasarnya:
//
//   Indomie Goreng Polos                      Rp 10.000
//   Indomie Goreng Sayur                      Rp 12.000
//   Indomie Goreng Sayur + Telur              Rp 17.000
//   Indomie Goreng Sayur + Telur + Sosis      Rp 20.000
//
// Kedelapan kombinasinya punya baris produk sendiri-sendiri, jadi tiga kotak
// centang di layar benar-benar bebas. Yang dikirim ke server tetap satu
// productId, sehingga laporan penjualan membedakan mi polos dari mi bersosis
// tanpa perlu mengurai teks — dan harga tetap ditentukan server dari baris
// produknya, tidak pernah dihitung ulang di klien.
//
// Di sinilah letak kerumitan sesungguhnya, dan sebabnya versi lama berkas ini
// tidak bisa dipakai ulang apa adanya: KETIADAAN akhiran harus berarti "panas"
// pada satu poros dan "ori" pada poros lain. Satu isyarat, dua makna. Karena
// itu jenis grup ditentukan lebih dulu dari saudara-saudaranya (langkah 1 di
// bawah), baru produk tanpa akhiran diberi arti. Menebaknya dari nama saja
// tidak mungkin.
//
// Seperti sebelumnya, sebuah produk baru benar-benar digabung kalau saudaranya
// memang ada. Kalau tidak, kartunya berdiri sendiri persis seperti produk biasa.
//
// Yang dikirim ke server tetap productId asli — pengelompokan ini murni tampilan,
// jadi laporan tetap bisa membedakan teriyaki dari mentega.
//
// Kembaran berkas ini ada di lib/product-variants.ts (aplikasi web). Keduanya
// harus berubah bersama: kalau berbeda, kasir melihat isi kartu yang berbeda di
// dua perangkat untuk katalog yang sama, dan tidak ada tes yang menangkapnya.

import type { ProductRow } from "../db/types";

export type VariantKind = "suhu" | "saus" | "topping";

/**
 * Pilihan yang TIDAK mengubah harga, dan karena itu sengaja tidak punya baris
 * produk sendiri: jenis kuah Indomie (Ayam Spesial / Soto).
 *
 * KENAPA BUKAN PRODUK. Membuatnya jadi produk berarti delapan baris untuk
 * Indomie Kuah — empat preset dikali dua jenis kuah — dan tiap topping baru
 * kelak menggandakannya lagi. Lebih buruk dari jumlahnya: laporan penjualan
 * jadi terbelah dua di poros yang tidak ada bedanya sepeser pun, sehingga
 * "berapa mi bersosis terjual" tidak lagi terbaca dalam satu baris.
 *
 * Yang dibayar untuk itu: pilihannya masuk ke order_items.notes, bukan kolom
 * sendiri. Kolom `notes` memang sudah ada, sudah ikut ke struk, dan sudah jadi
 * bagian kunci penggabungan baris — dua mi sama dengan kuah berbeda otomatis
 * jadi dua baris keranjang. Jadi tidak ada perubahan skema sama sekali.
 */
export interface ExtraOption {
  /** Ditulis apa adanya ke notes, jadi huruf besarnya sudah siap tampil. */
  value: string;
  label: string;
}

export interface ExtraGroup {
  key: string;
  label: string;
  options: ExtraOption[];
  /** null berarti wajib dipilih — tombol Tambah mati sampai kasir memilih. */
  defaultValue: string | null;
}

export interface ProductOption {
  product: ProductRow;
  /** Nilai varian dalam huruf kecil, mis. "panas", "ori", "lada hitam". */
  value: string;
  /** Teks tombol. Ikut di sini supaya lapisan tampilan tidak perlu tabel cari. */
  label: string;
}

export interface ProductEntry {
  key: string;
  /** Nama yang tampil di kartu: tanpa akhiran varian kalau ada lebih dari satu. */
  label: string;
  minPrice: number;
  maxPrice: number;
  /** null berarti kartu ini produk tunggal tanpa pilihan. */
  kind: VariantKind | null;
  /** Lebih dari satu berarti kasir harus memilih dulu. */
  options: ProductOption[];
  /**
   * Varian yang sudah tersorot saat lembar dibuka. null berarti kasir harus
   * memilih sendiri — itu perilaku poros suhu, dan sengaja dipertahankan:
   * panas dan dingin sama-sama wajar, jadi menyorot salah satunya berarti
   * menaruh ibu jari di timbangan menu yang laku.
   */
  defaultValue: string | null;
  /**
   * Poros kedua yang tidak berharga, ditanyakan bersama varian di lembar yang
   * sama. null untuk hampir semua kartu. Lihat ExtraGroup.
   */
  extra: ExtraGroup | null;
  /** Keterangan singkat di lembar varian. null kalau tidak ada yang perlu. */
  note: string | null;
}

/**
 * Akhiran penanda suhu. "S" dan "Es" hanya dikenali sebagai kata terpisah, jadi
 * "Kopi Milo Susu" (berakhir huruf u) dan "Kopi Susu Pancung" tidak ikut terpotong.
 */
const SUHU_SUFFIX = /\s+(panas|dingin|es|s)$/i;

/**
 * Urutan saus, dan sekaligus urutan tombolnya di layar. Ori selalu pertama
 * karena ia yang paling sering dipilih dan ia yang tersorot lebih dulu.
 *
 * Daftar tertutup, bukan pola: saus baru harus ditambahkan di sini DAN sebagai
 * baris produk di database. Itu memang lebih repot daripada mengenali kata
 * apa pun di akhir nama, dan itulah gunanya — "Nasi Paket Telur Kecap Pedas"
 * tidak boleh tiba-tiba terbaca sebagai varian saus bernama "Pedas".
 */
const SAUS: ReadonlyArray<readonly [value: string, label: string]> = [
  ["ori", "Ori"],
  ["mayonnaise", "Mayonnaise"],
  ["bangkok", "Bangkok"],
  ["mentega", "Mentega"],
  ["lada hitam", "Lada Hitam"],
  ["teriyaki", "Teriyaki"],
];

/** Semua saus kecuali ori, yang justru dikenali dari ketiadaan akhiran. */
const SAUS_SUFFIX = new RegExp(
  `\\s+(${SAUS.slice(1)
    .map(([value]) => value)
    .join("|")})$`,
  "i"
);

/**
 * Tiga topping Indomie, bebas dicentang satu per satu.
 *
 * URUTANNYA ADALAH ARTINYA: posisi di daftar ini adalah nomor bitnya, sehingga
 * satu kombinasi topping bisa diwakili satu angka 0..7 dan mencentang sebuah
 * kotak tinggal membalik satu bit. Nama produk di database disusun dari urutan
 * yang sama, jadi "Sayur + Sosis" tidak pernah tertulis "Sosis + Sayur".
 *
 * Sebelumnya ini sebuah TANGGA berisi empat preset, karena hanya empat
 * kombinasi yang punya baris produk berharga: mencentang Telur terpaksa ikut
 * mencentang Sayur. Sisanya sekarang ada (lihat 0010_topping_indomie_bebas.sql),
 * jadi kuncinya dibuka dan ketiga kotak berdiri sendiri-sendiri.
 */
export const TOPPING_BOXES = ["Sayur", "Telur", "Sosis"] as const;

/** Nama kombinasi untuk sebuah bitmask. Kosong berarti "Polos", bukan "". */
function toppingName(mask: number): string {
  const parts = TOPPING_BOXES.filter((_, bit) => mask & (1 << bit));
  return parts.length > 0 ? parts.join(" + ") : "Polos";
}

/**
 * Kedelapan kombinasi, diindeks oleh bitmask-nya. Bahwa indeks == bitmask
 * dipakai langsung oleh toppingMask dan toppingToggle di bawah.
 */
const TOPPING: ReadonlyArray<readonly [value: string, label: string]> =
  Array.from({ length: 1 << TOPPING_BOXES.length }, (_, mask) => {
    const label = toppingName(mask);
    return [label.toLowerCase(), label] as const;
  });

/** Kotak mana saja yang tercentang, sebagai bitmask. */
export function toppingMask(value: string): number {
  const index = TOPPING.findIndex(([v]) => v === value);
  return index < 0 ? 0 : index;
}

/** Nilai varian untuk sebuah bitmask — kebalikan toppingMask. */
export function toppingValue(mask: number): string {
  return TOPPING[mask & (TOPPING.length - 1)][0];
}

/** Hasil menekan kotak ke-`box` (0 = Sayur, 1 = Telur, 2 = Sosis). */
export function toppingToggle(value: string, box: number): string {
  return toppingValue(toppingMask(value) ^ (1 << box));
}

const TOPPING_LABEL = new Map(TOPPING);
const TOPPING_ORDER = new Map(TOPPING.map(([value], index) => [value, index]));

/**
 * Kombinasi terpanjang diperiksa lebih dulu — "Sayur + Telur + Sosis"
 * berakhiran "Sosis", dan alternasi regex memilih cabang pertama yang cocok,
 * bukan yang terpanjang. Terbalik urutannya, seluruh mi lengkap terbaca sebagai
 * varian bernama "Sosis" dengan nama dasar "Indomie Goreng Sayur + Telur +".
 *
 * `\s+` di depan bukan hiasan: tanpanya, produk yang namanya PERSIS satu kata
 * topping ikut tertangkap. Kategori TOPPING berisi tepat itu — "Sayur",
 * "Telur", "Sosis" sebagai barang tersendiri — dan ketiganya akan menyusut jadi
 * satu kartu tanpa nama, karena nama dasarnya sama-sama string kosong.
 */
const TOPPING_SUFFIX = new RegExp(
  `\\s+(${TOPPING.map(([value]) => value)
    .sort((a, b) => b.length - a.length)
    .map((value) => value.replace(/\+/g, "\\+"))
    .join("|")})$`,
  "i"
);

/**
 * Jenis kuah, hanya untuk Indomie Kuah. Tanpa bawaan: keduanya sama-sama wajar
 * dan sama harganya, jadi menyorot salah satunya akan diam-diam menjual yang
 * itu setiap kali kasir buru-buru.
 */
const JENIS_KUAH: ExtraGroup = {
  key: "jenis_kuah",
  label: "Jenis kuah",
  options: [
    { value: "Ayam Spesial", label: "Ayam Spesial" },
    { value: "Soto", label: "Soto" },
  ],
  defaultValue: null,
};

const SUHU_LABEL: Record<string, string> = {
  panas: "Panas",
  dingin: "Dingin",
};

const SAUS_LABEL = new Map(SAUS);
const SAUS_ORDER = new Map(SAUS.map(([value], index) => [value, index]));

const labelOf = (kind: VariantKind, value: string) =>
  kind === "suhu"
    ? SUHU_LABEL[value]
    : kind === "topping"
      ? (TOPPING_LABEL.get(value) ?? value)
      : (SAUS_LABEL.get(value) ?? value);

interface Marker {
  base: string;
  /** null kalau nama tidak berakhiran penanda apa pun — artinya baru bisa
   *  ditentukan setelah saudara-saudaranya diketahui. */
  kind: VariantKind | null;
  value: string | null;
}

/**
 * Saus diperiksa lebih dulu. Tidak ada saus yang berakhiran "s"/"es" sebagai
 * kata terpisah, jadi urutannya tidak mengubah hasil — tapi kalau suatu hari
 * ada saus bernama "Saus Es", yang benar adalah ia terbaca sebagai saus.
 */
function readMarker(name: string): Marker {
  // Topping lebih dulu dari keduanya: preset "Sayur + Telur + Sosis" tidak
  // bertabrakan dengan akhiran mana pun di poros lain, tapi memeriksanya
  // pertama membuat urutan ini tidak bergantung pada kebetulan itu.
  const topping = TOPPING_SUFFIX.exec(name);
  if (topping) {
    return {
      base: name.slice(0, topping.index).trim(),
      kind: "topping",
      value: topping[1].toLowerCase(),
    };
  }

  const saus = SAUS_SUFFIX.exec(name);
  if (saus) {
    return {
      base: name.slice(0, saus.index).trim(),
      kind: "saus",
      value: saus[1].toLowerCase(),
    };
  }

  const suhu = SUHU_SUFFIX.exec(name);
  if (suhu) {
    const suffix = suhu[1].toLowerCase();
    return {
      base: name.slice(0, suhu.index).trim(),
      kind: "suhu",
      value: suffix === "panas" ? "panas" : "dingin",
    };
  }

  // Tanpa akhiran: nama utuh sebagai nama dasar, arti ditentukan belakangan.
  return { base: name, kind: null, value: null };
}

/**
 * Menggabungkan produk yang namanya hanya berbeda pada penanda varian.
 * Kunci grup menyertakan kategori supaya menu bernama mirip di kategori berbeda
 * (mis. "Jahe Gula Merah" di JAHE dan "Teh Gula Merah" di TEH) tidak tercampur.
 * Urutan produk masukan dipertahankan.
 */
export function groupProductVariants(products: ProductRow[]): ProductEntry[] {
  const marked = products.map((product) => ({
    product,
    marker: readMarker(product.name),
  }));

  const keyOf = (product: ProductRow, marker: Marker) =>
    `${product.category_id}:${marker.base.toLowerCase()}`;

  // Langkah 1 — tentukan jenis tiap grup dari produk yang penandanya jelas.
  // Ini harus selesai sebelum apa pun digabung, karena produk tanpa akhiran
  // tidak punya arti sampai jenis grupnya diketahui.
  const kindByKey = new Map<string, VariantKind | null>();
  for (const { product, marker } of marked) {
    if (!marker.kind) continue;
    const key = keyOf(product, marker);
    const seen = kindByKey.get(key);
    if (seen === undefined) {
      kindByKey.set(key, marker.kind);
    } else if (seen !== marker.kind) {
      // Satu nama dasar dengan varian suhu DAN saus sekaligus. Tidak ada di
      // katalog sekarang, dan tidak bisa ditampilkan sebagai satu kartu tanpa
      // memilih dua kali. Dibiarkan terpisah — kartu berlebih jauh lebih baik
      // daripada kartu yang menyembunyikan separuh menunya.
      kindByKey.set(key, null);
    }
  }

  // Langkah 2 — susun kartunya.
  const entries: ProductEntry[] = [];
  const byKey = new Map<string, ProductEntry>();

  for (const { product, marker } of marked) {
    const key = keyOf(product, marker);
    const kind = kindByKey.get(key) ?? null;

    // Produk tanpa akhiran mendapat arti dari jenis grupnya di sini, dan hanya
    // di sini. Poros topping sengaja tidak ikut: di sana bahkan pilihan
    // dasarnya ditulis "Polos", jadi nama tanpa akhiran bukan preset apa pun
    // dan tidak punya harga — ia berdiri sendiri sebagai kartu biasa.
    const value =
      marker.value ?? (kind === "suhu" ? "panas" : kind === "saus" ? "ori" : null);

    const existing = kind && value ? byKey.get(key) : undefined;

    // Kalau varian yang sama sudah terisi, dua produk ini bukan pasangan
    // (nama dasarnya kebetulan sama). Biarkan berdiri sendiri daripada
    // memunculkan lembar dengan dua tombol "Panas".
    if (existing && value && !existing.options.some((o) => o.value === value)) {
      existing.options.push({ product, value, label: labelOf(kind!, value) });
      existing.minPrice = Math.min(existing.minPrice, product.price);
      existing.maxPrice = Math.max(existing.maxPrice, product.price);
      continue;
    }

    // Hanya kartu yang benar-benar memimpin sebuah grup yang boleh memakai
    // kunci grup; sisanya memakai id produknya sendiri.
    //
    // Bedanya baru terasa sejak topping bisa dicentang bebas. Satu produk
    // berakhiran topping sudah cukup membuat SELURUH saudara senama bertanda
    // "topping" — "Bubur Polos" menandai Bubur Ayam, Bubur Sapi, Bubur Teri;
    // "Nasi Goreng Sosis" menandai enam nasi goreng lainnya. Saudara-saudara
    // itu tidak punya nilai varian, jadi tidak ikut digabung, tetapi dulu
    // mereka tetap memakai kunci grup — dan tujuh kartu berbeda berbagi satu
    // kunci. React lalu melihat tujuh anak berkunci sama, dan kartu yang
    // ditekan bukan selalu kartu yang muncul di lembar variannya.
    const anchor = Boolean(kind && value && !existing);
    const entry: ProductEntry = {
      key: anchor ? key : product.id,
      label: marker.base,
      minPrice: product.price,
      maxPrice: product.price,
      kind,
      options: [
        {
          product,
          value: value ?? "",
          label: kind && value ? labelOf(kind, value) : "",
        },
      ],
      defaultValue: null,
      extra: null,
      note: null,
    };
    if (anchor) byKey.set(key, entry);
    entries.push(entry);
  }

  // Langkah 3 — urutkan pilihan, dan tentukan mana yang tersorot lebih dulu.
  for (const entry of entries) {
    if (entry.options.length > 1) {
      if (entry.kind === "suhu") {
        // Panas selalu di kiri supaya posisi tombol tidak berpindah-pindah antar
        // menu — kasir menekan berdasarkan hafalan posisi saat ramai.
        entry.options.sort((a, b) => (a.value === "panas" ? -1 : 1));
      } else if (entry.kind === "topping") {
        entry.options.sort(
          (a, b) =>
            (TOPPING_ORDER.get(a.value) ?? 99) - (TOPPING_ORDER.get(b.value) ?? 99)
        );
        // Polos jadi sorotan awal hanya kalau ia memang ada, sama seperti Ori.
        // Di layar sorotan itu berupa tiga kotak kosong, dan itu memang keadaan
        // yang benar sebelum kasir mencentang apa pun.
        if (entry.options.some((o) => o.value === "polos")) {
          entry.defaultValue = "polos";
        }
        // Jenis kuah ditempelkan dari nama dasarnya, bukan dari kategori:
        // Indomie Goreng dan Indomie Kuah sama-sama di kategori INDOMIE, dan
        // hanya yang berkuah yang punya pilihan ini.
        if (/\bkuah\b/i.test(entry.label)) entry.extra = JENIS_KUAH;
      } else {
        entry.options.sort(
          (a, b) =>
            (SAUS_ORDER.get(a.value) ?? 99) - (SAUS_ORDER.get(b.value) ?? 99)
        );
        // Ori hanya jadi sorotan awal kalau ia memang ada. Grup yang entah
        // bagaimana hanya berisi saus tidak boleh menyorot varian berbayar
        // lebih mahal tanpa kasir memilihnya.
        if (entry.options.some((o) => o.value === "ori")) {
          entry.defaultValue = "ori";
        }
      }
      continue;
    }
    // Hanya satu varian yang tersedia (mis. "Kopi Cendol S" tanpa versi panas).
    // Namanya dikembalikan utuh supaya kasir tahu ia tidak sedang memilih.
    entry.label = entry.options[0].product.name;
    entry.kind = null;
  }

  return entries;
}

/**
 * Menyaring kartu menurut kata kunci — SETELAH pengelompokan, tidak pernah
 * sebelumnya.
 *
 * Urutannya bukan selera. Menyaring daftar produk mentah lalu mengelompokkan
 * sisanya akan merobek keluarga varian, dan robekannya gagal dengan diam:
 *
 *   - Kata "telur" cocok dengan tujuh dari delapan kombinasi topping Indomie
 *     Goreng. Kartunya tetap muncul, tapi kotak yang hanya "Sosis" tidak lagi
 *     punya baris produk dan mati tanpa sebab yang terlihat kasir.
 *   - Kalau yang lolos tinggal satu, langkah 3 di groupProductVariants
 *     mengembalikannya jadi kartu biasa bernama lengkap. "Indomie Goreng Telur"
 *     lalu berdiri sendiri tanpa topping sama sekali — itu justru perilaku yang
 *     benar untuk "Kopi Cendol S", dan salah total di sini.
 *
 * Yang kedua pernah benar-benar tampil di layar Edit Order, lewat pemotongan
 * `products.slice(0, 30)`: kode "138" dan "139" mengurut paling atas secara
 * teks sementara saudaranya "K130".."K137" ada jauh di bawah, jadi dua kartu
 * pertama layar itu adalah dua mi telur yatim.
 *
 * Sebuah kartu cocok kalau nama dasarnya, atau nama/kode salah satu variannya,
 * mengandung kata kunci. Jadi mengetik "K137" tetap menemukan kartunya, dan
 * kartu yang ditemukan selalu utuh beserta seluruh pilihannya.
 *
 * Penyaringan per kategori tidak lewat sini dan memang tidak perlu: kunci grup
 * sudah menyertakan category_id, jadi satu keluarga varian tidak pernah
 * terbelah antar kategori.
 */
export function filterProductEntries(
  entries: ProductEntry[],
  keyword: string
): ProductEntry[] {
  const needle = keyword.trim().toLowerCase();
  if (!needle) return entries;

  return entries.filter(
    (entry) =>
      entry.label.toLowerCase().includes(needle) ||
      entry.options.some(
        (option) =>
          option.product.name.toLowerCase().includes(needle) ||
          option.product.code.toLowerCase().includes(needle)
      )
  );
}
