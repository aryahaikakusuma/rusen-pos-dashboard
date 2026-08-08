/**
 * Uji kecocokan silang tiga halaman laporan dan berkas xlsx-nya.
 *
 *   npm run dev                       # di terminal lain
 *   npm run periksa:laporan           # bulan berjalan
 *   npm run periksa:laporan 2026-08-01 2026-08-31
 *
 * APA YANG DIUJI, DAN KENAPA INI PERLU ADA
 *
 * Penjualan Harian, Detail Penjualan, dan Laporan Produk berasal dari tiga
 * fungsi Postgres yang berbeda dengan grain yang berbeda — per tanggal, per
 * order, per varian. Ketiganya WAJIB menjumlah ke angka yang sama di satu
 * sumbu: omzet kotor pra-pajak (`orders.subtotal`). Itu satu-satunya sumbu yang
 * bisa, karena `orders.total` sudah termasuk PBJT sedangkan `order_items` tidak
 * punya pajak sama sekali.
 *
 * Kalau ketiganya suatu saat berbeda, tidak ada yang error. Layar tetap
 * menampilkan angka yang tampak wajar, berkas tetap terunduh, dan yang ketahuan
 * lebih dulu adalah laporan pajak daerah atau isi laci yang tidak cocok. Itu
 * kelas kegagalan yang hanya bisa ditangkap oleh pemeriksaan seperti ini.
 *
 * Berkas xlsx ikut diuji karena ia yang beredar di WhatsApp. Berkas yang isinya
 * berbeda dari layar adalah kegagalan yang paling lama tidak ketahuan.
 *
 * CATATAN SESI. Skrip menandatangani cookie sesinya sendiri dengan
 * SESSION_SECRET dari .env.local, supaya seluruh permintaan menempuh route yang
 * persis sama dengan yang dipakai browser — termasuk `jaga()` di dalamnya.
 * Karena itu ia hanya jalan di mesin yang punya berkas .env.local, dan berkas
 * itu memang tidak pernah masuk repositori.
 */
import fs from "node:fs";
import { SignJWT } from "jose";
import ExcelJS from "exceljs";

const env = fs.readFileSync(".env.local", "utf8");
const ambilEnv = (k) => (env.match(new RegExp("^" + k + "=(.*)$", "m")) || [])[1];

const hariIni = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Jakarta",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());

const DARI = process.argv[2] ?? `${hariIni.slice(0, 8)}01`;
const SAMPAI = process.argv[3] ?? hariIni;
const ASAL = process.env.ASAL ?? "http://localhost:3000";

const rahasia = ambilEnv("SESSION_SECRET");
if (!rahasia) {
  console.error("SESSION_SECRET tidak ada di .env.local.");
  process.exit(2);
}

const token = await new SignJWT({ email: "periksa@lokal" })
  .setProtectedHeader({ alg: "HS256" })
  .setSubject("00000000-0000-0000-0000-000000000000")
  .setIssuedAt()
  .setExpirationTime("10m")
  .sign(new TextEncoder().encode(rahasia));

const kepala = { Cookie: `rusen_session=${token}` };
const rentang = `dari=${DARI}&sampai=${SAMPAI}`;

async function json(alamat) {
  const r = await fetch(`${ASAL}${alamat}`, { headers: kepala });
  if (!r.ok) throw new Error(`${alamat} -> ${r.status} ${await r.text()}`);
  return r.json();
}

const rp = (n) => "Rp " + n.toLocaleString("id-ID");

/* ------------------------------------------------------- 1. Penjualan Harian */
const harian = await json(`/api/laporan/harian?${rentang}`);
const H = harian.baris.reduce(
  (a, b) => ({
    order: a.order + b.jumlah_order,
    omzet: a.omzet + b.omzet_kotor,
    dasar: a.dasar + b.dasar_pbjt,
    pbjt: a.pbjt + b.pbjt,
    bebas: a.bebas + b.omzet_bebas_order,
    bukanObjek: a.bukanObjek + b.omzet_bukan_objek,
    tertagih: a.tertagih + b.tertagih,
    tunai: a.tunai + b.tertagih_tunai,
    nonTunai: a.nonTunai + b.tertagih_non_tunai,
    refund: a.refund + b.total_refund,
  }),
  { order: 0, omzet: 0, dasar: 0, pbjt: 0, bebas: 0, bukanObjek: 0, tertagih: 0, tunai: 0, nonTunai: 0, refund: 0 }
);

/* --------------------------------------- 2. Detail Penjualan, seluruh halaman */
const detail = [];
let halaman = 1;
let totalBaris = 0;
for (;;) {
  const h = await json(`/api/laporan/detail?${rentang}&halaman=${halaman}&limit=100`);
  totalBaris = h.totalBaris;
  detail.push(...h.baris);
  if (detail.length >= totalBaris || h.baris.length === 0) break;
  halaman++;
}
const D = detail.reduce(
  (a, b) => ({
    subtotal: a.subtotal + b.subtotal,
    dasar: a.dasar + b.dasar_pbjt,
    pbjt: a.pbjt + b.pbjt,
    total: a.total + b.total,
    bebas: a.bebas + (b.status_pajak === "exempt" ? b.subtotal : 0),
    // Dasar pengenaan HANYA dari order yang benar-benar dipungut.
    //
    // Kolom `dasar_pbjt` di Detail adalah `orders.taxable_subtotal` apa adanya,
    // dan kolom itu tetap terisi pada order yang dibebaskan — ia menjawab
    // "berapa nilai barang yang sebenarnya objek pajak di order ini", bukan
    // "berapa yang dikenakan". Laporan Harian menyaring ke `tax_status =
    // 'taxable'`, karena yang dilaporkan ke Bapenda adalah yang dipungut.
    // Menjumlahkan keduanya tanpa saringan ini melebih-lebihkan dasar pengenaan
    // sebesar nilai objek pajak di dalam order yang dibebaskan.
    dasarDipungut: a.dasarDipungut + (b.status_pajak === "taxable" ? b.dasar_pbjt : 0),
  }),
  { subtotal: 0, dasar: 0, pbjt: 0, total: 0, bebas: 0, dasarDipungut: 0 }
);

/* -------------------------------------------------------- 3. Laporan Produk */
const produk = await json(`/api/laporan/produk?${rentang}`);
const P = produk.baris.reduce(
  (a, b) => ({
    omzet: a.omzet + b.omzet,
    terjual: a.terjual + b.terjual,
    persen: a.persen + (b.kontribusi_persen ?? 0),
  }),
  { omzet: 0, terjual: 0, persen: 0 }
);

/* ----------------------------------------------------------- 4. Berkas xlsx */
async function unduh(jenis) {
  const r = await fetch(`${ASAL}/api/export/${jenis}?${rentang}`, { headers: kepala });
  if (!r.ok) throw new Error(`export ${jenis} -> ${r.status}`);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(await r.arrayBuffer()));
  return {
    wb,
    disposisi: r.headers.get("Content-Disposition"),
    tipe: r.headers.get("Content-Type"),
  };
}

const xh = await unduh("harian");
const xd = await unduh("detail");
const xp = await unduh("produk");

/** Baris TOTAL: baris terakhir yang sel pertamanya diawali "TOTAL". */
function barisTotal(sheet) {
  let hasil = null;
  sheet.eachRow((row) => {
    const a = row.getCell(1).value;
    if (typeof a === "string" && a.startsWith("TOTAL")) hasil = row;
  });
  return hasil;
}
const n = (row, i) => Number(row.getCell(i).value ?? 0);

const th = barisTotal(xh.wb.getWorksheet("Penjualan Harian"));
const td = barisTotal(xd.wb.getWorksheet("Detail Penjualan"));
const tp = barisTotal(xp.wb.getWorksheet("Laporan Produk"));

const X = {
  harian: { order: n(th, 3), omzet: n(th, 4), dasar: n(th, 5), pbjt: n(th, 6), bebas: n(th, 7), bukanObjek: n(th, 8), refund: n(th, 9), tertagih: n(th, 11) },
  detail: { subtotal: n(td, 6), dasar: n(td, 7), pbjt: n(td, 8), total: n(td, 9) },
  produk: { terjual: n(tp, 4), omzet: n(tp, 5) },
};

/* ------------------------------------------------------------------ periksa */
const uji = [];
const cek = (nama, a, b) => uji.push({ nama, a, b, cocok: a === b });

// Sumbu gate: omzet kotor pra-pajak. Tiga grain, satu angka.
cek("Harian.omzet_kotor = Detail.subtotal", H.omzet, D.subtotal);
cek("Harian.omzet_kotor = Produk.omzet", H.omzet, P.omzet);
cek("Harian.omzet_kotor = xlsx Harian", H.omzet, X.harian.omzet);
cek("Detail.subtotal = xlsx Detail", D.subtotal, X.detail.subtotal);
cek("Produk.omzet = xlsx Produk", P.omzet, X.produk.omzet);

// Sumbu tertagih: hanya antara Harian dan Detail — Produk tidak punya pajak.
cek("Harian.tertagih = Detail.total", H.tertagih, D.total);
cek("Harian.tertagih = omzet + pbjt", H.tertagih, H.omzet + H.pbjt);
cek("Harian tunai + non-tunai = tertagih", H.tunai + H.nonTunai, H.tertagih);

cek("Harian.pbjt = Detail.pbjt", H.pbjt, D.pbjt);
cek("Harian.dasar_pbjt = Detail(taxable).dasar_pbjt", H.dasar, D.dasarDipungut);
// Selisihnya bukan kesalahan, dan diuji supaya tetap begitu: nilai objek pajak
// di dalam order yang dibebaskan tidak boleh ikut jadi dasar pengenaan.
cek(
  "dasar seluruh order - dasar dipungut = objek di order bebas",
  D.dasar - D.dasarDipungut,
  D.dasar - H.dasar
);
cek("Harian.pbjt = xlsx Harian", H.pbjt, X.harian.pbjt);
cek("Detail.pbjt = xlsx Detail", D.pbjt, X.detail.pbjt);
cek("Harian.dasar_pbjt = xlsx Detail", H.dasar, X.detail.dasar);

// Invariant 0027: omzet_kotor = dasar_pbjt + bebas_order + bukan_objek.
cek("omzet = dasar + bebas_order + bukan_objek", H.omzet, H.dasar + H.bebas + H.bukanObjek);
cek("Harian.bebas_order = Detail(exempt).subtotal", H.bebas, D.bebas);

cek("Harian.jumlah_order = baris Detail terambil", H.order, detail.length);
cek("Harian.jumlah_order = total_baris Detail", H.order, totalBaris);
cek("Produk.terjual = xlsx Produk", P.terjual, X.produk.terjual);

// Berkas harus dikirim sebagai lampiran spreadsheet, bukan ditampilkan sebagai
// teks acak di tab browser.
for (const [nama, x] of [["harian", xh], ["detail", xd], ["produk", xp]]) {
  uji.push({
    nama: `xlsx ${nama}: Content-Disposition attachment`,
    a: /^attachment; filename="Rusen_.+\.xlsx"$/.test(x.disposisi ?? "") ? "ya" : x.disposisi,
    b: "ya",
    cocok: /^attachment; filename="Rusen_.+\.xlsx"$/.test(x.disposisi ?? ""),
  });
  const tipeBenar =
    x.tipe === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  uji.push({ nama: `xlsx ${nama}: Content-Type spreadsheet`, a: tipeBenar ? "ya" : x.tipe, b: "ya", cocok: tipeBenar });
}

console.log(`\nPERIODE ${DARI} s/d ${SAMPAI} · outlet: ${harian.outlet}\n`);
for (const u of uji) {
  console.log(
    `  ${u.cocok ? "COCOK " : "BEDA!!"} ${u.nama.padEnd(44)} ${String(u.a).padStart(13)} | ${String(u.b).padStart(13)}`
  );
}

console.log("\nANGKA PERIODE");
console.log(`  Order lunas          ${String(H.order).padStart(16)}`);
console.log(`  Omzet kotor          ${rp(H.omzet).padStart(16)}`);
console.log(`    dasar PBJT         ${rp(H.dasar).padStart(16)}`);
console.log(`    bukan objek        ${rp(H.bukanObjek).padStart(16)}`);
console.log(`    bebas per order    ${rp(H.bebas).padStart(16)}`);
console.log(`  PBJT terpungut       ${rp(H.pbjt).padStart(16)}`);
console.log(`  Tertagih             ${rp(H.tertagih).padStart(16)}`);
console.log(`    tunai              ${rp(H.tunai).padStart(16)}`);
console.log(`    non-tunai          ${rp(H.nonTunai).padStart(16)}`);
console.log(`  Refund               ${rp(H.refund).padStart(16)}`);
console.log(`  Varian terjual       ${String(produk.baris.length).padStart(16)}`);
console.log(`  Item terjual         ${String(P.terjual).padStart(16)} pcs`);
console.log(`  Jumlah kontribusi %  ${P.persen.toFixed(2).padStart(16)}  (mendekati 100, tidak persis: pembulatan per baris)`);

console.log("\nNAMA BERKAS");
for (const [nama, x] of [["harian", xh], ["detail", xd], ["produk", xp]]) {
  console.log(`  ${nama.padEnd(7)} ${x.disposisi}`);
}

const gagal = uji.filter((u) => !u.cocok);
console.log(
  `\n${gagal.length === 0 ? `SEMUA ${uji.length} UJI COCOK` : `${gagal.length} DARI ${uji.length} UJI TIDAK COCOK`}\n`
);
process.exit(gagal.length === 0 ? 0 : 1);
