/**
 * Penyusun struk untuk printer termal 58mm (Blueprint ECO 58D).
 *
 * Dipisah dari lapisan Bluetooth dengan sengaja: yang di sini murni perhitungan
 * — order masuk, byte keluar — sehingga bisa diperiksa tanpa printer, tanpa
 * perangkat, dan tanpa memilih pustaka Bluetooth lebih dulu. Pengiriman byte-nya
 * urusan modul lain.
 *
 * Tata letaknya TIDAK diambil dari components/Receipt.tsx milik web. Struk web
 * dirancang untuk kertas 80mm (~48 kolom) dan dicetak lewat window.print(), yang
 * membiarkan peramban mengatur perataan. Di sini tidak ada peramban: setiap
 * spasi harus dihitung sendiri, dan 58mm hanya memberi 32 kolom pada font A.
 * Yang diambil dari web adalah ISI-nya — bidang apa saja, urutannya, dan
 * kata-katanya — supaya struk kedua aplikasi terbaca sebagai struk toko yang
 * sama.
 */

import { formatRupiah, tableLabel } from "./types";

/** Font A pada kertas 58mm. Angka ini yang menentukan seluruh perataan. */
export const COLUMNS = 32;

const ESC = "\x1b";
const GS = "\x1d";

const CMD = {
  init: `${ESC}@`,
  alignLeft: `${ESC}a0`,
  alignCenter: `${ESC}a1`,
  boldOn: `${ESC}E1`,
  boldOff: `${ESC}E0`,
  doubleOn: `${GS}!\x11`,
  doubleOff: `${GS}!\x00`,
  /** Maju 4 baris supaya struk lewat dari kepala cetak dan bisa disobek. */
  feedAndCut: `${ESC}d\x04${GS}V\x42\x00`,
} as const;

export interface ReceiptItem {
  productName: string;
  quantity: number;
  unitPrice: number;
  notes?: string | null;
}

export interface ReceiptOrder {
  tableCode: string;
  tableSeq: number;
  status: string;
  total: number;
  paidAt?: string | null;
  createdAt: string;
  paymentMethod?: string | null;
  amountReceived?: number | null;
  changeAmount?: number | null;
  items: ReceiptItem[];
}

export interface ReceiptShop {
  name: string;
  outlet: string;
  /** Dicetak di kaki struk. Kosongkan kalau tidak ingin dibagikan. */
  wifiPassword?: string;
}

/** Kiri dan kanan dalam satu baris, ruang di tengahnya diisi spasi. */
function pair(left: string, right: string): string {
  const gap = COLUMNS - left.length - right.length;
  if (gap >= 1) return left + " ".repeat(gap) + right;
  // Tidak muat: potong yang kiri, karena yang kanan hampir selalu angka uang
  // dan angka uang yang terpotong lebih buruk daripada nama yang terpotong.
  const room = COLUMNS - right.length - 1;
  return (room > 0 ? left.slice(0, room) : "") + " " + right;
}

function center(text: string): string {
  if (text.length >= COLUMNS) return text.slice(0, COLUMNS);
  const pad = Math.floor((COLUMNS - text.length) / 2);
  return " ".repeat(pad) + text;
}

/** Pemenggal kata, supaya nama produk panjang tidak terpotong di tengah kata. */
function wrap(text: string): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    if (!line) {
      line = word;
    } else if (line.length + 1 + word.length <= COLUMNS) {
      line += " " + word;
    } else {
      lines.push(line);
      line = word;
    }
    // Satu kata yang lebih panjang dari kertasnya tetap harus dipotong.
    while (line.length > COLUMNS) {
      lines.push(line.slice(0, COLUMNS));
      line = line.slice(COLUMNS);
    }
  }
  if (line) lines.push(line);
  return lines.length > 0 ? lines : [""];
}

const divider = "-".repeat(COLUMNS);

const waktuIndonesia = (iso: string) =>
  new Intl.DateTimeFormat("id-ID", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Asia/Jakarta",
  }).format(new Date(iso));

/**
 * Bentuk struk sebagai teks polos, tanpa satu pun perintah printer.
 *
 * Ada sendiri supaya isinya bisa dibaca manusia saat diperiksa — struk yang
 * salah kolom terlihat langsung di sini, sementara di dalam byte ESC/POS ia
 * tersembunyi di antara kode kendali.
 */
export function renderReceiptText(
  order: ReceiptOrder,
  shop: ReceiptShop
): string {
  const lines: string[] = [];

  lines.push(center(shop.name));
  lines.push(center(shop.outlet));
  lines.push(divider);

  lines.push(pair("Meja", tableLabel(order.tableCode, order.tableSeq)));
  lines.push(pair("Waktu", waktuIndonesia(order.paidAt ?? order.createdAt)));
  lines.push(divider);

  for (const item of order.items) {
    for (const line of wrap(item.productName)) lines.push(line);
    lines.push(
      pair(
        `${item.quantity} x ${formatRupiah(item.unitPrice)}`,
        formatRupiah(item.unitPrice * item.quantity)
      )
    );
    if (item.notes) {
      for (const line of wrap(`Catatan: ${item.notes}`)) lines.push(line);
    }
  }

  lines.push(divider);
  lines.push(pair("TOTAL", formatRupiah(order.total)));

  if (order.status === "paid") {
    lines.push(
      pair("Metode", order.paymentMethod === "cash" ? "Cash" : "Non Cash")
    );
    if (order.paymentMethod === "cash") {
      lines.push(pair("Tunai", formatRupiah(order.amountReceived ?? 0)));
      lines.push(pair("Kembali", formatRupiah(order.changeAmount ?? 0)));
    }
  } else {
    // Order belum lunas: cetakan ini tagihan sementara, bukan bukti bayar.
    // Kalimatnya sama persis dengan struk web supaya tidak ada dua bahasa
    // untuk satu keadaan yang sama.
    lines.push("");
    lines.push(center("** BELUM LUNAS **"));
  }

  lines.push(divider);
  lines.push(center("Terima kasih atas kunjungan Anda"));

  if (shop.wifiPassword) {
    lines.push("");
    lines.push(center("Password WiFi:"));
    lines.push(center(shop.wifiPassword));
  }

  return lines.join("\n");
}

/**
 * Struk lengkap sebagai byte ESC/POS, siap dikirim ke printer.
 *
 * Kepala dan kaki ditegaskan dengan perintah cetak, bukan dengan karakter
 * hiasan: nama toko dicetak dobel, TOTAL ditebalkan. Sisanya teks biasa dari
 * renderReceiptText, jadi kedua bentuk itu tidak bisa berbeda isinya.
 */
export function buildReceiptBytes(
  order: ReceiptOrder,
  shop: ReceiptShop
): Uint8Array {
  const body = renderReceiptText(order, shop);

  // Baris judul dikeluarkan dari badan teks lalu dicetak ulang dengan penegasan.
  const [, , ...rest] = body.split("\n");

  const out =
    CMD.init +
    CMD.alignCenter +
    CMD.doubleOn +
    CMD.boldOn +
    shop.name +
    "\n" +
    CMD.doubleOff +
    CMD.boldOff +
    shop.outlet +
    "\n" +
    CMD.alignLeft +
    rest.join("\n") +
    "\n" +
    CMD.feedAndCut;

  // Latin-1, bukan UTF-8: printer termal kelas ini memakai halaman kode satu
  // byte, dan karakter multi-byte keluar sebagai sampah. Teks struk ini seluruhnya
  // ASCII, jadi tidak ada yang hilang.
  const bytes = new Uint8Array(out.length);
  for (let i = 0; i < out.length; i += 1) bytes[i] = out.charCodeAt(i) & 0xff;
  return bytes;
}
