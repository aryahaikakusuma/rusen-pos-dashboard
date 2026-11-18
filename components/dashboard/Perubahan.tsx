import { persen } from "@/lib/format";

/** Warna mengikuti dampak, bukan sekadar tanda: refund turun justru membaik. */
export default function Perubahan({
  nilai,
  turunLebihBaik = false,
  badge = false,
}: {
  nilai?: number | null;
  turunLebihBaik?: boolean;
  badge?: boolean;
}) {
  if (nilai === undefined || nilai === null || !Number.isFinite(nilai)) return null;

  const tetap = nilai === 0;
  const membaik = turunLebihBaik ? nilai < 0 : nilai > 0;
  const warna = tetap ? "text-ink-2" : membaik ? "text-good" : "text-danger";
  const latar = tetap ? "bg-surface" : membaik ? "bg-good-soft" : "bg-danger-soft";
  const arah = tetap ? "Tetap" : nilai > 0 ? "Naik" : "Turun";

  return (
    <span className={`${warna}${badge ? ` ${latar} rounded-full px-1.5 py-0.5 text-[11px] font-bold` : ""}`}>
      {arah} {persen(Math.abs(nilai))}
    </span>
  );
}
