"use client";

import { useMemo, useState } from "react";

import Grafik, { WARNA } from "./Grafik";
import { IsiKartu, Kartu, KepalaKartu } from "./Kartu";
import { Api } from "@/lib/api-klien";
import { angka, rupiah, rupiahRingkas } from "@/lib/format";
import { tanggalPendek } from "@/lib/periode";
import { useData } from "@/lib/use-data";
import { MAKS_SERI_PRODUK, type BarisProduk, type Periode } from "@/lib/kontrak";

/**
 * Tren penjualan per produk — satu garis per varian, sumbu X tanggal.
 *
 * MENGIKUTI PERIODE HALAMAN, TIDAK PUNYA PEMILIH SENDIRI. Kartu ini duduk di
 * bawah kontrol periode yang sudah ada dan menerima `periode` sebagai prop.
 * Pemilih kedua di dalam kartu akan membuat dua rentang hidup bersamaan di satu
 * layar, dan tabel di bawahnya diam-diam berbicara tentang bulan yang berbeda
 * dari grafik di atasnya — tanpa apa pun yang menandainya.
 *
 * SAAT DIBUKA, `kode` KOSONG, DAN ITU PENTING. Kosong dikirim ke server sebagai
 * "tidak ada daftar", dan Postgres menjawabnya dengan lima teratas menurut omzet
 * periode lewat bawaan `p_teratas`. Halaman ini tidak pernah memeringkat apa pun
 * sendiri: kalau ia memilih lima teratas dari tabel yang sudah ada di layar, ia
 * akan memakai peringkat dari SATU balasan lalu meminta deret dari balasan lain,
 * dan dua daftar itu bisa berasal dari periode yang berbeda selama penyegaran.
 * Konsekuensinya, tidak ada keadaan "silakan pilih produk dulu" — grafiknya
 * sudah berisi sebelum siapa pun menyentuhnya.
 *
 * BATAS 32 SERI DITEGAKKAN DI DUA TEMPAT, DAN KEDUANYA MEMANG PERLU. Di sini ia
 * mencegah tombol Tambah menghasilkan permintaan yang pasti ditolak; di route ia
 * menahan alamat yang diketik langsung. Alasannya bukan keterbacaan grafik
 * melainkan PostgREST yang memotong balasan di 1000 baris tanpa galat — lihat
 * `MAKS_SERI_PRODUK` di `lib/kontrak.ts`.
 */
export default function TrenProduk({
  periode,
  pilihan,
}: {
  periode: Periode;
  /**
   * Seluruh varian yang laku pada periode ini — sudah ada di halaman untuk
   * tabelnya, jadi pemilih di sini tidak menambah satu pun permintaan.
   */
  pilihan: BarisProduk[];
}) {
  /**
   * Daftar kosong BUKAN "tidak ada yang dipilih", melainkan "biar server yang
   * memilih". Keduanya dibedakan lewat `bawaan` pada balasan, bukan lewat
   * state kedua di sini — satu fakta, satu sumber.
   */
  const [kode, setKode] = useState<string[]>([]);
  const [tambah, setTambah] = useState("");

  const { data, memuat, galat, muatUlang } = useData(
    () => Api.produkHarian(periode, kode),
    [periode.dari, periode.sampai, kode.join(",")]
  );

  /** Kode yang benar-benar tergambar — dari server, supaya chip tidak pernah
      menjanjikan seri yang tidak ada di grafik. */
  const terpakai = useMemo(() => data?.kode ?? [], [data]);

  const nama = useMemo(() => {
    const peta = new Map<string, string>();
    for (const b of data?.baris ?? []) peta.set(b.product_code, b.nama_produk);
    return peta;
  }, [data]);

  const config = useMemo<Parameters<typeof Grafik>[0]["config"]>(() => {
    const baris = data?.baris ?? [];

    // Tanggal diambil dari barisnya sendiri, bukan dihasilkan ulang dari
    // periode. `0028` sudah mengisi tanggal kosong dengan nol, jadi menyusun
    // sumbu sendiri di sini cuma menciptakan kesempatan kedua daftar itu
    // berbeda panjang — dan Chart.js akan diam saja saat itu terjadi.
    const tanggal = [...new Set(baris.map((b) => b.tanggal))].sort();

    const perKode = new Map<string, Map<string, number>>();
    for (const b of baris) {
      let isi = perKode.get(b.product_code);
      if (!isi) perKode.set(b.product_code, (isi = new Map()));
      isi.set(b.tanggal, b.omzet);
    }

    return {
      type: "line",
      data: {
        labels: tanggal.map(tanggalPendek),
        datasets: terpakai.map((k, i) => {
          const warna = warnaSeri(i);
          return {
            label: nama.get(k) ?? k,
            data: tanggal.map((t) => perKode.get(k)?.get(t) ?? 0),
            borderColor: warna,
            backgroundColor: warna,
            borderWidth: 2,
            tension: 0.3,
            pointRadius: tanggal.length > 20 ? 0 : 2.5,
            pointHoverRadius: 4,
          };
        }),
      },
      options: {
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          // Legenda Chart.js dimatikan: chip berwarna di atas kartu sudah
          // menjadi legendanya, dan chip itu bisa dimatikan satu per satu.
          // Dua legenda untuk satu grafik hanya menyisakan pertanyaan mana
          // yang berlaku.
          legend: { display: false },
          tooltip: {
            callbacks: { label: (c) => `${c.dataset.label}: ${rupiah(Number(c.parsed.y))}` },
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: { callback: (v) => rupiahRingkas(Number(v)) },
            grid: { color: WARNA.kisi },
          },
          x: {
            grid: { display: false },
            ticks: { maxRotation: 40, minRotation: 0, font: { size: 9 } },
          },
        },
      },
    } as Parameters<typeof Grafik>[0]["config"];
  }, [data, terpakai, nama]);

  /** Kandidat untuk pemilih: varian yang laku periode ini dan belum tergambar. */
  const kandidat = useMemo(
    () => pilihan.filter((p) => !terpakai.includes(p.product_code)),
    [pilihan, terpakai]
  );

  const penuh = terpakai.length >= MAKS_SERI_PRODUK;

  function buang(k: string) {
    // Seri terakhir tidak boleh ikut dibuang: daftar yang jadi kosong berarti
    // "pilihkan lima teratas" bagi server, jadi menutup chip terakhir akan
    // membuat lima seri muncul kembali — kebalikan persis dari yang diminta.
    if (terpakai.length <= 1) return;
    setKode(terpakai.filter((x) => x !== k));
  }

  function pasang(k: string) {
    if (!k || penuh || terpakai.includes(k)) return;
    setKode([...terpakai, k]);
    setTambah("");
  }

  const kosong = !memuat && (data?.baris.length ?? 0) === 0;

  return (
    <Kartu className="no-print mb-4">
      <KepalaKartu
        judul="Tren Penjualan per Produk"
        sub={
          data?.bawaan
            ? "Lima produk teratas menurut omzet periode ini · omzet kotor, refund tidak dikurangkan"
            : `${angka(terpakai.length)} produk dipilih · omzet kotor, refund tidak dikurangkan`
        }
        aksi={
          data?.bawaan ? undefined : (
            <button
              type="button"
              onClick={() => setKode([])}
              className="text-ink-2 hover:text-brand-dark cursor-pointer text-[13px] font-semibold"
            >
              Kembali ke 5 teratas
            </button>
          )
        }
      />

      <IsiKartu>
        {galat ? (
          <div className="border-line grid min-h-[160px] place-items-center rounded-xl border border-dashed px-4 text-center">
            <div>
              {/* Kegagalan pengambilan TIDAK BOLEH berakhir sebagai grafik
                  kosong. Balasan terpotong dan sesi habis sama-sama bisa
                  mendarat di sini, dan keduanya terlihat persis seperti
                  "periode ini memang sepi" kalau pesannya tidak dipasang. */}
              <p className="text-ink-2 text-sm font-bold">Grafik gagal dimuat</p>
              <p className="text-ink-3 mt-1 text-[13px]">{galat}</p>
              <button
                type="button"
                onClick={muatUlang}
                className="border-line text-ink-2 hover:border-brand mt-3 cursor-pointer rounded-[10px] border bg-white px-3 py-2 text-[13px] font-semibold"
              >
                Coba lagi
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              {terpakai.map((k, i) => (
                <span
                  key={k}
                  className="border-line flex items-center gap-1.5 rounded-full border bg-white py-1 pr-1 pl-2.5 text-[12px] font-semibold"
                >
                  <span
                    aria-hidden="true"
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: warnaSeri(i) }}
                  />
                  <span className="text-ink-2">{nama.get(k) ?? k}</span>
                  <button
                    type="button"
                    onClick={() => buang(k)}
                    disabled={terpakai.length <= 1}
                    title={
                      terpakai.length <= 1
                        ? "Seri terakhir tidak bisa dimatikan"
                        : `Matikan ${nama.get(k) ?? k}`
                    }
                    aria-label={`Matikan ${nama.get(k) ?? k}`}
                    className="text-ink-3 hover:bg-line grid h-5 w-5 cursor-pointer place-items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <span aria-hidden="true">×</span>
                  </button>
                </span>
              ))}

              <select
                value={tambah}
                onChange={(e) => pasang(e.target.value)}
                disabled={penuh || kandidat.length === 0}
                aria-label="Tambah produk ke grafik"
                className="border-line focus:border-brand cursor-pointer rounded-full border bg-white px-3 py-1.5 text-[12px] font-semibold disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="">+ Tambah produk…</option>
                {kandidat.map((p) => (
                  <option key={p.product_code} value={p.product_code}>
                    {p.nama_produk} · {rupiah(p.omzet)}
                  </option>
                ))}
              </select>

              {penuh ? (
                <span className="text-ink-3 text-[12px]">
                  Batas {MAKS_SERI_PRODUK} produk tercapai — matikan satu dulu
                  untuk menambah yang lain.
                </span>
              ) : null}
            </div>

            {kosong ? (
              <div className="border-line text-ink-3 grid h-[240px] place-items-center rounded-xl border border-dashed px-4 text-center">
                <div>
                  <p className="text-ink-2 text-sm font-bold">
                    Tidak ada penjualan pada periode ini
                  </p>
                  <p className="mt-1 text-[13px]">
                    Bukan grafik yang gagal dimuat: tidak ada satu pun order
                    lunas antara {periode.dari} dan {periode.sampai}, jadi tidak
                    ada garis untuk digambar. Geser periodenya dengan panah di
                    atas.
                  </p>
                </div>
              </div>
            ) : (
              <Grafik
                config={config}
                tinggi="h-[320px]"
                judulAksesibilitas="Tren omzet harian per produk"
              />
            )}
          </>
        )}
      </IsiKartu>
    </Kartu>
  );
}

/**
 * Warna seri ke-`i`.
 *
 * Empat warna pertama diambil dari palet aplikasi supaya grafik dengan sedikit
 * seri terlihat sama dengan grafik lain di dasbor. Sisanya dihasilkan dengan
 * memutar rona pada jarak yang tidak membagi habis lingkaran, sehingga 32 seri
 * pun tidak pernah menghasilkan dua warna yang sama. Daftar warna tetap
 * sepanjang 32 akan lebih mudah dibaca, dan lebih mudah pula kehabisan diam-diam
 * lalu menggambar dua produk dengan warna identik.
 */
function warnaSeri(i: number): string {
  const tetap = [WARNA.brand, WARNA.biru, WARNA.kuning, WARNA.merah];
  if (i < tetap.length) return tetap[i];
  return `hsl(${(i * 137.5) % 360} 62% 45%)`;
}
