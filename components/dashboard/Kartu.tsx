import { Children, type CSSProperties, type ReactNode } from "react";

import { persen } from "@/lib/format";

/** Permukaan dasar seluruh dashboard: putih, garis tipis, bayangan sangat halus. */
export function Kartu({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`border-line rounded-2xl border bg-white shadow-[0_1px_2px_rgba(16,24,40,.04),0_8px_24px_rgba(16,24,40,.06)] ${className}`}
    >
      {children}
    </div>
  );
}

export function KepalaKartu({
  judul,
  sub,
  aksi,
}: {
  judul: string;
  sub?: ReactNode;
  aksi?: ReactNode;
}) {
  return (
    <div className="border-line flex items-center justify-between gap-3 border-b px-5 py-4">
      <div className="min-w-0">
        <h3 className="text-ink truncate text-[15px] font-bold">{judul}</h3>
        {sub ? <p className="text-ink-3 mt-0.5 text-xs">{sub}</p> : null}
      </div>
      {aksi}
    </div>
  );
}

export function IsiKartu({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`p-5 ${className}`}>{children}</div>;
}

/**
 * Kartu angka besar.
 *
 * `delta` hanya muncul kalau ada pembandingnya. Nilai `null` berarti periode
 * sebelumnya nol, dan itu ditampilkan sebagai ketiadaan tanda — bukan sebagai
 * "+100%", yang terbaca sebagai kenaikan nyata padahal artinya "dari nol".
 */
export function Kpi({
  label,
  nilai,
  kaki,
  delta: perubahan,
  kecil = false,
}: {
  label: string;
  nilai: string;
  kaki?: string;
  delta?: number | null;
  kecil?: boolean;
}) {
  return (
    <Kartu className="px-[18px] py-4">
      <div className="text-ink-3 flex flex-wrap items-center gap-1.5 text-xs font-medium">
        <span>{label}</span>
        {perubahan !== undefined && perubahan !== null ? (
          <span
            className={`rounded-full px-1.5 py-0.5 text-[11px] font-bold ${
              perubahan >= 0
                ? "bg-good-soft text-good"
                : "bg-danger-soft text-danger"
            }`}
          >
            {perubahan >= 0 ? "▲" : "▼"} {persen(Math.abs(perubahan))}
          </span>
        ) : null}
      </div>
      <p
        className={`text-ink mt-1.5 mb-1 font-extrabold tracking-[-0.7px] ${
          // `kecil` dipakai untuk nama produk, bukan angka — ia sudah kecil dan
          // boleh membungkus dua baris, jadi penyusutan `kpi-angka` tidak
          // berlaku padanya.
          kecil ? "text-base leading-snug" : "kpi-angka text-[23px]"
        }`}
      >
        {nilai}
      </p>
      {kaki ? <p className="text-ink-3 text-[11px]">{kaki}</p> : null}
    </Kartu>
  );
}

/**
 * Baris kartu angka — SATU BARIS PENUH di layar lebar, berapa pun jumlahnya.
 *
 * DULU `auto-fit` DENGAN `minmax(190px, 1fr)`, DAN ITU YANG MEMBUAT KARTU KELIMA
 * TURUN SENDIRIAN. `auto-fit` memuat sebanyak yang muat pada lebar minimum itu,
 * jadi jumlah kolomnya ditentukan lebar layar, bukan jumlah kartunya. Pada area
 * konten sekitar 1000px, 190px hanya memuat empat — dan kartu kelima jatuh ke
 * baris kedua sebagai satu kartu lebar penuh yang terbaca seperti kelompok
 * terpisah, padahal ia anggota kelompok yang sama. Selisihnya cuma beberapa
 * piksel, jadi ia muncul dan hilang tergantung ukuran jendela.
 *
 * Sekarang jumlah kolomnya ADALAH jumlah kartunya, dihitung dari `children` dan
 * diturunkan sebagai `--kolom`. Tidak ada angka jumlah kartu yang ditulis di
 * halaman mana pun: menambah atau membuang satu `<Kpi>` langsung mengubah
 * kisinya, jadi tidak ada yang bisa lupa disesuaikan.
 *
 * Di bawah `xl` ia kembali membungkus, dan itu disengaja — memaksa enam kartu
 * sebaris di tablet hanya memindahkan masalahnya jadi angka yang terpotong.
 */
export function BarisKpi({ children }: { children: ReactNode }) {
  const kolom = Children.count(children);

  return (
    <div
      style={{ "--kolom": kolom } as CSSProperties}
      className="mb-4 grid grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-4 xl:[grid-template-columns:repeat(var(--kolom),minmax(0,1fr))]"
    >
      {children}
    </div>
  );
}
