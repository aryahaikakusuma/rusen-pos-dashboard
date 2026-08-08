/**
 * Pemformatan angka untuk layar.
 *
 * Ditulis tangan, tidak memakai `Intl.NumberFormat` bergaya `currency`. Gaya
 * itu menyisipkan U+00A0 (spasi tak terputus) antara "Rp" dan angkanya. Di web
 * itu tidak berbahaya, tapi string yang sama gampang berpindah ke tempat yang
 * tidak mengampuni: di struk termal byte itu membuat printer memakan digit
 * berikutnya, dan harganya tercetak salah tanpa error di mana pun. Lebih murah
 * tidak pernah memproduksinya sama sekali.
 */

const PEMISAH = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 });

/** "Rp 1.250.000" — dengan spasi biasa. */
export function rupiah(nilai: number): string {
  const negatif = nilai < 0;
  return `${negatif ? "-" : ""}Rp ${PEMISAH.format(Math.abs(Math.round(nilai)))}`;
}

/** "1.250" — tanpa satuan, untuk kolom cacah. */
export function angka(nilai: number): string {
  return PEMISAH.format(Math.round(nilai));
}

/** "1,2 jt" — untuk label sumbu grafik, di mana angka penuh tidak muat. */
export function rupiahRingkas(nilai: number): string {
  const abs = Math.abs(nilai);
  if (abs >= 1_000_000_000) return `${bulat(nilai / 1_000_000_000)} M`;
  if (abs >= 1_000_000) return `${bulat(nilai / 1_000_000)} jt`;
  if (abs >= 1_000) return `${bulat(nilai / 1_000)} rb`;
  return String(Math.round(nilai));
}

function bulat(nilai: number): string {
  return nilai
    .toFixed(nilai < 10 && !Number.isInteger(nilai) ? 1 : 0)
    .replace(".", ",");
}

/** "12,4%" — null (periode tanpa transaksi) jadi tanda pisah, bukan "NaN%". */
export function persen(nilai: number | null, desimal = 1): string {
  if (nilai === null || !Number.isFinite(nilai)) return "—";
  return `${nilai.toFixed(desimal).replace(".", ",")}%`;
}

/** Pembagian yang tidak pernah menghasilkan NaN atau Infinity di layar. */
export function bagi(pembilang: number, penyebut: number): number {
  return penyebut === 0 ? 0 : pembilang / penyebut;
}

/**
 * Perubahan terhadap periode pembanding, dalam persen.
 *
 * Mengembalikan `null` kalau pembandingnya nol: "naik tak terhingga persen"
 * bukan informasi, dan menampilkannya sebagai +100% adalah kebohongan kecil
 * yang dipercaya orang.
 */
export function delta(sekarang: number, sebelumnya: number): number | null {
  if (sebelumnya === 0) return null;
  return ((sekarang - sebelumnya) / sebelumnya) * 100;
}
