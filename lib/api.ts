import "server-only";

import { KesalahanMasukan } from "./errors";
import { apiSession, unauthorized, type Session } from "./session";

/**
 * Pembungkus setiap Route Handler.
 *
 * Aturan kerasnya: pemeriksaan sesi terjadi di server, di dalam route, SEBELUM
 * data disentuh. Menyembunyikan tombol di frontend tidak menyembunyikan alamat
 * di baliknya, dan satu route yang lupa dijaga membuka seluruh data penjualan.
 * Karena itu tidak ada route yang menulis pemeriksaannya sendiri — semuanya
 * lewat sini, sehingga "lupa menjaga" berarti lupa memakai `jaga()`, yang
 * terlihat dalam satu pandangan pada file mana pun.
 *
 * `proxy.ts` juga menyaring `/api`, tapi itu lapisan kedua yang bisa dilewati
 * (rewrite, pemanggilan internal, matcher yang berubah). Yang menahan adalah
 * baris di dalam sini.
 */
/**
 * Membaca badan permintaan sebagai JSON.
 *
 * `request.json()` melempar SyntaxError untuk badan yang cacat, dan tanpa
 * pembungkus ini kiriman form yang salah bentuk akan dilaporkan sebagai
 * kegagalan server — 500 untuk kesalahan yang sepenuhnya ada di sisi pengirim.
 */
export async function bacaJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new KesalahanMasukan("Isian tidak terbaca sebagai JSON.");
  }
}

export function jaga<T extends unknown[]>(
  handler: (request: Request, sesi: Session, ...rest: T) => Promise<Response>
): (request: Request, ...rest: T) => Promise<Response> {
  return async (request, ...rest) => {
    const sesi = await apiSession();
    if (!sesi) return unauthorized();

    try {
      return await handler(request, sesi, ...rest);
    } catch (error) {
      // Kesalahan masukan boleh dikembalikan apa adanya — pengguna bisa
      // memperbaikinya. Sisanya tidak: pesan galat basis data bisa memuat nama
      // constraint, kolom, bahkan potongan nilai, dan tidak ada gunanya di layar.
      if (error instanceof KesalahanMasukan) {
        return Response.json({ error: error.message }, { status: 400 });
      }

      console.error("[api]", error);
      return Response.json(
        { error: "Terjadi kesalahan di server. Coba lagi." },
        { status: 500 }
      );
    }
  };
}
