/**
 * Perkecil logo struk yang SUDAH jadi bitmap 1-bit.
 *
 *   node scripts/kecilkan-logo-struk.mjs [lebar-titik] [ambang]
 *   node scripts/kecilkan-logo-struk.mjs 192
 *
 * Bedanya dengan buat-logo-struk.mjs: yang itu berangkat dari berkas gambar
 * asli, yang ini dari mobile/lib/receipt-logo.ts. Ia ada karena berkas logo
 * aslinya tidak pernah ikut masuk repo, sehingga bitmap yang sudah dihasilkan
 * itulah satu-satunya salinan logo yang tersisa. Kalau berkas aslinya ketemu
 * lagi, pakai buat-logo-struk.mjs — mengecilkan dari sumber selalu lebih tajam
 * daripada mengecilkan dari hasil yang sudah dipotong jadi hitam-putih.
 *
 * Bit dikembangkan dulu jadi satu byte per titik supaya sharp bisa menghaluskan
 * saat mengecilkan, lalu dipotong ulang jadi 1-bit. Mengambil satu titik dari
 * tiap blok tanpa penghalusan akan memutus garis tipis: pada logo bundar
 * berhuruf kecil, itu artinya tulisannya hilang sebagian dan yang tersisa
 * terlihat seperti kotor, bukan seperti logo yang mengecil.
 */

import sharp from "sharp";
import { readFileSync, writeFileSync } from "node:fs";

const BERKAS = "mobile/lib/receipt-logo.ts";

const [lebarArg, ambangArg] = process.argv.slice(2);
const AMBANG = Number(ambangArg) || 128;

const sumber = readFileSync(BERKAS, "utf8");

const angka = (nama) => {
  const cocok = sumber.match(new RegExp(`${nama}:\\s*(\\d+)`));
  if (!cocok) throw new Error(`Tidak menemukan ${nama} di ${BERKAS}`);
  return Number(cocok[1]);
};

const lebarAsli = angka("width");
const tinggiAsli = angka("height");

const dataCocok = sumber.match(/data:\s*\[([^\]]*)\]/);
if (!dataCocok) throw new Error(`Tidak menemukan data di ${BERKAS}`);
const dataAsli = dataCocok[1].split(",").map((n) => Number(n.trim()));

const bytePerBarisAsli = Math.ceil(lebarAsli / 8);
if (dataAsli.length !== bytePerBarisAsli * tinggiAsli) {
  throw new Error(
    `Ukuran data tidak cocok: ${dataAsli.length} byte, ` +
      `seharusnya ${bytePerBarisAsli * tinggiAsli}`
  );
}

// Satu byte per titik, 0 = hitam, 255 = putih — urutan yang dimengerti sharp
// sebagai greyscale. Bit 1 pada bitmap berarti hitam, jadi nilainya dibalik.
const abu = Buffer.alloc(lebarAsli * tinggiAsli, 255);
for (let y = 0; y < tinggiAsli; y += 1) {
  for (let x = 0; x < lebarAsli; x += 1) {
    const bit = dataAsli[y * bytePerBarisAsli + (x >> 3)] & (0x80 >> (x & 7));
    if (bit) abu[y * lebarAsli + x] = 0;
  }
}

const LEBAR_MAKS = 384;
const diminta = Math.min(Number(lebarArg) || 192, LEBAR_MAKS);
// Kelipatan 8: satu byte delapan titik. Sisa titik hanya jadi kolom kosong di
// kanan, yang membuat logo tidak benar-benar berada di tengah kertas.
const lebar = Math.floor(diminta / 8) * 8;
const tinggi = Math.max(1, Math.round((tinggiAsli * lebar) / lebarAsli));

const { data: kecil, info } = await sharp(abu, {
  raw: { width: lebarAsli, height: tinggiAsli, channels: 1 },
})
  .resize(lebar, tinggi, { fit: "fill" })
  .raw()
  .toBuffer({ resolveWithObject: true });

// Dibaca memakai bentuk yang DIKEMBALIKAN sharp, bukan yang diminta. Masukannya
// satu kanal, tapi keluarannya tiga: sharp menaikkan raw greyscale ke sRGB saat
// mengecilkan. Membacanya sebagai satu byte per titik menggeser tiap baris
// berikutnya, dan logonya keluar sebagai pita miring — terlihat seperti gambar
// yang hancur dikecilkan, padahal yang salah cuma cara membacanya kembali.
const lebarBaca = info.width;
const kanal = info.channels;
if (info.height < tinggi) {
  throw new Error(`sharp mengembalikan ${info.width} x ${info.height} titik`);
}

const bytePerBaris = lebar / 8;
const keluaran = new Uint8Array(bytePerBaris * tinggi);
for (let y = 0; y < tinggi; y += 1) {
  for (let x = 0; x < lebar; x += 1) {
    // terang = tidak dicetak
    if (kecil[(y * lebarBaca + x) * kanal] >= AMBANG) continue;
    keluaran[y * bytePerBaris + (x >> 3)] |= 0x80 >> (x & 7);
  }
}

// Pratinjau, dengan alasan yang sama seperti di buat-logo-struk.mjs: logo yang
// pecah karena dikecilkan terlalu jauh terlihat di layar, bukan setelah lima
// lembar kertas terbuang.
const langkahX = Math.max(1, Math.ceil(lebar / 64));
const langkahY = langkahX * 2;
console.log(
  `\n${lebarAsli} x ${tinggiAsli} -> ${lebar} x ${tinggi} titik, ` +
    `${dataAsli.length} -> ${keluaran.length} byte\n`
);
for (let y = 0; y < tinggi; y += langkahY) {
  let baris = "";
  for (let x = 0; x < lebar; x += langkahX) {
    baris += keluaran[y * bytePerBaris + (x >> 3)] & (0x80 >> (x & 7)) ? "#" : " ";
  }
  console.log(baris);
}

const hitam = [...keluaran].reduce(
  (n, b) => n + b.toString(2).replace(/0/g, "").length,
  0
);
console.log(`\nTitik hitam: ${Math.round((hitam / (lebar * tinggi)) * 100)}%`);

writeFileSync(
  BERKAS,
  `// DIHASILKAN OLEH scripts/kecilkan-logo-struk.mjs — jangan disunting tangan.
// Sumber: ${BERKAS} pada ${lebarAsli} x ${tinggiAsli} titik, dikecilkan ke ${lebar}.
//
// Bitmap 1-bit untuk perintah raster ESC/POS. Satu bit satu titik, bit 1 hitam,
// disusun per baris dari kiri ke kanan. Lihat receipt.ts untuk pengirimannya.
//
// Untuk mencetak TANPA logo, ganti seluruh isi berkas ini dengan:
//   export const receiptLogo = null;
// Tipenya sengaja tidak tinggal di sini — berkas ini ditimpa tiap konversi.

export const receiptLogo = {
  width: ${lebar},
  height: ${tinggi},
  data: [${[...keluaran].join(",")}],
} as const;
`
);
console.log(`\nDitulis ke ${BERKAS}`);
