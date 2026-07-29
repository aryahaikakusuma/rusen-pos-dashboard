"use client";

import { formatRupiah, tableLabel, type TableConflict } from "@/lib/types";

interface TableConflictDialogProps {
  tableCode: string;
  conflicts: TableConflict[];
  busy: boolean;
  onSameCustomer: (conflict: TableConflict) => void;
  onDifferentCustomer: () => void;
  onCancel: () => void;
}

const formatTime = (iso: string) =>
  new Intl.DateTimeFormat("id-ID", { timeStyle: "short" }).format(new Date(iso));

/**
 * Kode meja kembar bukan error, melainkan percabangan yang hanya kasir yang tahu
 * jawabannya. Kedua pilihan sengaja TIDAK diberi warna aksi utama: salah pilih
 * berdampak langsung ke tagihan pelanggan, jadi tidak ada default yang aman.
 */
export default function TableConflictDialog({
  tableCode,
  conflicts,
  busy,
  onSameCustomer,
  onDifferentCustomer,
  onCancel,
}: TableConflictDialogProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl">
        <div className="border-b border-slate-200 p-6">
          <h3 className="text-lg font-bold text-slate-900">
            Meja {tableCode} sudah punya order belum lunas
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            Pelanggan yang sama, atau pelanggan berbeda?
          </p>
        </div>

        <div className="space-y-3 p-6">
          {conflicts.map((conflict) => (
            <button
              key={conflict.orderId}
              onClick={() => onSameCustomer(conflict)}
              disabled={busy}
              className="w-full cursor-pointer rounded-lg border-2 border-slate-200 p-4 text-left transition-colors hover:border-slate-400 hover:bg-slate-50 disabled:opacity-50"
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-900">
                  {tableLabel(tableCode, conflict.tableSeq)}
                </span>
                <span className="font-bold text-slate-900">
                  {formatRupiah(conflict.total)}
                </span>
              </div>
              <p className="mt-1 text-sm text-slate-500">
                {conflict.itemCount} item · {conflict.cashier} ·{" "}
                {formatTime(conflict.createdAt)}
              </p>
              <p className="mt-2 text-sm font-semibold text-slate-700">
                Pelanggan sama — gabungkan ke order ini
              </p>
            </button>
          ))}

          <button
            onClick={onDifferentCustomer}
            disabled={busy}
            className="w-full cursor-pointer rounded-lg border-2 border-slate-200 p-4 text-left transition-colors hover:border-slate-400 hover:bg-slate-50 disabled:opacity-50"
          >
            <p className="font-semibold text-slate-700">Pelanggan berbeda</p>
            <p className="mt-1 text-sm text-slate-500">
              Buat order terpisah dengan kode {tableCode} (
              {conflicts.length + 1})
            </p>
          </button>
        </div>

        <div className="border-t border-slate-200 p-6">
          <button
            onClick={onCancel}
            disabled={busy}
            className="min-h-[2.75rem] w-full cursor-pointer rounded-lg border-2 border-slate-200 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
          >
            Batal
          </button>
        </div>
      </div>
    </div>
  );
}
