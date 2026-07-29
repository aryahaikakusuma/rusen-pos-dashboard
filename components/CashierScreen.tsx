"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import CategorySidebar from "@/components/CategorySidebar";
import DraftCart from "@/components/DraftCart";
import ProductGrid from "@/components/ProductGrid";
import TableConflictDialog from "@/components/TableConflictDialog";
import { useToast } from "@/components/Toast";
import {
  appendToOrderAction,
  checkTableCodeAction,
  saveNewOrderAction,
} from "@/lib/order-actions";
import type {
  Category,
  DraftItem,
  OrderItemInput,
  Product,
  TableConflict,
} from "@/lib/types";

interface CashierScreenProps {
  categories: Category[];
  products: Product[];
}

export default function CashierScreen({ categories, products }: CashierScreenProps) {
  const router = useRouter();
  const toast = useToast();

  const [selectedCategoryId, setSelectedCategoryId] = useState(categories[0]?.id ?? "");
  const [tableCode, setTableCode] = useState("");
  const [items, setItems] = useState<DraftItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [conflicts, setConflicts] = useState<TableConflict[] | null>(null);
  const [search, setSearch] = useState("");

  const total = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);

  // Saat mencari, kategori diabaikan: dengan 293 produk kasir sering tidak hafal
  // suatu menu ada di kategori mana, jadi pencarian menyapu seluruh menu.
  const keyword = search.trim().toLowerCase();
  const visibleProducts = keyword
    ? products.filter(
        (p) =>
          p.name.toLowerCase().includes(keyword) ||
          p.code.toLowerCase().includes(keyword)
      )
    : products.filter((p) => p.categoryId === selectedCategoryId);

  const toInput = (): OrderItemInput[] =>
    items.map((item) => ({
      productId: item.productId,
      quantity: item.quantity,
      notes: item.notes,
    }));

  const addProduct = (productId: string) => {
    const product = products.find((p) => p.id === productId);
    if (!product) return;
    setError("");

    setItems((current) => {
      const existing = current.find((item) => item.productId === productId);
      if (existing) {
        return current.map((item) =>
          item.productId === productId
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

  const updateQuantity = (productId: string, quantity: number) => {
    if (quantity <= 0) {
      removeItem(productId);
      return;
    }
    setItems((current) =>
      current.map((item) =>
        item.productId === productId ? { ...item, quantity } : item
      )
    );
  };

  const removeItem = (productId: string) =>
    setItems((current) => current.filter((item) => item.productId !== productId));

  const resetCart = () => {
    setItems([]);
    setTableCode("");
    setError("");
    setConflicts(null);
  };

  /** Langkah 1: cek bentrok kode meja sebelum menulis apa pun ke database. */
  const handleSave = async () => {
    if (!tableCode.trim()) {
      setError("Masukkan kode meja/order");
      toast.error("Kode meja/order belum diisi");
      return;
    }
    if (items.length === 0) {
      setError("Keranjang kosong");
      toast.error("Keranjang masih kosong");
      return;
    }

    setSaving(true);
    setError("");

    const found = await checkTableCodeAction(tableCode);
    if (found.length > 0) {
      setConflicts(found);
      setSaving(false);
      return;
    }

    await createNewOrder();
  };

  const createNewOrder = async () => {
    const label = tableCode.trim();
    setSaving(true);
    const result = await saveNewOrderAction(tableCode, toInput());
    setSaving(false);

    if (result.error) {
      setError(result.error);
      setConflicts(null);
      toast.error(result.error);
      return;
    }

    toast.success(`Order meja ${label} tersimpan`);
    resetCart();
    router.refresh();
  };

  const mergeIntoExisting = async (conflict: TableConflict) => {
    const label = tableCode.trim();
    setSaving(true);
    const result = await appendToOrderAction(
      conflict.orderId,
      conflict.version,
      toInput()
    );
    setSaving(false);

    if (result.error) {
      setError(result.error);
      setConflicts(null);
      toast.error(result.error);
      return;
    }

    toast.success(`Item ditambahkan ke order meja ${label}`);
    resetCart();
    router.refresh();
  };

  return (
    <div className="flex flex-1 overflow-hidden">
      <CategorySidebar
        categories={categories}
        selectedId={selectedCategoryId}
        onSelect={(id) => {
          // Memilih kategori membatalkan pencarian, supaya kategori yang tersorot
          // di sidebar selalu sama dengan yang tampil di grid.
          setSearch("");
          setSelectedCategoryId(id);
        }}
      />

      <div className="flex flex-1 flex-col overflow-hidden bg-white">
        <div className="flex gap-4 border-b border-slate-200 bg-slate-50 p-4">
          <div className="flex-1">
            <label
              htmlFor="product-search"
              className="mb-2 flex items-baseline justify-between text-sm font-semibold text-slate-700"
            >
              <span>Cari Produk</span>
              {keyword && (
                <span className="text-xs font-medium text-slate-500">
                  {visibleProducts.length} hasil di semua kategori
                </span>
              )}
            </label>
            <div className="relative">
              <input
                id="product-search"
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Ketik nama atau kode produk"
                className="w-full rounded-lg border-2 border-slate-300 px-4 py-3 pr-20 text-lg font-semibold focus:border-primary-600 focus:outline-none"
              />
              {keyword && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="absolute top-1/2 right-2 -translate-y-1/2 rounded-md px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-200"
                >
                  Hapus
                </button>
              )}
            </div>
          </div>

          <div className="w-1/3 shrink-0">
            <label
              htmlFor="table-code"
              className="mb-2 block text-sm font-semibold text-slate-700"
            >
              Kode Meja / Order
            </label>
            <input
              id="table-code"
              type="text"
              value={tableCode}
              onChange={(event) => {
                setTableCode(event.target.value);
                setError("");
              }}
              disabled={saving}
              placeholder="Contoh: A3, B7, atau 12"
              className="w-full rounded-lg border-2 border-slate-300 px-4 py-3 text-lg font-semibold focus:border-primary-600 focus:outline-none disabled:bg-slate-100"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <ProductGrid
            products={visibleProducts}
            onAddItem={addProduct}
            disabled={saving}
            emptyHint={
              keyword
                ? `Tidak ada produk cocok dengan "${search.trim()}"`
                : "Pilih kategori lain"
            }
          />
        </div>
      </div>

      <DraftCart
        items={items}
        total={total}
        saving={saving}
        error={error}
        onUpdateQuantity={updateQuantity}
        onRemove={removeItem}
        onSave={() => void handleSave()}
        onClear={resetCart}
      />

      {conflicts && (
        <TableConflictDialog
          tableCode={tableCode.trim()}
          conflicts={conflicts}
          busy={saving}
          onSameCustomer={(conflict) => void mergeIntoExisting(conflict)}
          onDifferentCustomer={() => void createNewOrder()}
          onCancel={() => setConflicts(null)}
        />
      )}
    </div>
  );
}
