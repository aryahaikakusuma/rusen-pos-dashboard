"use client";

import { formatRupiah, type DraftItem } from "@/lib/types";

interface DraftCartProps {
  items: DraftItem[];
  total: number;
  saving: boolean;
  error: string;
  onUpdateQuantity: (productId: string, quantity: number) => void;
  onRemove: (productId: string) => void;
  onSave: () => void;
  onClear: () => void;
}

/**
 * Keranjang yang masih hidup di browser dan belum menyentuh database.
 * Sengaja tanpa tombol bayar: pelunasan terjadi di Daftar Order, bukan di sini.
 */
export default function DraftCart({
  items,
  total,
  saving,
  error,
  onUpdateQuantity,
  onRemove,
  onSave,
  onClear,
}: DraftCartProps) {
  return (
    <div className="flex w-80 flex-col overflow-hidden border-l border-slate-200 bg-white">
      <div className="border-b border-slate-200 bg-slate-50 p-4">
        <h2 className="text-lg font-bold text-slate-900">Keranjang</h2>
      </div>

      <div className="flex-1 overflow-y-auto">
        {items.length === 0 ? (
          <div className="p-4 text-center text-sm text-slate-500">
            Keranjang kosong
          </div>
        ) : (
          <div className="divide-y divide-slate-200">
            {items.map((item) => (
              <div key={item.productId} className="p-4 transition-colors hover:bg-slate-50">
                <div className="mb-2 flex items-start justify-between">
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-slate-900">
                      {item.productName}
                    </p>
                    {item.notes && (
                      <p className="mt-1 text-xs text-slate-500 italic">{item.notes}</p>
                    )}
                  </div>
                  <button
                    onClick={() => onRemove(item.productId)}
                    disabled={saving}
                    className="ml-2 cursor-pointer text-slate-400 transition-colors hover:text-status-void disabled:opacity-40"
                    aria-label={`Hapus ${item.productName}`}
                  >
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => onUpdateQuantity(item.productId, item.quantity - 1)}
                      disabled={saving}
                      aria-label="Kurangi jumlah"
                      className="flex h-8 w-8 cursor-pointer items-center justify-center rounded bg-slate-100 font-semibold text-slate-900 transition-colors hover:bg-slate-200 disabled:opacity-40"
                    >
                      −
                    </button>
                    <span className="w-8 text-center font-semibold text-slate-900">
                      {item.quantity}
                    </span>
                    <button
                      onClick={() => onUpdateQuantity(item.productId, item.quantity + 1)}
                      disabled={saving}
                      aria-label="Tambah jumlah"
                      className="flex h-8 w-8 cursor-pointer items-center justify-center rounded bg-slate-100 font-semibold text-slate-900 transition-colors hover:bg-slate-200 disabled:opacity-40"
                    >
                      +
                    </button>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-slate-500">{formatRupiah(item.unitPrice)}</p>
                    <p className="font-bold text-slate-900">
                      {formatRupiah(item.unitPrice * item.quantity)}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {items.length > 0 && (
        <>
          <div className="border-t border-slate-200 bg-slate-50 p-4">
            <div className="rounded-lg border-2 border-slate-200 bg-white p-3">
              <p className="mb-1 text-xs text-slate-600">Total</p>
              <p className="text-3xl font-bold text-slate-900">{formatRupiah(total)}</p>
            </div>
          </div>

          <div className="space-y-3 border-t border-slate-200 bg-white p-4">
            {error && (
              <p role="alert" className="text-sm font-medium text-status-void">
                {error}
              </p>
            )}

            {/* Satu-satunya tombol utama di layar ini, sesuai DESIGN.md. */}
            <button
              onClick={onSave}
              disabled={saving}
              className="flex min-h-[2.75rem] w-full cursor-pointer items-center justify-center rounded-lg bg-primary-600 text-lg font-bold text-white shadow-sm transition-all hover:bg-primary-700 hover:shadow-md active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? "Menyimpan..." : "Simpan Order"}
            </button>

            <button
              onClick={onClear}
              disabled={saving}
              className="flex min-h-[2.5rem] w-full cursor-pointer items-center justify-center rounded-lg bg-status-void-light text-sm font-medium text-status-void transition-colors hover:bg-red-100 disabled:opacity-40"
            >
              Kosongkan Keranjang
            </button>
          </div>
        </>
      )}
    </div>
  );
}
