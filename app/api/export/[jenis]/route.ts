import { jaga } from "@/lib/api";
import { KesalahanMasukan } from "@/lib/errors";
import {
  laporanDetail,
  laporanHarian,
  laporanProduk,
  namaOutlet,
  type BarisDetail,
} from "@/lib/laporan";
import { bacaPeriode, type Periode } from "@/lib/periode";
import { bukuDetail, bukuHarian, bukuProduk, namaBerkas } from "@/lib/xlsx";

/**
 * Satu tombol, satu permintaan, satu berkas.
 *
 * Alurnya sinkron dengan sengaja: browser memanggil, server memeriksa sesi,
 * memanggil fungsi Postgres yang SAMA dengan yang mengisi layar, menyusun
 * workbook di memori, dan mengirimkannya balik. Tidak ada antrian dan tidak ada
 * job latar — dengan volume data Rusen (puluhan hingga ratusan order per hari)
 * itu kompleksitas yang tidak dibayar apa pun, dan setiap lapisan tambahan
 * adalah satu tempat lagi berkas bisa hilang tanpa ada yang tahu.
 *
 * Header `Content-Disposition: attachment` WAJIB. Tanpanya browser mencoba
 * menampilkan isi biner sebagai teks acak, dan itulah sebab paling umum keluhan
 * "download-nya tidak jalan".
 */

const JENIS = ["harian", "detail", "produk"] as const;
type Jenis = (typeof JENIS)[number];

interface Konteks {
  params: Promise<{ jenis: string }>;
}

export const GET = jaga(async (request, _sesi, konteks: Konteks) => {
  const { jenis } = await konteks.params;
  if (!(JENIS as readonly string[]).includes(jenis)) {
    throw new KesalahanMasukan(`Jenis laporan '${jenis}' tidak dikenal.`);
  }

  const periode = bacaPeriode(new URL(request.url).searchParams);
  const outlet = await namaOutlet();

  const { isi, berkas } = await susun(jenis as Jenis, periode, outlet);

  return new Response(isi as ArrayBuffer, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${berkas}"`,
      // Laporan periode berjalan berubah sepanjang hari; berkas yang di-cache
      // akan membuat orang mengunduh angka kemarin dan tidak menyadarinya.
      "Cache-Control": "no-store",
    },
  });
});

async function susun(jenis: Jenis, periode: Periode, outlet: string) {
  if (jenis === "harian") {
    return {
      isi: await bukuHarian(periode, outlet, await laporanHarian(periode)),
      berkas: namaBerkas("Penjualan-Harian", periode),
    };
  }

  if (jenis === "produk") {
    return {
      isi: await bukuProduk(periode, outlet, await laporanProduk(periode)),
      berkas: namaBerkas("Laporan-Produk", periode),
    };
  }

  return {
    isi: await bukuDetail(periode, outlet, await seluruhDetail(periode)),
    berkas: namaBerkas("Detail-Penjualan", periode),
  };
}

/**
 * Detail Penjualan dipaginasi di Postgres, tapi berkas export memuat SELURUH
 * periode — halaman adalah urusan layar, bukan urusan laporan. Diambil per
 * potongan supaya satu permintaan tidak pernah meminta puluhan ribu baris
 * sekaligus.
 */
const POTONGAN = 500;
const BATAS_BARIS = 20_000;

async function seluruhDetail(periode: Periode): Promise<BarisDetail[]> {
  const semua: BarisDetail[] = [];

  for (let offset = 0; offset < BATAS_BARIS; offset += POTONGAN) {
    const { baris, totalBaris } = await laporanDetail(periode, POTONGAN, offset);
    semua.push(...baris);
    if (semua.length >= totalBaris || baris.length === 0) break;
  }

  return semua;
}
