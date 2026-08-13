import { jaga } from "@/lib/api";
import { laporanShift, orderYatim, refundYatim } from "@/lib/laporan";
import { bacaPeriode } from "@/lib/periode";

/**
 * Kas per Shift — daftar shift plus order/refund "yatim" (di luar jendela shift
 * manapun) pada rentang yang sama. Tiga panggilan dijalankan bersamaan karena
 * semuanya membaca rentang tanggal yang sama dan halaman butuh ketiganya
 * sebelum bisa dirender.
 */
export const GET = jaga(async (request) => {
  const params = new URL(request.url).searchParams;
  const periode = bacaPeriode(params);
  const sertakanTerbuka = params.get("terbuka") === "1";

  const [baris, orderYatimBaris, refundYatimBaris] = await Promise.all([
    laporanShift(periode, sertakanTerbuka),
    orderYatim(periode),
    refundYatim(periode),
  ]);

  return Response.json({
    periode,
    sertakanTerbuka,
    baris,
    orderYatim: orderYatimBaris,
    refundYatim: refundYatimBaris,
  });
});
