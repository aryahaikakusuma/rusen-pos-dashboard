"use client";

import {
  ArcElement,
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  DoughnutController,
  Filler,
  Legend,
  LineController,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
  type ChartConfiguration,
} from "chart.js";
import { useEffect, useRef } from "react";

/**
 * Pembungkus Chart.js.
 *
 * Chart.js dipasang sebagai package, bukan dari CDN — mockup memuatnya dari
 * cdnjs, dan halaman yang bergantung pada host luar akan kosong persis pada
 * hari koneksi kantor bermasalah.
 *
 * Komponen yang dipakai didaftarkan satu per satu, bukan lewat `chart.js/auto`.
 * `auto` menarik seluruh jenis grafik termasuk yang tidak pernah dipakai di
 * sini (radar, polar area, bubble, scatter) dan ikut terkirim ke browser.
 */
Chart.register(
  LineController,
  BarController,
  DoughnutController,
  LineElement,
  PointElement,
  BarElement,
  ArcElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
  Filler
);

Chart.defaults.font.family =
  "Inter, system-ui, sans-serif";
Chart.defaults.color = "#606A68";

export const WARNA = {
  brand: "#2563EB",
  brandGaris: "#2563EB",
  brandLembut: "rgba(37,99,235,.08)",
  abu: "#77807E",
  abuTua: "#77807E",
  kuning: "#C77700",
  merah: "#DF2A36",
  pembanding: "#7C3AED",
  kisi: "#EFF1F1",
} as const;

export default function Grafik({
  config,
  tinggi = "h-[300px]",
  judulAksesibilitas,
}: {
  config: ChartConfiguration;
  tinggi?: string;
  /** Grafik adalah <canvas>; tanpa ini pembaca layar hanya menemukan kotak kosong. */
  judulAksesibilitas: string;
}) {
  const kanvas = useRef<HTMLCanvasElement>(null);
  const grafik = useRef<Chart | null>(null);

  useEffect(() => {
    if (!kanvas.current) return;
    Chart.defaults.font.family = getComputedStyle(kanvas.current).fontFamily;

    // Instance dibuat sekali lalu diperbarui, tidak dibongkar-pasang tiap kali
    // datanya berganti — membongkar akan mengulang animasi masuk setiap kali
    // rentang tanggal digeser satu hari, dan layarnya berkedip.
    if (grafik.current) {
      grafik.current.data = config.data;
      grafik.current.options = config.options ?? {};
      grafik.current.update();
      return;
    }

    grafik.current = new Chart(kanvas.current, config);
  }, [config]);

  useEffect(() => {
    return () => {
      grafik.current?.destroy();
      grafik.current = null;
    };
  }, []);

  return (
    <div className={`relative ${tinggi}`}>
      <canvas ref={kanvas} role="img" aria-label={judulAksesibilitas} />
    </div>
  );
}
