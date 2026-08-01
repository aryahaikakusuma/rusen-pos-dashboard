/**
 * Periksa pengelompokan varian atas katalog seed, tanpa perangkat.
 *
 * Membuktikan poros saus dan poros topping tidak merusak poros suhu.
 */

import {
  filterProductEntries,
  groupProductVariants,
  TOPPING_BOXES,
  toppingMask,
  toppingValue,
} from "../lib/product-variants";
import type { ProductRow } from "../db/types";

// Tipe Node dideklarasikan seperlunya di sini, bukan lewat @types/node.
// Proyek ini tidak memasangnya, dan satu skrip pemeriksa tidak cukup alasan
// untuk menambah dependensi ke seluruh proyek.
declare const require: (m: string) => any;
declare const process: { cwd(): string; exitCode?: number };

const { readFileSync } = require("node:fs") as {
  readFileSync: (path: string, encoding: string) => string;
};

// Dijalankan dari dalam mobile/.
const seed = readFileSync(`${process.cwd()}/../supabase/seed.sql`, "utf8");

const rows: ProductRow[] = [];
const baris = /^\s*\('([A-Z]+)'\s*,\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*(\d+)\)/gm;
for (const m of seed.matchAll(baris)) {
  rows.push({
    id: m[2],
    outlet_id: "o",
    category_id: m[1],
    code: m[2],
    name: m[3],
    price: Number(m[4]),
    active: 1,
  });
}

const entries = groupProductVariants(rows);
const gabungan = entries.filter((e) => e.options.length > 1);

console.log(`produk: ${rows.length}`);
console.log(`kartu : ${entries.length}`);
console.log(`  suhu: ${gabungan.filter((e) => e.kind === "suhu").length}`);
console.log(`  saus: ${gabungan.filter((e) => e.kind === "saus").length}`);
console.log(`  topping: ${gabungan.filter((e) => e.kind === "topping").length}`);

let gagal = 0;
const cek = (nama: string, syarat: boolean, detail = "") => {
  if (syarat) return;
  console.log(`GAGAL ${nama} ${detail}`);
  gagal += 1;
};

const semua = entries.flatMap((e) => e.options.map((o) => o.product.id));
cek(
  "tiap produk terwakili tepat sekali",
  semua.length === rows.length && new Set(semua).size === rows.length,
  `${rows.length} → ${semua.length} (${new Set(semua).size} unik)`
);

for (const e of gabungan) {
  cek(
    "tidak ada varian kembar",
    new Set(e.options.map((o) => o.value)).size === e.options.length,
    e.label
  );
  cek("kartu gabungan punya poros", e.kind !== null, e.label);
  if (e.kind === "suhu") {
    cek("panas pertama", e.options[0].value === "panas", e.label);
    cek("suhu tanpa bawaan", e.defaultValue === null, e.label);
  } else if (e.kind === "topping") {
    cek("polos pertama", e.options[0].value === "polos", e.label);
    cek("polos jadi bawaan", e.defaultValue === "polos", e.label);
    // Ketiga kotak bebas berarti kedelapan kombinasinya harus punya baris
    // produk. Yang kurang tidak menimbulkan error — kotaknya hanya mati di
    // layar, dan kasir mengira menunya memang tidak ada.
    cek("delapan kombinasi topping", e.options.length === 8, e.label);
    // Harga harus benar-benar penjumlahan. Satu baris yang harganya salah ketik
    // tetap tampil wajar di layar: kasir tidak hafal 24 angka, dan selisihnya
    // baru ketahuan saat laporan tidak cocok dengan laci.
    const harga = new Map(e.options.map((o) => [o.value, o.product.price]));
    const dasar = harga.get("polos");
    const tambahan = TOPPING_BOXES.map(
      (_, bit) => (harga.get(toppingValue(1 << bit)) ?? NaN) - (dasar ?? NaN)
    );
    cek(
      "harga topping menjumlah",
      e.options.every((o) => {
        const mask = toppingMask(o.value);
        const jumlah = tambahan.reduce(
          (n, t, bit) => n + (mask & (1 << bit) ? t : 0),
          dasar ?? NaN
        );
        return o.product.price === jumlah;
      }),
      e.label
    );
    cek(
      "jenis kuah hanya di menu berkuah",
      Boolean(e.extra) === /\bkuah\b/i.test(e.label),
      e.label
    );
  } else {
    cek("ori pertama", e.options[0].value === "ori", e.label);
    cek("ori jadi bawaan", e.defaultValue === "ori", e.label);
  }
}

// Penyaringan dan pembatasan harus bekerja atas KARTU, bukan atas daftar
// produk. Dulu tidak: layar Edit Order memotong `products.slice(0, 30)` sebelum
// mengelompokkan, dan karena kode "138"/"139" mengurut paling atas secara teks
// sementara saudaranya "K130".."K137" tidak ikut terpotong, dua kartu pertama
// layar itu adalah "Indomie Goreng Telur" dan "Indomie Kuah Telur" — berdiri
// sendiri, tanpa satu pun kotak topping, tanpa error di mana pun.
//
// Ketiga pemeriksaan di bawah adalah bentuk kegagalan itu, dikunci.
{
  // 1. Gejalanya sendiri: tidak boleh ada kartu yang namanya justru nama
  //    lengkap sebuah varian topping. Kartu semacam itu berarti keluarganya
  //    terpecah — nama itu hanya muncul lewat langkah 3 groupProductVariants,
  //    yang mengembalikan nama utuh saat sebuah grup tinggal satu opsi.
  const yatim = gabungan.filter((e) =>
    /^Indomie (Goreng|Kuah) (Polos|Sayur|Telur|Sosis)/i.test(e.label)
  );
  cek(
    "tidak ada kartu varian topping yang yatim",
    yatim.length === 0,
    yatim.map((e) => e.label).join(", ")
  );

  // 2. Mencari "telur" harus memberi kartu Indomie yang UTUH — kedelapan
  //    kombinasinya — bukan hanya tujuh yang namanya kebetulan memuat "telur".
  //    Kalau ini gagal, kotak "Sosis" saja mati di layar tanpa sebab terlihat.
  for (const label of ["Indomie Goreng", "Indomie Kuah"]) {
    const asli = gabungan.find((e) => e.label === label);
    const dicari = filterProductEntries(gabungan, "telur").find(
      (e) => e.label === label
    );
    cek(
      `pencarian "telur" tidak merobek ${label}`,
      Boolean(dicari) && dicari!.options.length === asli?.options.length,
      `${dicari?.options.length ?? 0} dari ${asli?.options.length ?? 0} opsi`
    );
  }

  // 3. Kode varian tetap bisa dicari, dan yang ditemukan adalah kartu utuhnya —
  //    bukan satu varian yatim bernama lengkap.
  const lewatKode = filterProductEntries(gabungan, "K137");
  cek(
    "mencari kode varian menemukan kartu utuhnya",
    lewatKode.length === 1 &&
      lewatKode[0].label === "Indomie Goreng" &&
      lewatKode[0].options.length === 8,
    lewatKode.map((e) => `${e.label}(${e.options.length})`).join(", ")
  );
}

for (const e of gabungan.filter((x) => x.kind === "saus" || x.kind === "topping")) {
  console.log(`\n${e.label}  (bawaan: ${e.defaultValue})`);
  for (const o of e.options) {
    console.log(`  ${o.label.padEnd(22)} ${o.product.price}  ${o.product.code}`);
  }
  if (e.extra) {
    const pilihan = e.extra.options.map((o) => o.label).join(" / ");
    console.log(`  + ${e.extra.label}: ${pilihan}`);
  }
}

console.log(gagal === 0 ? "\nSemua pemeriksaan lolos." : `\n${gagal} GAGAL`);
process.exitCode = gagal === 0 ? 0 : 1;
