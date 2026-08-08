"use client";

import { useMemo } from "react";

import Grafik, { WARNA } from "@/components/dashboard/Grafik";
import {
  BarisKpi,
  IsiKartu,
  Kartu,
  KepalaKartu,
  Kpi,
} from "@/components/dashboard/Kartu";
import { Gagal, SedangMemuat } from "@/components/dashboard/Status";
import { Api } from "@/lib/api-klien";
import { angka, bagi, delta, persen, rupiah, rupiahRingkas } from "@/lib/format";
import { useData } from "@/lib/use-data";
import { usePeriode } from "@/lib/use-periode";
import type { BarisProduk } from "@/lib/kontrak";
import { jumlahHari, labelPeriode, tanggalPendek } from "@/lib/periode";
import { totalHarian } from "@/lib/ringkas";

/**
 * Dashboard Penjualan.
 *
 * Seluruh isinya berasal dari dua fungsi Postgres: `laporan_penjualan_harian`
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
            data: baris.map((b) => b.omzet_kotor),
            borderColor: WARNA.brandGaris,
            backgroundColor: WARNA.brandLembut,
            borderWidth: 3,
            fill: true,
            tension: 0.35,
            pointRadius: 0,
            pointHoverRadius: 5,
          },
          {
            label: "Periode setara sebelumnya",
            // Dipotong ke panjang periode ini supaya kedua garis sejajar hari
            // ke-1 lawan hari ke-1, bukan tanggal lawan tanggal.
            data: sebelumnya.slice(0, baris.length).map((b) => b.omzet_kotor),
            borderColor: WARNA.abu,
            borderWidth: 2,
            borderDash: [6, 4],
            fill: false,
            tension: 0.35,
            pointRadius: 0,
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

  if (harian.galat) return <Gagal pesan={harian.galat} coba={harian.muatUlang} />;
  if (harian.memuat && !harian.data) return <SedangMemuat tinggi="h-96" />;

  const hariAda = baris.filter((b) => b.jumlah_order > 0).length;

  return (
    <>
      <div className="text-ink-3 mb-5 text-sm">
        {labelPeriode(periode)} · {jumlahHari(periode)} hari ·{" "}
        {hariAda} hari ada penjualan · data uji dikecualikan
      </div>

      <BarisKpi>
        <Kpi
          label="Omzet Kotor"
          nilai={rupiah(T.omzet_kotor)}
          delta={delta(T.omzet_kotor, S.omzet_kotor)}
          kaki={`Periode setara sebelumnya ${rupiah(S.omzet_kotor)}`}
        />
        <Kpi
          label="PBJT Terpungut"
          nilai={rupiah(T.pbjt)}
          kaki={`Atas dasar pengenaan ${rupiah(T.dasar_pbjt)}`}
        />
        <Kpi
          label="Di Luar Pengenaan"
          nilai={rupiah(T.omzet_bebas_order + T.omzet_bukan_objek)}
          kaki={`Dibebaskan ${rupiah(T.omzet_bebas_order)} · bukan objek ${rupiah(T.omzet_bukan_objek)}`}
        />
        <Kpi
          label="Transaksi"
          nilai={angka(T.jumlah_order)}
          delta={delta(T.jumlah_order, S.jumlah_order)}
          kaki={`Rata-rata ${rupiah(bagi(T.omzet_kotor, T.jumlah_order))} / order`}
        />
        <Kpi
          label="Masuk Laci"
          nilai={rupiah(T.tertagih)}
          kaki={`Tunai ${persen(bagi(T.tertagih_tunai, T.tertagih) * 100)} · non-tunai ${persen(bagi(T.tertagih_non_tunai, T.tertagih) * 100)}`}
        />
        <Kpi
          label="Refund"
          nilai={rupiah(T.total_refund)}
          kaki={
            T.total_refund > 0
              ? "Dicatat pada tanggal refundnya"
              : "Tidak ada pengembalian periode ini"
          }
        />
      </BarisKpi>

      <div className="mb-4 grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <Kartu>
          <KepalaKartu
            judul="Tren Penjualan"
            sub="Omzet kotor per hari · dibanding periode setara sebelumnya"
          />
          <IsiKartu>
            <Grafik config={tren} judulAksesibilitas="Grafik tren omzet harian" />
          </IsiKartu>
        </Kartu>

        <Kartu>
          <KepalaKartu
            judul="Komposisi Dasar Pengenaan"
            sub="Ketiganya menjumlah tepat ke omzet kotor"
          />
          <IsiKartu>
            <Grafik
              config={komposisi}
              judulAksesibilitas="Komposisi dasar pengenaan PBJT"
            />
          </IsiKartu>
        </Kartu>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
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

        <Kartu>
          <KepalaKartu judul="Metode Pembayaran" sub="Dari uang yang benar-benar berpindah" />
          <IsiKartu>
            <Grafik
              config={grafikBayar}
              tinggi="h-[230px]"
              judulAksesibilitas="Metode pembayaran"
            />
          </IsiKartu>
        </Kartu>
      </div>
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
