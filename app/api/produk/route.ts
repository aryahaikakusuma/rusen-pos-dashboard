import { bacaJson, jaga } from "@/lib/api";
import { buatProduk, daftarKategori, daftarProduk } from "@/lib/produk";

/** Daftar produk beserta kategorinya — dipakai halaman Kelola Produk. */
export const GET = jaga(async () => {
  const [produk, kategori] = await Promise.all([daftarProduk(), daftarKategori()]);
  return Response.json({ produk, kategori });
});

export const POST = jaga(async (request) => {
  const produk = await buatProduk(await bacaJson(request));
  return Response.json({ produk }, { status: 201 });
});
