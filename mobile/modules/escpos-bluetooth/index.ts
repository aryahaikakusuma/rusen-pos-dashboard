/**
 * Permukaan JS modul cetak Bluetooth. Tipis dengan sengaja: yang di sini hanya
 * pembungkus bertipe untuk fungsi native, tanpa satu pun keputusan produk.
 * Pemilihan printer, penyimpanan pilihan, dan kalimat error bahasa Indonesia
 * ada di `lib/printer.ts` — supaya modul ini tetap bisa dipakai ulang kalau
 * suatu saat ada layar kedua yang mencetak.
 */

import { requireNativeModule } from "expo-modules-core";

export interface BondedDevice {
  /** Nama yang terlihat di Pengaturan Android, mis. "RPP02N". */
  name: string;
  /** Alamat MAC. Inilah yang disimpan sebagai pilihan, bukan namanya —
   *  nama bisa berubah, alamat tidak. */
  address: string;
  /** Perangkat mengumumkan UUID 00001101. Hampir pasti printer termal. */
  supportsSpp: boolean;
  /** Kelas perangkat Bluetooth "imaging". Petunjuk kedua, bukan syarat. */
  isImagingClass: boolean;
}

export interface BluetoothStatus {
  /** Perangkat kerasnya ada. */
  supported: boolean;
  /** Bluetooth sedang hidup. */
  enabled: boolean;
  /** BLUETOOTH_CONNECT sudah diberikan (selalu true di bawah Android 12). */
  hasPermission: boolean;
}

interface EscposBluetoothNativeModule {
  getStatus(): Promise<BluetoothStatus>;
  listBondedDevices(): Promise<BondedDevice[]>;
  /**
   * Tiap paket ditulis utuh; jeda hanya diambil di antaranya. Batas paket
   * ditentukan penyusun struk, karena hanya di sana yang tahu byte mana yang
   * tidak boleh terpotong di tengah.
   */
  printPackets(address: string, packets: Uint8Array[]): Promise<void>;
}

export default requireNativeModule<EscposBluetoothNativeModule>("EscposBluetooth");
