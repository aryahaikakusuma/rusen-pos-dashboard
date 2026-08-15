"use client";

import { useMemo, useState } from "react";

import { useToast } from "@/components/Toast";
import { BarisKpi, Kartu, KepalaKartu, Kpi } from "@/components/dashboard/Kartu";
import { Gagal, Kosong, SedangMemuat } from "@/components/dashboard/Status";
import { Gulung, Tanda, Td, Th } from "@/components/dashboard/Tabel";
import { Api } from "@/lib/api-klien";
import { angka, rupiah } from "@/lib/format";
import { useData } from "@/lib/use-data";
import type { Kategori, Produk } from "@/lib/kontrak";

const PER_HALAMAN = [25, 50, 100];

/**
 * Kelola Produk.
 *
 * DUA KOLOM DI MOCKUP TIDAK ADA DI SINI, karena tidak ada di skema:
 *
 *   Stok — tidak ada konsepnya sama sekali. Tabel `products` hanya punya kode,
 *   nama, kategori, harga, dan aktif. Kolom yang isinya selalu nol hanya
 *   mengundang pertanyaan tiap bulan.
 *
 *   Status pajak — sejak `0034`, `products.taxable` otoritatif dan bisa diatur
 *   per produk lewat checkbox di form. `categories.taxable` (mis. Rokok) tetap
 *   dipakai sebagai SARAN nilai awal saat produk baru dibuat, bukan lagi
 *   satu-satunya sumber — produk promo bisa ditandai beda dari kategorinya
 *   tanpa perlu bikin kategori baru.
 *
 * "HAPUS" MENONAKTIFKAN. Riwayat transaksi menunjuk ke baris produk; produk
 * yang pernah terjual tidak boleh lenyap. Struk lama tetap benar karena
 * `order_items` menyimpan snapshot nama dan kodenya sendiri.
 */
export default function KelolaProdukPage() {
  const toast = useToast();
  const { data, memuat, galat, muatUlang } = useData(() => Api.katalog(), []);

  const [cari, setCari] = useState("");
  const [filterKategori, setFilterKategori] = useState("");
  const [tampilkanNonaktif, setTampilkanNonaktif] = useState(false);
  const [formBuka, setFormBuka] = useState(false);
  const [sedangDiubah, setSedangDiubah] = useState<Produk | null>(null);
  const [akanDinonaktifkan, setAkanDinonaktifkan] = useState<Produk | null>(null);
  const [menyimpan, setMenyimpan] = useState(false);
  const [halaman, setHalaman] = useState(1);
  const [limit, setLimit] = useState(25);

  const produk = useMemo(() => data?.produk ?? [], [data]);
  const kategori = useMemo(() => data?.kategori ?? [], [data]);

  const tampil = useMemo(() => {
    const kata = cari.trim().toLowerCase();
    return produk.filter(
      (p) =>
        (tampilkanNonaktif || p.active) &&
        (!filterKategori || p.category_id === filterKategori) &&
        (!kata ||
          p.name.toLowerCase().includes(kata) ||
          p.code.toLowerCase().includes(kata))
    );
  }, [produk, cari, filterKategori, tampilkanNonaktif]);

  /**
   * Paginasi di klien, bukan di Postgres — daftar produk sudah dimuat utuh
   * sekali untuk pencarian instan (lihat `tampil`), jadi tidak ada round-trip
   * server yang bisa dipotong per halaman. Ini murni membatasi DOM yang
   * dirender; totalnya (KPI, "N dari M produk") tetap dari `tampil` utuh.
   */
  const totalHalaman = Math.max(1, Math.ceil(tampil.length / limit));
  const halamanAman = Math.min(halaman, totalHalaman);
  const tampilHalaman = useMemo(
    () => tampil.slice((halamanAman - 1) * limit, halamanAman * limit),
    [tampil, halamanAman, limit]
  );

  function ubahFilter<T>(setter: (v: T) => void, nilai: T) {
    setter(nilai);
    setHalaman(1);
  }

  const aktif = produk.filter((p) => p.active);
  const bukanObjek = aktif.filter((p) => !p.taxable);

  async function simpan(isi: Record<string, unknown>) {
    setMenyimpan(true);
    try {
      if (sedangDiubah) {
        await Api.ubahProduk(sedangDiubah.id, isi);
        toast.success(`${String(isi.name)} diperbarui.`);
      } else {
        await Api.buatProduk(isi);
        toast.success(`${String(isi.name)} ditambahkan.`);
      }
      setFormBuka(false);
      setSedangDiubah(null);
      muatUlang();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Gagal menyimpan.");
    } finally {
      setMenyimpan(false);
    }
  }

  async function nonaktifkan(p: Produk) {
    setMenyimpan(true);
    try {
      await Api.nonaktifkanProduk(p.id);
      toast.success(`${p.name} dinonaktifkan.`);
      setAkanDinonaktifkan(null);
      muatUlang();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Gagal menonaktifkan.");
    } finally {
      setMenyimpan(false);
    }
  }

  if (galat) return <Gagal pesan={galat} coba={muatUlang} />;
  if (memuat && !data) return <SedangMemuat tinggi="h-96" />;

  return (
    <>
      {/*
       * SATU BARIS, filter kiri dan tombol utama kanan — sama seperti pola di
       * `KontrolPeriode`. Dulu penyekat `flex-1` di antara keduanya memaksa
       * "+ Tambah Produk" ke ujung kanan, dan pada area konten yang lebih
       * sempit dari jumlah lebar keempat kontrol, itu justru membuatnya jatuh
       * SENDIRIAN ke baris kedua — flex-wrap membungkus utuh satu elemen yang
       * tidak muat, bukan menyusun ulang sisanya. Mengelompokkan filter jadi
       * satu unit `flex-wrap` sendiri berarti filter yang membungkus duluan
       * saat sempit, dan tombolnya tetap searah dengan kelompok itu alih-alih
       * terdampar jauh di kanan.
       */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <input
            value={cari}
            onChange={(e) => ubahFilter(setCari, e.target.value)}
            placeholder="Cari nama atau kode produk…"
            className="border-line focus:border-brand min-w-[200px] rounded-[10px] border bg-white px-3 py-2 text-sm font-medium outline-none"
          />
          <select
            value={filterKategori}
            onChange={(e) => ubahFilter(setFilterKategori, e.target.value)}
            className="border-line cursor-pointer rounded-[10px] border bg-white px-3 py-2 text-sm font-medium"
          >
            <option value="">Semua kategori</option>
            {kategori.map((k) => (
              <option key={k.id} value={k.id}>
                {k.name}
              </option>
            ))}
          </select>
          <label className="border-line flex cursor-pointer items-center gap-2 rounded-[10px] border bg-white px-3 py-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={tampilkanNonaktif}
              onChange={(e) => ubahFilter(setTampilkanNonaktif, e.target.checked)}
              className="accent-brand"
            />
            Tampilkan yang nonaktif
          </label>
        </div>
        <button
          type="button"
          onClick={() => {
            setSedangDiubah(null);
            setFormBuka(true);
          }}
          className="bg-brand hover:bg-brand-dark shrink-0 cursor-pointer rounded-[10px] px-4 py-2.5 text-[13px] font-semibold text-white transition-colors"
        >
          ＋ Tambah Produk
        </button>
      </div>

      <BarisKpi>
        <Kpi
          label="Produk Aktif"
          nilai={angka(aktif.length)}
          kaki="Muncul di menu aplikasi kasir"
        />
        <Kpi
          label="Objek PBJT"
          nilai={angka(aktif.length - bukanObjek.length)}
          kaki="Kategorinya dipungut pajak"
        />
        <Kpi
          label="Bukan Objek PBJT"
          nilai={angka(bukanObjek.length)}
          kaki="Rokok dan sejenisnya"
        />
        <Kpi
          label="Nonaktif"
          nilai={angka(produk.length - aktif.length)}
          kaki="Tetap utuh di seluruh riwayat"
        />
      </BarisKpi>

      <Kartu className="overflow-hidden">
        <KepalaKartu
          judul="Daftar Produk"
          sub={`${angka(tampil.length)} dari ${angka(produk.length)} produk`}
        />
        <Gulung>
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <Th>Kode</Th>
                <Th>Produk</Th>
                <Th>Kategori</Th>
                <Th>Status Pajak</Th>
                <Th num>Harga Jual</Th>
                <Th>Status</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {tampil.length === 0 ? (
                <tr>
                  <Td colSpan={7}>
                    <Kosong>Tidak ada produk yang cocok.</Kosong>
                  </Td>
                </tr>
              ) : (
                tampilHalaman.map((p) => (
                  <tr
                    key={p.id}
                    className={`hover:bg-[#FAFBFB] ${p.active ? "" : "opacity-55"}`}
                  >
                    <Td className="text-ink-3 text-xs">{p.code}</Td>
                    <Td>
                      <b>{p.name}</b>
                    </Td>
                    <Td className="text-ink-3">{p.kategori}</Td>
                    <Td>
                      <Tanda jenis={p.taxable ? "brand" : "netral"}>
                        {p.taxable ? "Objek PBJT" : "Bukan objek"}
                      </Tanda>
                    </Td>
                    <Td num>
                      <b>{rupiah(p.price)}</b>
                    </Td>
                    <Td>
                      <Tanda jenis={p.active ? "baik" : "netral"}>
                        {p.active ? "Aktif" : "Nonaktif"}
                      </Tanda>
                    </Td>
                    <Td num className="whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => {
                          setSedangDiubah(p);
                          setFormBuka(true);
                        }}
                        className="border-line hover:border-brand hover:text-brand-dark mr-1.5 cursor-pointer rounded-lg border bg-white px-3 py-1.5 text-xs font-semibold"
                      >
                        Ubah
                      </button>
                      {p.active ? (
                        <button
                          type="button"
                          onClick={() => setAkanDinonaktifkan(p)}
                          className="bg-danger-soft text-danger cursor-pointer rounded-lg px-3 py-1.5 text-xs font-semibold"
                        >
                          Nonaktifkan
                        </button>
                      ) : null}
                    </Td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </Gulung>

        {tampil.length > 0 ? (
          <div className="border-line text-ink-3 flex flex-wrap items-center gap-3 border-t px-4 py-3.5 text-[13px]">
            <button
              type="button"
              disabled={halamanAman <= 1}
              onClick={() => setHalaman(halamanAman - 1)}
              className="border-line hover:border-brand cursor-pointer rounded-lg border bg-white px-3 py-1.5 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-40"
            >
              ‹ Sebelumnya
            </button>
            <span>
              Halaman {halamanAman} dari {totalHalaman}
            </span>
            <button
              type="button"
              disabled={halamanAman >= totalHalaman}
              onClick={() => setHalaman(halamanAman + 1)}
              className="border-line hover:border-brand cursor-pointer rounded-lg border bg-white px-3 py-1.5 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-40"
            >
              Berikutnya ›
            </button>
            <span className="flex-1" />
            <label className="flex items-center gap-2">
              <span className="sr-only">Baris per halaman</span>
              <select
                value={limit}
                onChange={(e) => {
                  setLimit(Number(e.target.value));
                  setHalaman(1);
                }}
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
        ) : null}
      </Kartu>

      {formBuka ? (
        <FormProduk
          produk={sedangDiubah}
          kategori={kategori}
          menyimpan={menyimpan}
          onTutup={() => {
            setFormBuka(false);
            setSedangDiubah(null);
          }}
          onSimpan={simpan}
        />
      ) : null}

      {akanDinonaktifkan ? (
        <Lapis onTutup={() => setAkanDinonaktifkan(null)}>
          <div className="p-5">
            <h3 className="text-[17px] font-bold">Nonaktifkan produk?</h3>
            <p className="text-ink-3 mt-2.5 mb-5 text-sm leading-relaxed">
              <b className="text-ink">{akanDinonaktifkan.name}</b> akan hilang
              dari menu aplikasi kasir. Barisnya tidak dihapus: riwayat
              transaksi, struk lama, dan seluruh laporan tetap utuh dan tidak
              berubah. Produk ini bisa diaktifkan lagi kapan saja lewat tombol
              Ubah.
            </p>
            <div className="flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setAkanDinonaktifkan(null)}
                className="border-line text-ink-2 cursor-pointer rounded-[10px] border bg-white px-4 py-2 text-[13px] font-semibold"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={menyimpan}
                onClick={() => nonaktifkan(akanDinonaktifkan)}
                className="bg-danger-soft text-danger cursor-pointer rounded-[10px] px-4 py-2 text-[13px] font-semibold disabled:opacity-60"
              >
                Ya, nonaktifkan
              </button>
            </div>
          </div>
        </Lapis>
      ) : null}
    </>
  );
}

/* -------------------------------------------------------------------- form */

function FormProduk({
  produk,
  kategori,
  menyimpan,
  onTutup,
  onSimpan,
}: {
  produk: Produk | null;
  kategori: Kategori[];
  menyimpan: boolean;
  onTutup: () => void;
  onSimpan: (isi: Record<string, unknown>) => void;
}) {
  const [code, setCode] = useState(produk?.code ?? "");
  const [name, setName] = useState(produk?.name ?? "");
  const [price, setPrice] = useState(String(produk?.price ?? ""));
  const [categoryId, setCategoryId] = useState(
    produk?.category_id ?? kategori[0]?.id ?? ""
  );
  const [active, setActive] = useState(produk?.active ?? true);
  // Untuk produk baru, disarankan dari kategori yang aktif saat form dibuka —
  // dihitung sekali (bukan disinkronkan tiap ganti kategori), supaya toggle
  // yang sudah disentuh pengguna tidak diam-diam tertimpa saat ia ganti pikiran
  // soal kategorinya.
  const [taxable, setTaxable] = useState(
    produk?.taxable ??
      kategori.find((k) => k.id === (produk?.category_id ?? kategori[0]?.id))
        ?.taxable ??
      true
  );

  const kategoriTerpilih = kategori.find((k) => k.id === categoryId);

  return (
    <Lapis onTutup={onTutup}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSimpan({
            code,
            name,
            price: Number(price),
            category_id: categoryId,
            active,
            taxable,
          });
        }}
      >
        <div className="border-line flex items-center justify-between border-b px-5 py-4">
          <h3 className="text-[17px] font-bold">
            {produk ? "Ubah Produk" : "Tambah Produk"}
          </h3>
          <button
            type="button"
            onClick={onTutup}
            aria-label="Tutup"
            className="text-ink-3 cursor-pointer text-2xl leading-none"
          >
            ×
          </button>
        </div>

        <div className="p-5">
          <Bidang label="Kode Produk">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              required
              maxLength={20}
              placeholder="K134A"
              className="border-line focus:border-brand w-full rounded-[10px] border px-3 py-2.5 outline-none"
            />
            {/* Kode di Rusen berasal dari ekspor spreadsheet dan berserakan di
                K1xx, K2xx, R0xx. Tidak ada deret yang bisa dilanjutkan otomatis
                tanpa menebak, dan tabrakan kode pernah terjadi. */}
            <p className="text-ink-3 mt-1.5 text-[11px]">
              Harus unik. Untuk varian baru dari produk yang sudah ada, susulkan
              huruf pada kode induknya — misalnya <code>K134</code> →{" "}
              <code>K134A</code>.
            </p>
          </Bidang>

          <Bidang label="Nama Produk">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={80}
              placeholder="Kopi Susu Panas"
              className="border-line focus:border-brand w-full rounded-[10px] border px-3 py-2.5 outline-none"
            />
            {/* Ini konsekuensi langsung dari tidak adanya tabel varian: nama
                yang diketik menentukan apakah produk ini bergabung ke kartu
                yang sudah ada di layar kasir atau berdiri sendiri. */}
            <p className="text-ink-3 mt-1.5 text-[11px]">
              Nama menentukan pengelompokan varian di layar kasir. &quot;Kopi
              Susu Panas&quot; dan &quot;Kopi Susu Dingin&quot; menyatu jadi satu
              kartu; salah satu huruf berbeda dan keduanya jadi kartu terpisah.
            </p>
          </Bidang>

          <Bidang label="Kategori">
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              required
              className="border-line focus:border-brand w-full cursor-pointer rounded-[10px] border px-3 py-2.5 outline-none"
            >
              {kategori.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.name}
                </option>
              ))}
            </select>
            <p className="text-ink-3 mt-1.5 text-[11px]">
              {kategoriTerpilih
                ? kategoriTerpilih.taxable
                  ? "Kategori ini biasanya objek PBJT."
                  : "Kategori ini biasanya bukan objek PBJT."
                : ""}{" "}
              Hanya saran nilai awal — status pajak produk ini diatur sendiri di
              bawah.
            </p>
          </Bidang>

          <Bidang label="Harga Jual (Rp)">
            <input
              value={price}
              onChange={(e) => setPrice(e.target.value.replace(/\D/g, ""))}
              required
              inputMode="numeric"
              placeholder="18000"
              className="border-line focus:border-brand w-full rounded-[10px] border px-3 py-2.5 tabular-nums outline-none"
            />
            <p className="text-ink-3 mt-1.5 text-[11px]">
              Rupiah bulat. Harga selalu dibaca server saat transaksi dibuat —
              aplikasi kasir tidak pernah mengirim harga.
            </p>
          </Bidang>

          <label className="flex cursor-pointer items-center gap-2.5 text-sm font-medium">
            <input
              type="checkbox"
              checked={taxable}
              onChange={(e) => setTaxable(e.target.checked)}
              className="accent-brand"
            />
            Kena PBJT — pajak dipungut saat produk ini terjual
          </label>
          <p className="text-ink-3 mt-1.5 mb-4 text-[11px]">
            Berlaku untuk transaksi berikutnya. Struk dan laporan order yang
            sudah lewat tidak berubah — pajaknya sudah tercatat di baris item
            saat itu terjual.
          </p>

          <label className="flex cursor-pointer items-center gap-2.5 text-sm font-medium">
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
              className="accent-brand"
            />
            Aktif — tampil di menu aplikasi kasir
          </label>

          <div className="mt-6 flex justify-end gap-2.5">
            <button
              type="button"
              onClick={onTutup}
              className="border-line text-ink-2 cursor-pointer rounded-[10px] border bg-white px-4 py-2.5 text-[13px] font-semibold"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={menyimpan}
              className="bg-brand hover:bg-brand-dark cursor-pointer rounded-[10px] px-4 py-2.5 text-[13px] font-semibold text-white disabled:opacity-60"
            >
              {menyimpan ? "Menyimpan…" : "Simpan Produk"}
            </button>
          </div>
        </div>
      </form>
    </Lapis>
  );
}

function Bidang({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <label className="text-ink-2 mb-1.5 block text-xs font-semibold">
        {label}
      </label>
      {children}
    </div>
  );
}

function Lapis({
  children,
  onTutup,
}: {
  children: React.ReactNode;
  onTutup: () => void;
}) {
  return (
    <div className="fixed inset-0 z-100 flex items-center justify-center bg-[rgba(16,24,40,.45)] p-5">
      <button
        type="button"
        aria-label="Tutup"
        onClick={onTutup}
        className="absolute inset-0 cursor-default"
      />
      <div className="relative max-h-[90vh] w-full max-w-[480px] overflow-auto rounded-2xl bg-white shadow-[0_24px_64px_rgba(0,0,0,.2)]">
        {children}
      </div>
    </div>
  );
}
