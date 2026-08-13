import { jaga } from "@/lib/api";
import { KesalahanMasukan } from "@/lib/errors";
import { detailKasShift } from "@/lib/laporan";

const PER_HALAMAN = [25, 50, 100];

/** Daftar Kas per Shift — dipaginasi lewat Content-Range, bukan argumen fungsi. */
export const GET = jaga(async (request) => {
  const params = new URL(request.url).searchParams;
  const shiftId = params.get("shift_id") ?? "";
  if (!shiftId) throw new KesalahanMasukan("Parameter `shift_id` wajib diisi.");

  const diminta = Number(params.get("limit") ?? 25);
  const limit = PER_HALAMAN.includes(diminta) ? diminta : 25;

  const halaman = Math.max(1, Number(params.get("halaman") ?? 1) || 1);
  const offset = (halaman - 1) * limit;

  const hasil = await detailKasShift(shiftId, limit, offset);

  return Response.json({
    shiftId,
    halaman,
    limit,
    totalBaris: hasil.totalBaris,
    baris: hasil.baris,
  });
});
