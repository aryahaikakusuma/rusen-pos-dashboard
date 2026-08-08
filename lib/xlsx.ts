import "server-only";

import ExcelJS from "exceljs";

import type { BarisDetail, BarisHarian, BarisProduk } from "./laporan";
import {
  jumlahHari,
  labelPeriode,
  namaHari,
  sekarangWib,
  tanggalPendek,
  type Periode,
} from "./periode";

/**
 * Penyusun berkas xlsx.
 *
 * TIDAK ADA SATU PUN ANGKA YANG DIHITUNG DI SINI selain penjumlahan kolom untuk
 * baris TOTAL. Seluruh isinya datang dari tiga fungsi Postgres yang sama dengan
 * yang mengisi layar — itu syaratnya supaya berkas yang beredar di WhatsApp
 * tidak pernah berbeda dari yang dilihat di dashboard.
 *
 * SETIAP BERKAS MEMBAWA IDENTITASNYA. Periode, waktu pembuatan dalam WIB, nama
 * outlet, dan pernyataan bahwa data uji dikecualikan ditulis di enam baris
 * pertama tiap lembar. Berkas laporan yang beredar tanpa keterangan periode
 * tidak berguna tiga bulan kemudian, dan yang paling sering ditanyakan justru
 * "ini bulan apa" dan "angka uji ikut tidak".
 */

const RUPIAH = '#,##0;[Red]-#,##0';
const CACAH = "#,##0";

interface Judul {
  judul: string;
  periode: Periode;
  outlet: string;
}

/** Enam baris identitas + satu baris kosong. Mengembalikan nomor baris berikutnya. */
function tulisKepala(sheet: ExcelJS.Worksheet, { judul, periode, outlet }: Judul): number {
  const baris: [string, string][] = [
    ["Laporan", judul],
    ["Outlet", outlet],
    ["Periode", `${labelPeriode(periode)} (${jumlahHari(periode)} hari, waktu WIB)`],
    ["Dibuat", sekarangWib()],
    ["Cakupan", "Order berstatus LUNAS. Data uji (is_test_data) DIKECUALIKAN."],
  ];

  baris.forEach(([label, isi], i) => {
    const row = sheet.getRow(i + 1);
    row.getCell(1).value = label;
    row.getCell(1).font = { bold: true };
    row.getCell(2).value = isi;
  });

  return baris.length + 2;
}

function tulisTabel(
  sheet: ExcelJS.Worksheet,
  mulai: number,
  kolom: { judul: string; lebar: number; format?: string }[],
  isi: (string | number | null)[][],
  total?: (string | number | null)[]
): void {
  const header = sheet.getRow(mulai);
  kolom.forEach((k, i) => {
    const sel = header.getCell(i + 1);
    sel.value = k.judul;
    sel.font = { bold: true };
    sel.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE6FAF5" } };
    sel.border = { bottom: { style: "thin", color: { argb: "FF36D4B1" } } };
    sheet.getColumn(i + 1).width = k.lebar;
  });

  isi.forEach((nilai, r) => {
    const row = sheet.getRow(mulai + 1 + r);
    nilai.forEach((v, i) => {
      const sel = row.getCell(i + 1);
      sel.value = v;
      if (kolom[i].format && typeof v === "number") sel.numFmt = kolom[i].format;
    });
  });

  if (total) {
    const row = sheet.getRow(mulai + 1 + isi.length);
    total.forEach((v, i) => {
      const sel = row.getCell(i + 1);
      sel.value = v;
      sel.font = { bold: true };
      sel.border = { top: { style: "thin" } };
      if (kolom[i].format && typeof v === "number") sel.numFmt = kolom[i].format;
    });
  }

  // Baris kepala tabel dibekukan supaya judul kolom tetap terlihat saat
  // digulir — laporan sebulan penuh tidak muat satu layar.
  sheet.views = [{ state: "frozen", ySplit: mulai }];
}

function jumlah<T>(baris: T[], ambil: (b: T) => number): number {
  return baris.reduce((s, b) => s + ambil(b), 0);
}

export async function bukuHarian(
  periode: Periode,
  outlet: string,
  baris: BarisHarian[]
): Promise<ExcelJS.Buffer> {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet("Penjualan Harian");
  const mulai = tulisKepala(sheet, { judul: "Penjualan Harian", periode, outlet });

  tulisTabel(
    sheet,
    mulai,
    [
      { judul: "Tanggal", lebar: 13 },
      { judul: "Hari", lebar: 9 },
      { judul: "Order", lebar: 9, format: CACAH },
      { judul: "Omzet Kotor", lebar: 15, format: RUPIAH },
      { judul: "Dasar PBJT", lebar: 15, format: RUPIAH },
      { judul: "PBJT", lebar: 13, format: RUPIAH },
      { judul: "Bebas (Order)", lebar: 15, format: RUPIAH },
      { judul: "Bukan Objek", lebar: 14, format: RUPIAH },
      { judul: "Refund", lebar: 13, format: RUPIAH },
      { judul: "Omzet Bersih", lebar: 15, format: RUPIAH },
      { judul: "Tertagih", lebar: 15, format: RUPIAH },
      { judul: "Tunai", lebar: 14, format: RUPIAH },
      { judul: "Non-Tunai", lebar: 14, format: RUPIAH },
    ],
    baris.map((b) => [
      b.tanggal,
      namaHari(b.tanggal),
      b.jumlah_order,
      b.omzet_kotor,
      b.dasar_pbjt,
      b.pbjt,
      b.omzet_bebas_order,
      b.omzet_bukan_objek,
      b.total_refund,
      b.omzet_bersih,
      b.tertagih,
      b.tertagih_tunai,
      b.tertagih_non_tunai,
    ]),
    [
      "TOTAL",
      "",
      jumlah(baris, (b) => b.jumlah_order),
      jumlah(baris, (b) => b.omzet_kotor),
      jumlah(baris, (b) => b.dasar_pbjt),
      jumlah(baris, (b) => b.pbjt),
      jumlah(baris, (b) => b.omzet_bebas_order),
      jumlah(baris, (b) => b.omzet_bukan_objek),
      jumlah(baris, (b) => b.total_refund),
      jumlah(baris, (b) => b.omzet_bersih),
      jumlah(baris, (b) => b.tertagih),
      jumlah(baris, (b) => b.tertagih_tunai),
      jumlah(baris, (b) => b.tertagih_non_tunai),
    ]
  );

  // Catatan kaki yang menjelaskan hubungan antar kolom. Tanpa ini, orang yang
  // membuka berkas tiga bulan kemudian akan menjumlahkan kolom yang salah.
  const akhir = mulai + baris.length + 3;
  [
    "Omzet Kotor = Dasar PBJT + Bebas (Order) + Bukan Objek.",
    "Tertagih = Omzet Kotor + PBJT. Tunai + Non-Tunai = Tertagih.",
    "Omzet Bersih = Omzet Kotor - pokok refund; kolom Refund memuat pokok + pajaknya.",
    "Refund dicatat pada tanggal refundnya, bukan tanggal order aslinya.",
  ].forEach((teks, i) => {
    sheet.getCell(akhir + i, 1).value = teks;
    sheet.getCell(akhir + i, 1).font = { size: 9, italic: true };
  });

  return wb.xlsx.writeBuffer();
}

export async function bukuDetail(
  periode: Periode,
  outlet: string,
  baris: BarisDetail[]
): Promise<ExcelJS.Buffer> {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet("Detail Penjualan");
  const mulai = tulisKepala(sheet, { judul: "Detail Penjualan", periode, outlet });

  tulisTabel(
    sheet,
    mulai,
    [
      { judul: "No. Order", lebar: 16 },
      { judul: "Kode Meja", lebar: 13 },
      { judul: "Waktu Bayar (WIB)", lebar: 20 },
      { judul: "Kasir", lebar: 18 },
      { judul: "Metode", lebar: 11 },
      { judul: "Subtotal", lebar: 14, format: RUPIAH },
      { judul: "Dasar PBJT", lebar: 14, format: RUPIAH },
      { judul: "PBJT", lebar: 12, format: RUPIAH },
      { judul: "Total", lebar: 14, format: RUPIAH },
      { judul: "Status Pajak", lebar: 13 },
      { judul: "Alasan Bebas", lebar: 26 },
      { judul: "Disetujui Oleh", lebar: 18 },
      { judul: "Refund", lebar: 13, format: RUPIAH },
    ],
    baris.map((b) => [
      b.nomor_order,
      b.table_code,
      b.waktu_bayar_wib,
      b.kasir,
      b.metode_bayar === "cash" ? "Tunai" : "Non-Tunai",
      b.subtotal,
      // Kosong pada order yang dibebaskan. `dasar_pbjt` tetap terisi di sana —
      // kolomnya menjawab "berapa nilai barang yang objek pajak", bukan "berapa
      // yang dikenakan". Menuliskannya membuat siapa pun yang menyorot kolom ini
      // di Excel mendapat dasar pengenaan lebih besar daripada yang dilaporkan.
      b.status_pajak === "exempt" ? null : b.dasar_pbjt,
      b.pbjt,
      b.total,
      b.status_pajak === "exempt" ? "Bebas" : "Dipungut",
      b.alasan_bebas ?? "",
      b.disetujui_oleh ?? "",
      b.refund_total,
    ]),
    [
      `TOTAL ${baris.length} order`,
      "",
      "",
      "",
      "",
      jumlah(baris, (b) => b.subtotal),
      jumlah(baris, (b) => (b.status_pajak === "exempt" ? 0 : b.dasar_pbjt)),
      jumlah(baris, (b) => b.pbjt),
      jumlah(baris, (b) => b.total),
      "",
      "",
      "",
      jumlah(baris, (b) => b.refund_total),
    ]
  );

  const akhir = mulai + baris.length + 3;
  [
    "Satu baris = satu order lunas. Rincian item tidak disertakan: satu order punya banyak item, dan mencampurnya membuat setiap penjumlahan jadi ganda.",
    "Kolom Kode Meja ditulis apa adanya dan tidak ditafsirkan sebagai jenis order.",
    "Kolom Refund adalah seluruh refund atas order itu, tanpa memandang tanggal refundnya.",
    "Kolom Dasar PBJT dikosongkan pada order yang dibebaskan, supaya totalnya sama dengan dasar pengenaan di laporan Penjualan Harian.",
  ].forEach((teks, i) => {
    sheet.getCell(akhir + i, 1).value = teks;
    sheet.getCell(akhir + i, 1).font = { size: 9, italic: true };
  });

  return wb.xlsx.writeBuffer();
}

export async function bukuProduk(
  periode: Periode,
  outlet: string,
  baris: BarisProduk[]
): Promise<ExcelJS.Buffer> {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet("Laporan Produk");
  const mulai = tulisKepala(sheet, { judul: "Laporan Produk", periode, outlet });

  tulisTabel(
    sheet,
    mulai,
    [
      { judul: "Kode", lebar: 12 },
      { judul: "Produk", lebar: 34 },
      { judul: "Kategori", lebar: 20 },
      { judul: "Terjual", lebar: 11, format: CACAH },
      { judul: "Omzet", lebar: 16, format: RUPIAH },
      { judul: "Kontribusi %", lebar: 14, format: "0.00" },
    ],
    baris.map((b) => [
      b.product_code,
      b.nama_produk,
      b.kategori,
      b.terjual,
      b.omzet,
      b.kontribusi_persen,
    ]),
    [
      "TOTAL",
      `${baris.length} varian`,
      "",
      jumlah(baris, (b) => b.terjual),
      jumlah(baris, (b) => b.omzet),
      null,
    ]
  );

  const akhir = mulai + baris.length + 3;
  [
    "Satu baris = satu VARIAN, karena di skema ini tiap varian adalah baris produk tersendiri. Penjumlahan ke tingkat produk induk tidak dilakukan di sini.",
    "Omzet bersifat KOTOR: refund tidak dikurangkan. Pertanyaan 'berapa yang terjual' berbeda dari 'berapa yang akhirnya tidak jadi'.",
    "Jumlah kolom Kontribusi % mendekati 100, tidak persis, karena pembulatan dua desimal per baris. Kolom Omzet yang cocok persis.",
  ].forEach((teks, i) => {
    sheet.getCell(akhir + i, 1).value = teks;
    sheet.getCell(akhir + i, 1).font = { size: 9, italic: true };
  });

  return wb.xlsx.writeBuffer();
}

/**
 * Nama berkas: deterministik dan informatif.
 *
 * Memuat jenis laporan dan periode, tanpa spasi, sehingga dua berkas dari
 * periode berbeda tidak pernah saling menimpa di folder unduhan dan masih bisa
 * dikenali setelah diteruskan lewat WhatsApp.
 */
export function namaBerkas(jenis: string, periode: Periode): string {
  const rentang =
    periode.dari === periode.sampai
      ? tanggalPendek(periode.dari)
      : `${tanggalPendek(periode.dari)}-sd-${tanggalPendek(periode.sampai)}`;
  return `Rusen_${jenis}_${rentang}.xlsx`.replace(/ /g, "");
}
