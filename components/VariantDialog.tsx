"use client";

import { formatRupiah } from "@/lib/types";
import { VARIANT_LABEL, type ProductEntry } from "@/lib/product-variants";

interface VariantDialogProps {
  entry: ProductEntry;
  onPick: (productId: string) => void;
  onCancel: () => void;
}

/**
 * Langkah kedua setelah kasir memilih menu: menentukan panas atau dingin.
 * Harga tiap suhu ditampilkan karena sering berbeda, dan kasir kadang perlu
 * menyebutkannya ke pelanggan sebelum menekan.
 */
export default function VariantDialog({
  entry,
  onPick,
  onCancel,
}: VariantDialogProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl">
        <div className="border-b border-slate-200 p-6">
          <h3 className="text-lg font-bold text-slate-900">{entry.label}</h3>
          <p className="mt-1 text-sm text-slate-500">Pilih suhu minuman</p>
        </div>

        <div className="grid grid-cols-2 gap-3 p-6">
          {/* Keduanya netral, tidak ada yang ditandai aksi utama: sesuai DESIGN.md
              hanya boleh ada satu tombol biru, dan di sini tidak ada pilihan yang
              lebih benar dari yang lain. */}
          {entry.options.map(({ product, variant }) => (
            <button
              key={product.id}
              onClick={() => onPick(product.id)}
              className="min-h-[5rem] cursor-pointer rounded-xl border-2 border-slate-200 p-4 text-center transition-colors hover:border-primary-500 hover:bg-primary-50"
            >
              <p className="text-lg font-bold text-slate-900">
                {VARIANT_LABEL[variant]}
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-600">
                {formatRupiah(product.price)}
              </p>
            </button>
          ))}
        </div>

        <div className="border-t border-slate-200 p-6 pt-4">
          <button
            onClick={onCancel}
            className="min-h-[2.75rem] w-full cursor-pointer rounded-lg border-2 border-slate-200 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
          >
            Batal
          </button>
        </div>
      </div>
    </div>
  );
}
