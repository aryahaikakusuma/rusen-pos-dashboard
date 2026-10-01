"use client";

import { useMemo } from "react";

import Grafik, { WARNA } from "@/components/dashboard/Grafik";
import Analisis from "@/components/dashboard/Analisis";
import { Fakta, Nilai, Pendapatan } from "@/components/dashboard/Ringkasan";
import KontrolPeriode from "@/components/dashboard/KontrolPeriode";
import {
  IsiKartu,
  Kartu,
  KepalaKartu,
} from "@/components/dashboard/Kartu";
import { AreaData, Gagal, SedangMemuat } from "@/components/dashboard/Status";
import { Api } from "@/lib/api-klien";
import { angka, bagi, persen, rupiah, rupiahRingkas } from "@/lib/format";
import { useData } from "@/lib/use-data";
import { usePeriode } from "@/lib/use-periode";
import type { BarisProduk } from "@/lib/kontrak";
import { tanggalPendek } from "@/lib/periode";
import { totalHarian } from "@/lib/ringkas";

/**
 * Dashboard Penjualan.
 *
 * Seluruh isinya berasal dari dua fungsi Postgres: `laporan_penjualan_harian_v2`
 * dan `laporan_produk`. Tidak ada transaksi mentah yang sampai ke browser, dan
 * tidak ada angka uang yang dihitung di sini — yang dikerjakan halaman ini
 * hanya menjumlahkan kolom yang sudah jadi dan menyusunnya jadi grafik.
 *
 * Satu pengecualian yang perlu disebut: grafik "Penjualan per Kategori"
 * menjumlahkan baris varian jadi kategori di tampilan. Itu memang tempatnya —
 * `0027` sengaja berhenti di grain varian dan menyerahkan penjumlahan tingkat
 * induk ke tampilan, karena penggabungan varian jadi satu kartu adalah parsing
 * nama di klien yang tidak bisa ditiru SQL tanpa risiko berbeda dari yang
 * dilihat kasir.
 */
export default function DashboardPage() {
  const { periode } = usePeriode();

  const harian = useData(() => Api.harian(periode, true), [
    periode.dari,
    periode.sampai,
  ]);
  const produk = useData(() => Api.produkLaporan(periode), [
    periode.dari,
    periode.sampai,
  ]);

  const baris = useMemo(() => harian.data?.baris ?? [], [harian.data]);
  const sebelumnya = useMemo(() => harian.data?.sebelumnya ?? [], [harian.data]);
  const barisProduk = useMemo(() => produk.data?.baris ?? [], [produk.data]);

  const T = useMemo(() => totalHarian(baris), [baris]);
  const S = useMemo(() => totalHarian(sebelumnya), [sebelumnya]);

  const kategori = useMemo(() => perKategori(barisProduk), [barisProduk]);
  const terlaris = useMemo(
    () => [...barisProduk].sort((a, b) => b.terjual - a.terjual).slice(0, 6),
    [barisProduk]
  );

  const tren = useMemo<Parameters<typeof Grafik>[0]["config"]>(
    () => ({
      type: "line",
      data: {
        labels: baris.map((b) => tanggalPendek(b.tanggal).slice(0, 6)),
        datasets: [
          {
            label: "Periode ini",
            data: baris.map((b) => b.omzet_bersih),
            borderColor: WARNA.brandGaris,
            backgroundColor: WARNA.brandLembut,
            borderWidth: 3,
            fill: true,
            tension: 0.35,
            pointRadius: baris.length === 1 ? 4 : 0,
            pointHoverRadius: 5,
          },
          {
            label: "Periode setara sebelumnya",
            // Dipotong ke panjang periode ini supaya kedua garis sejajar hari
            // ke-1 lawan hari ke-1, bukan tanggal lawan tanggal.
            data: sebelumnya.slice(0, baris.length).map((b) => b.omzet_bersih),
            borderColor: WARNA.abu,
            borderWidth: 2,
            borderDash: [6, 4],
            fill: false,
            tension: 0.35,
            pointRadius: baris.length === 1 ? 4 : 0,
          },
        ],
      },
      options: {
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: {
            position: "bottom",
            labels: { usePointStyle: true, pointStyle: "circle", boxWidth: 8 },
          },
          tooltip: {
            callbacks: {
              label: (c) => `${c.dataset.label}: ${rupiah(Number(c.parsed.y ?? 0))}`,
            },
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: { callback: (v) => rupiahRingkas(Number(v)) },
            grid: { color: WARNA.kisi },
          },
          x: { grid: { display: false }, ticks: { maxTicksLimit: 14 } },
        },
      },
    }),
    [baris, sebelumnya]
  );

  const komposisi = useMemo<Parameters<typeof Grafik>[0]["config"]>(() => {
    const nilai = [T.dasar_pbjt, T.omzet_bukan_objek, T.omzet_bebas_order];
    const jumlah = nilai.reduce((s, n) => s + n, 0);
    return {
      type: "doughnut",
      data: {
        labels: ["Dasar PBJT", "Bukan objek (rokok)", "Dibebaskan (order)"],
        datasets: [
          {
            data: nilai,
            backgroundColor: [WARNA.brand, WARNA.abu, WARNA.kuning],
            borderWidth: 0,
          },
        ],
      },
      options: {
        maintainAspectRatio: false,
        cutout: "62%",
        plugins: {
          legend: {
            position: "bottom",
            labels: {
              usePointStyle: true,
              pointStyle: "circle",
              boxWidth: 8,
              padding: 14,
            },
          },
          tooltip: {
            callbacks: {
              label: (c) =>
                `${c.label}: ${rupiah(c.parsed)} (${persen(bagi(c.parsed, jumlah) * 100)})`,
            },
          },
        },
      },
    };
  }, [T]);

  const grafikKategori = useMemo<Parameters<typeof Grafik>[0]["config"]>(
    () => batang(
      kategori.map((k) => k.nama),
      kategori.map((k) => k.omzet),
      WARNA.brand,
      (n) => rupiah(n)
    ),
    [kategori]
  );

  const grafikTerlaris = useMemo<Parameters<typeof Grafik>[0]["config"]>(
    () => batang(
      terlaris.map((p) => p.nama_produk),
      terlaris.map((p) => p.terjual),
      WARNA.brandGaris,
      (n) => `${angka(n)} pcs`,
      false
    ),
    [terlaris]
  );

  const grafikBayar = useMemo<Parameters<typeof Grafik>[0]["config"]>(
    () => batang(
      ["Tunai", "Non-Tunai"],
      [T.tertagih_tunai, T.tertagih_non_tunai],
      WARNA.brand,
      (n) => rupiah(n)
    ),
    [T]
  );

  const waktuData =
    harian.pada === null || produk.pada === null
      ? null
      : Math.min(harian.pada, produk.pada);

  // Kontrol periode di ATAS cabang galat — lihat catatan yang sama di halaman
  // Penjualan Harian.
  if (harian.galat) {
    return (
      <>
        <KontrolPeriode waktuData={waktuData} />
        <Gagal pesan={harian.galat} coba={harian.muatUlang} />
      </>
    );
  }
  if (harian.memuat && !harian.data) {
    return (
      <>
        <KontrolPeriode waktuData={waktuData} />
        <SedangMemuat tinggi="h-96" />
      </>
    );
  }

  const hariAda = baris.filter((b) => b.jumlah_order > 0).length;

  return (
    <>
      <KontrolPeriode waktuData={waktuData} />

      {/* Rentang dan jumlah hari sudah dinyatakan kontrol di atas; yang tersisa
          di sini hanya keterangan yang tidak ada di sana. */}
      <div className="text-ink-3 mb-3 text-xs">
        {hariAda} hari ada penjualan · data uji dikecualikan
      </div>

      <AreaData menyegarkan={harian.memuat}>
      <Pendapatan total={T} sebelumnya={S} />
      <Analisis panel={[
        { id: "tren", judul: "Tren", isi:
        <Kartu>
          <KepalaKartu
            judul="Tren Penjualan"
            sub="Pendapatan tanpa PBJT setelah refund · dibanding periode setara sebelumnya"
          />
          <IsiKartu>
            <Grafik config={tren} tinggi="h-[220px] sm:h-[300px]" judulAksesibilitas="Grafik tren pendapatan bersih harian" />
            <div className="mt-4"><Fakta>
              <Nilai label="Penjualan sebelum refund">{rupiah(T.omzet_kotor)}</Nilai>
              <Nilai label="Rata-rata penjualan per order">{rupiah(bagi(T.omzet_kotor, T.jumlah_order))}</Nilai>
            </Fakta></div>
          </IsiKartu>
        </Kartu> },
        { id: "produk", judul: "Produk", isi: produk.galat ? <Gagal pesan={produk.galat} coba={produk.muatUlang} /> :
      <div className="grid gap-3 lg:grid-cols-2">
      <Kartu>
          <KepalaKartu judul="Penjualan per Kategori" sub="Dijumlahkan dari varian" />
          <IsiKartu>
            {produk.memuat && !produk.data ? (
              <div className="text-ink-3 grid h-[230px] place-items-center text-sm">
                Memuat…
              </div>
            ) : (
              <Grafik
                config={grafikKategori}
                tinggi="h-[230px]"
                judulAksesibilitas="Omzet per kategori"
              />
            )}
          </IsiKartu>
        </Kartu>

        <Kartu>
          <KepalaKartu judul="Produk Terlaris" sub="Per varian, berdasarkan jumlah terjual" />
          <IsiKartu>
            {produk.memuat && !produk.data ? (
              <div className="text-ink-3 grid h-[230px] place-items-center text-sm">
                Memuat…
              </div>
            ) : (
              <Grafik
                config={grafikTerlaris}
                tinggi="h-[230px]"
                judulAksesibilitas="Produk terlaris"
              />
            )}
          </IsiKartu>
        </Kartu>
      </div> },
      { id: "pembayaran", judul: "Pembayaran", isi:
        <Kartu>
          <KepalaKartu judul="Metode Pembayaran" sub="Tagihan pelanggan sebelum refund · termasuk PBJT" />
          <IsiKartu>
            <Grafik
              config={grafikBayar}
              tinggi="h-[230px]"
              judulAksesibilitas="Metode pembayaran"
            />
            <Fakta>
              <Nilai label="Tunai sebelum refund">{rupiah(T.tertagih_tunai)}</Nilai>
              <Nilai label="Non-tunai sebelum refund">{rupiah(T.tertagih_non_tunai)}</Nilai>
              <Nilai label="Refund periode ini">{rupiah(T.total_refund)}</Nilai>
              <Nilai label="Penerimaan bersih termasuk PBJT">{rupiah(T.tertagih_bersih)}</Nilai>
            </Fakta>
          </IsiKartu>
        </Kartu> },
        { id: "pbjt", judul: "PBJT", isi:
        <Kartu>
          <KepalaKartu judul="Rincian PBJT" sub="Pajak terpungut dan dikembalikan pada periode ini" />
          <IsiKartu>
            <Fakta>
              <Nilai label="PBJT terpungut">{rupiah(T.pbjt)}</Nilai>
              <Nilai label="PBJT dikembalikan">{rupiah(T.refund_pbjt)}</Nilai>
              <Nilai label="PBJT bersih setelah refund">{rupiah(T.pbjt_bersih)}</Nilai>
              <Nilai label="Dasar pengenaan sebelum refund">{rupiah(T.dasar_pbjt)}</Nilai>
              <Nilai label="Dibebaskan per order">{rupiah(T.omzet_bebas_order)}</Nilai>
              <Nilai label="Bukan objek pajak">{rupiah(T.omzet_bukan_objek)}</Nilai>
            </Fakta>
            <div className="mt-5"><Grafik config={komposisi} tinggi="h-[240px]" judulAksesibilitas="Komposisi dasar pengenaan PBJT sebelum refund" /></div>
          </IsiKartu>
        </Kartu> },
      ]} />
      </AreaData>
    </>
  );
}

/* ------------------------------------------------------------------ bantuan */


/**
 * Penjumlahan varian ke kategori — di tampilan, bukan di SQL. Lihat catatan di
 * kepala berkas dan keputusan 4 di `0027`.
 */
function perKategori(baris: BarisProduk[]): { nama: string; omzet: number }[] {
  const peta = new Map<string, number>();
  for (const b of baris) peta.set(b.kategori, (peta.get(b.kategori) ?? 0) + b.omzet);
  return [...peta.entries()]
    .map(([nama, omzet]) => ({ nama, omzet }))
    .sort((a, b) => b.omzet - a.omzet);
}

/** Batang horizontal — bentuk yang dipakai tiga grafik kecil di baris bawah. */
function batang(
  label: string[],
  nilai: number[],
  warna: string,
  format: (n: number) => string,
  uang = true
): Parameters<typeof Grafik>[0]["config"] {
  return {
    type: "bar",
    data: {
      labels: label,
      datasets: [
        { data: nilai, backgroundColor: warna, borderRadius: 5, barThickness: 13 },
      ],
    },
    options: {
      indexAxis: "y",
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (c) => format(Number(c.parsed.x)) } },
      },
      scales: {
        x: {
          grid: { color: WARNA.kisi },
          ticks: uang ? { callback: (v) => rupiahRingkas(Number(v)) } : undefined,
        },
        y: { grid: { display: false }, ticks: { font: { size: 10 } } },
      },
    },
  };
}
