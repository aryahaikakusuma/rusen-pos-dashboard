import { formatRupiah } from "@/lib/types";
import { type ProductEntry } from "@/lib/product-variants";

interface ProductCardProps {
  entry: ProductEntry;
  onSelect: (entry: ProductEntry) => void;
  disabled?: boolean;
}

export default function ProductCard({
  entry,
  onSelect,
  disabled = false,
}: ProductCardProps) {
  const hasVariants = entry.options.length > 1;

  return (
    <button
      onClick={() => onSelect(entry)}
      disabled={disabled}
      className="bg-white border-2 border-slate-200 rounded-xl p-4 hover:border-primary-500 hover:shadow-lg active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed text-left w-full overflow-hidden flex flex-col"
    >
      {/* Nama produk — jadi identitas utama kartu, kode produk tidak ditampilkan */}
      <div className="text-lg font-semibold text-slate-900 leading-snug line-clamp-3">
        {entry.label}
      </div>

      <div className="mt-auto flex items-baseline gap-1 flex-wrap pt-1.5">
        <span className="text-lg font-bold text-slate-900">
          {entry.minPrice === entry.maxPrice
            ? formatRupiah(entry.minPrice)
            : /* Rentang harga: panas dan dingin sering beda tarif. */
              `${formatRupiah(entry.minPrice)}+`}
        </span>
        {hasVariants && (
          <span className="rounded bg-blue-50 px-1.5 py-[1px] text-[0.6rem] font-semibold text-blue-700 leading-tight">
            Panas/Dingin
          </span>
        )}
      </div>
    </button>
  );
}
