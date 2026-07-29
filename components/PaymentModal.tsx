"use client";

import { useState } from "react";

import { useToast } from "@/components/Toast";
import { payOrderAction } from "@/lib/order-actions";
import { formatRupiah, tableLabel, type Order, type PaymentMethod } from "@/lib/types";

interface PaymentModalProps {
  order: Order;
  onClose: () => void;
  onSuccess: () => void;
}

export default function PaymentModal({ order, onClose, onSuccess }: PaymentModalProps) {
  const toast = useToast();
  const total = order.total;
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [amountInput, setAmountInput] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const hasAmount = amountInput !== "";
  const amountReceived = hasAmount ? Number(amountInput) : 0;
  const change = amountReceived - total;
  const isCashReady = method === "cash" ? hasAmount && amountReceived >= total : true;

  const handleMethodChange = (next: PaymentMethod) => {
    setMethod(next);
    setError("");
    if (next === "non_cash") setAmountInput("");
  };

  const handleSubmit = async () => {
    setError("");
    setSubmitting(true);

    // Server tetap memvalidasi ulang; pemeriksaan di sini hanya agar kasir
    // dapat umpan balik sebelum permintaan dikirim.
    const result = await payOrderAction(
      order.id,
      method,
      method === "cash" ? amountReceived : null
    );

    if (result.error) {
      setError(result.error);
      setSubmitting(false);
      toast.error(result.error);
      return;
    }

    toast.success(
      `Order ${tableLabel(order.tableCode, order.tableSeq)} lunas — ${formatRupiah(total)}`
    );
    onSuccess();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl">
        <div className="border-b border-slate-200 p-6">
          <h3 className="text-lg font-bold text-slate-900">Pelunasan Order</h3>
          <p className="mt-1 text-sm text-slate-500">
            Meja/Order:{" "}
            <span className="font-semibold text-slate-700">
              {tableLabel(order.tableCode, order.tableSeq)}
            </span>
          </p>
        </div>

        <div className="space-y-5 p-6">
          <div className="rounded-lg border-2 border-slate-200 bg-slate-50 p-4">
            <p className="mb-1 text-xs text-slate-500">Total Tagihan</p>
            <p className="text-3xl font-bold text-slate-900">{formatRupiah(total)}</p>
          </div>

          <div>
            <span className="mb-2 block text-sm font-semibold text-slate-700">
              Metode Pembayaran
            </span>
            <div className="grid grid-cols-2 gap-3">
              {(["cash", "non_cash"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => handleMethodChange(option)}
                  className={`min-h-[2.75rem] cursor-pointer rounded-lg border-2 text-sm font-semibold transition-colors ${
                    method === option
                      ? "border-primary-600 bg-primary-50 text-primary-700"
                      : "border-slate-200 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {option === "cash" ? "Cash" : "Non Cash"}
                </button>
              ))}
            </div>
          </div>

          {method === "cash" && (
            <div className="space-y-3">
              <div>
                <label
                  htmlFor="amount-received"
                  className="mb-2 block text-sm font-semibold text-slate-700"
                >
                  Nominal Diterima
                </label>
                <input
                  id="amount-received"
                  type="text"
                  inputMode="numeric"
                  autoFocus
                  value={amountInput}
                  onChange={(event) => {
                    setAmountInput(event.target.value.replace(/[^0-9]/g, ""));
                    setError("");
                  }}
                  placeholder="0"
                  className="w-full rounded-lg border-2 border-slate-300 px-4 py-3 text-lg font-semibold focus:border-primary-600 focus:outline-none"
                />
              </div>

              <div
                className={`rounded-lg border-2 p-4 ${
                  !hasAmount
                    ? "border-slate-200 bg-slate-50"
                    : change >= 0
                      ? "border-status-paid-light bg-status-paid-light"
                      : "border-red-200 bg-red-50"
                }`}
              >
                <p className="mb-1 text-xs text-slate-500">Kembalian</p>
                <p
                  className={`text-2xl font-bold ${
                    !hasAmount
                      ? "text-slate-400"
                      : change >= 0
                        ? "text-status-paid"
                        : "text-red-600"
                  }`}
                >
                  {!hasAmount ? "-" : formatRupiah(Math.max(change, 0))}
                </p>
              </div>
            </div>
          )}

          {error && (
            <div
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 p-3 text-center"
            >
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 border-t border-slate-200 p-6">
          <button
            onClick={onClose}
            disabled={submitting}
            className="min-h-[2.75rem] cursor-pointer rounded-lg border-2 border-slate-200 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
          >
            Batal
          </button>
          <button
            onClick={() => void handleSubmit()}
            disabled={submitting || !isCashReady}
            className="min-h-[2.75rem] cursor-pointer rounded-lg bg-primary-600 text-sm font-semibold text-white transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? "Memproses..." : "Konfirmasi Lunas"}
          </button>
        </div>
      </div>
    </div>
  );
}
