"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import EditOrderModal from "@/components/EditOrderModal";
import PaymentModal from "@/components/PaymentModal";
import Receipt from "@/components/Receipt";
import { useToast } from "@/components/Toast";
import {
  formatRupiah,
  tableLabel,
  type Category,
  type Order,
  type Product,
} from "@/lib/types";

interface OrdersTableProps {
  orders: Order[];
  categories: Category[];
  products: Product[];
}

export default function OrdersTable({ orders, categories, products }: OrdersTableProps) {
  const router = useRouter();
  const toast = useToast();
  const [payingOrder, setPayingOrder] = useState<Order | null>(null);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [printingOrder, setPrintingOrder] = useState<Order | null>(null);

  // Struk harus sudah ter-render sebelum window.print() dipanggil, jadi cetak
  // dijalankan di effect setelah render — bukan langsung di dalam onClick.
  useEffect(() => {
    if (!printingOrder) return;

    window.print();
    setPrintingOrder(null);
    // Browser tidak memberi tahu apakah pengguna benar-benar mencetak atau
    // membatalkan dialog, jadi pesannya netral.
    toast.success(
      `Struk ${tableLabel(printingOrder.tableCode, printingOrder.tableSeq)} dikirim ke printer`
    );
  }, [printingOrder, toast]);

  const closeAndRefresh = () => {
    setPayingOrder(null);
    setEditingOrder(null);
    router.refresh();
  };

  if (orders.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white py-16 text-center text-slate-500">
        Belum ada order tersimpan.
      </div>
    );
  }

  return (
    <>
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-100 text-slate-600">
            <tr>
              <th className="px-4 py-3 text-left font-semibold">Meja/Order</th>
              <th className="px-4 py-3 text-left font-semibold">Kasir</th>
              <th className="px-4 py-3 text-left font-semibold">Item</th>
              <th className="px-4 py-3 text-right font-semibold">Total</th>
              <th className="px-4 py-3 text-center font-semibold">Status</th>
              <th className="px-4 py-3 text-center font-semibold">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {orders.map((order) => {
              const itemCount = order.items.reduce(
                (sum, item) => sum + item.quantity,
                0
              );

              return (
                <tr key={order.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-semibold text-slate-900">
                    {tableLabel(order.tableCode, order.tableSeq)}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{order.createdByName}</td>
                  <td className="px-4 py-3 text-slate-600">{itemCount} item</td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-900">
                    {formatRupiah(order.total)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                        order.status === "paid"
                          ? "bg-status-paid-light text-status-paid"
                          : "bg-status-pending-light text-status-pending"
                      }`}
                    >
                      {order.status === "paid" ? "Lunas" : "Belum Lunas"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-center gap-2">
                      {order.status === "pending" && (
                        <button
                          onClick={() => setEditingOrder(order)}
                          className="min-h-[2.5rem] cursor-pointer rounded-lg border-2 border-slate-200 px-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
                        >
                          Edit
                        </button>
                      )}
                      <button
                        onClick={() => setPrintingOrder(order)}
                        className="min-h-[2.5rem] cursor-pointer rounded-lg border-2 border-slate-200 px-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
                      >
                        Cetak Struk
                      </button>
                      {/* Hanya Pelunasan yang berwarna aksi utama, sesuai DESIGN.md. */}
                      {order.status === "pending" && (
                        <button
                          onClick={() => setPayingOrder(order)}
                          className="min-h-[2.5rem] cursor-pointer rounded-lg bg-primary-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-700"
                        >
                          Pelunasan
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {printingOrder && <Receipt order={printingOrder} />}

      {payingOrder && (
        <PaymentModal
          order={payingOrder}
          onClose={() => setPayingOrder(null)}
          onSuccess={closeAndRefresh}
        />
      )}

      {editingOrder && (
        <EditOrderModal
          order={editingOrder}
          categories={categories}
          products={products}
          onClose={() => setEditingOrder(null)}
          onDone={closeAndRefresh}
        />
      )}
    </>
  );
}
