import type {
  BalasanDetail,
  BalasanHarian,
  BalasanKatalog,
  BalasanProduk,
  Periode,
  Produk,
} from "./kontrak";

/**
 * Lapisan `Api` sisi browser.
 *
 * Ini satu-satunya tempat halaman berbicara ke server. Idenya diambil dari
 * mockup, yang juga memisahkan objek `Api` dari tampilan — pemisahan itu benar.
 * Yang berbeda adalah isinya.
 *
 * MOCKUP MENGAMBIL SELURUH TRANSAKSI MENTAH KE BROWSER lalu menjumlahkan omzet,
 * pajak, dan ringkasan produk di JavaScript. Itu tidak ditiru, karena dua hal:
 *
 *   1. Data penjualan mentah tidak boleh sampai ke browser. Yang berhak
 *      membacanya cuma service_role, dan kunci itu tidak pernah meninggalkan
 *      server.
 *   2. Angka harus dihitung sekali di satu tempat. Kalau agregasi hidup di sini
 *      DAN di Postgres, keduanya akan berbeda suatu hari, dan yang ketahuan
 *      lebih dulu adalah laporan pajak, bukan tesnya.
 *
 * Jadi setiap fungsi di bawah hanya memindahkan hasil yang sudah jadi.
 */

async function ambil<T>(alamat: string): Promise<T> {
  const balasan = await fetch(alamat, { cache: "no-store" });
  if (!balasan.ok) throw await bacaKesalahan(balasan);
  return (await balasan.json()) as T;
}

async function kirim<T>(
  alamat: string,
  metode: "POST" | "PATCH" | "DELETE",
  isi?: unknown
): Promise<T> {
  const balasan = await fetch(alamat, {
    method: metode,
    headers: isi ? { "Content-Type": "application/json" } : undefined,
    body: isi ? JSON.stringify(isi) : undefined,
  });
  if (!balasan.ok) throw await bacaKesalahan(balasan);
  return (await balasan.json()) as T;
}

/**
 * Sesi yang habis dijawab 401 oleh route, bukan diarahkan ke halaman login —
 * pengarahan akan membuat `fetch` menerima HTML berstatus 200 dan gagal
 * mem-parse JSON dengan pesan yang tidak ada hubungannya dengan sebabnya.
 * Di sini 401 diterjemahkan jadi kembali ke halaman login.
 */
async function bacaKesalahan(balasan: Response): Promise<Error> {
  if (balasan.status === 401 && typeof window !== "undefined") {
    window.location.href = "/login";
  }

  try {
    const isi = (await balasan.json()) as { error?: string };
    if (isi.error) return new Error(isi.error);
  } catch {
    // Badan bukan JSON — jatuh ke pesan umum di bawah.
  }
  return new Error(`Permintaan gagal (${balasan.status}).`);
}

function rentang(periode: Periode): string {
  return `dari=${periode.dari}&sampai=${periode.sampai}`;
}

export const Api = {
  harian(periode: Periode, bandingkan = false): Promise<BalasanHarian> {
    return ambil(
      `/api/laporan/harian?${rentang(periode)}${bandingkan ? "&bandingkan=1" : ""}`
    );
  },

  detail(periode: Periode, halaman: number, limit: number): Promise<BalasanDetail> {
    return ambil(
      `/api/laporan/detail?${rentang(periode)}&halaman=${halaman}&limit=${limit}`
    );
  },

  produkLaporan(periode: Periode): Promise<BalasanProduk> {
    return ambil(`/api/laporan/produk?${rentang(periode)}`);
  },

  katalog(): Promise<BalasanKatalog> {
    return ambil("/api/produk");
  },

  buatProduk(isi: Record<string, unknown>): Promise<{ produk: Produk }> {
    return kirim("/api/produk", "POST", isi);
  },

  ubahProduk(id: string, isi: Record<string, unknown>): Promise<{ produk: Produk }> {
    return kirim(`/api/produk/${id}`, "PATCH", isi);
  },

  /** Menonaktifkan, bukan menghapus baris — lihat `lib/produk.ts`. */
  nonaktifkanProduk(id: string): Promise<{ produk: Produk }> {
    return kirim(`/api/produk/${id}`, "DELETE");
  },

  /**
   * Mengunduh berkas xlsx.
   *
   * Berkas dibaca sebagai blob lalu diklik lewat anchor bikinan, bukan dengan
   * mengarahkan `window.location` ke alamat API. Sebabnya: pengarahan tidak
   * punya cara melaporkan kegagalan — sesi yang habis akan berakhir sebagai
   * halaman kosong, dan tombolnya tidak pernah tahu kapan harus berhenti
   * berputar. Nama berkas tetap datang dari header server, bukan disusun ulang
   * di sini, supaya cuma ada satu tempat yang menentukannya.
   */
  async unduh(jenis: "harian" | "detail" | "produk", periode: Periode): Promise<void> {
    const balasan = await fetch(`/api/export/${jenis}?${rentang(periode)}`, {
      cache: "no-store",
    });
    if (!balasan.ok) throw await bacaKesalahan(balasan);

    const nama =
      balasan.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/)?.[1] ??
      `Rusen_${jenis}.xlsx`;

    const blob = await balasan.blob();
    const url = URL.createObjectURL(blob);
    const tautan = document.createElement("a");
    tautan.href = url;
    tautan.download = nama;
    document.body.appendChild(tautan);
    tautan.click();
    tautan.remove();
    URL.revokeObjectURL(url);
  },
};
