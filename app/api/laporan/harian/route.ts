import { jaga } from "@/lib/api";
import { laporanHarian, namaOutlet } from "@/lib/laporan";
import { bacaPeriode, periodeSebelumnya } from "@/lib/periode";

/**
 * Penjualan Harian — satu baris per tanggal WIB, hari kosong tetap muncul nol.
 *
 * `bandingkan=1` ikut mengambil periode setara sebelumnya untuk kartu KPI.
 * Perbandingannya diambil dari fungsi yang sama, bukan dihitung ulang, supaya
 * angka pembanding tidak pernah punya definisi kedua.
 */
export const GET = jaga(async (request) => {
  const params = new URL(request.url).searchParams;
  const periode = bacaPeriode(params);
  const bandingkan = params.get("bandingkan") === "1";

  const [baris, outlet, sebelumnya] = await Promise.all([
    laporanHarian(periode),
    namaOutlet(),
    bandingkan ? laporanHarian(periodeSebelumnya(periode)) : Promise.resolve(null),
  ]);

  return Response.json({ periode, outlet, baris, sebelumnya });
});
