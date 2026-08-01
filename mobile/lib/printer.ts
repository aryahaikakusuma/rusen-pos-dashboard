/**
 * Lapisan antara struk dan radio.
 *
 * `lib/receipt.ts` tahu bentuk struk dan tidak tahu apa-apa soal Bluetooth;
 * `modules/escpos-bluetooth` tahu Bluetooth dan tidak tahu apa itu order.
 * Berkas ini yang mempertemukan keduanya: mengambil printer tersimpan,
 * mengubah baris SQLite menjadi struk, dan menerjemahkan kode error native
 * menjadi kalimat yang berguna bagi kasir.
 */

import { PermissionsAndroid, Platform } from "react-native";
import type { SQLiteDatabase } from "expo-sqlite";

import EscposBluetooth, {
  type BondedDevice,
  type BluetoothStatus,
} from "../modules/escpos-bluetooth";
import { savedPrinter } from "../db/settings";
import { taxRateBps } from "../db/catalog";
import type { OrderItemRow, OrderRow } from "../db/types";
import {
  buildBillPackets,
  buildReceiptPackets,
  buildShiftPackets,
  type BillOrder,
  type ReceiptOrder,
  type ShiftReport,
} from "./receipt";
import { shop } from "./shop";

export type { BondedDevice, BluetoothStatus };

export type PrinterErrorCode =
  | "NO_PRINTER_SELECTED"
  | "BLUETOOTH_UNSUPPORTED"
  | "BLUETOOTH_OFF"
  | "BLUETOOTH_PERMISSION_DENIED"
  | "PRINTER_NOT_BONDED"
  | "BILL_NOT_AVAILABLE"
  | "BILL_TAX_RATE_UNKNOWN"
  | "PRINT_FAILED";

const MESSAGES: Record<PrinterErrorCode, string> = {
  NO_PRINTER_SELECTED: "Printer belum dipilih. Buka menu, lalu pilih Printer.",
  BLUETOOTH_UNSUPPORTED: "Perangkat ini tidak punya Bluetooth.",
  BLUETOOTH_OFF: "Bluetooth mati. Nyalakan dulu, lalu coba lagi.",
  BLUETOOTH_PERMISSION_DENIED:
    "Izin Bluetooth ditolak. Aktifkan lewat Pengaturan aplikasi.",
  PRINTER_NOT_BONDED:
    "Printer belum dipasangkan. Pasangkan lewat Pengaturan Bluetooth Android.",
  BILL_NOT_AVAILABLE:
    "Bill tidak dapat dicetak karena order atau itemnya sudah berubah. Buka lagi ordernya.",
  BILL_TAX_RATE_UNKNOWN:
    "Tarif PBJT belum tersedia. Segarkan katalog dari layar Kasir dulu, atau cetak Bill Biasa.",
  // Menyebut "sudah dicoba dua kali" bukan basa-basi: tanpa itu kasir mengira
  // sekali coba lagi akan berhasil, dan kalimat lama membuatnya membuka
  // Pengaturan Bluetooth untuk menyambungkan ulang dengan tangan — padahal
  // aplikasi ini membuka soketnya sendiri tiap kali mencetak, jadi menyambung
  // manual tidak pernah jadi bagian dari perbaikannya.
  PRINT_FAILED:
    "Printer tidak menjawab, sudah dicoba dua kali. Pastikan printer menyala, " +
    "kertasnya ada, dan jaraknya dekat — lalu tekan Cetak Struk lagi.",
};

export class PrinterError extends Error {
  readonly code: PrinterErrorCode;

  constructor(code: PrinterErrorCode) {
    super(code);
    this.name = "PrinterError";
    this.code = code;
  }
}

/**
 * Kode dari Kotlin datang sebagai `error.code` pada objek yang dilempar Expo.
 * Kode yang dikenal diteruskan apa adanya; sisanya dianggap kegagalan cetak,
 * karena bagi kasir yang penting hanya "struk tidak keluar" dan apa yang harus
 * dilakukan.
 */
export function translatePrinterError(error: unknown): string {
  if (error instanceof PrinterError) return MESSAGES[error.code];

  const code = (error as { code?: string } | null)?.code;
  if (code && code in MESSAGES) return MESSAGES[code as PrinterErrorCode];

  // Sengaja TIDAK memakai kalimat PRINT_FAILED di sini. Kesalahan tak dikenal
  // pernah muncul sebagai "Printer tidak menjawab" padahal sebabnya
  // SecurityException di dalam modul — dugaan yang disajikan sebagai fakta,
  // dan itu menyesatkan orang yang sedang mencari sebabnya.
  console.error("Kesalahan printer tidak dikenal:", error);
  return "Gagal mencetak. Periksa printer, lalu coba lagi.";
}

/**
 * Minta BLUETOOTH_CONNECT saat jalan, bukan hanya mendeklarasikannya.
 *
 * Ini jebakan yang dicatat MIGRATION.md dan pantas diulang: tanpa permintaan
 * runtime di Android 12+, aplikasi tidak error — ia hanya melihat daftar
 * perangkat kosong. Kasir akan melapor "printernya tidak ada di daftar", dan
 * tidak ada apa pun di log yang menjelaskannya.
 */
export async function ensureBluetoothPermission(): Promise<boolean> {
  if (Platform.OS !== "android") return false;
  // Di bawah Android 12 izin diberikan saat pemasangan, jadi konstantanya pun
  // tidak ada di PermissionsAndroid.
  if (Number(Platform.Version) < 31) return true;

  const permission = PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT;
  if (await PermissionsAndroid.check(permission)) return true;

  const result = await PermissionsAndroid.request(permission, {
    title: "Izin Bluetooth",
    message: "Aplikasi perlu izin Bluetooth untuk mencetak struk.",
    buttonPositive: "Izinkan",
    buttonNegative: "Nanti",
  });
  return result === PermissionsAndroid.RESULTS.GRANTED;
}

export function bluetoothStatus(): Promise<BluetoothStatus> {
  return EscposBluetooth.getStatus();
}

/**
 * Daftar perangkat terpasang, yang paling mungkin printer di urutan atas.
 *
 * Tidak ada yang disembunyikan — printer yang tidak mengumumkan SPP tetap
 * muncul, hanya turun urutannya. Menyaringnya keluar akan membuat kasir
 * menatap daftar tanpa printernya tanpa penjelasan apa pun.
 */
export async function listPrinters(): Promise<BondedDevice[]> {
  const devices = await EscposBluetooth.listBondedDevices();
  return [...devices].sort((a, b) => score(b) - score(a));
}

const score = (device: BondedDevice) =>
  (device.supportsSpp ? 2 : 0) + (device.isImagingClass ? 1 : 0);

/** Bentuk baris SQLite menjadi bentuk yang dimengerti penyusun struk. */
export function toReceiptOrder(
  order: OrderRow,
  items: OrderItemRow[]
): ReceiptOrder {
  return {
    tableCode: order.table_code,
    tableSeq: order.table_seq,
    status: order.status,
    subtotal: order.subtotal,
    total: order.total,
    taxStatus: order.tax_status,
    taxRateBps: order.tax_rate_bps,
    taxAmount: order.tax_amount,
    createdAt: order.created_at,
    paidAt: order.paid_at,
    paymentMethod: order.payment_method,
    amountReceived: order.amount_received,
    changeAmount: order.change_amount,
    isTestData: order.is_test_data === 1,
    items: items.map((item) => ({
      productName: item.product_name,
      quantity: item.quantity,
      unitPrice: item.unit_price,
      notes: item.notes,
    })),
  };
}

/**
 * Struk contoh untuk tombol uji di pemilih printer.
 *
 * Isinya dipilih supaya kegagalan yang khas terlihat di kertas, bukan supaya
 * enak dipandang: nama produk yang harus dipenggal menguji pemenggalan kata,
 * dan nominal enam digit menguji kolom kanan. Ditandai "CONTOH" supaya lembar
 * yang tertinggal di meja tidak pernah tertukar dengan bukti bayar.
 *
 * Sengaja KENA PAJAK, supaya cetak uji ikut membuktikan baris Subtotal dan PBJT
 * benar-benar muat di 32 kolom. Struk bebas pajak tidak punya baris tambahan
 * apa pun, jadi ia tidak menguji apa-apa yang belum diuji struk lama.
 */
export const sampleReceiptOrder: ReceiptOrder = {
  tableCode: "CONTOH",
  tableSeq: 1,
  status: "paid",
  subtotal: 147000,
  taxStatus: "taxable",
  taxRateBps: 1000,
  taxAmount: 14700,
  total: 161700,
  createdAt: new Date().toISOString(),
  paidAt: new Date().toISOString(),
  paymentMethod: "cash",
  amountReceived: 200000,
  changeAmount: 38300,
  items: [
    { productName: "Kentang / Tela Singkong Goreng", quantity: 2, unitPrice: 15000 },
    { productName: "Kopi Susu Gelas Besar", quantity: 6, unitPrice: 17000 },
    // Satu baris bercatatan, supaya cetak uji ikut membuktikan jalur itu:
    // baris tanpa catatan tidak pernah menunjukkan catatan yang salah tempat.
    {
      productName: "Indomie Kuah Sayur + Telur",
      quantity: 1,
      unitPrice: 15000,
      notes: "Ayam Spesial",
    },
  ],
};

/** Cetak ke perangkat tertentu — dipakai tombol uji di pemilih printer. */
export async function printTo(
  address: string,
  order: ReceiptOrder
): Promise<void> {
  await EscposBluetooth.printPackets(address, buildReceiptPackets(order, shop));
}

/**
 * Cetak sebuah order ke printer yang tersimpan.
 *
 * Melempar kalau printer belum dipilih, bukan diam saja: pemanggil yang
 * mencetak otomatis setelah pembayaran memang menelan kesalahannya, tetapi
 * tombol "Cetak Struk" harus bisa mengatakan apa yang salah.
 */
export async function printOrder(
  db: SQLiteDatabase,
  order: OrderRow,
  items: OrderItemRow[]
): Promise<void> {
  const printer = await savedPrinter(db);
  if (!printer) throw new PrinterError("NO_PRINTER_SELECTED");
  await printTo(printer.address, toReceiptOrder(order, items));
}

/**
 * Cetak bill parsial dari salinan SQLite yang paling baru.
 *
 * Pemilihan yang datang dari layar hanya ID baris. Harga, nama, jumlah, dan
 * bahkan status pending dibaca ulang tepat sebelum byte dikirim, supaya bill
 * tidak bisa mencetak item yang baru diubah atau order yang baru dilunasi.
 */
export async function printBill(
  db: SQLiteDatabase,
  orderId: string,
  selectedItemIds: readonly string[],
  taxStatus: "taxable" | "exempt"
): Promise<void> {
  const selected = new Set(selectedItemIds);
  if (selected.size === 0) throw new PrinterError("BILL_NOT_AVAILABLE");

  const [printer, order, items, rateBps] = await Promise.all([
    savedPrinter(db),
    db.getFirstAsync<OrderRow>("select * from orders where id = ?", [orderId]),
    db.getAllAsync<OrderItemRow>(
      "select * from order_items where order_id = ? order by rowid",
      [orderId]
    ),
    taxRateBps(db),
  ]);
  if (!printer) throw new PrinterError("NO_PRINTER_SELECTED");
  if (!order || order.status !== "pending") {
    throw new PrinterError("BILL_NOT_AVAILABLE");
  }
  if (taxStatus === "taxable" && rateBps === null) {
    throw new PrinterError("BILL_TAX_RATE_UNKNOWN");
  }

  const chosen = items.filter((item) => selected.has(item.id));
  if (chosen.length !== selected.size) {
    throw new PrinterError("BILL_NOT_AVAILABLE");
  }

  const bill: BillOrder = {
    tableCode: order.table_code,
    tableSeq: order.table_seq,
    createdAt: order.created_at,
    taxStatus,
    taxRateBps: rateBps ?? 0,
    isTestData: order.is_test_data === 1,
    items: chosen.map((item) => ({
      productName: item.product_name,
      quantity: item.quantity,
      unitPrice: item.unit_price,
      notes: item.notes,
      // Dari snapshot di barisnya, bukan dari kategori produk hari ini.
      taxable: item.taxable === 1,
    })),
  };
  await EscposBluetooth.printPackets(printer.address, buildBillPackets(bill, shop));
}

/**
 * Cetak laporan Tutup Kasir. Dipanggil setelah totalnya sudah dihitung
 * (db/shift.ts, shiftTotals) — panggilan ini hanya mengirim byte, pemanggil
 * yang bertanggung jawab menutup sif (db/shift.ts, closeShift) SESUDAH cetak
 * ini berhasil, tidak sebelum.
 */
export async function printShiftReport(
  db: SQLiteDatabase,
  report: ShiftReport
): Promise<void> {
  const printer = await savedPrinter(db);
  if (!printer) throw new PrinterError("NO_PRINTER_SELECTED");
  await EscposBluetooth.printPackets(printer.address, buildShiftPackets(report, shop));
}
