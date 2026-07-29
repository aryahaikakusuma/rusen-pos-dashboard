"use client";

import { useMemo, useState } from "react";

import { type Product } from "@/lib/types";
import { groupProductVariants, type ProductEntry } from "@/lib/product-variants";
import ProductCard from "./ProductCard";
import VariantDialog from "./VariantDialog";

interface ProductGridProps {
  products: Product[];
  onAddItem: (productId: string) => void;
  disabled?: boolean;
  emptyHint?: string;
}

export default function ProductGrid({
  products,
  onAddItem,
  disabled = false,
  emptyHint = "Pilih kategori lain",
}: ProductGridProps) {
  // Menu panas dan dingin digabung jadi satu kartu; suhunya ditanyakan setelah
  // kartu ditekan, supaya jumlah kartu yang harus dipindai kasir separuhnya saja.
  const entries = useMemo(() => groupProductVariants(products), [products]);
  const [pending, setPending] = useState<ProductEntry | null>(null);

  const selectEntry = (entry: ProductEntry) => {
    // Kalau hanya satu suhu tersedia, dialog dilewati — bertanya tanpa pilihan
    // nyata hanya menambah satu ketukan.
    if (entry.options.length === 1) {
      onAddItem(entry.options[0].product.id);
      return;
    }
    setPending(entry);
  };

  if (entries.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-slate-500">
        <div className="text-center">
          <p className="text-lg font-semibold mb-2">Tidak ada produk</p>
          <p className="text-sm">{emptyHint}</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-3 gap-4 auto-rows-max">
        {entries.map((entry) => (
          <ProductCard
            key={entry.key}
            entry={entry}
            onSelect={selectEntry}
            disabled={disabled}
          />
        ))}
      </div>

      {pending && (
        <VariantDialog
          entry={pending}
          onPick={(productId) => {
            onAddItem(productId);
            setPending(null);
          }}
          onCancel={() => setPending(null)}
        />
      )}
    </>
  );
}
