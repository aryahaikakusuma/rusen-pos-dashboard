import { jaga } from "@/lib/api";
import { laporanDetail, namaOutlet } from "@/lib/laporan";
import { bacaPeriode } from "@/lib/periode";

const PER_HALAMAN = [25, 50, 100];

/** Detail Penjualan — satu baris per order lunas, dipaginasi di Postgres. */
export const GET = jaga(async (request) => {
  const params = new URL(request.url).searchParams;
  const periode = bacaPeriode(params);

  // Ukuran halaman dikunci ke daftar yang ada di UI. Menerima angka bebas dari
  // query string berarti satu permintaan bisa meminta seluruh tabel sekaligus.
  const diminta = Number(params.get("limit") ?? 25);
  const limit = PER_HALAMAN.includes(diminta) ? diminta : 25;

  const halaman = Math.max(1, Number(params.get("halaman") ?? 1) || 1);
  const offset = (halaman - 1) * limit;

  const [hasil, outlet] = await Promise.all([
    laporanDetail(periode, limit, offset),
    namaOutlet(),
  ]);

  return Response.json({
    periode,
    outlet,
    halaman,
    limit,
    totalBaris: hasil.totalBaris,
    baris: hasil.baris,
  });
});
