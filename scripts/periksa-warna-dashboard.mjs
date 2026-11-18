/** Regression warna: komponen asli, tanpa browser/database atau test runner baru. */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import vm from "node:vm";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, "..");
const cache = new Map();

// Transpile hanya di memori: alias @/ tetap menuju sumber web yang diuji.
function muat(berkas) {
  if (cache.has(berkas)) return cache.get(berkas).exports;
  const kode = ts.transpileModule(fs.readFileSync(berkas, "utf8"), {
    fileName: berkas,
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
      target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText;
  const modul = { exports: {} };
  cache.set(berkas, modul);
  const impor = (id) => {
    if (!id.startsWith("@/") && !id.startsWith(".")) return require(id);
    const awal = id.startsWith("@/") ? path.join(root, id.slice(2)) : path.resolve(path.dirname(berkas), id);
    const tujuan = [awal, `${awal}.tsx`, `${awal}.ts`].find((p) => fs.existsSync(p) && fs.statSync(p).isFile());
    if (!tujuan) throw new Error(`Impor tidak ditemukan: ${id}`);
    return muat(tujuan);
  };
  vm.runInThisContext(`(function(module,exports,require){${kode}\n})`, { filename: berkas })(modul, modul.exports, impor);
  return modul.exports;
}

const { Pendapatan } = muat(path.join(root, "components/dashboard/Ringkasan.tsx"));
const { Kpi } = muat(path.join(root, "components/dashboard/Kartu.tsx"));
const tampil = (komponen, props) => renderToStaticMarkup(React.createElement(komponen, props));
const total = (overrides = {}) => ({ jumlah_order: 10, omzet_kotor: 100000, total_refund: 0,
  omzet_bersih: 100000, dasar_pbjt: 100000, pbjt: 10000, omzet_bebas_order: 0,
  omzet_bukan_objek: 0, tertagih: 110000, tertagih_tunai: 110000, tertagih_non_tunai: 0,
  tertagih_bersih: 110000, refund_pbjt: 0, pbjt_bersih: 10000, ...overrides });
const warnaTeks = (html, warna, teks) => assert.match(html,
  new RegExp(`<span class="[^"]*${warna}[^"]*"[^>]*>${teks}</span>`));
let lulus = 0;
let gagal = 0;
function uji(nama, run) {
  try { run(); lulus++; console.log(`PASS ${nama}`); }
  catch (error) { gagal++; console.error(`FAIL ${nama}: ${error.message}`); }
}

for (const [nama, nilai, warna, teks] of [
  ["naik", 120000, "text-good", "Naik 20,0%"],
  ["turun", 80000, "text-danger", "Turun 20,0%"],
  ["tetap", 100000, "text-ink-2", "Tetap 0,0%"],
]) {
  uji(`Pendapatan ${nama}: arah dan warna sesuai`, () => {
    const html = tampil(Pendapatan, { total: total({ omzet_bersih: nilai }), sebelumnya: total() });
    warnaTeks(html, warna, teks);
  });
}
uji("Tanpa pembanding tidak mengarang persentase", () => {
  assert.doesNotMatch(tampil(Pendapatan, { total: total() }), /%|NaN|Infinity/);
});
uji("Pembanding nol atau negatif tidak menghasilkan persentase semu", () => {
  for (const nilai of [0, -100000]) {
    const html = tampil(Pendapatan, { total: total(), sebelumnya: total({ omzet_bersih: nilai, tertagih_bersih: nilai }) });
    assert.doesNotMatch(html, /%|NaN|Infinity/);
  }
});
uji("Pendapatan negatif tetap merah walau merupakan nilai bersih yang sah", () => {
  const html = tampil(Pendapatan, { total: total({ omzet_bersih: -50000, tertagih_bersih: -55000 }) });
  assert.match(html, /<p class="[^"]*text-danger[^"]*">-Rp 50\.000<\/p>/);
  assert.match(html, /<p class="[^"]*text-danger[^"]*">-Rp 55\.000<\/p>/);
});
for (const [nama, sekarang, lalu, warna, teks] of [
  ["turun", 50000, 100000, "text-good", "Turun 50,0%"],
  ["naik", 100000, 50000, "text-danger", "Naik 100,0%"],
  ["tetap", 50000, 50000, "text-ink-2", "Tetap 0,0%"],
  ["habis", 0, 50000, "text-good", "Turun 100,0%"],
]) {
  uji(`Refund ${nama}: warna perubahan berlawanan dengan pendapatan`, () => {
    const html = tampil(Pendapatan, { total: total({ total_refund: sekarang }), sebelumnya: total({ total_refund: lalu }) });
    warnaTeks(html, warna, teks);
    if (sekarang > 0) assert.match(html, /<span class="text-danger">Refund Rp /);
    else assert.doesNotMatch(html, /<span class="text-danger">Refund Rp 0/);
  });
}
uji("Refund dari nol tidak menampilkan Naik 100%", () => {
  const html = tampil(Pendapatan, { total: total({ total_refund: 50000 }), sebelumnya: total() });
  assert.doesNotMatch(html, /Naik 100|NaN|Infinity/);
  assert.match(html, /<span class="text-danger">Refund Rp 50\.000<\/span>/);
});
for (const [delta, inverse, warna, teks] of [
  [20, false, "text-good", "Naik 20,0%"],
  [-20, false, "text-danger", "Turun 20,0%"],
  [20, true, "text-danger", "Naik 20,0%"],
  [-20, true, "text-good", "Turun 20,0%"],
  [0, false, "text-ink-2", "Tetap 0,0%"],
  [0, true, "text-ink-2", "Tetap 0,0%"],
]) {
  uji(`KPI delta=${delta}, turunLebihBaik=${inverse}`, () => {
    warnaTeks(tampil(Kpi, { label: "Nilai", nilai: "Rp 100.000", delta, turunLebihBaik: inverse }), warna, teks);
  });
}
uji("KPI menyembunyikan pembanding tidak tersedia atau tidak valid", () => {
  for (const delta of [undefined, null, NaN, Infinity, -Infinity]) {
    assert.equal(tampil(Kpi, { label: "Nilai", nilai: "Rp 100.000", delta }),
      tampil(Kpi, { label: "Nilai", nilai: "Rp 100.000" }));
  }
});

console.log(`\nWarna dashboard: ${lulus} lulus, ${gagal} gagal.`);
if (gagal) process.exitCode = 1;
