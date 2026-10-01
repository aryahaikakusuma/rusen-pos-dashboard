"use client";

import { useId, useRef, useState, type ReactNode } from "react";

export default function Analisis({ panel }: { panel: { id: string; judul: string; isi: ReactNode }[] }) {
  const [aktif, setAktif] = useState(panel[0].id);
  const id = useId();
  const tombol = useRef<(HTMLButtonElement | null)[]>([]);
  return (
    <section aria-label="Analisis penjualan" className="min-w-0">
      <div role="tablist" aria-label="Analisis penjualan" className="border-line mb-3 grid grid-cols-4 border-b">
        {panel.map((p, i) => (
          <button key={p.id} ref={(el) => { tombol.current[i] = el; }} role="tab" type="button"
            id={`${id}-${p.id}`} aria-controls={`${id}-${p.id}-panel`} aria-selected={aktif === p.id} tabIndex={aktif === p.id ? 0 : -1}
            onClick={() => setAktif(p.id)}
            onKeyDown={(e) => {
              const arah = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
              const ke = e.key === "Home" ? 0 : e.key === "End" ? panel.length - 1 : arah ? (i + arah + panel.length) % panel.length : null;
              if (ke !== null) { e.preventDefault(); setAktif(panel[ke].id); tombol.current[ke]?.focus(); }
            }}
            className={`min-h-12 cursor-pointer border-b-2 px-1 text-xs font-semibold sm:text-sm ${aktif === p.id ? "border-brand text-brand-dark" : "border-transparent text-ink-2 hover:text-ink"}`}>
            {p.judul}
          </button>
        ))}
      </div>
      {panel.filter((p) => p.id === aktif).map((p) => (
        <div key={p.id} role="tabpanel" id={`${id}-${p.id}-panel`} aria-labelledby={`${id}-${p.id}`} tabIndex={0}>{p.isi}</div>
      ))}
    </section>
  );
}
