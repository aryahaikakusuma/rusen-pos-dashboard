"use client";

import { useMemo } from "react";

import { BarisKpi, Kpi } from "@/components/dashboard/Kartu";
import { Gagal, SedangMemuat } from "@/components/dashboard/Status";
import SubTab from "@/components/dashboard/SubTab";
import { Gulung, Td, Th } from "@/components/dashboard/Tabel";
import TombolUnduh from "@/components/dashboard/TombolUnduh";
import { Api } from "@/lib/api-klien";
import { angka, bagi, persen, rupiah } from "@/lib/format";
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
 * Penjualan Harian — satu baris per tanggal WIB.
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

  const { data, memuat, galat, muatUlang } = useData(
    () => Api.harian(periode),
    [periode.dari, periode.sampai]
  );

  const baris = useMemo(() => data?.baris ?? [], [data]);
  const T = useMemo(() => totalHarian(baris), [baris]);

  if (galat) {
    return (
      <>
        <SubTab />
        <Gagal pesan={galat} coba={muatUlang} />
      </>
    );
  }

  if (memuat && !data) {
    return (
      <>
        <SubTab />
        <SedangMemuat tinggi="h-96" />
      </>
    );
  }

  const hariAda = baris.filter((b) => b.jumlah_order > 0).length;
  const tertinggi = [...baris].sort((a, b) => b.omzet_kotor - a.omzet_kotor)[0];

  return (
    <>
      <SubTab />

      <div className="no-print mb-5 flex flex-wrap items-center gap-3">
        <div className="border-line text-ink-2 rounded-[10px] border bg-white px-3 py-2 text-sm font-medium">
          📅 {labelPeriode(periode)} · {jumlahHari(periode)} hari
        </div>
        <span className="flex-1" />
        <button
          type="button"
          onClick={() => window.print()}
          className="border-line text-ink-2 hover:border-brand hover:text-brand-dark cursor-pointer rounded-[10px] border bg-white px-4 py-2.5 text-[13px] font-semibold transition-colors"
        >
          🖨 Cetak / PDF
        </button>
        <TombolUnduh jenis="harian" periode={periode} />
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
            <h2 className="text-xl font-extrabold">Laporan Penjualan Harian</h2>
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
    </>
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

