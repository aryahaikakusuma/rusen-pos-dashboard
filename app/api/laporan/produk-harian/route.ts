import { jaga } from "@/lib/api";
import { KesalahanMasukan } from "@/lib/errors";
import { MAKS_SERI_PRODUK } from "@/lib/kontrak";
import { laporanProdukHarian, namaOutlet } from "@/lib/laporan";
import { bacaPeriode } from "@/lib/periode";

/**
 * Sumbu tanggal untuk Laporan Produk — satu baris per varian per tanggal WIB.
 *
 * Route terpisah dari `/api/laporan/produk`, bukan parameter tambahan padanya.
 * Keduanya punya grain yang berbeda dan bentuk balasan yang berbeda, dan
 * halaman itu memakai KEDUANYA sekaligus: tabelnya dari yang lama, grafiknya
 * dari yang ini. Menggabungkannya berarti setiap pengetikan di kotak cari ikut
 * menyeret ulang deret harian yang tidak berubah sedikit pun.
 *
 * `kode` KOSONG BUKAN KESALAHAN. Ia berarti "pilihkan": Postgres mengembalikan
 * lima teratas menurut omzet periode, lewat bawaan `p_teratas`. Halaman karena
 * itu bisa menggambar sesuatu yang berguna sebelum pengguna memilih apa pun.
 *
 * BATASNYA DITEGAKKAN DI SINI, BUKAN HANYA DI TOMBOL. Tombol yang dinonaktifkan
 * tidak menonaktifkan alamatnya, dan permintaan dengan 200 kode akan menempuh
 * jalur yang persis sama sampai ke Postgres. Penolakannya 400 dengan keterangan
 * yang menyebut angkanya, karena pesan itu memang layak dibaca pengguna.
 */
export const GET = jaga(async (request) => {
  const params = new URL(request.url).searchParams;
  const periode = bacaPeriode(params);

  const kode = (params.get("kode") ?? "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);

  // Duplikat dibuang lebih dulu supaya batasnya dihitung atas jumlah SERI, bukan
  // atas panjang teks yang dikirim. Dua kode yang sama juga akan menghasilkan
  // dua seri bertumpuk sempurna di grafik, yang tidak pernah berguna.
  const unik = [...new Set(kode)];

  if (unik.length > MAKS_SERI_PRODUK) {
    throw new KesalahanMasukan(
      `Grafik ini menampung paling banyak ${MAKS_SERI_PRODUK} produk sekaligus, ` +
        `dan yang diminta ${unik.length}. Batas itu ada karena balasan basis data ` +
        `dipotong diam-diam di 1000 baris — lewat batas, grafik akan menggambar ` +
        `garis dari data yang tidak lengkap tanpa tanda apa pun. Kurangi pilihannya.`
    );
  }

  const [hasil, outlet] = await Promise.all([
    laporanProdukHarian(periode, unik),
    namaOutlet(),
  ]);

  return Response.json({
    periode,
    outlet,
    kode: hasil.kode,
    bawaan: unik.length === 0,
    baris: hasil.baris,
  });
});
