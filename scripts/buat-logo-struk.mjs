/**
 * Ubah berkas logo menjadi bitmap 1-bit siap cetak untuk struk termal.
 *
 *   node scripts/buat-logo-struk.mjs <berkas-logo> [lebar-titik]
 *   node scripts/buat-logo-struk.mjs logo-rusen.png 256
 *
 * Hasilnya ditulis ke mobile/lib/receipt-logo.ts sebagai deretan byte.
 *
 * KENAPA DIKONVERSI SAAT BUILD, BUKAN SAAT MENCETAK. React Native tidak punya
 * pembaca PNG, dan menambah pustaka pengolah gambar ke aplikasi kasir demi satu
 * logo yang tidak pernah berubah itu ongkos yang dibayar terus-menerus untuk
 * pekerjaan yang cukup dilakukan sekali. Aplikasi cukup mengirim byte yang sudah
 * jadi. Tidak ada dependensi baru di mobile/, tidak ada kerja berat saat kasir
 * menekan cetak.
 *
 * sharp dipakai dari node_modules root — ia sudah ada di sana sebagai bawaan
 * Next.js, jadi alat ini pun tidak menambah apa-apa.
 *
 * Printer termal TIDAK punya gradasi: tiap titik hitam atau putih. Gradien,
 * bayangan, warna muda, dan garis tipis akan hilang atau menggumpal. Karena itu
 * skrip ini mencetak pratinjau ASCII di terminal — logo yang salah ambangnya
 * terlihat di layar, bukan setelah lima lembar kertas terbuang.
 */

import sharp from "sharp";
import { writeFileSync } from "node:fs";
import { basename } from "node:path";

const argumen = process.argv.slice(2);
const balik = argumen.includes("--balik");
const [berkas, lebarArg, ambangArg] = argumen.filter((a) => !a.startsWith("--"));

if (!berkas) {
  console.error(
    "Pakai: node scripts/buat-logo-struk.mjs <berkas-logo> [lebar-titik] [ambang] [--balik]\n" +
      "  lebar-titik : 384 maksimum (kertas 58mm), bawaan 384\n" +
      "  ambang      : 0-255, bawaan 128. Naikkan kalau logo terlalu tipis,\n" +
      "                turunkan kalau menggumpal jadi balok.\n" +
      "  --balik     : untuk logo terang di atas latar gelap"
  );
  process.exit(1);
}

/** Kertas 58mm = 384 titik pada kepala cetak. Tidak bisa lebih. */
const LEBAR_MAKS = 384;

const lebar = Math.min(Number(lebarArg) || LEBAR_MAKS, LEBAR_MAKS);
// Kelipatan 8: satu byte berisi 8 titik, dan sisa titik hanya jadi kolom kosong
// di kanan yang membuat logo tidak benar-benar di tengah.
const lebarTitik = Math.floor(lebar / 8) * 8;

const gambar = sharp(berkas)
  // Latar transparan jadi PUTIH, bukan hitam. Tanpa ini logo PNG transparan
  // keluar sebagai kotak hitam pekat selebar kertas.
  .flatten({ background: "#ffffff" })
  // Buang bingkai kosong di sekeliling logo. Berkas logo hampir selalu punya
  // ruang kosong, dan ruang itu ikut diperbesar ke lebar kertas — logonya jadi
  // kecil di tengah sambil memakan kertas yang tidak perlu.
  .trim()
  .greyscale()
  // Kontras direntangkan sebelum dipotong: logo yang aslinya abu-abu muda tidak
  // punya cukup jarak dari putih untuk dipotong dengan bersih apa adanya.
  .normalise()
  .resize({ width: lebarTitik, fit: "inside", withoutEnlargement: false });

const { data, info } = await gambar.raw().toBuffer({ resolveWithObject: true });

const tinggi = info.height;
const bytePerBaris = lebarTitik / 8;
const keluaran = new Uint8Array(bytePerBaris * tinggi);

// Satu ambang, bukan dithering: logo adalah bentuk, bukan foto, dan dithering
// pada garis tegas justru membuatnya terlihat kotor di kertas kasar.
const AMBANG = Number(ambangArg) || 128;

for (let y = 0; y < tinggi; y += 1) {
  for (let x = 0; x < lebarTitik; x += 1) {
    const asli = data[y * info.width + x] ?? 255;
    const piksel = balik ? 255 - asli : asli;
    if (piksel >= AMBANG) continue; // terang = tidak dicetak
    // Bit 1 berarti titik hitam. Bit paling kiri = titik paling kiri.
    keluaran[y * bytePerBaris + (x >> 3)] |= 0x80 >> (x & 7);
  }
}

// Pratinjau di terminal. Dimampatkan supaya muat di layar, jadi ini gambaran
// kasar bentuknya — cukup untuk melihat logo yang jadi gumpalan atau lenyap.
const langkahX = Math.ceil(lebarTitik / 64);
const langkahY = langkahX * 2;
console.log(`\n${basename(berkas)} -> ${lebarTitik} x ${tinggi} titik, ${keluaran.length} byte\n`);
for (let y = 0; y < tinggi; y += langkahY) {
  let baris = "";
  for (let x = 0; x < lebarTitik; x += langkahX) {
    const bit = keluaran[y * bytePerBaris + (x >> 3)] & (0x80 >> (x & 7));
    baris += bit ? "#" : " ";
  }
  console.log(baris);
}

const hitam = [...keluaran].reduce((n, b) => n + b.toString(2).replace(/0/g, "").length, 0);
const rasio = Math.round((hitam / (lebarTitik * tinggi)) * 100);
console.log(`\nTitik hitam: ${rasio}% dari bidang logo.`);
if (rasio > 60) {
  console.log(
    `Terlalu pekat — logo akan keluar seperti balok.\n` +
      `  Coba ambang lebih rendah: ... ${lebarTitik} ${Math.max(40, AMBANG - 40)}` +
      (balik ? "" : `\n  Atau logo ini terang di atas latar gelap: tambahkan --balik`)
  );
}
if (rasio < 3) {
  console.log(
    `Terlalu tipis — hampir tidak ada yang tercetak.\n` +
      `  Coba ambang lebih tinggi: ... ${lebarTitik} ${Math.min(220, AMBANG + 40)}` +
      (balik ? "" : `\n  Atau logo ini terang di atas latar gelap: tambahkan --balik`)
  );
}

const tujuan = "mobile/lib/receipt-logo.ts";
const isi = `// DIHASILKAN OLEH scripts/buat-logo-struk.mjs — jangan disunting tangan.
// Sumber: ${basename(berkas)} (${lebarTitik} x ${tinggi} titik)
//
// Bitmap 1-bit untuk perintah raster ESC/POS. Satu bit satu titik, bit 1 hitam,
// disusun per baris dari kiri ke kanan. Lihat receipt.ts untuk pengirimannya.
//
// Untuk mencetak TANPA logo, ganti seluruh isi berkas ini dengan:
//   export const receiptLogo = null;
// Tipenya sengaja tidak tinggal di sini — berkas ini ditimpa tiap konversi.

export const receiptLogo = {
  width: ${lebarTitik},
  height: ${tinggi},
  data: [${[...keluaran].join(",")}],
} as const;
`;

writeFileSync(tujuan, isi);
console.log(`\nDitulis ke ${tujuan}`);
