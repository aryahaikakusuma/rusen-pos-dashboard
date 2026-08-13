"use client";

import { useMemo, useState, type ReactNode } from "react";

import KontrolPeriode from "@/components/dashboard/KontrolPeriode";
import { IsiKartu, Kartu, KepalaKartu } from "@/components/dashboard/Kartu";
import { AreaData, Gagal, Kosong, SedangMemuat } from "@/components/dashboard/Status";
import { Gulung, Tanda, Td, Th } from "@/components/dashboard/Tabel";
import { Api } from "@/lib/api-klien";
import {
  kelompokkanPerHari,
  labelStatusSelisih,
  TANGGAL_MULAI_SHIFT,
  type BarisHari,
} from "@/lib/kas-shift";
import type {
  BalasanDetailKasShift,
  BarisDetailKasShift,
  BarisShift,
  Periode,
} from "@/lib/kontrak";
import { angka, rupiah } from "@/lib/format";
import { geserHari, hariIniWib, tanggalPendek, tanggalWib, waktuWib } from "@/lib/periode";
import { useData } from "@/lib/use-data";
import { usePeriode } from "@/lib/use-periode";

const PER_HALAMAN = [25, 50, 100];

/**
 * Kas per Shift — grain per-hari (lapis 1), shift (lapis 2), movement (lapis 3).
 *
 * BAWAAN 7 HARI TERAKHIR, BUKAN AWAL BULAN. Sama alasannya seperti sebelum
 * halaman ini punya lapis hari: toko dengan 2–3 shift/hari sudah puluhan
 * shift dalam sepekan. Referensi fungsi ini WAJIB stabil (didefinisikan di
 * luar komponen) — lihat catatan di `usePeriode`.
 */
function bawaanKasShift(): Periode {
  const hariIni = hariIniWib();
  return { dari: geserHari(hariIni, -6), sampai: hariIni };
}

const LABEL_JENIS: Record<BarisDetailKasShift["jenis"], string> = {
  masuk: "Kas Masuk",
  keluar: "Kas Keluar",
  refund: "Refund",
};

/** "HH:mm" WIB — `waktuWib` di `lib/periode.ts` membawa tanggal juga, terlalu panjang untuk sel tabel. */
function jamWib(iso: string): string {
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

/** Netral nol/null, merah kurang, kuning lebih — TIDAK PERNAH hijau. */
function warnaSelisih(nilai: number | null): string {
  if (nilai === null || nilai === 0) return "text-ink-2";
  return nilai < 0 ? "text-danger" : "text-warn";
}

/** Sama aturan warna dengan `warnaSelisih`, dipakai untuk kolom Status Selisih lapis 1. */
function warnaStatusHari(hari: BarisHari): string {
  if (hari.shiftBermasalah === 0 || hari.selisihTerbesar === null) {
    return hari.adaTidakDiketahui ? "text-ink-3" : "text-ink-2";
  }
  return hari.selisihTerbesar < 0 ? "text-danger" : "text-warn";
}

export default function KasPerShiftPage() {
  const { periode } = usePeriode(bawaanKasShift);
  const [sertakanTerbuka, setSertakanTerbuka] = useState(false);

  const { data, memuat, galat, muatUlang, pada } = useData(
    () => Api.kasShift(periode, sertakanTerbuka),
    [periode.dari, periode.sampai, sertakanTerbuka]
  );

  const baris = useMemo(() => data?.baris ?? [], [data]);

  // Order/refund yatim sebelum sistem shift dipakai adalah fakta historis
  // (hampir semua order memang yatim), bukan anomali — jadi tidak dihitung
  // untuk banner. Ini bukan agregasi uang, cuma penyaringan daftar yang
  // sudah dikembalikan server berdasarkan tanggal.
  const orderYatim = useMemo(
    () => (data?.orderYatim ?? []).filter((o) => tanggalWib(new Date(o.waktu)) >= TANGGAL_MULAI_SHIFT),
    [data]
  );
  const refundYatim = useMemo(
    () => (data?.refundYatim ?? []).filter((r) => tanggalWib(new Date(r.waktu)) >= TANGGAL_MULAI_SHIFT),
    [data]
  );

  const hariBaris = useMemo(() => kelompokkanPerHari(baris, periode), [baris, periode]);

  // Satu-satunya pengecualian aturan "tidak menghitung di JS" (di luar
  // pengelompokan per-hari sendiri): menjumlahkan baris yang SUDAH
  // dikembalikan `laporan_shift`, karena tidak ada fungsi agregat rentang
  // tersendiri untuk baris ringkasan di bawah tabel. Selisih SENGAJA tidak
  // ikut dijumlahkan — lihat `lib/kas-shift.ts`.
  const total = useMemo(
    () =>
      baris.reduce(
        (a, b) => ({
          penjualanTunai: a.penjualanTunai + b.penjualan_tunai,
          kasMasuk: a.kasMasuk + b.kas_masuk,
          kasKeluar: a.kasKeluar + b.kas_keluar,
        }),
        { penjualanTunai: 0, kasMasuk: 0, kasKeluar: 0 }
      ),
    [baris]
  );
  const totalShiftBermasalah = useMemo(
    () => hariBaris.reduce((a, h) => a + h.shiftBermasalah, 0),
    [hariBaris]
  );

  const [hariTerpilih, setHariTerpilih] = useState<string | null>(null);
  const [shiftId, setShiftId] = useState<string | null>(null);
  const [halamanDetail, setHalamanDetail] = useState(1);
  const [limitDetail, setLimitDetail] = useState(25);

  const hariAktif = hariBaris.find((h) => h.tanggal === hariTerpilih) ?? null;
  const shiftTerpilih = baris.find((b) => b.shift_id === shiftId) ?? null;

  const detail = useData<BalasanDetailKasShift>(
    () =>
      shiftId
        ? Api.detailKasShift(shiftId, halamanDetail, limitDetail)
        : Promise.resolve({
            shiftId: "",
            halaman: 1,
            limit: limitDetail,
            totalBaris: 0,
            baris: [],
          }),
    [shiftId, halamanDetail, limitDetail]
  );

  /**
   * Satu klik dari lapis 1 sudah cukup untuk hari dengan satu shift — lapis 3
   * dibuka langsung di atas lapis 2, bukan menggantikannya. Lapis 2 tetap
   * ada di baliknya (bukan dilewati secara struktural): menutup lapis 3
   * kembali ke lapis 2, yang untuk hari itu berisi baris shift yang sama.
   */
  function bukaHari(hari: BarisHari) {
    if (hari.jumlahShift === 0) return;
    setHariTerpilih(hari.tanggal);
    setShiftId(hari.jumlahShift === 1 ? hari.shifts[0].shift_id : null);
    setHalamanDetail(1);
  }

  function tutupHari() {
    setHariTerpilih(null);
    setShiftId(null);
  }

  function bukaDetail(id: string) {
    setShiftId(id);
    setHalamanDetail(1);
  }

  function tutupDetail() {
    setShiftId(null);
  }

  function ubahLimitDetail(n: number) {
    setLimitDetail(n);
    setHalamanDetail(1);
  }

  if (galat) {
    return (
      <>
        <KontrolPeriode waktuData={pada} bawaan={bawaanKasShift} />
        <Gagal pesan={galat} coba={muatUlang} />
      </>
    );
  }
  if (memuat && !data) {
    return (
      <>
        <KontrolPeriode waktuData={pada} bawaan={bawaanKasShift} />
        <SedangMemuat tinggi="h-96" />
      </>
    );
  }

  return (
    <>
      <KontrolPeriode waktuData={pada} bawaan={bawaanKasShift} />

      <div className="no-print border-line mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-white px-4 py-3">
        <label className="text-ink-2 flex cursor-pointer items-center gap-2 text-[13px] font-medium">
          <input
            type="checkbox"
            checked={sertakanTerbuka}
            onChange={(e) => setSertakanTerbuka(e.target.checked)}
            className="accent-brand h-4 w-4 cursor-pointer"
          />
          Tampilkan shift terbuka
        </label>
        {/* Shift terbuka hari ini tidak pernah dikirim ke server (shifts.closed_at
            NOT NULL) — lihat 0032_agregasi_shift_kas.sql. Toggle tetap dipasang
            supaya benar kalau constraint itu suatu saat dilonggarkan. */}
        <p className="text-ink-3 text-[11px]">
          Shift terbuka saat ini tidak pernah dikirim ke server, jadi toggle ini
          kemungkinan besar tidak mengubah apa pun.
        </p>
      </div>

      <AreaData menyegarkan={memuat}>
        {orderYatim.length > 0 || refundYatim.length > 0 ? (
          <div className="mb-4 flex flex-col gap-2">
            {orderYatim.length > 0 ? (
              <PeringatanYatim
                label="penjualan"
                jumlah={orderYatim.length}
                nominal={orderYatim.reduce((a, o) => a + o.total, 0)}
              >
                {orderYatim.map((o) => (
                  <div key={o.order_id} className="flex justify-between gap-3 py-1">
                    <span>
                      {waktuWib(new Date(o.waktu))} · {o.kasir} · {o.table_code} ·{" "}
                      {o.metode_pembayaran === "cash" ? "Tunai" : "Non-Tunai"}
                    </span>
                    <span className="font-semibold tabular-nums">{rupiah(o.total)}</span>
                  </div>
                ))}
              </PeringatanYatim>
            ) : null}

            {refundYatim.length > 0 ? (
              <PeringatanYatim
                label="refund"
                jumlah={refundYatim.length}
                nominal={refundYatim.reduce((a, r) => a + r.nominal, 0)}
              >
                {refundYatim.map((r) => (
                  <div key={r.refund_id} className="flex justify-between gap-3 py-1">
                    <span>
                      {waktuWib(new Date(r.waktu))} · {r.kasir} ·{" "}
                      {r.alasan || "Tanpa alasan"} ·{" "}
                      {r.metode_pembayaran === "cash" ? "Tunai" : "Non-Tunai"}
                    </span>
                    <span className="font-semibold tabular-nums">{rupiah(r.nominal)}</span>
                  </div>
                ))}
              </PeringatanYatim>
            ) : null}
          </div>
        ) : null}

        {periode.dari < TANGGAL_MULAI_SHIFT ? (
          <div className="border-line bg-[#F7F8F8] text-ink-3 mb-4 rounded-xl border px-4 py-3 text-[13px]">
            Sistem shift baru dipakai sejak {tanggalPendek(TANGGAL_MULAI_SHIFT)}. Periode
            sebelum tanggal itu tidak punya data kas per shift.
          </div>
        ) : null}

        <Kartu className="overflow-hidden">
          <KepalaKartu
            judul="Kas per Hari"
            sub={`${angka(baris.length)} shift pada ${angka(
              hariBaris.filter((h) => h.jumlahShift > 0).length
            )} hari`}
          />

          <Gulung>
            <table className="w-full border-collapse text-[13px] [&_td]:px-2 [&_th]:px-2">
              <thead>
                <tr>
                  <Th>Tanggal</Th>
                  <Th num>Jumlah Shift</Th>
                  <Th>Kasir</Th>
                  <Th num>Penjualan Tunai</Th>
                  <Th num>Kas Masuk</Th>
                  <Th num>Kas Keluar</Th>
                  <Th>Status Selisih</Th>
                </tr>
              </thead>
              <tbody>
                {hariBaris.length === 0 ? (
                  <tr>
                    <Td colSpan={7}>
                      <Kosong>Tidak ada hari pada rentang ini.</Kosong>
                    </Td>
                  </tr>
                ) : (
                  hariBaris.map((h) => {
                    const bisaBuka = h.jumlahShift > 0;
                    const label = labelStatusSelisih(h, rupiah);
                    return (
                      <tr
                        key={h.tanggal}
                        onClick={bisaBuka ? () => bukaHari(h) : undefined}
                        className={
                          h.diLuarCakupan
                            ? "opacity-60"
                            : bisaBuka
                              ? "hover:bg-[#FAFBFB] cursor-pointer"
                              : ""
                        }
                      >
                        <Td className="whitespace-nowrap">
                          <b>{tanggalPendek(h.tanggal)}</b>
                          {h.adaFormulaTidakCocok ? (
                            <span
                              role="img"
                              aria-label="Ada shift dengan perhitungan perangkat dan server berbeda"
                              title="Ada shift di hari ini dengan perhitungan perangkat dan server berbeda — buka lapis shift untuk lihat yang mana."
                              className="text-danger ml-1 cursor-help"
                            >
                              ⚠
                            </span>
                          ) : null}
                        </Td>
                        <Td num>
                          {h.diLuarCakupan ? (
                            <Tanda jenis="netral">Di luar cakupan</Tanda>
                          ) : (
                            angka(h.jumlahShift)
                          )}
                        </Td>
                        <Td>{h.kasir || "—"}</Td>
                        <Td num>{h.penjualanTunai ? rupiah(h.penjualanTunai) : "—"}</Td>
                        <Td num>{h.kasMasuk ? rupiah(h.kasMasuk) : "—"}</Td>
                        <Td num>{h.kasKeluar ? rupiah(h.kasKeluar) : "—"}</Td>
                        <Td className={h.jumlahShift === 0 ? "text-ink-3" : warnaStatusHari(h)}>
                          {h.diLuarCakupan || h.jumlahShift === 0 ? (
                            "—"
                          ) : label ? (
                            <b>{label}</b>
                          ) : h.adaTidakDiketahui ? (
                            "Tidak Diketahui"
                          ) : (
                            "Sesuai"
                          )}
                        </Td>
                      </tr>
                    );
                  })
                )}
              </tbody>
              {hariBaris.length > 0 ? (
                <tfoot>
                  <tr className="bg-brand-soft text-brand-dark font-extrabold">
                    <Td className="whitespace-nowrap" colSpan={3}>
                      TOTAL {angka(baris.length)} SHIFT
                    </Td>
                    <Td num>{rupiah(total.penjualanTunai)}</Td>
                    <Td num>{rupiah(total.kasMasuk)}</Td>
                    <Td num>{rupiah(total.kasKeluar)}</Td>
                    <Td>
                      {totalShiftBermasalah === 0
                        ? "Tidak ada selisih"
                        : `${angka(totalShiftBermasalah)} shift selisih`}
                    </Td>
                  </tr>
                </tfoot>
              ) : null}
            </table>
          </Gulung>
        </Kartu>

        <Kartu className="no-print mt-4">
          <IsiKartu className="text-ink-3 text-xs leading-relaxed">
            <p>
              <b className="text-ink-2">Refund atas order non-tunai yang dibayar dari uang laci</b>{" "}
              belum terhitung di kas seharusnya, dan dapat muncul sebagai selisih
              kurang. Ini keterbatasan yang sudah didokumentasikan di kode
              perangkat, bukan bug.
            </p>
          </IsiKartu>
        </Kartu>
      </AreaData>

      {hariAktif ? (
        <HariDrawer hari={hariAktif} onBukaShift={bukaDetail} onTutup={tutupHari} />
      ) : null}

      {shiftTerpilih ? (
        <DetailShift
          shift={shiftTerpilih}
          hari={hariAktif}
          detail={detail}
          halaman={halamanDetail}
          limit={limitDetail}
          onHalaman={setHalamanDetail}
          onLimit={ubahLimitDetail}
          onTutup={tutupDetail}
        />
      ) : null}
    </>
  );
}

/** Baris peringatan data "yatim" — bisa dibuka untuk melihat rinciannya. */
function PeringatanYatim({
  label,
  jumlah,
  nominal,
  children,
}: {
  label: string;
  jumlah: number;
  nominal: number;
  children: ReactNode;
}) {
  const [buka, setBuka] = useState(false);

  return (
    <div className="border-warn/30 bg-warn-soft/40 overflow-hidden rounded-xl border">
      <button
        type="button"
        onClick={() => setBuka((v) => !v)}
        aria-expanded={buka}
        className="text-warn flex w-full cursor-pointer items-center justify-between gap-3 px-4 py-3 text-left text-[13px] font-semibold"
      >
        <span>
          {angka(jumlah)} {label} di luar jam shift senilai {rupiah(nominal)} — tidak
          masuk laporan shift manapun.
        </span>
        <span aria-hidden="true">{buka ? "▲" : "▼"}</span>
      </button>
      {buka ? (
        <div className="border-warn/20 text-ink-2 border-t bg-white px-4 py-3 text-[13px]">
          {children}
        </div>
      ) : null}
    </div>
  );
}

/** Lapis 2 — Daftar Shift dalam satu hari. Isinya persis tabel per-shift lama, difilter ke satu tanggal. */
function HariDrawer({
  hari,
  onBukaShift,
  onTutup,
}: {
  hari: BarisHari;
  onBukaShift: (id: string) => void;
  onTutup: () => void;
}) {
  const totalHari = hari.shifts.reduce(
    (a, b) => ({
      penjualanTunai: a.penjualanTunai + b.penjualan_tunai,
      kasMasuk: a.kasMasuk + b.kas_masuk,
      kasKeluar: a.kasKeluar + b.kas_keluar,
    }),
    { penjualanTunai: 0, kasMasuk: 0, kasKeluar: 0 }
  );

  return (
    <div className="fixed inset-0 z-40 flex justify-end" role="dialog" aria-modal="true">
      <button
        type="button"
        aria-label="Tutup daftar shift"
        onClick={onTutup}
        className="absolute inset-0 cursor-default bg-black/30"
      />
      <div className="border-line relative flex h-full w-full max-w-3xl flex-col overflow-y-auto border-l bg-white shadow-[0_24px_64px_rgba(16,24,40,.24)]">
        <div className="border-line sticky top-0 z-10 flex items-center justify-between gap-3 border-b bg-white px-5 py-4">
          <div className="min-w-0">
            <h3 className="text-ink truncate text-[15px] font-bold">
              {tanggalPendek(hari.tanggal)}
            </h3>
            <p className="text-ink-3 text-xs">{angka(hari.jumlahShift)} shift pada hari ini</p>
          </div>
          <button
            type="button"
            onClick={onTutup}
            aria-label="Tutup"
            className="text-ink-3 hover:text-ink cursor-pointer text-2xl leading-none"
          >
            ×
          </button>
        </div>

        <Gulung>
          <table className="w-full border-collapse text-[13px] [&_td]:px-2 [&_th]:px-2">
            <thead>
              <tr>
                <Th>Tanggal &amp; Jam</Th>
                <Th>Kasir</Th>
                <Th num>Modal Awal</Th>
                <Th num>Penjualan Tunai</Th>
                <Th num>Kas Masuk</Th>
                <Th num>Kas Keluar</Th>
                <Th num>Refund Tunai</Th>
                <Th num>Kas Seharusnya</Th>
                <Th num>Kas Aktual</Th>
                <Th num>Selisih</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {hari.shifts.length === 0 ? (
                <tr>
                  <Td colSpan={11}>
                    <Kosong>Tidak ada shift pada hari ini.</Kosong>
                  </Td>
                </tr>
              ) : (
                hari.shifts.map((b) => (
                  <tr
                    key={b.shift_id}
                    onClick={() => onBukaShift(b.shift_id)}
                    className="hover:bg-[#FAFBFB] cursor-pointer"
                  >
                    <Td className="whitespace-nowrap">
                      <b>{tanggalPendek(tanggalWib(new Date(b.dibuka_pada)))}</b>{" "}
                      <span className="text-ink-3 text-[11px]">
                        {jamWib(b.dibuka_pada)}
                        {b.ditutup_pada ? ` – ${jamWib(b.ditutup_pada)}` : " – berjalan"}
                      </span>
                    </Td>
                    <Td>{b.kasir}</Td>
                    <Td num>{rupiah(b.modal_awal)}</Td>
                    <Td num>{rupiah(b.penjualan_tunai)}</Td>
                    <Td num>{rupiah(b.kas_masuk)}</Td>
                    <Td num>{rupiah(b.kas_keluar)}</Td>
                    <Td num className={b.refund_tunai ? "text-danger" : ""}>
                      {b.refund_tunai ? rupiah(b.refund_tunai) : "—"}
                    </Td>
                    <Td num>{rupiah(b.kas_seharusnya)}</Td>
                    <Td num>{b.kas_aktual === null ? "" : rupiah(b.kas_aktual)}</Td>
                    <Td num className={warnaSelisih(b.selisih_tersimpan)}>
                      <b>{b.selisih_tersimpan === null ? "" : rupiah(b.selisih_tersimpan)}</b>
                      {b.formula_cocok === false ? (
                        <span
                          role="img"
                          aria-label="Perhitungan perangkat dan server berbeda"
                          title={`Perhitungan perangkat dan server berbeda — angkanya perlu diperiksa. Selisih hitung server: ${
                            b.selisih_hitung_server === null ? "—" : rupiah(b.selisih_hitung_server)
                          }`}
                          className="text-danger ml-1 cursor-help"
                        >
                          ⚠
                        </span>
                      ) : null}
                    </Td>
                    <Td>{b.masih_terbuka ? <Tanda jenis="peringatan">Terbuka</Tanda> : null}</Td>
                  </tr>
                ))
              )}
            </tbody>
            {hari.shifts.length > 0 ? (
              <tfoot>
                <tr className="bg-brand-soft text-brand-dark font-extrabold">
                  <Td className="whitespace-nowrap" colSpan={2}>
                    TOTAL {angka(hari.shifts.length)} SHIFT
                  </Td>
                  <Td num>—</Td>
                  <Td num>{rupiah(totalHari.penjualanTunai)}</Td>
                  <Td num>{rupiah(totalHari.kasMasuk)}</Td>
                  <Td num>{rupiah(totalHari.kasKeluar)}</Td>
                  <Td num colSpan={4}>
                    —
                  </Td>
                  <Td>—</Td>
                </tr>
              </tfoot>
            ) : null}
          </table>
        </Gulung>
      </div>
    </div>
  );
}

/** Lapis 3 — Daftar Kas per Shift. Sama lebar dengan lapis 2 (`HariDrawer`) supaya
 * menutupinya penuh — tidak menyisakan celah yang membuat lapis 2 nyembul di kiri. */
function DetailShift({
  shift,
  hari,
  detail,
  halaman,
  limit,
  onHalaman,
  onLimit,
  onTutup,
}: {
  shift: BarisShift;
  hari: BarisHari | null;
  detail: ReturnType<typeof useData<BalasanDetailKasShift>>;
  halaman: number;
  limit: number;
  onHalaman: (halaman: number) => void;
  onLimit: (limit: number) => void;
  onTutup: () => void;
}) {
  const baris = detail.data?.baris ?? [];
  const totalBaris = detail.data?.totalBaris ?? 0;
  const totalHalaman = Math.max(1, Math.ceil(totalBaris / limit));

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true">
      <button
        type="button"
        aria-label="Tutup detail"
        onClick={onTutup}
        className="absolute inset-0 cursor-default bg-black/30"
      />
      <div className="border-line relative flex h-full w-full max-w-3xl flex-col overflow-y-auto border-l bg-white shadow-[0_24px_64px_rgba(16,24,40,.24)]">
        <div className="border-line sticky top-0 z-10 flex items-center justify-between gap-3 border-b bg-white px-5 py-4">
          <div className="min-w-0">
            {hari ? (
              <button
                type="button"
                onClick={onTutup}
                className="text-ink-3 hover:text-brand mb-0.5 flex cursor-pointer items-center gap-1 text-xs font-semibold"
              >
                ‹ {tanggalPendek(hari.tanggal)}
              </button>
            ) : null}
            <h3 className="text-ink truncate text-[15px] font-bold">
              Detail Kas — {shift.kasir}
            </h3>
            <p className="text-ink-3 text-xs">
              {tanggalPendek(tanggalWib(new Date(shift.dibuka_pada)))} ·{" "}
              {jamWib(shift.dibuka_pada)}
              {shift.ditutup_pada ? ` – ${jamWib(shift.ditutup_pada)}` : " – berjalan"}
            </p>
          </div>
          <button
            type="button"
            onClick={onTutup}
            aria-label="Tutup"
            className="text-ink-3 hover:text-ink cursor-pointer text-2xl leading-none"
          >
            ×
          </button>
        </div>

        <div className="border-line grid grid-cols-2 gap-x-4 gap-y-3 border-b px-5 py-4 text-[13px] sm:grid-cols-4">
          <Ringkas label="Modal Awal" nilai={rupiah(shift.modal_awal)} />
          <Ringkas label="Penjualan Tunai" nilai={rupiah(shift.penjualan_tunai)} />
          <Ringkas label="Kas Masuk" nilai={rupiah(shift.kas_masuk)} />
          <Ringkas label="Kas Keluar" nilai={rupiah(shift.kas_keluar)} />
          <Ringkas label="Refund Tunai" nilai={rupiah(shift.refund_tunai)} />
          <Ringkas label="Kas Seharusnya" nilai={rupiah(shift.kas_seharusnya)} />
          <Ringkas
            label="Kas Aktual"
            nilai={shift.kas_aktual === null ? "" : rupiah(shift.kas_aktual)}
          />
          <Ringkas
            label="Selisih"
            nilai={shift.selisih_tersimpan === null ? "" : rupiah(shift.selisih_tersimpan)}
            warna={warnaSelisih(shift.selisih_tersimpan)}
          />
        </div>

        {detail.galat ? (
          <div className="p-5">
            <Gagal pesan={detail.galat} coba={detail.muatUlang} />
          </div>
        ) : detail.memuat && !detail.data ? (
          <div className="p-5">
            <SedangMemuat tinggi="h-64" />
          </div>
        ) : (
          <>
            <Gulung>
              <table className="w-full border-collapse text-[13px] [&_td]:px-2 [&_th]:px-2">
                <thead>
                  <tr>
                    <Th>Jam</Th>
                    <Th>Jenis</Th>
                    <Th>Keterangan</Th>
                    <Th>No. Order</Th>
                    <Th>Kasir</Th>
                    <Th num>Nominal</Th>
                  </tr>
                </thead>
                <tbody>
                  {baris.length === 0 ? (
                    <tr>
                      <Td colSpan={6}>
                        <Kosong>Tidak ada pergerakan kas pada shift ini.</Kosong>
                      </Td>
                    </tr>
                  ) : (
                    baris.map((m, i) => (
                      <tr key={i} className="hover:bg-[#FAFBFB]">
                        <Td className="whitespace-nowrap">{jamWib(m.waktu)}</Td>
                        <Td className="whitespace-nowrap">{LABEL_JENIS[m.jenis]}</Td>
                        <Td className="text-ink-2">{m.keterangan || "—"}</Td>
                        <Td className="text-ink-3 text-xs">
                          <span title={m.nomor_order ?? undefined}>
                            {m.nomor_order ? m.nomor_order.slice(0, 8) : "—"}
                          </span>
                        </Td>
                        <Td>{m.kasir}</Td>
                        <Td num className={m.nominal < 0 ? "text-danger" : "text-good"}>
                          <b>
                            {m.nominal > 0 ? "+" : ""}
                            {rupiah(m.nominal)}
                          </b>
                        </Td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </Gulung>

            <div className="border-line text-ink-3 mt-auto flex flex-wrap items-center gap-3 border-t px-4 py-3.5 text-[13px]">
              <button
                type="button"
                disabled={halaman <= 1}
                onClick={() => onHalaman(halaman - 1)}
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
                onClick={() => onHalaman(halaman + 1)}
                className="border-line hover:border-brand cursor-pointer rounded-lg border bg-white px-3 py-1.5 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-40"
              >
                Berikutnya ›
              </button>
              <span className="flex-1" />
              <label className="flex items-center gap-2">
                <span className="sr-only">Baris per halaman</span>
                <select
                  value={limit}
                  onChange={(e) => onLimit(Number(e.target.value))}
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
          </>
        )}
      </div>
    </div>
  );
}

function Ringkas({
  label,
  nilai,
  warna,
}: {
  label: string;
  nilai: string;
  warna?: string;
}) {
  return (
    <div>
      <p className="text-ink-3 text-[11px] font-semibold tracking-[0.3px] uppercase">
        {label}
      </p>
      <p className={`font-bold tabular-nums ${warna ?? "text-ink"}`}>{nilai || "—"}</p>
    </div>
  );
}
