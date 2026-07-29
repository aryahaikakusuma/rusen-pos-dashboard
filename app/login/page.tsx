"use client";

import { useCallback, useEffect, useState } from "react";

import { PIN_LENGTH } from "@/lib/types";
import { login } from "./actions";

export default function LoginPage() {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const appendDigit = useCallback((digit: string) => {
    setError("");
    setPin((current) =>
      current.length < PIN_LENGTH ? current + digit : current
    );
  }, []);

  const backspace = useCallback(() => {
    setError("");
    setPin((current) => current.slice(0, -1));
  }, []);

  const clear = useCallback(() => {
    setError("");
    setPin("");
  }, []);

  const submit = useCallback(async () => {
    if (pin.length !== PIN_LENGTH) return;

    setLoading(true);
    setError("");

    // Saat PIN benar, action memanggil redirect() dan promise ini tidak pernah
    // menghasilkan nilai — jadi penanganan di bawah hanya jalan untuk kegagalan.
    const result = await login(pin);

    if (result?.error) {
      setError(result.error);
      setPin("");
      setLoading(false);
    }
  }, [pin]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (loading) return;
      if (event.key >= "0" && event.key <= "9") {
        appendDigit(event.key);
      } else if (event.key === "Backspace") {
        event.preventDefault();
        backspace();
      } else if (event.key === "Enter") {
        event.preventDefault();
        void submit();
      } else if (event.key === "Escape") {
        clear();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [appendDigit, backspace, clear, submit, loading]);

  const keyClass =
    "flex h-14 cursor-pointer items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-lg font-medium text-white transition-colors duration-150 hover:bg-white/[0.09] active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-white/[0.04]";

  return (
    <main className="font-inter flex min-h-screen items-center justify-center bg-login-bg px-4 py-10">
      <div className="w-full max-w-sm">
        {/* Brand */}
        <header className="mb-8 text-center">
          <div className="mb-5 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-login-primary shadow-lg shadow-black/40">
            <svg
              className="h-8 w-8 text-white"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-white">
            Rusen Kopitiam
          </h1>
          <p className="mt-1.5 text-sm text-white/50">Point of Sale System</p>
        </header>

        {/* PIN entry */}
        <section className="rounded-2xl border border-white/10 bg-login-primary/20 p-7 shadow-2xl shadow-black/40">
          <p className="text-center text-sm text-white/60">
            Masukkan PIN {PIN_LENGTH} digit
          </p>

          <div className="mt-6 mb-7 flex justify-center gap-2.5">
            {Array.from({ length: PIN_LENGTH }, (_, index) => {
              const filled = pin.length > index;
              return (
                <div
                  key={index}
                  className={`flex h-11 w-11 items-center justify-center rounded-xl border transition-colors duration-200 ${
                    filled
                      ? "border-login-accent bg-login-accent/15"
                      : "border-white/10 bg-login-muted/60"
                  }`}
                >
                  <span
                    className={`block rounded-full transition-all duration-200 ${
                      filled ? "h-3 w-3 bg-login-accent" : "h-2 w-2 bg-white/25"
                    }`}
                  />
                </div>
              );
            })}
          </div>

          <p
            role="alert"
            aria-live="polite"
            className={`mb-5 rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2.5 text-center text-sm text-red-300 transition-opacity duration-200 ${
              error ? "opacity-100" : "invisible opacity-0"
            }`}
          >
            {error || " "}
          </p>

          {/* Keypad */}
          <div className="grid grid-cols-3 gap-3">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((digit) => (
              <button
                key={digit}
                type="button"
                onClick={() => appendDigit(String(digit))}
                disabled={loading || pin.length >= PIN_LENGTH}
                className={keyClass}
              >
                {digit}
              </button>
            ))}

            <button
              type="button"
              onClick={clear}
              disabled={loading || pin.length === 0}
              className={`${keyClass} text-sm font-normal text-white/60`}
            >
              Hapus
            </button>

            <button
              type="button"
              onClick={() => appendDigit("0")}
              disabled={loading || pin.length >= PIN_LENGTH}
              className={keyClass}
            >
              0
            </button>

            <button
              type="button"
              onClick={backspace}
              disabled={loading || pin.length === 0}
              aria-label="Hapus satu digit"
              className={keyClass}
            >
              <svg
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 10l4 4m0-4l-4 4m9-9H9.5a2 2 0 00-1.5.7L3 12l5 6.3a2 2 0 001.5.7H21a1 1 0 001-1V6a1 1 0 00-1-1z"
                />
              </svg>
            </button>
          </div>

          <button
            type="button"
            onClick={() => void submit()}
            disabled={loading || pin.length !== PIN_LENGTH}
            className="mt-5 flex h-14 w-full cursor-pointer items-center justify-center gap-2.5 rounded-xl bg-login-accent text-base font-semibold text-white shadow-lg shadow-login-accent/25 transition-colors duration-200 hover:bg-login-accent/90 active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-white/[0.07] disabled:text-white/35 disabled:shadow-none"
          >
            {loading ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                Memeriksa PIN
              </>
            ) : (
              "Masuk"
            )}
          </button>
        </section>
      </div>
    </main>
  );
}
