"use client";

import { useActionState } from "react";

import { login } from "./actions";

export default function LoginPage() {
  // Saat kredensial benar, action memanggil redirect() dan tidak pernah
  // menghasilkan nilai — jadi `state` hanya pernah terisi untuk kegagalan.
  const [state, formAction, pending] = useActionState(login, null);

  return (
    <main className="font-inter bg-login-bg flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <header className="mb-8 text-center">
          <div className="bg-brand mb-5 inline-flex h-16 w-16 items-center justify-center rounded-2xl text-2xl font-extrabold text-white shadow-lg shadow-black/40">
            R
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-white">
            Rusen Kopitiam
          </h1>
          <p className="mt-1.5 text-sm text-white/50">Manager Console</p>
        </header>

        <form
          action={formAction}
          className="bg-login-primary/20 rounded-2xl border border-white/10 p-7 shadow-2xl shadow-black/40"
        >
          <label
            htmlFor="email"
            className="block text-xs font-semibold tracking-wide text-white/60 uppercase"
          >
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            required
            disabled={pending}
            className="mt-2 mb-5 h-12 w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 text-white placeholder:text-white/25 disabled:opacity-50"
            placeholder="owner@rusenkopitiam.id"
          />

          <label
            htmlFor="password"
            className="block text-xs font-semibold tracking-wide text-white/60 uppercase"
          >
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            disabled={pending}
            className="mt-2 h-12 w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 text-white placeholder:text-white/25 disabled:opacity-50"
            placeholder="••••••••"
          />

          <p
            role="alert"
            aria-live="polite"
            className={`mt-5 rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2.5 text-center text-sm text-red-300 transition-opacity duration-200 ${
              state?.error ? "opacity-100" : "invisible opacity-0"
            }`}
          >
            {state?.error || " "}
          </p>

          <button
            type="submit"
            disabled={pending}
            className="bg-brand hover:bg-brand-dark mt-5 flex h-14 w-full cursor-pointer items-center justify-center gap-2.5 rounded-xl text-base font-semibold text-white shadow-lg transition-colors duration-200 active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-white/[0.07] disabled:text-white/35 disabled:shadow-none"
          >
            {pending ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                Memeriksa
              </>
            ) : (
              "Masuk"
            )}
          </button>
        </form>

        <p className="mt-6 text-center text-xs leading-relaxed text-white/30">
          Aplikasi kasir ada di HP, bukan di sini. Halaman ini hanya untuk
          laporan dan pengelolaan produk.
        </p>
      </div>
    </main>
  );
}
