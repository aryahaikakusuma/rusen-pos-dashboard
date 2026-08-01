/**
 * Penyusun struk untuk printer termal 58mm (RPP02N — bukan Blueprint ECO 58D seperti
 * yang sempat tertulis di sini dan di MIGRATION.md; lebar kertasnya kebetulan sama,
 * jadi kekeliruan itu tidak mengubah satu pun perhitungan di bawah).
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

import { receiptLogo } from "./receipt-logo";
import { hitungPbjt, labelPbjt } from "./tax";
import { formatRupiah, tableLabel } from "./types";

/** Font A pada kertas 58mm. Angka ini yang menentukan seluruh perataan. */
export const COLUMNS = 32;

/**
 * Bentuk logo struk.
 *
 * Tipenya tinggal DI SINI, bukan di receipt-logo.ts, karena berkas itu ditimpa
 * seluruhnya oleh scripts/buat-logo-struk.mjs setiap kali logo dibuat ulang —
 * apa pun yang diletakkan di sana akan lenyap pada konversi berikutnya. Ini
 * ketahuan justru saat logo sungguhan pertama kali dikonversi.
 */
export interface ReceiptLogo {
  /** Lebar dalam titik. Kelipatan 8, maksimum 384 pada kertas 58mm. */
  width: number;
  height: number;
  /** Bitmap 1-bit, satu bit satu titik, bit 1 = hitam. */
  data: readonly number[];
}

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
  /** Jarak di bawah logo, dua baris. */
  feedLogo: `${ESC}d\x02`,
} as const;

export interface ReceiptItem {
  productName: string;
  quantity: number;
  unitPrice: number;
  notes?: string | null;
}

/** Satu baris yang dipilih untuk dicetak pada tagihan sementara. */
export interface BillItem {
  productName: string;
  quantity: number;
  unitPrice: number;
  notes?: string | null;
  /**
   * Apakah baris ini objek PBJT. Rokok tidak. Wajib, bukan opsional: nilai
   * bawaan yang diam-diam "kena pajak" adalah persis kegagalan yang perubahan
   * ini ada untuk mencegahnya, dan kompiler harus memaksa setiap pemanggil
   * menjawabnya.
   */
  taxable: boolean;
}

/**
 * Bentuk tagihan sementara sengaja berbeda dari ReceiptOrder.
 *
 * Bill tidak tahu pajak, pembayaran, atau total order: semua itu belum terjadi
 * pada order pending. Subtotalnya selalu diturunkan dari `items` yang dipilih.
 */
export interface BillOrder {
  tableCode: string;
  tableSeq: number;
  createdAt: string;
  /** Pilihan cetak sementara; tidak pernah disimpan pada order. */
  taxStatus: "taxable" | "exempt";
  /** Tarif saat bill dibuat, dari app_state lokal. */
  taxRateBps: number;
  /** Lihat catatan pada ReceiptOrder.isTestData. */
  isTestData?: boolean;
  items: BillItem[];
}

export interface ReceiptOrder {
  tableCode: string;
  tableSeq: number;
  status: string;
  /** Jumlah subtotal item, sebelum pajak. */
  subtotal: number;
  /** Yang ditagih ke pelanggan: subtotal + pajak. */
  total: number;
  taxStatus: "taxable" | "exempt";
  /** Basis point, hanya untuk label barisnya. */
  taxRateBps: number;
  taxAmount: number;
  paidAt?: string | null;
  createdAt: string;
  paymentMethod?: string | null;
  amountReceived?: number | null;
  changeAmount?: number | null;
  /**
   * Order mode uji. Kertasnya harus mengatakannya sendiri: begitu keluar dari
   * printer ia lepas dari aplikasi, dan tidak ada bingkai merah maupun badge
   * yang ikut menempel padanya. Tanpa penanda, struk order uji tidak bisa
   * dibedakan dari bukti pembayaran sungguhan oleh siapa pun yang memegangnya.
   *
   * Opsional supaya seluruh pemanggil lama tetap benar tanpa disentuh — dan
   * `undefined` berarti "bukan uji", yang memang jawaban yang tepat untuk
   * setiap order yang sudah ada.
   */
  isTestData?: boolean;
  items: ReceiptItem[];
}

export interface ReceiptShop {
  name: string;
  outlet: string;
  /**
   * Jaringan WiFi yang passwordnya dicetak di kaki struk. Kosongkan (atau
   * hilangkan) kalau tidak ingin dibagikan.
   *
   * Daftar, bukan satu nilai, karena outlet punya lebih dari satu jaringan dan
   * passwordnya berbeda. Satu ruang password memaksa memilih salah satu, dan
   * pelanggan yang tersambung ke jaringan yang satunya akan mengira
   * passwordnya salah.
   */
  wifi?: ReadonlyArray<{ network: string; password: string }>;
}

/**
 * Penanda struk uji, dicetak DUA KALI — di kepala dan di kaki.
 *
 * Pengulangannya disengaja, bukan kelalaian. Struk 58mm sering disobek dan
 * dibaca dari bawah, tempat TOTAL berada; penanda yang hanya di kepala akan
 * hilang bersama potongan yang dibuang. Dua baris di dua tempat masih jauh
 * lebih murah daripada satu lembar yang terbaca sebagai bukti bayar.
 *
 * Kata-katanya menyebut akibat, bukan status. "UJI COBA" sendirian bisa
 * dikira nama menu promo oleh yang tidak tahu; "BUKAN BUKTI PEMBAYARAN"
 * tidak bisa disalahartikan siapa pun.
 *
 * Keduanya muat lega di 32 kolom — 16 dan 22 karakter — dan seluruhnya ASCII,
 * jadi tidak ada yang bisa dimakan printer (lihat ascii() di kaki berkas).
 */
function pushUjiBanner(lines: string[]): void {
  lines.push(center("*** UJI COBA ***"));
  lines.push(center("BUKAN BUKTI PEMBAYARAN"));
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

/**
 * Paksa seluruh isi struk menjadi ASCII.
 *
 * Ini memperbaiki cacat uang yang gagal tanpa suara. `formatRupiah` memakai
 * Intl.NumberFormat locale id-ID, dan ICU menyisipkan U+00A0 (no-break space)
 * antara "Rp" dan angkanya — bukan spasi biasa. Di layar keduanya tidak bisa
 * dibedakan, jadi harga di grid produk dan di pratinjau terminal tampak benar.
 *
 * Di kertas tidak. Byte 0xA0 terkirim ke printer yang halaman kodenya
 * memperlakukan setiap byte >= 0x80 sebagai awal karakter dua-byte, sehingga
 * ia MENELAN digit sesudahnya: "Rp 17.000" keluar kehilangan angka depannya.
 * Struk dengan harga yang salah, tanpa satu pun error di mana pun.
 *
 * Diterapkan pada teks utuh, bukan hanya pada angka, karena sumber karakter
 * asing bukan cuma Intl: nama produk dan terutama catatan yang diketik kasir
 * bisa berisi apa saja. Yang tidak bisa dicetak jadi "?" — terlihat jelas oleh
 * manusia, dan jauh lebih baik daripada byte yang memakan tetangganya.
 *
 * Karena dipasang di renderReceiptText, pratinjau terminal dan byte yang
 * dikirim ke printer tidak bisa berbeda — sesuai alasan kedua fungsi itu
 * dipisah sejak awal.
 */
function ascii(text: string): string {
  let out = "";
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    if (code === 0xa0) {
      // No-break space memang spasi. Menggantinya dengan "?" akan membuat
      // setiap harga di struk terlihat rusak.
      out += " ";
    } else if (code === 0x0a || (code >= 0x20 && code < 0x7f)) {
      out += ch;
    } else {
      // Dua "?" untuk karakter di luar BMP (emoji di catatan kasir), karena
      // panjangnya dihitung dua satuan UTF-16 saat kolom disusun. Satu "?"
      // akan menggeser perataan seluruh baris.
      out += code > 0xffff ? "??" : "?";
    }
  }
  return out;
}

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

  // Nama toko dan outlet TIDAK dicetak sebagai teks. Logo yang membawa identitas
  // struk sejak ia terbukti tercetak bersih di kertas; mengulangnya sebagai
  // tulisan hanya menghabiskan dua baris untuk keterangan yang sama.
  //
  // Kalau logo suatu saat dimatikan (receipt-logo.ts diisi null), struk akan
  // keluar tanpa identitas sama sekali. Itu konsekuensi yang disadari, bukan
  // kelalaian — dan `shop.name` tetap ada di lib/shop.ts untuk dikembalikan.
  lines.push(divider);

  if (order.isTestData) {
    pushUjiBanner(lines);
    lines.push(divider);
  }

  lines.push(pair("Meja", tableLabel(order.tableCode, order.tableSeq)));
  lines.push(pair("Waktu", waktuIndonesia(order.paidAt ?? order.createdAt)));
  lines.push(divider);

  for (const item of order.items) {
    for (const line of wrap(item.productName)) lines.push(line);
    // Catatan menempel di bawah NAMA, bukan di bawah harga. Untuk Indomie Kuah
    // isinya jenis kuah — bagian dari apa yang dipesan, bukan keterangan atas
    // pembayaran — dan dapur membaca dari atas: nama, lalu variannya.
    if (item.notes) {
      for (const line of wrap(`Catatan: ${item.notes}`)) lines.push(line);
    }
    lines.push(
      pair(
        `${item.quantity} x ${formatRupiah(item.unitPrice)}`,
        formatRupiah(item.unitPrice * item.quantity)
      )
    );
  }

  lines.push(divider);

  // Struk BEBAS PAJAK tidak memuat apa pun soal pajak — keputusan Heika.
  // Pelanggan instansi tidak membawa pulang kertas yang mengumumkan status
  // khususnya; keterangan pembebasannya tetap lengkap tersimpan di sistem dan
  // terbaca lewat get_pbjt_exempt_report.
  //
  // Struk KENA PAJAK wajib memuat rinciannya, dan itu bukan sekadar kelengkapan:
  // tanpa dua baris ini, TOTAL tidak sama dengan jumlah baris item di atasnya,
  // dan pelanggan yang menjumlahkan sendiri akan menyimpulkan dirinya kelebihan
  // ditagih. Struk yang tidak bisa dijumlahkan lebih buruk daripada struk yang
  // menyebut pajak.
  //
  // Muat dengan lega di 32 kolom: "PBJT 10%" delapan karakter, nominalnya
  // sekitar sepuluh. Tanda % lolos ascii() apa adanya.
  if (order.taxStatus === "taxable" && order.taxAmount > 0) {
    lines.push(pair("Subtotal", formatRupiah(order.subtotal)));
    lines.push(pair(labelPbjt(order.taxRateBps), formatRupiah(order.taxAmount)));
  }

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
  // Sebelum "Terima kasih", bukan sesudah: ucapan penutup adalah tempat mata
  // berhenti membaca, dan penanda di bawahnya akan terlewat.
  if (order.isTestData) {
    pushUjiBanner(lines);
    lines.push(divider);
  }
  lines.push(center("Terima kasih atas kunjungan Anda"));

  if (shop.wifi && shop.wifi.length > 0) {
    lines.push("");
    lines.push(center("Password WiFi:"));
    // Nama jaringan ikut dicetak, bukan hanya passwordnya: dengan dua jaringan,
    // password tanpa nama jaringan tidak bisa dipakai siapa pun.
    for (const { network, password } of shop.wifi) {
      lines.push(center(`${network}: ${password}`));
    }
  }

  return ascii(lines.join("\n"));
}

/** Tagihan sementara pra-pajak untuk sebagian (atau seluruh) baris order. */
export function renderBillText(order: BillOrder, shop: ReceiptShop): string {
  // `shop` tetap menjadi bagian kontrak seperti struk lunas. Identitasnya
  // dibawa logo pada buildBillPackets; renderer teks tidak perlu menyalinnya.
  void shop;
  const lines: string[] = [center("TAGIHAN SEMENTARA"), divider];

  if (order.isTestData) {
    pushUjiBanner(lines);
    lines.push(divider);
  }

  lines.push(pair("Meja", tableLabel(order.tableCode, order.tableSeq)));
  lines.push(pair("Waktu", waktuIndonesia(order.createdAt)));
  lines.push(divider);

  let subtotal = 0;
  let kena = 0;
  for (const item of order.items) {
    for (const line of wrap(item.productName)) lines.push(line);
    if (item.notes) {
      for (const line of wrap(`Catatan: ${item.notes}`)) lines.push(line);
    }
    const amount = item.unitPrice * item.quantity;
    subtotal += amount;
    if (item.taxable) kena += amount;
    lines.push(pair(`${item.quantity} x ${formatRupiah(item.unitPrice)}`, formatRupiah(amount)));
  }

  lines.push(divider);
  lines.push(pair("SUBTOTAL TAGIHAN", formatRupiah(subtotal)));
  if (order.taxStatus === "taxable") {
    // Basisnya `kena`. Rokok ikut di subtotal tapi tidak di basis pajak, jadi
    // pada tagihan campuran PBJT-nya lebih kecil dari 10% subtotal yang
    // tercetak persis di atasnya. Itu benar, dan akan terlihat seperti salah
    // hitung bagi siapa pun yang mengalikan sendiri di kepala.
    const tax = hitungPbjt(kena, order.taxRateBps);
    lines.push(pair(labelPbjt(order.taxRateBps), formatRupiah(tax)));
    lines.push(pair("TOTAL TAGIHAN", formatRupiah(subtotal + tax)));
  }
  lines.push("");
  lines.push(center("** BELUM LUNAS **"));

  return ascii(lines.join("\n"));
}

/**
 * Sama seperti pair(), tapi untuk pasangan label/nilai yang nilainya BUKAN
 * uang — nama orang, yang boleh sepenuhnya berpindah baris kalau kepanjangan,
 * berbeda dari pair() yang justru mengorbankan sisi kiri supaya angka uang di
 * kanan tidak pernah terpotong. Nama kasir "Raden Ayu Kusumaningrum
 * Wijayanti" tidak muat di satu baris 32 kolom bersama label apa pun; pair()
 * akan memotong labelnya sampai kosong dan HASILNYA TETAP melebihi 32 kolom
 * karena nilainya sendiri sudah sepanjang itu.
 */
function pairAtauBaris(label: string, value: string): string[] {
  const satuBaris = pair(label, value);
  if (satuBaris.length <= COLUMNS) return [satuBaris];
  return [label, ...wrap(value)];
}

/** Uang non-penjualan: lewat laci ("cash") atau tidak sama sekali ("non_cash"). */
export type CashMethod = "cash" | "non_cash";

/**
 * Satu entri kas masuk/keluar sebagaimana ia dicetak.
 *
 * Bentuknya didefinisikan DI SINI dan sengaja tidak diimpor dari db/cash.ts:
 * berkas ini wajib bebas React Native dan expo-sqlite supaya `preview:struk`
 * tetap bisa dijalankan Node tanpa perangkat — satu import dari db/ akan
 * menyeret expo-sqlite dan mematikan satu-satunya pemeriksaan kolom yang
 * berjalan tanpa printer. `CashMovement` cocok secara struktur, jadi pemanggil
 * melewatkan barisnya apa adanya tanpa konversi.
 */
export interface CashLine {
  note: string;
  method: CashMethod;
  amount: number;
}

export interface ShiftReport {
  cashierName: string;
  openedAt: string;
  closedAt: string;
  modalAwal: number;
  tunai: number;
  nonTunai: number;
  refund: number;
  /** Refund atas order tunai saja — dasar penghitungan Kas Seharusnya. */
  refundTunai: number;
  /** Hasil hitung fisik yang diketik kasir. */
  kasFisik: number;
  pajak: number;
  transaksiSelesai: number;
  transaksiPending: number;
  /** Entri kas non-penjualan sif ini, terurut waktu, yang dibatalkan sudah disaring. */
  kasMasuk: CashLine[];
  kasKeluar: CashLine[];
  kasMasukTunai: number;
  kasMasukNonTunai: number;
  kasKeluarTunai: number;
  kasKeluarNonTunai: number;
}

/**
 * Kas yang seharusnya ada di laci saat sif ditutup.
 *
 * Dipusatkan di sini karena rumusnya sebelum ini ditulis TIGA kali — di
 * renderShiftText, di components/TutupKasirSheet.tsx, dan di
 * screens/AppShell.tsx. Menambahkan dua suku baru (kas masuk dan kas keluar
 * tunai) ke tiga tempat terpisah adalah cara paling pasti membuat layar dan
 * kertas berselisih, dan selisih semacam itu tidak menimbulkan error sama
 * sekali: kasir hanya melihat dua angka berbeda tanpa cara tahu mana yang
 * benar. Ketiganya sekarang memanggil fungsi ini.
 *
 * Hanya suku TUNAI yang masuk hitungan — entri non tunai uangnya tidak pernah
 * lewat laci, jadi ia tidak boleh mengubah apa yang harus ada di dalamnya.
 */
export function kasSeharusnya(r: {
  modalAwal: number;
  tunai: number;
  refundTunai: number;
  kasMasukTunai: number;
  kasKeluarTunai: number;
}): number {
  return (
    r.modalAwal + r.tunai - r.refundTunai + r.kasMasukTunai - r.kasKeluarTunai
  );
}

/**
 * Rincian satu entri kas, dengan bentuk yang sama seperti baris item pada
 * renderBillText: catatan sebagai baris penuh lewat wrap(), nominalnya di
 * baris tersendiri.
 *
 * Catatan kas adalah teks bebas yang diketik kasir dan panjangnya tidak bisa
 * diduga ("Beli gas 3kg dan es batu di warung sebelah"). Kalau catatan dan
 * nominal dipaksa satu baris, pair() akan memotong catatannya — dan pada
 * catatan yang jauh lebih panjang dari sisa kolom, yang tersisa tidak lagi
 * menjelaskan apa pun. Dipisah, catatan boleh sepanjang apa pun tanpa satu
 * digit uang pun bergeser.
 *
 * Metode dicetak eksplisit per entri, bukan disingkat atau dikelompokkan:
 * dua entri dengan catatan mirip tapi metode berbeda adalah persis kasus yang
 * harus bisa dibedakan saat laporan dipertanyakan, dan pengelompokan menurut
 * metode akan merusak urutan waktu yang membuat daftar ini bisa dicocokkan
 * dengan ingatan kasir.
 *
 * pairAtauBaris() sengaja TIDAK dipakai di baris nominal: nilainya uang, dan
 * uang tidak boleh berpindah baris.
 */
function rincianKas(entries: CashLine[]): string[] {
  const lines: string[] = [];
  for (const entry of entries) {
    for (const line of wrap(entry.note)) lines.push(line);
    lines.push(
      pair(
        entry.method === "cash" ? "  Tunai" : "  Non Tunai",
        formatRupiah(entry.amount)
      )
    );
  }
  return lines;
}

/**
 * Laporan Tutup Kasir. `shop` tetap bagian kontrak seperti renderer lain —
 * identitasnya dibawa logo pada buildShiftPackets.
 *
 * Baris Refund SELALU dicetak, walau nol: ini dokumen rekonsiliasi, dan baris
 * yang hilang saat nol membuat pembaca bertanya apakah refund sudah diperiksa
 * atau terlupa. Saldo Akhir mengikuti bentuk struk pembanding
 * (Modal Awal + Penerimaan − Refund) — BUKAN isi laci fisik, karena non tunai
 * tidak pernah masuk laci. Kalau nanti dibutuhkan rekonsiliasi laci fisik,
 * itu baris terpisah, bukan penggantian baris ini.
 */
export function renderShiftText(report: ShiftReport, shop: ReceiptShop): string {
  void shop;
  const penerimaan = report.tunai + report.nonTunai;
  const saldoAkhir = report.modalAwal + penerimaan - report.refund;

  const lines: string[] = [
    center("LAPORAN TUTUP KASIR"),
    center("TRANSAKSI PENJUALAN"),
    divider,
  ];

  lines.push(...pairAtauBaris("Kasir", report.cashierName));
  lines.push(pair("Waktu Buka", waktuIndonesia(report.openedAt)));
  lines.push(pair("Waktu Tutup", waktuIndonesia(report.closedAt)));
  lines.push(divider);

  lines.push(pair("Modal Awal", formatRupiah(report.modalAwal)));
  lines.push(pair("Tunai", formatRupiah(report.tunai)));
  lines.push(pair("Non Tunai", formatRupiah(report.nonTunai)));
  lines.push(divider);

  lines.push(pair("Total Penerimaan", formatRupiah(penerimaan)));
  lines.push(pair("Refund", `-${formatRupiah(report.refund)}`));
  lines.push(divider);

  lines.push(pair("Saldo Akhir", formatRupiah(saldoAkhir)));
  lines.push(divider);

  // Kas non-penjualan. JUDUL dan EMPAT BARIS TOTAL selalu dicetak walau nol;
  // hanya baris rincian yang bersyarat, karena daftar entri yang kosong memang
  // tidak punya apa-apa untuk dirinci.
  //
  // Judulnya wajib karena label barisnya sengaja dipendekkan: tanpa kata "Kas",
  // sebuah "Masuk Tunai Rp 0" yang berdiri sendiri tidak menyebutkan dirinya
  // kas sama sekali. Label pendek dipilih supaya pair() tidak pernah perlu
  // memotong labelnya — "Keluar Non Tunai" enam belas kolom, jadi masih muat
  // bersama nominal sampai Rp 999.999.999 — dan judul inilah yang memikul arti
  // yang dilepas dari tiap barisnya. Label yang sama dipakai di layar
  // (components/TutupKasirSheet.tsx) supaya kertas dan lembar berbunyi sama.
  //
  // Selalu tercetaknya blok ini beralasan sama dengan baris Refund di atas:
  // ini dokumen rekonsiliasi, dan blok yang menghilang saat nol membuat
  // pembaca bertanya apakah kasnya sudah diperiksa atau justru terlupa
  // dicatat. Nol yang tercetak menjawab pertanyaan itu.
  //
  // Entri NON TUNAI tidak mengubah Kas Seharusnya maupun Saldo Akhir. Uangnya
  // tidak lewat laci, dan Saldo Akhir sengaja tetap murni penjualan supaya
  // struk lama dan baru masih bisa dibandingkan. Ia tercetak sebagai catatan
  // dengan barisnya sendiri — itu keputusan, bukan kelalaian.
  lines.push("KAS MASUK");
  if (report.kasMasuk.length > 0) lines.push(...rincianKas(report.kasMasuk));
  lines.push(pair("Masuk Tunai", formatRupiah(report.kasMasukTunai)));
  lines.push(pair("Masuk Non Tunai", formatRupiah(report.kasMasukNonTunai)));
  lines.push(divider);

  lines.push("KAS KELUAR");
  if (report.kasKeluar.length > 0) lines.push(...rincianKas(report.kasKeluar));
  lines.push(pair("Keluar Tunai", formatRupiah(report.kasKeluarTunai)));
  lines.push(pair("Keluar Non Tunai", formatRupiah(report.kasKeluarNonTunai)));
  lines.push(divider);

  // Rekonsiliasi kas fisik. Kas Seharusnya memakai refundTunai (bukan
  // report.refund di atas) karena hanya refund atas order tunai yang
  // uangnya keluar dari laci — lihat komentar shiftTotals di db/shift.ts.
  //
  // Arah selisih dicetak lewat LABEL (KURANG/LEBIH/COCOK), bukan tanda
  // minus: di kertas termal 58mm sebuah "-" mudah tidak terlihat, dan
  // "kurang 2.700" yang terbaca "lebih 2.700" adalah kesalahan yang tidak
  // akan pernah ada yang menyadarinya.
  const kasHarus = kasSeharusnya(report);
  const selisih = report.kasFisik - kasHarus;
  const labelSelisih =
    selisih === 0 ? "KAS COCOK" : selisih > 0 ? "SELISIH LEBIH" : "SELISIH KURANG";

  lines.push(pair("Refund Tunai", `-${formatRupiah(report.refundTunai)}`));
  lines.push(pair("Kas Seharusnya", formatRupiah(kasHarus)));
  lines.push(pair("Kas Dihitung", formatRupiah(report.kasFisik)));
  lines.push(pair(labelSelisih, formatRupiah(Math.abs(selisih))));
  lines.push(divider);

  lines.push(pair("Pajak (PBJT)", formatRupiah(report.pajak)));
  lines.push(divider);

  lines.push(pair("Transaksi Selesai", String(report.transaksiSelesai)));
  lines.push(pair("Transaksi Belum Terbayar", String(report.transaksiPending)));

  return ascii(lines.join("\n"));
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
  const packets = buildReceiptPackets(order, shop);
  const total = packets.reduce((n, p) => n + p.length, 0);
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const packet of packets) {
    bytes.set(packet, offset);
    offset += packet.length;
  }
  return bytes;
}

/**
 * Struk yang sama, dipecah menjadi paket-paket yang BOLEH dijeda di antaranya.
 *
 * Ini yang sebenarnya dikirim ke printer; buildReceiptBytes di atas hanya
 * menyambungnya kembali untuk pemeriksaan dan pratinjau.
 *
 * Alasannya ditemukan di kertas, bukan di dokumentasi. Modul Bluetooth memberi
 * jeda antar potongan supaya buffer printer sempat kosong — tetapi potongannya
 * dipotong per 256 byte, tanpa peduli isinya, sehingga jedanya bisa jatuh di
 * TENGAH satu perintah raster. Printer kelas ini membatalkan perintah yang
 * belum lengkap ketika alirannya berhenti sejenak, lalu kembali ke mode teks —
 * dan sisa data gambar tercetak sebagai karakter, termasuk aksara Mandarin,
 * karena byte di atas 0x7F dibaca menurut halaman kode bawaannya.
 *
 * Jadi batas paket di sini punya arti: setiap perintah raster berdiri sebagai
 * satu paket utuh yang tidak boleh dipotong, dan jeda hanya boleh diambil di
 * antara paket — yaitu di tempat printer memang sedang tidak menunggu apa pun.
 */
export function buildReceiptPackets(
  order: ReceiptOrder,
  shop: ReceiptShop
): Uint8Array[] {
  const body = renderReceiptText(order, shop);

  const packets: Uint8Array[] = [];

  packets.push(new Uint8Array(teksJadiByte(CMD.init + CMD.alignCenter)));

  // Logo di ATAS nama toko, bukan menggantikannya. Kalau logo ternyata kurang
  // terbaca di kertas termal, struk masih menyebutkan nama tokonya — sedangkan
  // logo yang menggantikan nama akan menghasilkan struk tanpa identitas sama
  // sekali. Bisa ditukar setelah hasil cetaknya dilihat.
  if (receiptLogo) {
    for (const pita of logoJadiPita(receiptLogo)) {
      packets.push(new Uint8Array(pita));
    }
    // Jarak di bawah logo. `GS v 0` memajukan kertas tepat setinggi gambarnya,
    // jadi tanpa ini baris pertama menempel langsung pada tepi bawah logo.
    packets.push(new Uint8Array(teksJadiByte(CMD.feedLogo)));
  }

  packets.push(
    new Uint8Array(teksJadiByte(CMD.alignLeft + body + "\n" + CMD.feedAndCut))
  );

  return packets;
}

/**
 * Paket ESC/POS untuk bill. Batas raster logo tetap dipertahankan seperti
 * struk lunas: satu pita gambar tidak boleh terpotong oleh jeda Bluetooth.
 */
export function buildBillPackets(order: BillOrder, shop: ReceiptShop): Uint8Array[] {
  const body = renderBillText(order, shop);
  const packets: Uint8Array[] = [
    new Uint8Array(teksJadiByte(CMD.init + CMD.alignCenter)),
  ];

  if (receiptLogo) {
    for (const pita of logoJadiPita(receiptLogo)) {
      packets.push(new Uint8Array(pita));
    }
    packets.push(new Uint8Array(teksJadiByte(CMD.feedLogo)));
  }

  packets.push(
    new Uint8Array(teksJadiByte(CMD.alignLeft + body + "\n" + CMD.feedAndCut))
  );
  return packets;
}

/**
 * Paket ESC/POS untuk laporan Tutup Kasir. Batas raster logo dipertahankan
 * sama seperti struk lunas dan bill — lihat komentar buildReceiptPackets.
 */
export function buildShiftPackets(report: ShiftReport, shop: ReceiptShop): Uint8Array[] {
  const body = renderShiftText(report, shop);
  const packets: Uint8Array[] = [
    new Uint8Array(teksJadiByte(CMD.init + CMD.alignCenter)),
  ];

  if (receiptLogo) {
    for (const pita of logoJadiPita(receiptLogo)) {
      packets.push(new Uint8Array(pita));
    }
    packets.push(new Uint8Array(teksJadiByte(CMD.feedLogo)));
  }

  packets.push(
    new Uint8Array(teksJadiByte(CMD.alignLeft + body + "\n" + CMD.feedAndCut))
  );
  return packets;
}

/**
 * Satu karakter satu byte. Seluruh isi struk sudah dilewatkan ascii(), jadi
 * tidak ada lagi karakter di atas 0x7F yang bisa ditafsirkan printer sebagai
 * awal karakter dua-byte dan menelan tetangganya. Dulu komentar di sini
 * menyatakan isinya "seluruhnya ASCII" sebagai fakta, padahal tidak ada yang
 * menjaminnya — dan formatRupiah diam-diam melanggarnya.
 */
function teksJadiByte(text: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < text.length; i += 1) out.push(text.charCodeAt(i) & 0xff);
  return out;
}

/**
 * Tinggi satu pita logo, dalam titik.
 *
 * Kelipatan 8 supaya pita terakhir tidak pernah jatuh di tengah byte, dan
 * cukup kecil agar satu pita muat di buffer printer termurah sekalipun:
 * 24 titik x 24 byte per baris = 576 byte.
 */
const PITA_LOGO = 24;

/**
 * Perintah raster ESC/POS `GS v 0`, dipecah menjadi beberapa pita mendatar.
 *
 * Ukurannya dikirim sebagai lebar dalam BYTE (bukan titik) dan tinggi dalam
 * titik, masing-masing dua byte little-endian. Ini satu-satunya tempat di
 * seluruh struk yang mengirim byte di atas 0x7F dengan sengaja, dan itu aman
 * justru karena printer sedang membaca panjang data yang sudah diberitahukan —
 * bukan menafsirkannya sebagai teks.
 *
 * KENAPA DIPECAH, dan bukan satu perintah untuk seluruh gambar. Satu perintah
 * memaksa printer menampung seluruh bitmap sebelum mencetak sebaris pun.
 * Buffer printer termal murah jauh lebih kecil dari itu, dan ketika penuh ia
 * tidak melapor apa-apa — ia MEMBUANG byte yang datang. Byte yang terbuang
 * membuat hitungan panjangnya meleset, sehingga printer berhenti membaca
 * gambar di tengah jalan dan mulai menafsirkan sisa bitmap sebagai teks:
 * logonya keluar setengah, disusul karakter acak, dan sisa struk — produk,
 * total, kembalian — habis tertelan sebagai gambar yang tidak pernah selesai.
 *
 * Gejalanya persis itu yang terlihat di kertas, dan tidak ada satu pun error
 * di aplikasi maupun di logcat, karena dari sisi Android semua byte terkirim.
 *
 * Dipecah per pita, tiap perintah berdiri sendiri: printer mencetak pita yang
 * satu dan mengosongkan buffernya sebelum pita berikutnya tiba. Hasil di
 * kertas sama persis — pita ditumpuk tanpa jarak — karena `GS v 0` tidak
 * memajukan kertas melebihi tinggi gambarnya sendiri.
 */
function logoJadiPita(logo: ReceiptLogo): number[][] {
  const bytePerBaris = Math.ceil(logo.width / 8);
  const pita: number[][] = [];

  for (let atas = 0; atas < logo.height; atas += PITA_LOGO) {
    const tinggi = Math.min(PITA_LOGO, logo.height - atas);
    const satu: number[] = [
      0x1d,
      0x76,
      0x30,
      0x00, // mode normal, tanpa penggandaan ukuran
      bytePerBaris & 0xff,
      (bytePerBaris >> 8) & 0xff,
      tinggi & 0xff,
      (tinggi >> 8) & 0xff,
    ];
    const mulai = atas * bytePerBaris;
    for (let i = 0; i < tinggi * bytePerBaris; i += 1) {
      satu.push(logo.data[mulai + i] ?? 0);
    }
    pita.push(satu);
  }

  return pita;
}
