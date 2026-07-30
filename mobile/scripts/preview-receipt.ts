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

import { renderReceiptText, COLUMNS, type ReceiptOrder, type ReceiptShop } from "../lib/receipt";

const shop: ReceiptShop = {
  name: "RUSEN KOPITIAM",
  outlet: "Outlet Utama",
  wifiPassword: "rusen2026",
};

const lunas: ReceiptOrder = {
  tableCode: "A3",
  tableSeq: 1,
  status: "paid",
  total: 91000,
  createdAt: "2026-07-31T10:15:00+07:00",
  paidAt: "2026-07-31T10:42:00+07:00",
  paymentMethod: "cash",
  amountReceived: 100000,
  changeAmount: 9000,
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
  total: 22000,
  items: [{ productName: "Kopi Cendol S", quantity: 1, unitPrice: 22000 }],
};

const nonTunai: ReceiptOrder = {
  ...lunas,
  paymentMethod: "non_cash",
  amountReceived: null,
  changeAmount: null,
};

function tampilkan(judul: string, order: ReceiptOrder) {
  const teks = renderReceiptText(order, shop);
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
}

tampilkan("--- Lunas tunai, dengan kembalian", lunas);
tampilkan("--- Lunas non tunai", nonTunai);
tampilkan("--- Belum lunas (tagihan sementara)", belumLunas);

if (process.exitCode !== 1) {
  console.log("\nSemua baris muat di dalam kertas.");
}
