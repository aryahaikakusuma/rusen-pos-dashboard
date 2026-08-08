"use client";

import { useMemo, useState } from "react";

import Grafik, { WARNA } from "@/components/dashboard/Grafik";
import KontrolPeriode from "@/components/dashboard/KontrolPeriode";
import {
  BarisKpi,
  IsiKartu,
  Kartu,
  KepalaKartu,
  Kpi,
} from "@/components/dashboard/Kartu";
import { AreaData, Gagal, Kosong, SedangMemuat } from "@/components/dashboard/Status";
import { Gulung, Td, Th } from "@/components/dashboard/Tabel";
import { Api } from "@/lib/api-klien";
import { angka, bagi, persen, rupiah, rupiahRingkas } from "@/lib/format";
import { useData } from "@/lib/use-data";
import { usePeriode } from "@/lib/use-periode";
import type { BarisProduk } from "@/lib/kontrak";

type Urutan = "omzet" | "terjual" | "lambat";

/**
 * Laporan Produk — satu baris per VARIAN.
 *
 * "Kopi Susu Panas" dan "Kopi Susu Dingin" muncul sebagai dua baris, karena di
 * skema ini keduanya memang dua baris produk. Tidak ada tabel varian sama
 * sekali; penggabungannya jadi satu kartu di aplikasi kasir adalah parsing nama
 * di klien, dan logika itu bahkan tidak bisa memutuskan arti "tanpa akhiran"
 * tanpa melihat produk saudaranya. Menirunya di sini berarti mempertaruhkan
 * angka laporan pada tebakan yang belum tentu cocok dengan yang dilihat kasir.
 *
 * Penjumlahan tingkat kategori dikerjakan di halaman ini (kartu KPI dan grafik
 * kontribusi), bukan di SQL — itu memang pembagian tugas yang dipilih `0027`.
 *
 * PENCARIAN DI HALAMAN INI AMAN. Yang berbahaya adalah menyaring daftar produk
 * SEBELUM varian dikelompokkan, dan itu urusan menu kasir. Di sini tidak ada
 * pengelompokan sama sekali: seluruh baris periode datang dalam satu balasan,
 * dan penyaringan hanya memilih baris mana yang ditampilkan.
 */
export default function LaporanProdukPage() {
  const { periode } = usePeriode();
  const [cari, setCari] = useState("");
  const [urutan, setUrutan] = useState<Urutan>("omzet");

  const { data, memuat, galat, muatUlang, pada } = useData(
    () => Api.produkLaporan(periode),
    [periode.dari, periode.sampai]
  );

  const semua = useMemo(() => data?.baris ?? [], [data]);

  const totalOmzet = useMemo(
    () => semua.reduce((s, b) => s + b.omzet, 0),
    [semua]
  );
  const totalTerjual = useMemo(
    () => semua.reduce((s, b) => s + b.terjual, 0),
    [semua]
  );

  const tampil = useMemo(() => {
    const kata = cari.trim().toLowerCase();
    const hasil = semua.filter(
      (b) =>
        !kata ||
        b.nama_produk.toLowerCase().includes(kata) ||
        b.product_code.toLowerCase().includes(kata) ||
        b.kategori.toLowerCase().includes(kata)
    );

    const urut: Record<Urutan, (a: BarisProduk, b: BarisProduk) => number> = {
      omzet: (a, b) => b.omzet - a.omzet,
      terjual: (a, b) => b.terjual - a.terjual,
      lambat: (a, b) => a.terjual - b.terjual,
    };

    return [...hasil].sort(urut[urutan]);
  }, [semua, cari, urutan]);

  /**
   * Berapa varian yang menyumbang 80% omzet. Dihitung atas SELURUH baris
   * periode, tidak atas yang sedang tampil — kalau ikut penyaringan, angkanya
   * berubah setiap kali orang mengetik di kotak cari, dan tidak ada yang bisa
   * dipercaya dari sana.
   */
  const n80 = useMemo(() => {
    const urut = [...semua].sort((a, b) => b.omzet - a.omzet);
    let kumulatif = 0;
    let n = 0;
    for (const b of urut) {
      kumulatif += b.omzet;
      n++;
      if (kumulatif / (totalOmzet || 1) >= 0.8) break;
    }
    return n;
  }, [semua, totalOmzet]);

  const kategori = useMemo(() => {
    const peta = new Map<string, number>();
    for (const b of semua) peta.set(b.kategori, (peta.get(b.kategori) ?? 0) + b.omzet);
    return [...peta.entries()]
      .map(([nama, omzet]) => ({ nama, omzet }))
      .sort((a, b) => b.omzet - a.omzet);
  }, [semua]);

  const pareto = useMemo<Parameters<typeof Grafik>[0]["config"]>(() => {
    const atas = [...semua].sort((a, b) => b.omzet - a.omzet).slice(0, 10);

    // Dijumlahkan ulang per titik alih-alih memakai akumulator di luar `map`.
    // Sepuluh baris, jadi ongkosnya tidak terasa, dan nilainya tidak lagi
    // bergantung pada variabel yang berubah selama render.
    const kumulatif = atas.map((_, i) =>
      Number(
        (
          (atas.slice(0, i + 1).reduce((s, b) => s + b.omzet, 0) /
            (totalOmzet || 1)) *
          100
        ).toFixed(1)
      )
    );

    return {
      // Grafik campuran: jenis ditetapkan per dataset, tapi Chart.js tetap
      // menuntut jenis dasar di tingkat konfigurasi.
      type: "bar",
      data: {
        labels: atas.map((b) => b.nama_produk),
        datasets: [
          {
            type: "bar",
            label: "Omzet",
            data: atas.map((b) => b.omzet),
            backgroundColor: WARNA.brand,
            borderRadius: 5,
            yAxisID: "y",
          },
          {
            type: "line",
            label: "Kumulatif %",
            data: kumulatif,
            borderColor: WARNA.kuning,
            backgroundColor: WARNA.kuning,
            borderWidth: 3,
            tension: 0.3,
            pointRadius: 3,
            yAxisID: "y1",
          },
        ],
      },
      options: {
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: "bottom",
            labels: { usePointStyle: true, pointStyle: "circle", boxWidth: 8 },
          },
          tooltip: {
            callbacks: {
              label: (c) =>
                c.dataset.label === "Omzet"
                  ? `Omzet: ${rupiah(Number(c.parsed.y))}`
                  : `Kumulatif: ${c.parsed.y}%`,
            },
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: { callback: (v) => rupiahRingkas(Number(v)) },
            grid: { color: WARNA.kisi },
          },
          y1: {
            position: "right",
            beginAtZero: true,
            max: 100,
            ticks: { callback: (v) => `${v}%` },
            grid: { display: false },
          },
          x: {
            grid: { display: false },
            ticks: { maxRotation: 40, minRotation: 0, font: { size: 9 } },
          },
        },
      },
    } as Parameters<typeof Grafik>[0]["config"];
  }, [semua, totalOmzet]);

  const grafikKategori = useMemo<Parameters<typeof Grafik>[0]["config"]>(
    () => ({
      type: "bar",
      data: {
        labels: kategori.map((k) => k.nama),
        datasets: [
          {
            data: kategori.map((k) => k.omzet),
            backgroundColor: WARNA.brandGaris,
            borderRadius: 5,
            barThickness: 14,
          },
        ],
      },
      options: {
        indexAxis: "y",
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (c) =>
                `${rupiah(Number(c.parsed.x))} (${persen(
                  bagi(Number(c.parsed.x), totalOmzet) * 100
                )})`,
            },
          },
        },
        scales: {
          x: {
            ticks: { callback: (v) => rupiahRingkas(Number(v)) },
            grid: { color: WARNA.kisi },
          },
          y: { grid: { display: false }, ticks: { font: { size: 10 } } },
        },
      },
    }),
    [kategori, totalOmzet]
  );

  // Kontrol periode di ATAS cabang galat — lihat catatan yang sama di halaman
  // Penjualan Harian.
  if (galat) {
    return (
      <>
        <KontrolPeriode waktuData={pada} />
        <Gagal pesan={galat} coba={muatUlang} />
      </>
    );
  }
  if (memuat && !data) {
    return (
      <>
        <KontrolPeriode waktuData={pada} />
        <SedangMemuat tinggi="h-96" />
      </>
    );
  }

  const terlaris = [...semua].sort((a, b) => b.terjual - a.terjual)[0];

  return (
    <>
      <KontrolPeriode waktuData={pada} />

      <div className="no-print mb-5 flex flex-wrap items-center gap-3">
        <input
          value={cari}
          onChange={(e) => setCari(e.target.value)}
          placeholder="Cari nama, kode, atau kategori…"
          className="border-line focus:border-brand min-w-[240px] rounded-[10px] border bg-white px-3 py-2 text-sm font-medium outline-none"
        />
        <select
          value={urutan}
          onChange={(e) => setUrutan(e.target.value as Urutan)}
          className="border-line cursor-pointer rounded-[10px] border bg-white px-3 py-2 text-sm font-medium"
        >
          <option value="omzet">Urutkan: Omzet tertinggi</option>
          <option value="terjual">Urutkan: Terjual terbanyak</option>
          <option value="lambat">Urutkan: Paling lambat laku</option>
        </select>
      </div>

      <AreaData menyegarkan={memuat}>
      <div className="no-print">
        <BarisKpi>
          <Kpi
            label="Varian Terjual"
            nilai={`${angka(semua.length)} varian`}
            kaki="Baris produk yang laku minimal satu kali"
          />
          <Kpi
            label="Penyumbang 80% Omzet"
            nilai={`${angka(n80)} varian`}
            kaki={`Dari ${angka(semua.length)} varian yang terjual`}
          />
          <Kpi
            label="Paling Laris"
            nilai={terlaris?.nama_produk ?? "—"}
            kecil
            kaki={terlaris ? `${angka(terlaris.terjual)} pcs terjual` : "Belum ada data"}
          />
          <Kpi
            label="Total Omzet"
            nilai={rupiah(totalOmzet)}
            kaki="Kotor — refund tidak dikurangkan"
          />
          <Kpi
            label="Total Terjual"
            nilai={`${angka(totalTerjual)} pcs`}
            kaki={`${angka(kategori.length)} kategori`}
          />
        </BarisKpi>
      </div>

      <div className="mb-4 grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <Kartu>
          <KepalaKartu
            judul="Kontribusi Omzet per Varian"
            sub="Sepuluh teratas · garis kuning adalah kumulatif terhadap omzet periode"
          />
          <IsiKartu>
            <Grafik config={pareto} judulAksesibilitas="Pareto kontribusi omzet per varian" />
          </IsiKartu>
        </Kartu>

        <Kartu>
          <KepalaKartu judul="Omzet per Kategori" sub="Dijumlahkan dari baris varian" />
          <IsiKartu>
            <Grafik
              config={grafikKategori}
              judulAksesibilitas="Omzet per kategori"
            />
          </IsiKartu>
        </Kartu>
      </div>

      <Kartu className="overflow-hidden">
        <KepalaKartu
          judul="Rekap Performa Varian"
          sub={`${angka(tampil.length)} dari ${angka(semua.length)} varian ditampilkan`}
        />

        <Gulung>
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <Th>Kode</Th>
                <Th>Produk</Th>
                <Th>Kategori</Th>
                <Th num>Terjual</Th>
                <Th num>Omzet</Th>
                <Th num>% Omzet</Th>
                <Th className="w-[130px]">Kontribusi</Th>
              </tr>
            </thead>
            <tbody>
              {tampil.length === 0 ? (
                <tr>
                  <Td colSpan={7}>
                    <Kosong>
                      {semua.length === 0
                        ? "Tidak ada produk terjual pada rentang ini."
                        : "Tidak ada varian yang cocok dengan pencarian."}
                    </Kosong>
                  </Td>
                </tr>
              ) : (
                tampil.map((b) => (
                  <tr key={b.product_code} className="hover:bg-[#FAFBFB]">
                    <Td className="text-ink-3 text-xs">{b.product_code}</Td>
                    <Td>
                      <b>{b.nama_produk}</b>
                    </Td>
                    <Td className="text-ink-3">{b.kategori}</Td>
                    <Td num>
                      <b>{angka(b.terjual)}</b>
                    </Td>
                    <Td num>
                      <b>{rupiah(b.omzet)}</b>
                    </Td>
                    <Td num className="text-brand-dark font-bold">
                      {persen(b.kontribusi_persen, 2)}
                    </Td>
                    <Td>
                      <div className="bg-line h-1.5 min-w-[60px] overflow-hidden rounded-full">
                        <span
                          className="bg-brand block h-full rounded-full"
                          style={{
                            width: `${Math.min(100, (b.kontribusi_persen ?? 0) * 4)}%`,
                          }}
                        />
                      </div>
                    </Td>
                  </tr>
                ))
              )}
            </tbody>
            <tfoot>
              <tr className="bg-brand-soft text-brand-dark font-extrabold">
                <Td colSpan={3}>TOTAL {angka(semua.length)} VARIAN</Td>
                <Td num>{angka(totalTerjual)}</Td>
                <Td num>{rupiah(totalOmzet)}</Td>
                <Td num>100%</Td>
                <Td />
              </tr>
            </tfoot>
          </table>
        </Gulung>
      </Kartu>
      </AreaData>

      <Kartu className="no-print mt-4">
        <IsiKartu className="text-ink-3 text-xs leading-relaxed">
          <p>
            <b className="text-ink-2">Kolom % Omzet dihitung terhadap omzet
            seluruh periode</b>, bukan terhadap baris yang sedang tampil —
            memotong daftar tidak pernah membuat sisanya melonjak jadi 100.
            Jumlah seluruh barisnya karena itu mendekati 100, tidak persis:
            pembulatan dua desimal atas ratusan baris menyisakan selisih. Kolom
            Omzet-lah yang cocok persis, dan itu yang dipakai memeriksa
            kecocokan dengan halaman lain.
          </p>
          <p className="mt-2">
            <b className="text-ink-2">Omzet di sini kotor:</b> refund tidak
            dikurangkan. &quot;Berapa yang terjual&quot; adalah pertanyaan yang
            berbeda dari &quot;berapa yang akhirnya tidak jadi&quot;.
          </p>
        </IsiKartu>
      </Kartu>
    </>
  );
}
