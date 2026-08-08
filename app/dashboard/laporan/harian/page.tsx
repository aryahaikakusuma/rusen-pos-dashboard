"use client";

import { useMemo, useState } from "react";

import Grafik, { WARNA } from "@/components/dashboard/Grafik";
import KontrolPeriode from "@/components/dashboard/KontrolPeriode";
import { BarisKpi, IsiKartu, Kartu, KepalaKartu, Kpi } from "@/components/dashboard/Kartu";
import { AreaData, Gagal, SedangMemuat } from "@/components/dashboard/Status";
import { Gulung, Td, Th } from "@/components/dashboard/Tabel";
import { Api } from "@/lib/api-klien";
import type { BarisHarian } from "@/lib/kontrak";
import { angka, bagi, persen, rupiah, rupiahRingkas } from "@/lib/format";
import { useData } from "@/lib/use-data";
import { usePeriode } from "@/lib/use-periode";
import {
  jumlahHari,
  labelPeriode,
  namaHari,
  sekarangWib,
  tanggalPendek,
} from "@/lib/periode";
import { totalHarian } from "@/lib/ringkas";

/**
 * Penjualan per Periode — satu baris per tanggal WIB.
 *
 * Namanya berubah dari "Penjualan Harian" karena yang dulu disebut "harian"
 * adalah GRAIN barisnya, bukan rentangnya: halaman ini sudah sejak awal
 * melayani rentang apa pun yang dipilih di kontrol periode, dan "Harian" di
 * sidebar terbaca seolah ia hanya bisa menampilkan satu hari. Route, fungsi
 * Postgres, dan nama jenis export tetap `harian` — itu grain, dan grain-nya
 * memang tidak berubah.
 *
 * Tanggal tanpa transaksi tetap muncul sebagai nol. Itu bukan kelebihan baris:
 * kalau hari sepi hilang dari daftar, garis tren melompat dari tanggal 3 ke
 * tanggal 5 dan berbohong tentang bentuk minggunya.
 *
 * Bagian "Pemisahan Dasar Pengenaan" mengganti kotak PBJT vs Non-PBJT di
 * mockup, dan pembagiannya TIGA, bukan dua. Ada dua jenis pembebasan yang
 * kelihatan sama dari nama kolomnya dan sama sekali berbeda asalnya:
 * pembebasan tingkat order yang disetujui pegawai, dan barang yang memang bukan
 * objek pajak (rokok, per baris). Menggabungkannya membuat laporan pajak
 * daerah salah tanpa memicu error apa pun.
 */
export default function PenjualanHarianPage() {
  const { periode } = usePeriode();

  const { data, memuat, galat, muatUlang, pada } = useData(
    () => Api.harian(periode),
    [periode.dari, periode.sampai]
  );

  const baris = useMemo(() => data?.baris ?? [], [data]);
  const T = useMemo(() => totalHarian(baris), [baris]);

  const hariAda = baris.filter((b) => b.jumlah_order > 0).length;
  const tertinggi = [...baris].sort((a, b) => b.omzet_kotor - a.omzet_kotor)[0];

  /**
   * Kontrol periode berada DI ATAS cabang galat dan pemuat pertama, bukan di
   * dalamnya. Dulu ia di topbar, jadi ia selalu ada apa pun keadaan halaman.
   * Kalau ia ikut hilang saat permintaan gagal, satu-satunya jalan keluar dari
   * rentang yang bermasalah adalah menyunting URL — dan tombol "Coba lagi"
   * hanya mengulang permintaan yang sama.
   */
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

  return (
    <>
      <KontrolPeriode waktuData={pada} />

      {/* Chip periode yang dulu berdiri di sini dihapus: label rentang sudah
          jadi bagian kontrol di atas, dan dua tempat yang menyatakan periode
          yang sama hanya menambah tempat untuk berselisih. Kop periode di
          lembar CETAK di bawah tetap ada — itu identitas berkas arsipnya.

          Tombol Cetak dan Unduh Excel yang dulu satu baris sendiri di sini kini
          duduk di ujung kanan topbar bersama dua laporan lainnya; lihat
          `AksiLaporan`. */}

      {/* Kontrol periode dan tombol ekspor tetap di luar: labelnya justru yang
          sedang benar. Yang harus ditandai usang adalah angkanya. */}
      <AreaData menyegarkan={memuat}>
      <div className="no-print">
        <GrafikPeriode baris={baris} />
      </div>

      <div className="no-print">
        <BarisKpi>
          <Kpi
            label="Omzet Kotor"
            nilai={rupiah(T.omzet_kotor)}
            kaki={`${angka(T.jumlah_order)} order lunas`}
          />
          <Kpi
            label="Rata-rata per Hari Buka"
            nilai={rupiah(bagi(T.omzet_kotor, hariAda))}
            kaki={`Dari ${hariAda} hari yang ada penjualannya`}
          />
          <Kpi
            label="Hari Tertinggi"
            nilai={tertinggi?.omzet_kotor ? rupiah(tertinggi.omzet_kotor) : "—"}
            kaki={
              tertinggi?.omzet_kotor
                ? `${namaHari(tertinggi.tanggal)}, ${tanggalPendek(tertinggi.tanggal)}`
                : "Belum ada transaksi"
            }
          />
          <Kpi
            label="PBJT Terpungut"
            nilai={rupiah(T.pbjt)}
            kaki={`Atas dasar pengenaan ${rupiah(T.dasar_pbjt)}`}
          />
          <Kpi
            label="Refund"
            nilai={rupiah(T.total_refund)}
            kaki="Pokok + pajaknya, pada tanggal refund"
          />
        </BarisKpi>
      </div>

      {/* Lembar laporan — inilah yang keluar saat dicetak. */}
      <div className="border-line cetak-lepas rounded-2xl border bg-white p-6 shadow-[0_1px_2px_rgba(16,24,40,.04),0_8px_24px_rgba(16,24,40,.06)] lg:p-8">
        <header className="border-ink mb-5 flex flex-wrap justify-between gap-5 border-b-2 pb-4">
          <div>
            <h2 className="text-xl font-extrabold">Laporan Penjualan</h2>
            <p className="text-ink-3 mt-1 text-[13px]">
              Rusen Kopitiam · {data?.outlet ?? "—"}
            </p>
          </div>
          <div className="text-ink-3 text-xs leading-relaxed sm:text-right">
            Periode: <b>{labelPeriode(periode)}</b>
            <br />
            Jumlah hari: <b>{jumlahHari(periode)}</b> · Order:{" "}
            <b>{angka(T.jumlah_order)}</b>
            <br />
            Waktu WIB · data uji dikecualikan
            <br />
            Dibuat: {sekarangWib()}
          </div>
        </header>

        <section className="mb-7">
          <h3 className="text-ink-3 mb-2.5 text-xs font-bold tracking-[0.8px] uppercase">
            Rekapitulasi per Tanggal
          </h3>
          <Gulung>
            <table className="w-full border-collapse text-[13px] [&_td]:px-2 [&_th]:px-2">
              <thead>
                <tr>
                  <Th>Tanggal</Th>
                  <Th num>Order</Th>
                  <Th num>Omzet Kotor</Th>
                  <Th num>Dasar PBJT</Th>
                  <Th num>PBJT</Th>
                  <Th num>Bebas (order)</Th>
                  <Th num>Bukan objek</Th>
                  <Th num>Refund</Th>
                  <Th num>Tertagih</Th>
                </tr>
              </thead>
              <tbody>
                {baris.map((b) => {
                  const sepi = b.jumlah_order === 0;
                  return (
                    <tr
                      key={b.tanggal}
                      className={sepi ? "text-ink-3" : "hover:bg-[#FAFBFB]"}
                    >
                      <Td className="whitespace-nowrap">
                        <b>{tanggalPendek(b.tanggal)}</b>{" "}
                        <span className="text-ink-3 text-[11px]">
                          {namaHari(b.tanggal)}
                        </span>
                      </Td>
                      <Td num>{b.jumlah_order || "—"}</Td>
                      <Td num>{b.omzet_kotor ? rupiah(b.omzet_kotor) : "—"}</Td>
                      <Td num>{b.dasar_pbjt ? rupiah(b.dasar_pbjt) : "—"}</Td>
                      <Td num>{b.pbjt ? rupiah(b.pbjt) : "—"}</Td>
                      <Td num className={b.omzet_bebas_order ? "text-warn" : ""}>
                        {b.omzet_bebas_order ? rupiah(b.omzet_bebas_order) : "—"}
                      </Td>
                      <Td num>
                        {b.omzet_bukan_objek ? rupiah(b.omzet_bukan_objek) : "—"}
                      </Td>
                      <Td num className={b.total_refund ? "text-danger" : ""}>
                        {b.total_refund ? rupiah(b.total_refund) : "—"}
                      </Td>
                      <Td num>
                        <b>{b.tertagih ? rupiah(b.tertagih) : "—"}</b>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-brand-soft text-brand-dark font-extrabold">
                  <Td className="whitespace-nowrap">TOTAL {jumlahHari(periode)} HARI</Td>
                  <Td num>{angka(T.jumlah_order)}</Td>
                  <Td num>{rupiah(T.omzet_kotor)}</Td>
                  <Td num>{rupiah(T.dasar_pbjt)}</Td>
                  <Td num>{rupiah(T.pbjt)}</Td>
                  <Td num>{rupiah(T.omzet_bebas_order)}</Td>
                  <Td num>{rupiah(T.omzet_bukan_objek)}</Td>
                  <Td num>{rupiah(T.total_refund)}</Td>
                  <Td num>{rupiah(T.tertagih)}</Td>
                </tr>
              </tfoot>
            </table>
          </Gulung>
        </section>

        <section className="mb-7">
          <h3 className="text-ink-3 mb-2.5 text-xs font-bold tracking-[0.8px] uppercase">
            Pemisahan Dasar Pengenaan
          </h3>
          <div className="grid gap-4 md:grid-cols-3">
            <Kotak
              judul="Objek PBJT"
              nilai={rupiah(T.dasar_pbjt)}
              porsi={persen(bagi(T.dasar_pbjt, T.omzet_kotor) * 100)}
              utama
              rincian={[
                ["Dasar pengenaan", rupiah(T.dasar_pbjt)],
                ["PBJT terutang", rupiah(T.pbjt)],
              ]}
            />
            <Kotak
              judul="Bukan Objek Pajak"
              nilai={rupiah(T.omzet_bukan_objek)}
              porsi={persen(bagi(T.omzet_bukan_objek, T.omzet_kotor) * 100)}
              rincian={[
                ["Sifat barangnya", "rokok dsb"],
                ["PBJT terutang", rupiah(0)],
              ]}
            />
            <Kotak
              judul="Dibebaskan per Order"
              nilai={rupiah(T.omzet_bebas_order)}
              porsi={persen(bagi(T.omzet_bebas_order, T.omzet_kotor) * 100)}
              rincian={[
                ["Persetujuan per order", "di Detail Penjualan"],
                ["PBJT terutang", rupiah(0)],
              ]}
            />
          </div>

          <div className="bg-brand-soft text-brand-dark mt-4 flex flex-wrap justify-between gap-3 rounded-[10px] px-4 py-3.5 text-[15px] font-extrabold">
            <span>PBJT yang harus disetor periode ini</span>
            <span>{rupiah(T.pbjt)}</span>
          </div>
        </section>

        <section className="mb-7">
          <h3 className="text-ink-3 mb-2.5 text-xs font-bold tracking-[0.8px] uppercase">
            Rekonsiliasi Penerimaan
          </h3>
          <table className="w-full border-collapse">
            <tbody>
              <tr>
                <Td>Penerimaan tunai</Td>
                <Td num>
                  <b>{rupiah(T.tertagih_tunai)}</b>
                </Td>
              </tr>
              <tr>
                <Td>Penerimaan non-tunai</Td>
                <Td num>
                  <b>{rupiah(T.tertagih_non_tunai)}</b>
                </Td>
              </tr>
              <tr>
                <Td>Refund keluar laci</Td>
                <Td num className="text-danger">
                  <b>-{rupiah(T.total_refund)}</b>
                </Td>
              </tr>
              <tr className="bg-brand-soft">
                <Td>
                  <b>Bersih masuk laci</b>
                </Td>
                <Td num>
                  <b className="text-brand-dark">
                    {rupiah(T.tertagih - T.total_refund)}
                  </b>
                </Td>
              </tr>
            </tbody>
          </table>
        </section>

        <section>
          <h3 className="text-ink-3 mb-2.5 text-xs font-bold tracking-[0.8px] uppercase">
            Catatan
          </h3>
          <ol className="text-ink-3 list-decimal space-y-1.5 pl-5 text-xs leading-relaxed">
            <li>
              Hanya order berstatus lunas yang dihitung. Order bertanda data uji
              dikecualikan seluruhnya, termasuk refund atasnya.
            </li>
            <li>
              Omzet Kotor = Dasar PBJT + Bukan objek + Bebas per order.
              Tertagih = Omzet Kotor + PBJT.
            </li>
            <li>
              Refund menambah baris tersendiri dan tidak mengurangi omzet yang
              tercatat pada order aslinya — yang tercetak di struk pelanggan
              tetap jumlah yang benar-benar ditagih saat itu.
            </li>
            <li>
              Pajak dihitung sekali atas subtotal order, tidak pernah per baris
              item. Menjumlahkan per baris menghasilkan angka yang berbeda.
            </li>
          </ol>
        </section>

        <p className="border-line text-ink-3 mt-5 border-t pt-3.5 text-center text-[11px]">
          Dokumen internal Rusen Kopitiam · {labelPeriode(periode)} · dibuat{" "}
          {sekarangWib()}
        </p>
      </div>
      </AreaData>
    </>
  );
}

/* -------------------------------------------------- grafik penjualan periode */

/**
 * Deret yang bisa dinyalakan-dimatikan di grafik.
 *
 * SEMUANYA KOLOM YANG SUDAH JADI dari `laporan_penjualan_harian`. Tidak ada
 * yang dihitung ulang di sini — kalau suatu deret butuh angka yang belum ada
 * kolomnya, tempatnya migrasi, bukan berkas ini.
 *
 * DUA DERET DI CONTOH RANCANGAN SENGAJA TIDAK ADA:
 *
 * - "Laba Kotor". Skema ini tidak menyimpan harga pokok sama sekali —
 *   `products` hanya punya `price`. Laba kotor tanpa modal berarti menyamakan
 *   laba dengan omzet, dan garis yang persis menimpa garis Penjualan akan
 *   terbaca sebagai margin 100%. Itu bukan angka yang kurang teliti, itu angka
 *   yang salah.
 * - "Total Produk" per tanggal. `laporan_produk` berjalan pada grain varian
 *   untuk SELURUH periode dan tidak membawa tanggal, jadi jumlah item per hari
 *   tidak bisa diambil dari mana pun tanpa fungsi baru.
 *
 * Keduanya butuh perubahan database, dan itu urusan Tahap 1.
 */
const DERET = [
  { id: "penjualan", label: "Penjualan", warna: WARNA.brandGaris, uang: true },
  { id: "tertagih", label: "Tertagih", warna: WARNA.biru, uang: true },
  { id: "pbjt", label: "PBJT", warna: WARNA.kuning, uang: true },
  { id: "refund", label: "Refund", warna: WARNA.merah, uang: true },
  { id: "transaksi", label: "Transaksi", warna: WARNA.abuTua, uang: false },
] as const;

type IdDeret = (typeof DERET)[number]["id"];

const NILAI: Record<IdDeret, (b: BarisHarian) => number> = {
  penjualan: (b) => b.omzet_kotor,
  tertagih: (b) => b.tertagih,
  pbjt: (b) => b.pbjt,
  refund: (b) => b.total_refund,
  transaksi: (b) => b.jumlah_order,
};

/**
 * Grafik penjualan per periode, dengan deret yang bisa dimatikan satu-satu.
 *
 * DUA SUMBU-Y, DAN ITU WAJIB. "Transaksi" dihitung dalam order — puluhan —
 * sementara sisanya rupiah — jutaan. Pada satu sumbu, garis transaksi menempel
 * rata di garis nol dan terlihat seperti hari tanpa penjualan. Sumbu kanan
 * hanya muncul saat deret itu menyala, supaya tidak ada skala menganggur yang
 * mengundang salah baca.
 *
 * Legenda bawaan Chart.js diganti kotak centang sendiri karena legendanya hanya
 * mencoret label saat diklik: pada layar sempit hasilnya tidak jelas apakah
 * deret itu mati atau hanya labelnya yang aneh. Kotak centang menyatakannya
 * tanpa perlu ditebak, dan bisa dijangkau keyboard.
 *
 * Bertanda `no-print`: yang dicetak adalah lembar laporan di bawah. Kanvas
 * dirender lewat WebGL/2D context yang hasilnya tidak selalu ikut ke printer,
 * dan halaman kertas yang kadang berisi grafik kadang kosong lebih buruk
 * daripada yang konsisten tidak berisi.
 */
function GrafikPeriode({ baris }: { baris: BarisHarian[] }) {
  const [tampil, setTampil] = useState(true);
  const [aktif, setAktif] = useState<Set<IdDeret>>(
    () => new Set<IdDeret>(["penjualan", "transaksi", "pbjt"])
  );

  const adaTransaksi = aktif.has("transaksi");

  /**
   * Rentang satu tanggal tidak punya grafik, dan itu bukan kegagalan memuat.
   *
   * Satu titik data menghasilkan garis tanpa panjang: dengan `pointRadius: 0`
   * yang dipakai seluruh deret di sini, kanvasnya benar-benar kosong — hanya
   * kisi dan sumbu. Kotak kosong itu tidak bisa dibedakan dari data yang gagal
   * datang, dan orang akan menekan muat ulang berkali-kali menunggu sesuatu
   * yang memang tidak akan pernah muncul.
   *
   * Angkanya sendiri tidak hilang: seluruh kartu KPI dan tabel di bawah tetap
   * terisi. Yang tidak berlaku hanya bentuk trennya.
   */
  const satuTanggal = baris.length < 2;

  const config = useMemo<Parameters<typeof Grafik>[0]["config"]>(
    () => ({
      type: "line",
      data: {
        labels: baris.map((b) => tanggalPendek(b.tanggal).slice(0, 6)),
        datasets: DERET.filter((d) => aktif.has(d.id)).map((d) => ({
          label: d.label,
          data: baris.map(NILAI[d.id]),
          borderColor: d.warna,
          backgroundColor: d.warna,
          borderWidth: d.id === "penjualan" ? 3 : 2,
          fill: false,
          tension: 0.35,
          pointRadius: 0,
          pointHoverRadius: 5,
          yAxisID: d.uang ? "y" : "y2",
        })),
      },
      options: {
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          // Kotak centang di atas sudah jadi legendanya.
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (c) => {
                const n = Number(c.parsed.y ?? 0);
                return c.dataset.yAxisID === "y2"
                  ? `${c.dataset.label}: ${angka(n)} order`
                  : `${c.dataset.label}: ${rupiah(n)}`;
              },
            },
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: { callback: (v) => rupiahRingkas(Number(v)) },
            grid: { color: WARNA.kisi },
          },
          y2: {
            display: adaTransaksi,
            position: "right",
            beginAtZero: true,
            ticks: { callback: (v) => `${angka(Number(v))} order` },
            grid: { display: false },
          },
          x: { grid: { display: false }, ticks: { maxTicksLimit: 16 } },
        },
      },
    }),
    [baris, aktif, adaTransaksi]
  );

  function alih(id: IdDeret) {
    setAktif((lama) => {
      const baru = new Set(lama);
      // Deret terakhir tidak boleh ikut dimatikan: grafik tanpa satu pun deret
      // menyisakan kotak kosong bergaris kisi yang terbaca sebagai galat.
      if (baru.has(id) && baru.size > 1) baru.delete(id);
      else baru.add(id);
      return baru;
    });
  }

  return (
    <Kartu className="mb-4 overflow-hidden">
      <KepalaKartu
        judul="Grafik Penjualan per Periode"
        sub="Per tanggal WIB · tanggal tanpa transaksi tetap digambar sebagai nol"
        aksi={
          <button
            type="button"
            onClick={() => setTampil((v) => !v)}
            aria-expanded={tampil}
            className="text-brand-dark hover:text-brand cursor-pointer text-[13px] font-semibold whitespace-nowrap"
          >
            {tampil ? "Sembunyikan ▲" : "Tampilkan ▼"}
          </button>
        }
      />

      {tampil && satuTanggal ? (
        <IsiKartu>
          <div className="border-line text-ink-3 grid h-[160px] place-items-center rounded-xl border border-dashed px-4 text-center">
            <div>
              <p className="text-ink-2 text-sm font-bold">
                Tidak berlaku untuk harian
              </p>
              <p className="mt-1 text-[13px]">
                Grafik ini menggambar tren antar tanggal, dan rentang satu hari
                cuma punya satu titik. Pilih Mingguan atau Bulanan di sebelah
                kiri untuk melihatnya.
              </p>
            </div>
          </div>
        </IsiKartu>
      ) : tampil ? (
        <IsiKartu>
          <div className="mb-3 flex flex-wrap justify-end gap-x-4 gap-y-2">
            {DERET.map((d) => (
              <label
                key={d.id}
                className="text-ink-2 flex cursor-pointer items-center gap-1.5 text-[13px] font-medium"
              >
                <input
                  type="checkbox"
                  checked={aktif.has(d.id)}
                  onChange={() => alih(d.id)}
                  className="accent-brand h-4 w-4 cursor-pointer"
                />
                <span
                  aria-hidden="true"
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: d.warna }}
                />
                {d.label}
              </label>
            ))}
          </div>

          <Grafik
            config={config}
            tinggi="h-[320px]"
            judulAksesibilitas="Grafik penjualan per tanggal"
          />
        </IsiKartu>
      ) : null}
    </Kartu>
  );
}

function Kotak({
  judul,
  nilai,
  porsi,
  rincian,
  utama = false,
}: {
  judul: string;
  nilai: string;
  porsi: string;
  rincian: [string, string][];
  utama?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-4 ${
        utama ? "border-brand bg-brand-soft" : "border-line"
      }`}
    >
      <h4 className="text-ink-3 text-xs font-bold tracking-[0.5px] uppercase">
        {judul}
      </h4>
      <p
        className={`mt-2 mb-0.5 text-[22px] font-extrabold tracking-[-0.5px] ${
          utama ? "text-brand-dark" : ""
        }`}
      >
        {nilai}
      </p>
      <p className="text-ink-3 mb-2.5 text-xs">{porsi} dari omzet kotor</p>
      <dl className="text-[13px]">
        {rincian.map(([label, isi]) => (
          <div key={label} className="text-ink-2 flex justify-between py-1">
            <dt>{label}</dt>
            <dd className="font-bold tabular-nums">{isi}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

