import type { ReactNode } from "react";

/** Potongan tabel yang dipakai berulang di tiga halaman laporan. */

export function Gulung({ children }: { children: ReactNode }) {
  return <div className="overflow-x-auto">{children}</div>;
}

/**
 * Kenapa sel angka dipaksa `whitespace-nowrap`.
 *
 * Tanpa itu, tabel sembilan kolom di layar 1280px tidak melebar melewati
 * wadahnya — ia MENGERUT: "Rp 4.386.000" pecah jadi "Rp" di satu baris dan
 * angkanya di baris berikutnya, dan kolom terakhir terpotong tanpa pernah
 * memicu penggulir mendatar. Hasilnya laporan yang terbaca salah dan tidak
 * kelihatan rusak. Dengan nowrap, tabel melebar melampaui wadahnya dan
 * `Gulung` melakukan tugasnya.
 */

export function Th({
  children,
  num = false,
  className = "",
}: {
  children?: ReactNode;
  num?: boolean;
  className?: string;
}) {
  return (
    <th
      scope="col"
      className={`border-line text-ink-3 border-b px-3.5 py-3 text-[11px] font-bold tracking-[0.5px] whitespace-nowrap uppercase ${
        num ? "text-right" : "text-left"
      } ${className}`}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  num = false,
  className = "",
  colSpan,
}: {
  children?: ReactNode;
  num?: boolean;
  className?: string;
  colSpan?: number;
}) {
  return (
    <td
      colSpan={colSpan}
      className={`border-line border-b px-3.5 py-3 align-middle ${
        // tabular-nums: tanpa ini digit punya lebar berbeda-beda dan kolom
        // rupiah bergerigi, yang membuat perbandingan antar baris melelahkan.
        num ? "text-right whitespace-nowrap tabular-nums" : ""
      } ${className}`}
    >
      {children}
    </td>
  );
}

export function Tanda({
  jenis = "netral",
  children,
}: {
  jenis?: "brand" | "netral" | "baik" | "peringatan" | "buruk";
  children: ReactNode;
}) {
  const gaya = {
    brand: "bg-brand-soft text-brand-dark",
    netral: "bg-[#EFF1F1] text-ink-2",
    baik: "bg-good-soft text-good",
    peringatan: "bg-warn-soft text-warn",
    buruk: "bg-danger-soft text-danger",
  }[jenis];

  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-bold whitespace-nowrap ${gaya}`}
    >
      {children}
    </span>
  );
}
