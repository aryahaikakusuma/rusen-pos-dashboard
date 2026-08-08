import { jaga } from "@/lib/api";
import { laporanProduk, namaOutlet } from "@/lib/laporan";
import { bacaPeriode } from "@/lib/periode";

/**
 * Laporan Produk — satu baris per VARIAN, karena di skema ini tiap varian
 * memang baris produk tersendiri (keputusan 4 di `0027`). Penjumlahan ke
 * tingkat kategori dikerjakan di tampilan, bukan di sini dan bukan di SQL.
 */
export const GET = jaga(async (request) => {
  const periode = bacaPeriode(new URL(request.url).searchParams);

  const [baris, outlet] = await Promise.all([laporanProduk(periode), namaOutlet()]);

  return Response.json({ periode, outlet, baris });
});
