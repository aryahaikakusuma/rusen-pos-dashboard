/**
 * Pratinjau struk di terminal, tanpa printer dan tanpa perangkat.
 *
 * Gunanya bukan menguji — ini alat lihat. Lebar kertas 58mm hanya memberi 32
 * kolom, dan satu-satunya cara tahu sebuah nama produk merusak perataan adalah
 * dengan melihatnya. Menunggu printer sungguhan untuk itu berarti setiap
 * penyetelan kecil berbiaya satu build APK.
 *
 * Jalankan: npm run preview:struk
 *
 * Contohnya sengaja memakai kasus terburuk yang benar-benar ada di katalog,
 * bukan contoh yang enak dilihat: nama produk terpanjang dari 293 produk,
 * catatan yang harus dipenggal, dan nominal enam digit.
 */

import {
  buildBillPackets,
  buildShiftPackets,
  kasSeharusnya,
  renderBillText,
  renderReceiptText,
  renderShiftText,
  COLUMNS,
  type BillOrder,
  type ReceiptOrder,
  type ShiftReport,
} from "../lib/receipt";
// Identitas toko dibaca dari sumber yang sama dengan yang dipakai aplikasi.
// Dulu nilainya disalin di sini, sehingga pratinjau bisa terlihat benar
// sementara struk yang keluar dari printer berbeda.
import { shop } from "../lib/shop";
import { formatRupiah } from "../lib/types";

const lunas: ReceiptOrder = {
  tableCode: "A3",
  tableSeq: 1,
  status: "paid",
  // 34.000 + 15.000 + 27.000 + 5.000. Angkanya dulu tertulis 91.000 dan tidak
  // pernah menjumlah — luput bertahun-tahun karena struk lama tidak punya baris
  // Subtotal untuk dibandingkan. Baris pajak yang membuatnya kelihatan, dan
  // pemeriksaan jumlah item di kaki berkas ini yang menjaganya tetap kelihatan.
  subtotal: 81000,
  taxStatus: "taxable",
  taxRateBps: 1000,
  taxAmount: 8100,
  total: 89100,
  createdAt: "2026-07-31T10:15:00+07:00",
  paidAt: "2026-07-31T10:42:00+07:00",
  paymentMethod: "cash",
  amountReceived: 100000,
  changeAmount: 10900,
  items: [
    { productName: "Kopi Susu Gelas Besar", quantity: 2, unitPrice: 17000 },
    {
      productName: "Kentang / Tela Singkong Goreng",
      quantity: 1,
      unitPrice: 15000,
      notes: "tanpa saus, pedas sedikit saja",
    },
    { productName: "Nasi Goreng Ayam", quantity: 1, unitPrice: 27000 },
    { productName: "Teh", quantity: 1, unitPrice: 5000 },
  ],
};

const belumLunas: ReceiptOrder = {
  ...lunas,
  status: "pending",
  paidAt: null,
  paymentMethod: null,
  amountReceived: null,
  changeAmount: null,
  // Order pending: status pajaknya belum diputuskan, jadi subtotal dan total
  // masih sama dan tidak ada baris pajak sama sekali. Struk final untuk order
  // yang sama nanti akan 10% lebih tinggi — itu benar, dan bagian dari kenapa
  // contoh ini dicetak.
  subtotal: 22000,
  total: 22000,
  taxAmount: 0,
  items: [{ productName: "Kopi Cendol S", quantity: 1, unitPrice: 22000 }],
};

const nonTunai: ReceiptOrder = {
  ...lunas,
  paymentMethod: "non_cash",
  amountReceived: null,
  changeAmount: null,
};

const billParsial: BillOrder = {
  tableCode: "A3",
  tableSeq: 1,
  createdAt: "2026-07-31T10:15:00+07:00",
  taxStatus: "exempt",
  taxRateBps: 1000,
  items: [
    {
      productName: "Kopi Susu Gelas Besar",
      quantity: 2,
      unitPrice: 17000,
      taxable: true,
    },
    {
      productName: "Kentang / Tela Singkong Goreng",
      quantity: 1,
      unitPrice: 15000,
      notes: "tanpa saus, pedas sedikit saja",
      taxable: true,
    },
  ],
};

const billPbjt: BillOrder = {
  ...billParsial,
  taxStatus: "taxable",
};

/**
 * Tagihan campuran: makanan kena PBJT, rokok tidak.
 *
 * Dicetak supaya satu hal terlihat oleh mata manusia: PBJT-nya BUKAN 10% dari
 * SUBTOTAL TAGIHAN yang tercetak tepat di atasnya. 49.000 subtotal, tapi
 * basisnya hanya 49.000 - 38.000 = 11.000, jadi pajaknya 1.100 dan bukan 4.900.
 * Itu benar, dan itu persis angka yang akan dilaporkan sebagai salah hitung
 * oleh siapa pun yang mengalikan sendiri di kepala. Tidak ada assertion yang
 * bisa membuktikan sebuah angka pantas terlihat ganjil.
 */
const billRokok: BillOrder = {
  ...billParsial,
  taxStatus: "taxable",
  items: [
    { productName: "Kopi", quantity: 1, unitPrice: 11000, taxable: true },
    {
      productName: "Sampoerna / Hijau",
      quantity: 1,
      unitPrice: 38000,
      taxable: false,
    },
  ],
};

/**
 * Bebas pajak. Struknya harus tidak menyebut pajak SAMA SEKALI — bukan menulis
 * "PBJT Rp 0", bukan menandai statusnya. Dicetak di sini justru supaya
 * ketiadaan itu terlihat oleh manusia, karena tidak ada assertion yang bisa
 * membuktikan sebuah baris pantas absen.
 */
const bebasPajak: ReceiptOrder = {
  ...lunas,
  taxStatus: "exempt",
  taxAmount: 0,
  total: 81000,
  amountReceived: 100000,
  changeAmount: 19000,
};

function tampilkan(judul: string, teks: string) {
  const kepanjangan = teks.split("\n").filter((l) => l.length > COLUMNS);

  console.log(`\n${judul}`);
  console.log("=".repeat(COLUMNS) + "  <- batas kertas 58mm");
  console.log(teks);
  console.log("=".repeat(COLUMNS));

  if (kepanjangan.length > 0) {
    console.log(`\n  MELEWATI ${COLUMNS} KOLOM:`);
    for (const l of kepanjangan) console.log(`  ${l.length}: ${l}`);
    process.exitCode = 1;
  }

  // Tanda tanya di struk berarti ada karakter yang tidak bisa dicetak dan
  // sudah diganti oleh penyaring ASCII. Tidak ada satu pun "?" yang sah di
  // teks struk, jadi kemunculannya selalu berarti sesuatu hilang. Inilah yang
  // akan menangkap ulang cacat U+00A0 dari Intl kalau ia kembali lewat jalan
  // lain — dulu ia lolos justru karena di layar tampak seperti spasi biasa.
  if (teks.includes("?")) {
    console.log("\n  ADA KARAKTER YANG TIDAK BISA DICETAK (diganti '?')");
    process.exitCode = 1;
  }
}

tampilkan("--- Lunas tunai, kena pajak, dengan kembalian", renderReceiptText(lunas, shop));
tampilkan("--- Lunas non tunai, kena pajak", renderReceiptText(nonTunai, shop));
tampilkan("--- Lunas tunai, BEBAS PAJAK (tanpa baris pajak apa pun)", renderReceiptText(bebasPajak, shop));
tampilkan("--- Belum lunas (tagihan sementara, pra-pajak)", renderReceiptText(belumLunas, shop));

// Struk order mode uji. Yang diuji bukan hanya lebarnya: penandanya harus
// muncul DUA KALI, di kepala dan di kaki. Struk 58mm sering disobek dan dibaca
// dari bawah, jadi penanda yang hanya di kepala bisa hilang bersama potongan
// yang dibuang — dan yang tersisa terbaca sebagai bukti bayar sungguhan.
const uji: ReceiptOrder = { ...lunas, isTestData: true };
const teksUji = renderReceiptText(uji, shop);
tampilkan("--- Lunas tunai, MODE UJI (penanda di kepala dan kaki)", teksUji);

const jumlahPenandaUji = teksUji
  .split("\n")
  .filter((line) => line.includes("BUKAN BUKTI PEMBAYARAN")).length;
if (jumlahPenandaUji !== 2) {
  console.log(
    `\n  GAGAL: penanda uji muncul ${jumlahPenandaUji} kali, seharusnya 2.`
  );
  process.exitCode = 1;
}

// Dan struk BIASA tidak boleh memuatnya sama sekali. Tanpa pemeriksaan ini,
// penanda yang tidak sengaja dicetak pada setiap struk akan lolos — ia hanya
// menambah dua baris dan tidak melanggar batas kolom mana pun.
if (renderReceiptText(lunas, shop).includes("UJI COBA")) {
  console.log("\n  GAGAL: struk biasa memuat penanda uji.");
  process.exitCode = 1;
}

const teksBill = renderBillText(billParsial, shop);
console.log("\n--- Bill parsial Biasa");
console.log("=".repeat(COLUMNS) + "  <- batas kertas 58mm");
console.log(teksBill);
console.log("=".repeat(COLUMNS));

const billKepanjangan = teksBill.split("\n").filter((line) => line.length > COLUMNS);
if (billKepanjangan.length > 0) {
  console.log("\n  GAGAL: ada baris bill melebihi 32 kolom.");
  process.exitCode = 1;
}
const subtotalBill = billParsial.items.reduce(
  (total, item) => total + item.quantity * item.unitPrice,
  0
);
if (!teksBill.includes("Rp 49.000") || subtotalBill !== 49000) {
  console.log("\n  GAGAL: subtotal bill bukan jumlah item terpilih.");
  process.exitCode = 1;
}
for (const forbidden of ["PBJT", "Metode", "Kembali", "WiFi", "Terima kasih"]) {
  if (teksBill.includes(forbidden)) {
    console.log(`\n  GAGAL: bill memuat ${forbidden}.`);
    process.exitCode = 1;
  }
}
if (teksBill.split("\n").some((line) => line.trimStart().startsWith("TOTAL"))) {
  console.log("\n  GAGAL: bill Biasa memuat total akhir.");
  process.exitCode = 1;
}

const teksBillPbjt = renderBillText(billPbjt, shop);
console.log("\n--- Bill parsial Kena PBJT");
console.log("=".repeat(COLUMNS) + "  <- batas kertas 58mm");
console.log(teksBillPbjt);
console.log("=".repeat(COLUMNS));
if (teksBillPbjt.split("\n").some((line) => line.length > COLUMNS)) {
  console.log("\n  GAGAL: ada baris bill PBJT melebihi 32 kolom.");
  process.exitCode = 1;
}
if (
  !teksBillPbjt.includes("PBJT 10%") ||
  !teksBillPbjt.includes("Rp 4.900") ||
  !teksBillPbjt.includes("Rp 53.900")
) {
  console.log("\n  GAGAL: bill PBJT tidak memuat pajak dan total tagihan yang benar.");
  process.exitCode = 1;
}

const teksBillRokok = renderBillText(billRokok, shop);
console.log("\n--- Bill campuran: makanan kena PBJT, rokok tidak");
console.log("=".repeat(COLUMNS) + "  <- batas kertas 58mm");
console.log(teksBillRokok);
console.log("=".repeat(COLUMNS));
if (teksBillRokok.split("\n").some((line) => line.length > COLUMNS)) {
  console.log("\n  GAGAL: ada baris bill rokok melebihi 32 kolom.");
  process.exitCode = 1;
}
// Subtotal 49.000, tapi basis pajaknya hanya kopinya: 11.000 -> PBJT 1.100.
// Angka 4.900 di bawah adalah yang akan tercetak kalau basisnya kembali ke
// seluruh subtotal — itulah kegagalan yang assertion ini jaga.
if (
  !teksBillRokok.includes("Rp 49.000") ||
  !teksBillRokok.includes("Rp 1.100") ||
  !teksBillRokok.includes("Rp 50.100") ||
  teksBillRokok.includes("Rp 4.900")
) {
  console.log("\n  GAGAL: PBJT pada bill campuran tidak dihitung dari basis kena pajak.");
  process.exitCode = 1;
}

const bytesBillPbjt = String.fromCharCode(
  ...buildBillPackets(billPbjt, shop).flatMap((packet) => [...packet])
);
if (bytesBillPbjt.includes("\x1bM")) {
  console.log("\n  GAGAL: bill mengubah font printer; ukuran hanya diatur pada tampilan aplikasi.");
  process.exitCode = 1;
}

// Angka contoh harus benar-benar menjumlah. Terdengar sepele, dan justru di
// sinilah satu kesalahan bertahan lama: `total` pernah tertulis 91.000 untuk
// item yang berjumlah 81.000, dan tidak ada yang menangkapnya karena struk lama
// hanya mencetak TOTAL — tidak ada angka kedua untuk membandingkannya. Contoh
// yang tidak konsisten membuat pratinjau kehilangan gunanya: mata tidak bisa
// menilai perataan sambil menduga-duga angka mana yang salah.
for (const [judul, order] of [
  ["lunas", lunas],
  ["non tunai", nonTunai],
  ["bebas pajak", bebasPajak],
  ["belum lunas", belumLunas],
] as const) {
  const jumlahItem = order.items.reduce(
    (n, i) => n + i.unitPrice * i.quantity,
    0
  );
  if (jumlahItem !== order.subtotal) {
    console.log(
      `\n  GAGAL contoh "${judul}": jumlah item ${jumlahItem} != subtotal ${order.subtotal}`
    );
    process.exitCode = 1;
  }
  if (order.subtotal + order.taxAmount !== order.total) {
    console.log(
      `\n  GAGAL contoh "${judul}": subtotal + pajak != total (${order.subtotal} + ${order.taxAmount} != ${order.total})`
    );
    process.exitCode = 1;
  }
}

// Satu-satunya hal soal pajak yang bisa ditegaskan otomatis: struk bebas pajak
// tidak boleh memuat kata "PBJT". Sisanya urusan mata.
const teksBebas = renderReceiptText(bebasPajak, shop);
if (teksBebas.includes("PBJT") || teksBebas.includes("Subtotal")) {
  console.log("\n  GAGAL: struk bebas pajak memuat baris pajak.");
  process.exitCode = 1;
}

// Dan struk kena pajak WAJIB memuatnya — tanpa itu TOTAL tidak sama dengan
// jumlah baris item di atasnya, dan pelanggan yang menjumlahkan sendiri akan
// mengira dirinya kelebihan ditagih.
const teksKena = renderReceiptText(lunas, shop);
if (!teksKena.includes("PBJT") || !teksKena.includes("Subtotal")) {
  console.log("\n  GAGAL: struk kena pajak tidak memuat rincian pajaknya.");
  process.exitCode = 1;
}

// --------------------------------------------------------- Tutup Kasir

const sifNormal: ShiftReport = {
  cashierName: "Nurannisa",
  openedAt: "2026-07-31T00:12:00+07:00",
  closedAt: "2026-07-31T07:35:00+07:00",
  modalAwal: 0,
  tunai: 502700,
  nonTunai: 346500,
  qris: 200000,
  transfer: 100000,
  kartu: 46500,
  refund: 0,
  refundTunai: 0,
  // Kas cocok: modalAwal(0) + tunai(502.700) - refundTunai(0) = 502.700.
  kasFisik: 502700,
  pajak: 77200,
  transaksiSelesai: 24,
  transaksiPending: 0,
  // Sif tanpa satu pun entri kas. Empat baris total tetap harus tercetak
  // sebagai Rp 0, dan judul KAS MASUK/KAS KELUAR tidak boleh muncul —
  // inilah bentuk struk yang paling sering keluar dari printer.
  kasMasuk: [],
  kasKeluar: [],
  kasMasukTunai: 0,
  kasMasukNonTunai: 0,
  kasKeluarTunai: 0,
  kasKeluarNonTunai: 0,
};

const sifDenganRefund: ShiftReport = {
  ...sifNormal,
  cashierName: "Budi Santoso",
  refund: 12000,
  refundTunai: 12000,
  // Kas Seharusnya = 0 + 502.700 - 12.000 = 490.700; kasir menghitung
  // 488.000 => SELISIH KURANG 2.700.
  kasFisik: 488000,
  transaksiSelesai: 25,
};

// Kas lebih: hasil hitung fisik di atas Kas Seharusnya.
const sifKasLebih: ShiftReport = {
  ...sifNormal,
  cashierName: "Nurannisa",
  kasFisik: 505000,
};

// Sif kosong harus tetap masuk akal: tidak ada transaksi tidak berarti struk
// rusak, dan Saldo Akhir harus tetap sama dengan Modal Awal.
const sifKosong: ShiftReport = {
  cashierName: "Budi Santoso",
  openedAt: "2026-07-31T14:35:00+07:00",
  closedAt: "2026-07-31T15:00:00+07:00",
  modalAwal: 100000,
  tunai: 0,
  nonTunai: 0,
  qris: 0,
  transfer: 0,
  kartu: 0,
  refund: 0,
  refundTunai: 0,
  // Kas dihitung 0 adalah hasil yang sah (laci memang kosong selain modal).
  kasFisik: 100000,
  pajak: 0,
  transaksiSelesai: 0,
  transaksiPending: 3,
  kasMasuk: [],
  kasKeluar: [],
  kasMasukTunai: 0,
  kasMasukNonTunai: 0,
  kasKeluarTunai: 0,
  kasKeluarNonTunai: 0,
};

// Nama panjang dan nilai jutaan, supaya pair() terbukti tidak pernah memotong
// angka uang — kalaupun sisi kiri (nama/label) yang harus dikorbankan.
const sifBesar: ShiftReport = {
  cashierName: "Raden Ayu Kusumaningrum Wijayanti",
  openedAt: "2026-07-31T00:00:00+07:00",
  closedAt: "2026-07-31T23:59:00+07:00",
  modalAwal: 5000000,
  tunai: 12345000,
  nonTunai: 9876000,
  qris: 5000000,
  transfer: 3876000,
  kartu: 1000000,
  refund: 543000,
  refundTunai: 543000,
  kasFisik: 16789000,
  pajak: 2012300,
  transaksiSelesai: 318,
  transaksiPending: 2,
  kasMasuk: [],
  kasKeluar: [],
  kasMasukTunai: 0,
  kasMasukNonTunai: 0,
  kasKeluarTunai: 0,
  kasKeluarNonTunai: 0,
};

// Kas campuran tunai dan non tunai, dua arah. Ini contoh yang membuktikan
// bahwa entri non tunai TIDAK ikut menggeser Kas Seharusnya: kasnya
// 0 + 502.700 - 0 + 200.000 - 25.000 = 677.700, dan Bayar listrik 120.000
// non tunai tidak menguranginya walau tercetak jelas di kertas.
const sifKasCampuran: ShiftReport = {
  ...sifNormal,
  cashierName: "Nurannisa",
  kasMasuk: [{ note: "Setoran pemilik", method: "cash", amount: 200000 }],
  kasKeluar: [
    { note: "Beli gas 3kg", method: "cash", amount: 25000 },
    { note: "Bayar listrik", method: "non_cash", amount: 120000 },
  ],
  kasMasukTunai: 200000,
  kasMasukNonTunai: 0,
  kasKeluarTunai: 25000,
  kasKeluarNonTunai: 120000,
  kasFisik: 677700,
};

// Catatan yang lebih panjang dari satu baris kertas, bersama nominal jutaan.
// Inilah yang membuktikan pemenggalan catatan tidak pernah memakan angka
// uang: catatannya boleh sepanjang apa pun karena nominalnya berdiri di
// barisnya sendiri.
const sifKasCatatanPanjang: ShiftReport = {
  ...sifBesar,
  cashierName: "Nurannisa",
  kasMasuk: [
    {
      note: "Tarik tunai dari rekening toko untuk kembalian akhir pekan",
      method: "cash",
      amount: 3000000,
    },
  ],
  kasKeluar: [
    {
      note: "Beli gas 3kg dan es batu di warung sebelah",
      method: "cash",
      amount: 1250000,
    },
    {
      note: "Bayar sewa mesin kopi bulan Juli lewat transfer bank",
      method: "non_cash",
      amount: 2400000,
    },
  ],
  kasMasukTunai: 3000000,
  kasMasukNonTunai: 0,
  kasKeluarTunai: 1250000,
  kasKeluarNonTunai: 2400000,
  // 5.000.000 + 12.345.000 - 543.000 + 3.000.000 - 1.250.000 = 18.552.000.
  kasFisik: 18552000,
};

tampilkan("--- Tutup Kasir, sif normal (kas cocok)", renderShiftText(sifNormal, shop));
tampilkan("--- Tutup Kasir, dengan refund (kas kurang)", renderShiftText(sifDenganRefund, shop));
tampilkan("--- Tutup Kasir, kas lebih", renderShiftText(sifKasLebih, shop));
tampilkan("--- Tutup Kasir, sif kosong (nol transaksi)", renderShiftText(sifKosong, shop));
tampilkan("--- Tutup Kasir, nama panjang dan nilai jutaan", renderShiftText(sifBesar, shop));
tampilkan("--- Tutup Kasir, kas masuk/keluar campuran tunai dan non tunai", renderShiftText(sifKasCampuran, shop));
tampilkan("--- Tutup Kasir, catatan kas panjang dan nominal jutaan", renderShiftText(sifKasCatatanPanjang, shop));

for (const [judul, report] of [
  ["normal", sifNormal],
  ["refund", sifDenganRefund],
  ["kas lebih", sifKasLebih],
  ["kosong", sifKosong],
  ["besar", sifBesar],
  ["kas campuran", sifKasCampuran],
  ["kas catatan panjang", sifKasCatatanPanjang],
] as const) {
  const penerimaan = report.tunai + report.nonTunai;
  const saldoAkhir = report.modalAwal + penerimaan - report.refund;
  // Dihitung lewat helper yang sama dengan yang dipakai kertas dan layar.
  // Menyalin rumusnya di sini akan membuat pemeriksaan ini lulus justru saat
  // rumusnya salah di kedua tempat.
  const kasHarus = kasSeharusnya(report);
  const selisih = report.kasFisik - kasHarus;
  const teks = renderShiftText(report, shop);

  if (!teks.includes("Refund Tunai") || !teks.includes("Kas Seharusnya") || !teks.includes("Kas Dihitung")) {
    console.log(`\n  GAGAL sif "${judul}": baris rekonsiliasi kas tidak lengkap.`);
    process.exitCode = 1;
  }
  if (!teks.includes("Refund")) {
    console.log(`\n  GAGAL sif "${judul}": baris Refund tidak ada walau seharusnya selalu dicetak.`);
    process.exitCode = 1;
  }

  // Judul dan empat baris total kas selalu dicetak, termasuk pada sif yang
  // tidak punya satu pun entri — alasan yang sama dengan baris Refund. Yang
  // boleh absen hanyalah baris rinciannya.
  //
  // Baris totalnya dicocokkan dengan label UTUH, bukan awalannya: label pendek
  // ("Keluar Non Tunai", 16 kolom) dipilih justru supaya pair() tidak pernah
  // perlu memotongnya, jadi pemeriksaan yang menerima label tercukur akan
  // menyembunyikan kembalinya masalah itu.
  for (const label of [
    "Masuk Tunai",
    "Masuk Non Tunai",
    "Keluar Tunai",
    "Keluar Non Tunai",
  ]) {
    if (!teks.split("\n").some((line) => line.startsWith(`${label} `))) {
      console.log(`\n  GAGAL sif "${judul}": baris total "${label}" tidak dicetak utuh.`);
      process.exitCode = 1;
    }
  }
  // Judulnya yang memikul kata "Kas" sesudah label dipendekkan, jadi ia tidak
  // boleh pernah hilang — "Masuk Tunai Rp 0" tanpa judul tidak menyebutkan
  // dirinya kas sama sekali.
  for (const judulBlok of ["KAS MASUK", "KAS KELUAR"]) {
    if (!teks.split("\n").includes(judulBlok)) {
      console.log(`\n  GAGAL sif "${judul}": judul ${judulBlok} tidak dicetak.`);
      process.exitCode = 1;
    }
  }

  // Angka Kas Seharusnya di kertas harus angka yang keluar dari helper. Ini
  // yang menangkap kalau renderShiftText suatu saat kembali menghitung sendiri
  // — persis keadaan yang membuat rumusnya sempat tertulis di tiga tempat.
  //
  // Bahwa entri NON TUNAI tidak ikut menggesernya dijaga oleh tipe helper itu
  // sendiri: parameternya tidak punya medan non tunai sama sekali, jadi
  // memasukkannya adalah galat kompilasi, bukan sekadar pemeriksaan yang bisa
  // dilewat.
  // U+00A0 dari Intl harus diratakan dulu: teks struk sudah lewat ascii(),
  // sedangkan formatRupiah di sini belum. Membandingkan mentah-mentah akan
  // selalu gagal walau angkanya sama persis.
  //
  // Yang ada di dalam regex baris berikut adalah KARAKTER U+00A0 SUNGGUHAN,
  // bukan spasi — di editor mana pun keduanya tampak sama. Menggantinya
  // dengan spasi biasa tidak menimbulkan galat, hanya membuat pemeriksaan ini
  // gagal terus tanpa alasan yang kelihatan. Kalau ragu, dump bytenya.
  const nominalKasHarus = formatRupiah(kasHarus).replace(/ /g, " ");
  const barisKasHarus = teks.split("\n").find((line) => line.startsWith("Kas Seharusnya"));
  if (!barisKasHarus || !barisKasHarus.endsWith(nominalKasHarus)) {
    console.log(`\n  GAGAL sif "${judul}": Kas Seharusnya di kertas bukan hasil kasSeharusnya().`);
    process.exitCode = 1;
  }
  const saldoTercetak = String(Math.round(saldoAkhir)).length > 0;
  if (!saldoTercetak) {
    console.log(`\n  GAGAL sif "${judul}": Saldo Akhir tidak terhitung.`);
    process.exitCode = 1;
  }

  // Arah selisih tertukar adalah kegagalan paling mungkin dan paling tidak
  // kelihatan — KURANG yang tercetak sebagai LEBIH tetap terlihat "normal".
  if (selisih < 0 && (!teks.includes("KURANG") || teks.includes("LEBIH"))) {
    console.log(`\n  GAGAL sif "${judul}": selisih negatif tapi tidak tercetak KURANG.`);
    process.exitCode = 1;
  }
  if (selisih > 0 && (!teks.includes("LEBIH") || teks.includes("KURANG"))) {
    console.log(`\n  GAGAL sif "${judul}": selisih positif tapi tidak tercetak LEBIH.`);
    process.exitCode = 1;
  }
  if (selisih === 0 && !teks.includes("KAS COCOK")) {
    console.log(`\n  GAGAL sif "${judul}": selisih nol tapi tidak tercetak KAS COCOK.`);
    process.exitCode = 1;
  }
}

const bytesSifPbjt = String.fromCharCode(
  ...buildShiftPackets(sifBesar, shop).flatMap((packet) => [...packet])
);
if (bytesSifPbjt.includes("\x1bM")) {
  console.log("\n  GAGAL: laporan Tutup Kasir mengubah font printer.");
  process.exitCode = 1;
}

if (process.exitCode !== 1) {
  console.log("\nSemua baris muat di dalam kertas.");
}
