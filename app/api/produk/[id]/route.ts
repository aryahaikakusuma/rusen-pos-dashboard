import { bacaJson, jaga } from "@/lib/api";
import { nonaktifkanProduk, ubahProduk } from "@/lib/produk";

interface Konteks {
  params: Promise<{ id: string }>;
}

export const PATCH = jaga(async (request, _sesi, konteks: Konteks) => {
  const { id } = await konteks.params;
  const produk = await ubahProduk(id, await bacaJson(request));
  return Response.json({ produk });
});

/**
 * Menonaktifkan, bukan menghapus baris.
 *
 * Metodenya tetap DELETE karena itu yang dimaksud pemakainya ("hapus produk
 * ini"), tapi yang terjadi di basis data adalah `active = false`. Alasannya di
 * kepala `lib/produk.ts`: riwayat transaksi menunjuk ke baris produk, dan
 * produk yang pernah terjual tidak boleh lenyap.
 */
export const DELETE = jaga(async (_request, _sesi, konteks: Konteks) => {
  const { id } = await konteks.params;
  const produk = await nonaktifkanProduk(id);
  return Response.json({ produk });
});
