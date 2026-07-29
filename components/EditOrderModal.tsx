"use client";

import { useState } from "react";

import ProductGrid from "@/components/ProductGrid";
import { useToast } from "@/components/Toast";
import { appendToOrderAction, voidOrderItemAction } from "@/lib/order-actions";
import {
  formatRupiah,
  tableLabel,
  type Category,
  type DraftItem,
  type Order,
  type Product,
} from "@/lib/types";

interface EditOrderModalProps {
  order: Order;
  categories: Category[];
  products: Product[];
  onClose: () => void;
  onDone: () => void;
}

/**
 * Setiap operasi di sini langsung dikirim ke server lalu modal ditutup, bukan
 * dikumpulkan dulu. Alasannya: `version` order berubah setiap kali ada perubahan,
 * jadi menumpuk beberapa operasi dengan satu version akan selalu kena STALE_ORDER
 * pada operasi kedua.
 */
export default function EditOrderModal({
  order,
  categories,
  products,
  onClose,
  onDone,
}: EditOrderModalProps) {
  const toast = useToast();
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? "");
  const [additions, setAdditions] = useState<DraftItem[]>([]);
  const [voidingId, setVoidingId] = useState<string | null>(null);
  const [voidQty, setVoidQty] = useState(1);
  const [voidReason, setVoidReason] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const visibleProducts = products.filter((p) => p.categoryId === categoryId);
  const additionsTotal = additions.reduce(
    (sum, item) => sum + item.unitPrice * item.quantity,
    0
  );

  const stageProduct = (productId: string) => {
    const product = products.find((p) => p.id === productId);
    if (!product) return;
    setError("");
    setAdditions((current) => {
      const existing = current.find((item) => item.productId === product.id);
      if (existing) {
        return current.map((item) =>
          item.productId === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [
        ...current,
        {
          productId: product.id,
          productCode: product.code,
          productName: product.name,
          quantity: 1,
          unitPrice: product.price,
          notes: "",
        },
      ];
    });
  };

  const submitAdditions = async () => {
    setBusy(true);
    setError("");
    const result = await appendToOrderAction(
      order.id,
      order.version,
      additions.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
        notes: item.notes,
      }))
    );
    setBusy(false);

    if (result.error) {
      setError(result.error);
      toast.error(result.error);
      return;
    }
    toast.success(`${additions.length} item ditambahkan ke order`);
    onDone();
  };

  const submitVoid = async (itemId: string) => {
    const item = order.items.find((i) => i.id === itemId);
    setBusy(true);
    setError("");
    const result = await voidOrderItemAction(
      order.id,
      itemId,
      voidQty,
      voidReason,
      order.version
    );
    setBusy(false);

    if (result.error) {
      setError(result.error);
      toast.error(result.error);
      return;
    }
    toast.success(
      `${voidQty}x ${item?.productName ?? "item"} dibatalkan dan tercatat di laporan void`
    );
    onDone();
  };

  const startVoid = (itemId: string) => {
    setVoidingId(itemId);
    setVoidQty(1);
    setVoidReason("");
    setError("");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-2xl">
        <div className="border-b border-slate-200 p-6">
          <h3 className="text-lg font-bold text-slate-900">
            Edit Order — {tableLabel(order.tableCode, order.tableSeq)}
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            Menghapus item akan tercatat di laporan void.
          </p>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto p-6">
          {/* Item saat ini */}
          <section>
            <h4 className="mb-3 text-sm font-semibold text-slate-700">Item Saat Ini</h4>
            <div className="divide-y divide-slate-200 rounded-lg border border-slate-200">
              {order.items.map((item) => (
                <div key={item.id} className="p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">
                        {item.quantity}x {item.productName}
                      </p>
                      <p className="text-xs text-slate-500">
                        {formatRupiah(item.unitPrice)} / item
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-semibold text-slate-900">
                        {formatRupiah(item.subtotal)}
                      </span>
                      <button
                        onClick={() => startVoid(item.id)}
                        disabled={busy}
                        className="cursor-pointer rounded-lg bg-status-void-light px-3 py-1.5 text-xs font-semibold text-status-void transition-colors hover:bg-red-100 disabled:opacity-40"
                      >
                        Batalkan
                      </button>
                    </div>
                  </div>

                  {voidingId === item.id && (
                    <div className="mt-3 space-y-3 rounded-lg bg-slate-50 p-3">
                      <div className="flex items-center gap-3">
                        <label
                          htmlFor={`qty-${item.id}`}
                          className="text-xs font-semibold text-slate-700"
                        >
                          Jumlah dibatalkan
                        </label>
                        <input
                          id={`qty-${item.id}`}
                          type="number"
                          min={1}
                          max={item.quantity}
                          value={voidQty}
                          onChange={(event) => setVoidQty(Number(event.target.value))}
                          className="w-20 rounded-lg border-2 border-slate-300 px-2 py-1 text-sm font-semibold focus:border-primary-600 focus:outline-none"
                        />
                        <span className="text-xs text-slate-500">
                          dari {item.quantity}
                        </span>
                      </div>
                      <input
                        type="text"
                        value={voidReason}
                        onChange={(event) => setVoidReason(event.target.value)}
                        placeholder="Alasan pembatalan (wajib)"
                        className="w-full rounded-lg border-2 border-slate-300 px-3 py-2 text-sm focus:border-primary-600 focus:outline-none"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => void submitVoid(item.id)}
                          disabled={busy || !voidReason.trim()}
                          className="cursor-pointer rounded-lg bg-status-void px-4 py-2 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          {busy ? "Memproses..." : "Konfirmasi Batal"}
                        </button>
                        <button
                          onClick={() => setVoidingId(null)}
                          disabled={busy}
                          className="cursor-pointer rounded-lg border-2 border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-white"
                        >
                          Urung
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* Tambah item */}
          <section>
            <h4 className="mb-3 text-sm font-semibold text-slate-700">Tambah Item</h4>

            <div className="mb-3 flex flex-wrap gap-2">
              {categories.map((category) => (
                <button
                  key={category.id}
                  onClick={() => setCategoryId(category.id)}
                  className={`cursor-pointer rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                    categoryId === category.id
                      ? "bg-neutral-700 text-white"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  {category.name}
                </button>
              ))}
            </div>

            {/* Pakai grid yang sama dengan layar kasir supaya pemilihan suhu
                panas/dingin berperilaku identik di kedua tempat. */}
            <ProductGrid
              products={visibleProducts}
              onAddItem={stageProduct}
              disabled={busy}
            />

            {additions.length > 0 && (
              <div className="mt-4 rounded-lg border-2 border-primary-200 bg-primary-50 p-3">
                <p className="mb-2 text-xs font-semibold text-slate-700">
                  Akan ditambahkan
                </p>
                <ul className="space-y-1">
                  {additions.map((item) => (
                    <li
                      key={item.productId}
                      className="flex justify-between text-sm text-slate-700"
                    >
                      <span>
                        {item.quantity}x {item.productName}
                      </span>
                      <span className="font-semibold">
                        {formatRupiah(item.unitPrice * item.quantity)}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 border-t border-primary-200 pt-2 text-right text-sm font-bold text-slate-900">
                  {formatRupiah(additionsTotal)}
                </p>
              </div>
            )}
          </section>

          {error && (
            <p
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 p-3 text-center text-sm text-red-600"
            >
              {error}
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 border-t border-slate-200 p-6">
          <button
            onClick={onClose}
            disabled={busy}
            className="min-h-[2.75rem] cursor-pointer rounded-lg border-2 border-slate-200 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
          >
            Tutup
          </button>
          <button
            onClick={() => void submitAdditions()}
            disabled={busy || additions.length === 0}
            className="min-h-[2.75rem] cursor-pointer rounded-lg bg-primary-600 text-sm font-semibold text-white transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? "Menyimpan..." : "Simpan Tambahan"}
          </button>
        </div>
      </div>
    </div>
  );
}
