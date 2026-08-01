/**
 * Identitas toko seperti yang tercetak di kepala dan kaki struk.
 *
 * Ini rumah tetapnya. Sebelumnya nilai-nilai ini hanya ada sebagai contoh di
 * dalam `scripts/preview-receipt.ts`, yang berarti pratinjau di terminal dan
 * struk yang benar-benar keluar dari printer bisa berbeda tanpa ada yang
 * menyadarinya. Sekarang keduanya membaca berkas yang sama.
 *
 * Konstanta di dalam kode, bukan setelan di layar, dan itu keputusan sadar:
 * nilai-nilai ini berubah beberapa tahun sekali, sementara layar setelan yang
 * bisa diubah kasir adalah permukaan baru yang harus dijaga selamanya. Sejak
 * expo-updates terpasang, mengubahnya cukup satu update OTA — tidak perlu APK
 * baru.
 */

import type { ReceiptShop } from "./receipt";

export const shop: ReceiptShop = {
  name: "RUSEN KOPITIAM",
  outlet: "Outlet Utama",

  // Dua jaringan, dua password. Hapus salah satu barisnya kalau tidak ingin
  // dibagikan, atau kosongkan seluruh daftarnya kalau tidak ingin ada password
  // di struk sama sekali — kaki struk menyesuaikan sendiri.
  //
  // Nama jaringan ditulis persis seperti yang terbaca di daftar WiFi ponsel
  // pelanggan. Kalau di sana namanya bukan "4G"/"5G", ubah di sini juga:
  // password yang benar di bawah nama yang tidak dikenali sama saja dengan
  // tidak dicetak.
  wifi: [
    { network: "4G", password: "kopihitam" },
    { network: "5G", password: "kopisusu" },
  ],
};
