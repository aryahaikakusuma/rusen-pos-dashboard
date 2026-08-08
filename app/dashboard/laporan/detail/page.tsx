"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo } from "react";

import KontrolPeriode from "@/components/dashboard/KontrolPeriode";
import { BarisKpi, IsiKartu, Kartu, KepalaKartu, Kpi } from "@/components/dashboard/Kartu";
import { AreaData, Gagal, Kosong, SedangMemuat } from "@/components/dashboard/Status";
import { Gulung, Tanda, Td, Th } from "@/components/dashboard/Tabel";
import { Api } from "@/lib/api-klien";
import { angka, bagi, rupiah } from "@/lib/format";
import { useData } from "@/lib/use-data";
import { usePeriode } from "@/lib/use-periode";

const PER_HALAMAN = [25, 50, 100];

/**
 * Detail Penjualan — satu baris per ORDER lunas.
 *
 * TIDAK ADA RINCIAN ITEM DI SINI, dan itu bukan kelalaian. Satu order punya
 * banyak item; memaksakannya ke satu baris berarti satu baris mewakili dua
 * grain sekaligus, dan tiap penjumlahan atas tabelnya jadi ganda. Rincian item
 * per order ada di Histori Transaksi.
 *
 * PAGINASI DIKERJAKAN POSTGRES, bukan browser. `total_baris` dibawa fungsi
 * sebagai kolom window, jadi hitungan halaman dan isi halaman selalu berasal
 * dari satu definisi "baris mana yang masuk".
 *
 * KARTU DI ATAS TABEL SENGAJA DIAMBIL DARI LAPORAN HARIAN, bukan dijumlahkan
 * dari baris yang tampil. Halaman ini cuma memuat 25–100 order; menjumlahkan
 * yang terlihat akan menghasilkan "omzet periode" yang berubah setiap kali
 * orang menekan Berikutnya. Karena kedua fungsi berjalan di sumbu `subtotal`
 * yang sama, angka di kartu ini wajib cocok dengan halaman Penjualan Harian.
 */
export default function DetailPenjualanPage() {
  const { periode } = usePeriode();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const halaman = Math.max(1, Number(params.get("halaman") ?? 1) || 1);
  const limitDiminta = Number(params.get("per") ?? 25);
  const limit = PER_HALAMAN.includes(limitDiminta) ? limitDiminta : 25;

  const detail = useData(() => Api.detail(periode, halaman, limit), [
    periode.dari,
    periode.sampai,
    halaman,
    limit,
  ]);

  const harian = useData(() => Api.harian(periode), [
    periode.dari,
    periode.sampai,
  ]);

  const ringkas = useMemo(() => {
    const baris = harian.data?.baris ?? [];
    return baris.reduce(
      (a, b) => ({
        order: a.order + b.jumlah_order,
        omzet: a.omzet + b.omzet_kotor,
        pbjt: a.pbjt + b.pbjt,
        tertagih: a.tertagih + b.tertagih,
        refund: a.refund + b.total_refund,
      }),
      { order: 0, omzet: 0, pbjt: 0, tertagih: 0, refund: 0 }
    );
  }, [harian.data]);

  /**
   * Halaman ini punya DUA sumber yang bisa tiba pada saat berbeda, jadi satu
   * penanda waktu harus memilih. Yang dipakai adalah yang PALING TUA — itu umur
   * hal tertua yang sedang terpampang. Memakai yang terbaru akan mengklaim
   * kesegaran untuk blok yang belum tentu ikut diperbarui.
   *
   * Selama salah satunya belum pernah tiba, tidak ada waktu yang bisa
   * dinyatakan sama sekali.
   */
  const waktuData =
    detail.pada === null || harian.pada === null
      ? null
      : Math.min(detail.pada, harian.pada);

  function pindah(ke: number, perHalaman = limit) {
    const berikut = new URLSearchParams(params);
    berikut.set("halaman", String(ke));
    berikut.set("per", String(perHalaman));
    router.push(`${pathname}?${berikut.toString()}`);
  }

  const baris = detail.data?.baris ?? [];
  const totalBaris = detail.data?.totalBaris ?? 0;
  const totalHalaman = Math.max(1, Math.ceil(totalBaris / limit));

  return (
    <>
      <KontrolPeriode waktuData={waktuData} />

      {/* Dua sumber, dua penanda: kartu KPI datang dari laporan HARIAN dan
          tabel dari laporan DETAIL, jadi keduanya bisa selesai pada saat yang
          berbeda. Satu penanda gabungan akan berbohong tentang salah satunya. */}
      <AreaData menyegarkan={harian.memuat}>
      <div className="no-print">
        <BarisKpi>
          <Kpi label="Order Lunas" nilai={angka(ringkas.order)} kaki="Seluruh periode" />
          <Kpi
            label="Omzet Kotor"
            nilai={rupiah(ringkas.omzet)}
            kaki="Pra-pajak, sama dengan Penjualan Harian"
          />
          <Kpi
            label="Rata-rata per Order"
            nilai={rupiah(bagi(ringkas.omzet, ringkas.order))}
            kaki="Ukuran keranjang periode ini"
          />
          <Kpi label="PBJT Terpungut" nilai={rupiah(ringkas.pbjt)} kaki="Seluruh periode" />
          <Kpi
            label="Refund"
            nilai={rupiah(ringkas.refund)}
            kaki="Pada tanggal refundnya"
          />
        </BarisKpi>
      </div>
      </AreaData>

      {detail.galat ? (
        <Gagal pesan={detail.galat} coba={detail.muatUlang} />
      ) : detail.memuat && !detail.data ? (
        <SedangMemuat tinggi="h-96" />
      ) : (
        <AreaData menyegarkan={detail.memuat}>
        <Kartu className="overflow-hidden">
          <KepalaKartu
            judul="Detail Transaksi Penjualan"
            sub={`${angka(totalBaris)} order · halaman ${halaman} dari ${totalHalaman}`}
          />

          <Gulung>
            {/* Sebelas kolom: dirapatkan supaya sebanyak mungkin muat sebelum
                penggulir mendatar diperlukan. */}
            <table className="w-full border-collapse text-[13px] [&_td]:px-2 [&_th]:px-2">
              <thead>
                <tr>
                  <Th>No. Order</Th>
                  <Th>Waktu (WIB)</Th>
                  <Th>Kasir</Th>
                  <Th>Kode Meja</Th>
                  <Th>Metode</Th>
                  <Th num>Subtotal</Th>
                  <Th num>Dasar PBJT</Th>
                  <Th num>PBJT</Th>
                  <Th num>Total</Th>
                  <Th num>Refund</Th>
                  <Th>Pajak</Th>
                </tr>
              </thead>
              <tbody>
                {baris.length === 0 ? (
                  <tr>
                    <Td colSpan={11}>
                      <Kosong>
                        Tidak ada order lunas pada rentang ini.
                      </Kosong>
                    </Td>
                  </tr>
                ) : (
                  baris.map((b) => (
                    <tr key={b.order_id} className="hover:bg-[#FAFBFB]">
                      <Td className="whitespace-nowrap">
                        <b className="text-xs">{b.nomor_order}</b>
                        {/* Baris uji hanya muncul kalau suatu saat ada yang
                            menyalakan p_include_test; ditandai supaya tidak
                            pernah terbaca sebagai omzet biasa. */}
                        {b.is_test_data ? (
                          <span className="ml-2">
                            <Tanda jenis="peringatan">UJI</Tanda>
                          </span>
                        ) : null}
                      </Td>
                      <Td className="whitespace-nowrap">{b.waktu_bayar_wib}</Td>
                      <Td>{b.kasir}</Td>
                      <Td className="text-ink-3 text-xs">{b.table_code}</Td>
                      <Td className="whitespace-nowrap">
                        {b.metode_bayar === "cash" ? "Tunai" : "Non-Tunai"}
                      </Td>
                      <Td num>{rupiah(b.subtotal)}</Td>
                      {/* Pada order yang dibebaskan, `dasar_pbjt` TETAP terisi:
                          kolomnya menjawab "berapa nilai barang yang objek
                          pajak", bukan "berapa yang dikenakan". Menampilkan
                          angkanya di sini akan membuat orang menjumlahkan kolom
                          ini dan mendapat dasar pengenaan yang lebih besar
                          daripada yang dilaporkan ke Bapenda. */}
                      <Td num className="text-ink-3">
                        {b.status_pajak === "exempt"
                          ? "—"
                          : b.dasar_pbjt
                            ? rupiah(b.dasar_pbjt)
                            : "—"}
                      </Td>
                      <Td num className="text-brand-dark">
                        {b.pbjt ? rupiah(b.pbjt) : "—"}
                      </Td>
                      <Td num>
                        <b>{rupiah(b.total)}</b>
                      </Td>
                      <Td num className={b.ada_refund ? "text-danger" : "text-ink-3"}>
                        {b.ada_refund ? rupiah(b.refund_total) : "—"}
                      </Td>
                      <Td>
                        {b.status_pajak === "exempt" ? (
                          <span
                            title={
                              [b.alasan_bebas, b.disetujui_oleh && `disetujui ${b.disetujui_oleh}`]
                                .filter(Boolean)
                                .join(" · ") || "Tanpa keterangan"
                            }
                          >
                            <Tanda jenis="peringatan">Bebas</Tanda>
                          </span>
                        ) : (
                          <Tanda jenis="brand">Dipungut</Tanda>
                        )}
                      </Td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </Gulung>

          <div className="border-line text-ink-3 no-print flex flex-wrap items-center gap-3 border-t px-4 py-3.5 text-[13px]">
            <button
              type="button"
              disabled={halaman <= 1}
              onClick={() => pindah(halaman - 1)}
              className="border-line hover:border-brand cursor-pointer rounded-lg border bg-white px-3 py-1.5 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-40"
            >
              ‹ Sebelumnya
            </button>
            <span>
              Halaman {halaman} dari {totalHalaman}
            </span>
            <button
              type="button"
              disabled={halaman >= totalHalaman}
              onClick={() => pindah(halaman + 1)}
              className="border-line hover:border-brand cursor-pointer rounded-lg border bg-white px-3 py-1.5 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-40"
            >
              Berikutnya ›
            </button>
            <span className="flex-1" />
            <label className="flex items-center gap-2">
              <span className="sr-only">Baris per halaman</span>
              <select
                value={limit}
                onChange={(e) => pindah(1, Number(e.target.value))}
                className="border-line cursor-pointer rounded-lg border bg-white px-2.5 py-1.5 text-xs font-semibold"
              >
                {PER_HALAMAN.map((n) => (
                  <option key={n} value={n}>
                    {n} / halaman
                  </option>
                ))}
              </select>
            </label>
          </div>
        </Kartu>
        </AreaData>
      )}

      <Kartu className="no-print mt-4">
        <IsiKartu className="text-ink-3 text-xs leading-relaxed">
          <p>
            <b className="text-ink-2">Kolom Kode Meja ditulis apa adanya.</b> Ia
            tidak ditafsirkan sebagai jenis order: aplikasi kasir punya sakelar
            Meja/Takeaway, tapi yang sampai ke basis data hanya string{" "}
            <code>Takeaway</code> pada kolom kode meja. Satu ejaan berbeda dan
            barisnya diam-diam salah golong — kolom jenis order yang sungguhan
            menuntut perubahan di aplikasi HP lebih dulu.
          </p>
          <p className="mt-2">
            <b className="text-ink-2">Penyaringan belum ada di sini.</b> Filter
            kasir, metode bayar, dan pencarian nomor struk hanya bisa benar
            kalau dikerjakan Postgres bersamaan dengan paginasinya. Menyaring
            baris yang kebetulan sedang tampil akan menghasilkan hasil yang
            berbeda tiap halaman.
          </p>
        </IsiKartu>
      </Kartu>
    </>
  );
}
