/**
 * PBJT — perhitungan pajak.
 *
 * KEMBAR dengan lib/tax.ts milik web. Metro tidak bisa mengimpor dari luar
 * `mobile/`, jadi berkas ini digandakan, bukan dibagi. Isinya harus sama persis
 * dan wajib diubah bersamaan — kalau keduanya menyimpang, dua perangkat
 * menghitung pajak berbeda untuk transaksi yang sama, dan selisihnya uang.
 * Lihat AGENTS.md.
 *
 * Rumusnya juga harus sama persis dengan yang ada di Postgres
 * (`0012_pbjt_skema.sql`, constraint `tax_arithmetic`) dan di skema SQLite
 * lokal. Ponsel menghitung pajak saat offline dan server memvalidasi ulang saat
 * push; kalau pembulatan ketiganya tidak identik, order lunas ditolak
 * sinkronisasi dan kasir tidak punya cara memahami kenapa.
 */

/**
 * Tarif disimpan dalam basis point: 1 bps = 0,01%, jadi 10% = 1000 bps.
 * Bilangan bulat, supaya tarif pecahan seperti 7,5% tidak pernah menyentuh
 * floating point. Angkanya sendiri TIDAK ada di berkas ini — ia tinggal di
 * `outlets.tax_rate_bps` supaya bisa diubah tanpa build ulang apa pun.
 *
 * ARGUMEN PERTAMA ADALAH BASIS KENA PAJAK, BUKAN SUBTOTAL ORDER.
 *
 * Namanya dibiarkan `subtotal` karena itulah yang benar sampai rokok
 * dibebaskan, dan mengganti nama parameter tidak akan menangkap satu pun
 * pemanggil yang salah. Yang menangkapnya ada di tempat lain: `sumItems` di
 * mobile/db/orders.ts mengembalikan objek `{ subtotal, kena }` justru supaya
 * pemanggil tidak bisa lagi menyerahkan angka yang salah tanpa sadar.
 *
 * Pada order tanpa rokok kedua angka itu sama persis, jadi seluruh pemanggil
 * lama tetap benar.
 */
export function hitungPbjt(subtotal: number, rateBps: number): number {
  // Pembagian dibulatkan ke bawah setelah suku +5000, yang membuatnya
  // pembulatan setengah-ke-atas pada satuan rupiah.
  //
  // SUKU +5000 TIDAK AKAN PERNAH AKTIF DENGAN HARGA YANG ADA SEKARANG. Seluruh
  // harga di seed.sql kelipatan seribu, jadi `subtotal * 1000` selalu kelipatan
  // sejuta dan hasil baginya selalu bulat. Ia asuransi untuk harga masa depan
  // yang berujung angka selain nol — bukan perilaku yang akan pernah terlihat,
  // dan bukan sesuatu untuk "disederhanakan" karena tidak pernah terpicu.
  //
  // Aman dari galat IEEE754: `subtotal * rateBps` tetap eksak selama hasilnya
  // di bawah 2^53 (pada 1000 bps itu subtotal sampai sekitar 9 x 10^11 rupiah),
  // dan hasil bagi selalu kelipatan 1e-4 sehingga tidak pernah cukup dekat ke
  // bilangan bulat untuk digeser pembulatan biner.
  return Math.floor((subtotal * rateBps + 5000) / 10000);
}

/** "PBJT 10%" — label baris pajak di layar dan di struk. */
export function labelPbjt(rateBps: number): string {
  const persen = rateBps / 100;
  return `PBJT ${Number.isInteger(persen) ? persen : persen.toFixed(2)}%`;
}
