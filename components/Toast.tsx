"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";

type ToastType = "success" | "error";

interface Toast {
  id: number;
  type: ToastType;
  message: string;
}

interface ToastApi {
  success: (message: string) => void;
  error: (message: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

/** Notifikasi hasil aksi. Sukses hilang sendiri, gagal harus ditutup kasir. */
export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error("useToast harus dipakai di dalam <ToastProvider>");
  return api;
}

const AUTO_DISMISS_MS = 3000;

export default function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback(
    (type: ToastType, message: string) => {
      const id = nextId.current++;
      setToasts((current) => [...current, { id, type, message }]);
      // Notifikasi gagal sengaja tidak dihapus otomatis: kasir perlu membaca
      // penyebabnya, dan pesan yang lenyap sendiri mudah terlewat saat sibuk.
      if (type === "success") {
        setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
      }
    },
    [dismiss]
  );

  const api = useMemo<ToastApi>(
    () => ({
      success: (message) => push("success", message),
      error: (message) => push("error", message),
    }),
    [push]
  );

  return (
    <ToastContext.Provider value={api}>
      {children}

      <div
        aria-live="polite"
        className="pointer-events-none fixed top-4 right-4 z-[100] flex w-full max-w-sm flex-col gap-2 print:hidden"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role={toast.type === "error" ? "alert" : "status"}
            className={`pointer-events-auto flex items-start gap-3 rounded-xl border-2 p-4 shadow-lg ${
              toast.type === "success"
                ? "border-status-paid bg-status-paid-light text-status-paid"
                : "border-red-300 bg-red-50 text-red-700"
            }`}
          >
            <p className="flex-1 text-sm font-semibold">{toast.message}</p>
            <button
              onClick={() => dismiss(toast.id)}
              aria-label="Tutup notifikasi"
              className="cursor-pointer px-1 text-lg leading-none font-bold opacity-60 hover:opacity-100"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
