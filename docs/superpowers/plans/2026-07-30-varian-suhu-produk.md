# Varian Suhu Produk — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Menggabungkan produk minuman panas dan dingin menjadi satu kartu di grid kasir mobile, dengan pemilihan suhu setelah kartu ditekan dan penanda `Panas/Dingin` di kartu.

**Architecture:** Port dari aplikasi web, bukan desain ulang. `lib/product-variants.ts` disalin ke `mobile/lib/` dengan dua penyesuaian tipe; `ProductCard` dan `VariantDialog` diterjemahkan ke React Native memakai `Sheet` yang sudah ada. Pengelompokan murni tampilan — yang masuk keranjang tetap `productId` asli, jadi `mobile/db/`, skema SQLite, dan skema Postgres tidak tersentuh sama sekali.

**Tech Stack:** Expo SDK 57, React Native 0.86, React 19.2, TypeScript strict, StyleSheet + token di `mobile/theme/`.

Spesifikasi: `docs/superpowers/specs/2026-07-30-varian-suhu-produk-design.md`

## Global Constraints

- **Baca dokumen versi dulu.** `mobile/AGENTS.md`: Expo sudah berubah — rujuk https://docs.expo.dev/versions/v57.0.0/ sebelum menulis kode.
- **Tidak ada dependensi baru.** Tidak ada jest, tidak ada library pengelompokan. Proyek ini tidak punya test runner; rumah pengujian adalah uji mandiri di `mobile/screens/DebugScreen.tsx`.
- **Tidak ada perubahan skema.** Tidak ada migrasi baru, tidak ada perubahan di `mobile/db/`, tidak ada perubahan pada tabel Postgres maupun SQLite.
- **Pengelompokan murni tampilan.** Yang dikirim ke `createOrder` / `appendToOrder` tetap `productId` asli.
- **Logika pengelompokan disalin, tidak ditulis ulang.** Regex akhiran mengenali `panas`, `dingin`, `es`, dan `s`. Menulis ulang dengan asumsi hanya ada "Panas"/"Dingin" membuat 8 kartu kategori KOPI gagal tergabung **tanpa satu pun error**.
- **Duplikasi berkas diterima secara sadar** (keputusan Heika, 2026-07-30). Berbagi satu berkas antara web dan mobile butuh npm workspace atau konfigurasi Metro yang menengok ke luar `mobile/` — perubahan struktural yang jauh lebih besar dari fitur ini. Preseden yang sama sudah dipakai untuk nilai warna antara `app/globals.css` dan `mobile/theme/`. **Syaratnya: kedua berkas wajib memuat komentar kepala yang menyatakan keduanya harus diubah bersama.** Berkas web belum punya komentar itu dan harus ditambahi.
- **Uji tidak boleh menegaskan jumlah.** Tidak ada asersi ke angka 38 atau 255. Menambah atau menghapus produk di masa depan tidak boleh membuat uji merah tanpa ada yang rusak. Jumlah hanya dilaporkan sebagai baris informasi; yang membuat uji gagal adalah sifat pengelompokan.
- **Target sentuh** minimal 48dp (`touchTarget.min`), aksi utama 64dp (`touchTarget.primaryAction`) — `DESIGN.md`.
- **Hanya satu tombol biru per layar** (`DESIGN.md`). Tombol panas dan dingin keduanya netral.
- **Komentar dan teks antarmuka berbahasa Indonesia**, mengikuti seluruh berkas di `mobile/`.
- **Verifikasi di perangkat**, bukan hanya typecheck. Metro sudah tersambung lewat USB: `adb reverse tcp:8081`, lalu `adb shell am start -a android.intent.action.VIEW -d "exp://127.0.0.1:8081"`. Tangkap layar dengan `adb shell screencap -p /sdcard/s.png` lalu `adb pull`. Injeksi sentuhan `adb shell input tap` **diblokir HyperOS** — interaksi harus dilakukan manusia.

## File Structure

| Berkas | Tanggung jawab |
| --- | --- |
| `mobile/lib/product-variants.ts` (baru) | Murni logika pengelompokan. Tanpa impor React Native, supaya bisa dibaca dan diuji terpisah dari tampilan. |
| `mobile/components/VariantSheet.tsx` (baru) | Menampilkan pilihan suhu. Tidak tahu apa-apa soal keranjang atau database. |
| `mobile/components/ProductCard.tsx` (ubah) | Menampilkan satu entry. Tidak lagi tahu soal kode produk. |
| `mobile/components/ProductGrid.tsx` (ubah) | Mengelompokkan lalu merender. Melaporkan entry terpilih ke induk, tidak memutuskan apa pun. |
| `mobile/screens/CashierScreen.tsx` (ubah) | Memutuskan: satu opsi masuk langsung, banyak opsi buka lembar. |
| `mobile/screens/EditOrderScreen.tsx` (ubah) | Aturan yang sama untuk penambahan item ke order yang sudah ada. |
| `mobile/screens/DebugScreen.tsx` (ubah) | Rumah pemeriksaan regresi pengelompokan. |

---

### Task 1: Logika pengelompokan dan pemeriksaannya

**Files:**
- Create: `mobile/lib/product-variants.ts`
- Modify: `mobile/screens/DebugScreen.tsx`
- Modify: `lib/product-variants.ts` — **hanya menambah komentar kepala**, logikanya tidak boleh berubah
- Reference: `mobile/db/types.ts:21-29` (`ProductRow`), `mobile/components/Button.tsx:20-32` (props `Button`)

**Interfaces:**
- Consumes: `ProductRow` dari `mobile/db/types.ts` — punya `id`, `outlet_id`, `category_id`, `code`, `name`, `price`, `active`.
- Produces: `groupProductVariants(products: ProductRow[]): ProductEntry[]`, tipe `TemperatureVariant = "panas" | "dingin"`, `ProductOption { product: ProductRow; variant: TemperatureVariant }`, `ProductEntry { key: string; label: string; minPrice: number; maxPrice: number; options: ProductOption[] }`, dan `VARIANT_LABEL: Record<TemperatureVariant, string>`. Task 2-4 memakai nama-nama ini persis.

- [ ] **Step 1: Baca sumber salinannya**

Buka `lib/product-variants.ts`. Seluruh komentarnya menjelaskan keputusan yang tidak boleh hilang saat disalin — terutama kenapa nama tanpa akhiran diperlakukan sebagai kandidat panas, dan kenapa kunci grup menyertakan kategori.

- [ ] **Step 2: Tulis pemeriksaan yang gagal lebih dulu**

Tambahkan di `mobile/screens/DebugScreen.tsx`, setelah `runSelfTest` (berkas ini sudah memakai pola `append(...)` untuk melaporkan hasil):

```ts
/**
 * Pemeriksaan pengelompokan varian suhu. Dijalankan atas katalog lokal yang
 * sesungguhnya, bukan data buatan: yang mau dibuktikan justru bahwa aturan
 * akhiran cocok dengan penamaan menu yang dipakai outlet ini.
 */
async function runVariantChecks(
  db: ReturnType<typeof useSQLiteContext>,
  append: (line: string) => void
) {
  const products = await listProducts(db);
  if (products.length === 0) {
    append("GAGAL: katalog lokal kosong. Tarik katalog dulu.");
    return;
  }

  const entries = groupProductVariants(products);
  const paired = entries.filter((e) => e.options.length > 1);

  const ok = (label: string) => append(`OK  ${label}`);
  const fail = (label: string, detail: string) =>
    append(`GAGAL ${label}: ${detail}`);

  // Asersi sifat, bukan jumlah. Menambah atau menghapus menu tidak boleh
  // membuat pemeriksaan ini merah — yang diuji aturannya, bukan isi katalog.

  // 1. Tidak ada produk yang hilang atau terhitung dua kali. Ini yang menangkap
  //    kegagalan paling mahal: menu yang lenyap dari grid tanpa error.
  const grouped = entries.flatMap((e) => e.options.map((o) => o.product.id));
  const uniqueGrouped = new Set(grouped);
  if (grouped.length !== products.length || uniqueGrouped.size !== products.length) {
    fail(
      "semua produk terwakili tepat sekali",
      `${products.length} produk jadi ${grouped.length} opsi (${uniqueGrouped.size} unik)`
    );
  } else {
    ok("semua produk terwakili tepat sekali");
  }

  // 2. Satu entry tidak boleh punya dua opsi bersuhu sama — itu akan memunculkan
  //    lembar dengan dua tombol "Panas".
  const duplicateVariant = entries.find(
    (e) => new Set(e.options.map((o) => o.variant)).size !== e.options.length
  );
  if (duplicateVariant) {
    fail("tidak ada suhu kembar dalam satu kartu", `"${duplicateVariant.label}"`);
  } else {
    ok("tidak ada suhu kembar dalam satu kartu");
  }

  // 3. Panas selalu opsi pertama, supaya posisi tombol tidak berpindah antar menu.
  const wrongOrder = paired.find((e) => e.options[0].variant !== "panas");
  if (wrongOrder) {
    fail("panas selalu di urutan pertama", `"${wrongOrder.label}"`);
  } else {
    ok("panas selalu di urutan pertama");
  }

  // 4. Rentang harga cocok dengan opsi yang benar-benar ada.
  const wrongPrice = entries.find((e) => {
    const prices = e.options.map((o) => o.product.price);
    return e.minPrice !== Math.min(...prices) || e.maxPrice !== Math.max(...prices);
  });
  if (wrongPrice) {
    fail("rentang harga cocok dengan opsinya", `"${wrongPrice.label}"`);
  } else {
    ok("rentang harga cocok dengan opsinya");
  }

  // 5. Kartu tunggal memakai nama utuh, kartu gabungan memakai nama dasar.
  const wrongLabel = entries.find(
    (e) => e.options.length === 1 && e.label !== e.options[0].product.name
  );
  if (wrongLabel) {
    fail("kartu tunggal memakai nama utuh", `"${wrongLabel.label}"`);
  } else {
    ok("kartu tunggal memakai nama utuh");
  }

  // 6. Inti aturannya: dua produk sekategori yang namanya hanya berbeda pada
  //    penanda suhu WAJIB berada di kartu yang sama. Normalisasi di bawah ini
  //    sengaja ditulis ulang di sini, tidak diimpor dari modulnya — kalau ia
  //    mengimpor regex yang sama, pemeriksaan ini jadi memutar dan selalu lolos
  //    meski aturannya rusak. Inilah yang menangkap hilangnya akhiran "S".
  const strip = (name: string) =>
    name.replace(/\s+(panas|dingin|es|s)$/i, "").trim().toLowerCase();
  const entryOfProduct = new Map<string, ProductEntry>();
  for (const entry of entries) {
    for (const option of entry.options) entryOfProduct.set(option.product.id, entry);
  }
  let separated: string | null = null;
  for (const a of products) {
    for (const b of products) {
      if (a.id === b.id || a.category_id !== b.category_id) continue;
      if (a.name === b.name || strip(a.name) !== strip(b.name)) continue;
      if (entryOfProduct.get(a.id) !== entryOfProduct.get(b.id)) {
        separated = `"${a.name}" dan "${b.name}"`;
        break;
      }
    }
    if (separated) break;
  }
  if (separated) {
    fail("pasangan suhu selalu satu kartu", separated);
  } else {
    ok("pasangan suhu selalu satu kartu");
  }

  // Informasi, bukan asersi. Angkanya berguna dilihat manusia — saat rencana ini
  // ditulis katalog seed menghasilkan 255 kartu, 38 di antaranya berpasangan —
  // tapi menegaskannya membuat uji merah setiap kali menu bertambah.
  append(
    `info: ${products.length} produk → ${entries.length} kartu, ${paired.length} berpasangan`
  );
}
```

Tambahkan impor di bagian atas berkas:

```ts
import {
  groupProductVariants,
  type ProductEntry,
} from "../lib/product-variants";
```

Dan tombol pemanggilnya, di sebelah tombol uji yang sudah ada:

```tsx
<Button
  label="Uji pengelompokan varian"
  variant="secondary"
  onPress={() => void runVariantChecks(db, append)}
/>
```

Sesuaikan nama prop `Button` dengan yang dipakai tombol lain di berkas ini — jangan menebak, salin dari pemakaian yang sudah ada.

- [ ] **Step 3: Jalankan dan pastikan gagal**

```bash
cd mobile && npm run typecheck
```

Expected: FAIL — `Cannot find module '../lib/product-variants'`.

- [ ] **Step 4: Tulis implementasinya**

Create `mobile/lib/product-variants.ts`. Ini salinan `lib/product-variants.ts` dengan dua penyesuaian: `Product` → `ProductRow`, dan `product.categoryId` → `product.category_id`.

```ts
// Pengelompokan varian suhu minuman.
//
// Di database, panas dan dingin adalah dua produk terpisah dengan kode dan harga
// masing-masing (mis. "Coklat Panas" Rp 17.000 dan "Coklat Dingin" Rp 20.000).
// Itu benar untuk pencatatan, tapi memaksa kasir memindai dua kartu untuk satu
// menu. Di layar keduanya digabung jadi satu kartu "Coklat"; suhunya baru
// ditanyakan setelah kartu ditekan.
//
// Penanda suhu di daftar menu tidak seragam. Selain "Panas"/"Dingin", kategori
// Kopi memakai akhiran "S" atau "Es" untuk versi dingin, dan versi panasnya
// ditulis tanpa akhiran sama sekali:
//
//   Kopi              Rp 11.000   ← panas
//   Kopi S            Rp 15.000   ← dingin
//   Kopi Susu Panas   Rp 13.000
//   Kopi Susu S       Rp 18.000
//
// Jadi nama tanpa akhiran diperlakukan sebagai kandidat "panas", dan baru benar-
// benar digabung kalau ada saudara dinginnya. Kalau tidak ada, kartunya berdiri
// sendiri persis seperti produk biasa.
//
// Yang dikirim ke server tetap productId asli — pengelompokan ini murni tampilan.
//
// Kembaran berkas ini ada di lib/product-variants.ts (aplikasi web). Keduanya
// harus berubah bersama: kalau berbeda, kasir melihat isi kartu yang berbeda di
// dua perangkat untuk katalog yang sama, dan tidak ada tes yang menangkapnya.

import type { ProductRow } from "../db/types";

export type TemperatureVariant = "panas" | "dingin";

export interface ProductOption {
  product: ProductRow;
  variant: TemperatureVariant;
}

export interface ProductEntry {
  key: string;
  /** Nama yang tampil di kartu: tanpa akhiran suhu kalau kedua varian ada. */
  label: string;
  minPrice: number;
  maxPrice: number;
  /** Lebih dari satu berarti kasir harus memilih suhu dulu. */
  options: ProductOption[];
}

/**
 * Akhiran penanda suhu. "S" dan "Es" hanya dikenali sebagai kata terpisah, jadi
 * "Kopi Milo Susu" (berakhir huruf u) dan "Kopi Susu Pancung" tidak ikut terpotong.
 */
const SUFFIX = /\s+(panas|dingin|es|s)$/i;

function readVariant(name: string): {
  base: string;
  variant: TemperatureVariant;
} {
  const match = SUFFIX.exec(name);
  if (!match) {
    // Tanpa akhiran: kandidat panas, dengan nama utuh sebagai nama dasar.
    return { base: name, variant: "panas" };
  }
  const suffix = match[1].toLowerCase();
  return {
    base: name.slice(0, match.index).trim(),
    variant: suffix === "panas" ? "panas" : "dingin",
  };
}

/**
 * Menggabungkan produk yang namanya hanya berbeda pada penanda suhu.
 * Kunci grup menyertakan kategori supaya menu bernama mirip di kategori berbeda
 * (mis. "Jahe Gula Merah" di JAHE dan "Teh Gula Merah" di TEH) tidak tercampur.
 * Urutan produk masukan dipertahankan.
 */
export function groupProductVariants(products: ProductRow[]): ProductEntry[] {
  const entries: ProductEntry[] = [];
  const byKey = new Map<string, ProductEntry>();

  for (const product of products) {
    const { base, variant } = readVariant(product.name);
    const key = `${product.category_id}:${base.toLowerCase()}`;
    const existing = byKey.get(key);

    // Kalau suhu yang sama sudah terisi, dua produk ini bukan pasangan varian
    // (nama dasarnya kebetulan sama). Biarkan berdiri sendiri daripada
    // memunculkan lembar dengan dua tombol "Panas".
    if (existing && !existing.options.some((o) => o.variant === variant)) {
      existing.options.push({ product, variant });
      existing.minPrice = Math.min(existing.minPrice, product.price);
      existing.maxPrice = Math.max(existing.maxPrice, product.price);
      continue;
    }

    const entry: ProductEntry = {
      key: existing ? product.id : key,
      label: base,
      minPrice: product.price,
      maxPrice: product.price,
      options: [{ product, variant }],
    };
    if (!existing) byKey.set(key, entry);
    entries.push(entry);
  }

  for (const entry of entries) {
    if (entry.options.length > 1) {
      // Panas selalu di kiri supaya posisi tombol tidak berpindah-pindah antar
      // menu — kasir menekan berdasarkan hafalan posisi saat ramai.
      entry.options.sort((a, b) => (a.variant === "panas" ? -1 : 1));
      continue;
    }
    // Hanya satu suhu yang tersedia (mis. "Kopi Cendol S" tanpa versi panas).
    // Namanya dikembalikan utuh supaya kasir tahu ia tidak sedang memilih.
    entry.label = entry.options[0].product.name;
  }

  return entries;
}

export const VARIANT_LABEL: Record<TemperatureVariant, string> = {
  panas: "Panas",
  dingin: "Dingin",
};
```

- [ ] **Step 5: Tandai berkas web sebagai kembaran**

Syarat dari Heika untuk menerima duplikasi ini: **kedua** berkas menyatakan hubungannya.
Berkas mobile sudah memuatnya di Step 4; berkas web belum punya sama sekali.

Di `lib/product-variants.ts`, sisipkan tepat sebelum baris `import { type Product }`:

```ts
// Kembaran berkas ini ada di mobile/lib/product-variants.ts. Keduanya sengaja
// diduplikasi, bukan berbagi satu sumber: Metro tidak mengimpor dari luar
// folder mobile/, dan menyatukannya butuh npm workspace — perubahan struktural
// yang lebih besar daripada logika di berkas ini. Pola yang sama sudah dipakai
// untuk nilai warna antara app/globals.css dan mobile/theme/.
//
// Konsekuensinya: setiap perubahan logika di sini WAJIB diterapkan di sana juga.
// Kalau tidak, kasir melihat isi kartu yang berbeda di web dan di ponsel untuk
// katalog yang sama, dan tidak ada tes yang akan menangkapnya.
```

Jangan mengubah apa pun selain menambahkan komentar ini. Logika berkas web tidak boleh
tersentuh di task ini.

- [ ] **Step 6: Typecheck**

```bash
cd mobile && npm run typecheck
```

Expected: PASS, tanpa keluaran error.

Lalu pastikan aplikasi web tidak ikut rusak oleh penambahan komentar:

```bash
npm run lint
```

Expected: tidak ada error baru pada `lib/product-variants.ts`.

- [ ] **Step 7: Jalankan pemeriksaan di perangkat**

Pastikan Metro jalan dan terowongan USB hidup:

```bash
adb reverse tcp:8081 tcp:8081
adb shell am start -a android.intent.action.VIEW -d "exp://127.0.0.1:8081"
```

Minta Heika menekan **Uji** di header, lalu **Tarik katalog** (kalau katalog lokal kosong), lalu **Uji pengelompokan varian**. Tangkap hasilnya:

```bash
adb shell screencap -p /sdcard/s.png && adb pull /sdcard/s.png
```

Expected: enam baris `OK`, lalu satu baris `info:`.

Baris `info:` **tidak menentukan lulus atau gagal.** Saat rencana ini ditulis, katalog seed
menghasilkan `293 produk → 255 kartu, 38 berpasangan`. Kalau angkanya berbeda sementara
keenam baris `OK` tetap muncul, itu berarti katalognya yang berubah, bukan aturannya —
lanjutkan. Yang menghentikan pekerjaan hanya baris `GAGAL`.

- [ ] **Step 8: Commit**

```bash
git add mobile/lib/product-variants.ts mobile/screens/DebugScreen.tsx lib/product-variants.ts
git commit -m "mobile: kelompokkan varian suhu produk, dengan uji di layar debug"
```

---

### Task 2: Lembar pemilihan suhu

**Files:**
- Create: `mobile/components/VariantSheet.tsx`
- Reference: `mobile/components/Sheet.tsx` (wadah yang dipakai ulang), `components/VariantDialog.tsx` (sumber salinan), `mobile/components/Button.tsx` (tombol Batal)

**Interfaces:**
- Consumes: `ProductEntry` dan `VARIANT_LABEL` dari Task 1; `Sheet` dengan props `{ title, subtitle?, onClose, children, footer? }`.
- Produces: komponen default `VariantSheet` dengan props `{ entry: ProductEntry; onPick: (productId: string) => void; onCancel: () => void }`. Task 3 memakai nama props ini persis.

Komponen ini belum dipakai siapa pun setelah task ini — itu disengaja, supaya perubahan tampilan bisa dilihat dan ditolak terpisah dari perubahan alur.

- [ ] **Step 1: Tulis komponennya**

```tsx
import { Pressable, StyleSheet, Text, View } from "react-native";

import { formatRupiah } from "../lib/types";
import { VARIANT_LABEL, type ProductEntry } from "../lib/product-variants";
import {
  colors,
  radius,
  semantic,
  spacing,
  textStyles,
  touchTarget,
} from "../theme";
import Button from "./Button";
import Sheet from "./Sheet";

interface VariantSheetProps {
  entry: ProductEntry;
  onPick: (productId: string) => void;
  onCancel: () => void;
}

/**
 * Langkah kedua setelah kasir memilih menu: menentukan panas atau dingin.
 *
 * Memakai Sheet yang sama dengan keranjang, bukan overlay baru — aplikasi ini
 * sudah punya satu bentuk dialog, dan bentuk kedua membuat dua hal yang sama
 * terlihat berbeda tanpa alasan.
 *
 * Harga tiap suhu ditampilkan karena sering berbeda, dan kasir kadang perlu
 * menyebutkannya ke pelanggan sebelum menekan.
 */
export default function VariantSheet({
  entry,
  onPick,
  onCancel,
}: VariantSheetProps) {
  return (
    <Sheet
      title={entry.label}
      subtitle="Pilih suhu minuman"
      onClose={onCancel}
      footer={<Button label="Batal" variant="secondary" onPress={onCancel} />}>
      <View style={styles.options}>
        {/* Keduanya netral, tidak ada yang ditandai aksi utama: DESIGN.md
            hanya mengizinkan satu tombol biru per layar, dan di sini tidak ada
            pilihan yang lebih benar dari yang lain. */}
        {entry.options.map(({ product, variant }) => (
          <Pressable
            key={product.id}
            accessibilityRole="button"
            accessibilityLabel={`${VARIANT_LABEL[variant]}, ${formatRupiah(product.price)}`}
            onPress={() => onPick(product.id)}
            style={({ pressed }) => [
              styles.option,
              pressed && styles.optionPressed,
            ]}>
            <Text style={styles.variant}>{VARIANT_LABEL[variant]}</Text>
            <Text style={styles.price}>{formatRupiah(product.price)}</Text>
          </Pressable>
        ))}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  options: {
    flexDirection: "row",
    gap: spacing.md,
    padding: spacing.lg,
  },
  option: {
    flex: 1,
    minHeight: touchTarget.primaryAction,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    padding: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: semantic.border,
    backgroundColor: semantic.surface,
  },
  optionPressed: {
    borderColor: colors.primary[600],
    backgroundColor: colors.primary[50],
  },
  variant: {
    ...textStyles.sectionTitle,
    color: semantic.textPrimary,
  },
  price: {
    ...textStyles.price,
    color: semantic.textSecondary,
  },
});
```

Sebelum menulis, buka `mobile/components/Button.tsx` dan pastikan props `label` / `variant` / `onPress` memang seperti itu. Kalau berbeda, ikuti yang ada di berkas — jangan mengubah `Button`.

- [ ] **Step 2: Typecheck**

```bash
cd mobile && npm run typecheck
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add mobile/components/VariantSheet.tsx
git commit -m "mobile: lembar pilihan suhu minuman"
```

---

### Task 3: Pasang pengelompokan ke grid dan kedua layar

**Files:**
- Modify: `mobile/components/ProductCard.tsx`
- Modify: `mobile/components/ProductGrid.tsx`
- Modify: `mobile/screens/CashierScreen.tsx`
- Modify: `mobile/screens/EditOrderScreen.tsx`

**Interfaces:**
- Consumes: `groupProductVariants`, `ProductEntry` (Task 1); `VariantSheet` (Task 2).
- Produces: `ProductGrid` dengan prop `onSelect: (entry: ProductEntry) => void` menggantikan `onAddItem: (productId: string) => void`.

Keempat berkas berubah dalam satu commit. Memecahnya menghasilkan repo yang tidak lolos typecheck di tengah jalan: mengubah props `ProductCard` langsung mematahkan `ProductGrid`, dan mengubah props `ProductGrid` mematahkan kedua layar.

- [ ] **Step 1: Ubah `ProductCard` menerima satu entry**

Ganti seluruh isi `mobile/components/ProductCard.tsx`:

```tsx
import { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { formatRupiah } from "../lib/types";
import type { ProductEntry } from "../lib/product-variants";
import {
  cashierLayout,
  colors,
  radius,
  semantic,
  spacing,
  textStyles,
} from "../theme";

interface ProductCardProps {
  entry: ProductEntry;
  disabled?: boolean;
  onPress: () => void;
}

/**
 * Kode produk sengaja tidak ditampilkan, mengikuti kartu di aplikasi web.
 * Kartu gabungan punya dua kode ("Coklat" adalah K26 dan K27 sekaligus) dan
 * menampilkan keduanya justru membingungkan.
 *
 * Ini menyimpang dari DESIGN.md, yang menyatakan kasir membaca kode lebih dulu
 * sehingga kode dibuat lebih besar dari nama. Penyimpangan diambil sadar:
 * kolom pencarian tetap menyapu kode, jadi kasir yang hafal kode masih bisa
 * mengetiknya — dan hasil pencarian kode selalu satu produk, sehingga langsung
 * masuk keranjang tanpa lembar suhu.
 *
 * Nama dibatasi tiga baris supaya tinggi kartu seragam; grid dengan tinggi
 * baris berbeda-beda terlihat berantakan dan menyulitkan menyasar jari.
 */
function ProductCardBase({ entry, disabled, onPress }: ProductCardProps) {
  const hasVariants = entry.options.length > 1;
  const price =
    entry.minPrice === entry.maxPrice
      ? formatRupiah(entry.minPrice)
      : // Rentang harga: panas dan dingin sering beda tarif.
        `${formatRupiah(entry.minPrice)}+`;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        hasVariants
          ? `${entry.label}, mulai ${formatRupiah(entry.minPrice)}, tersedia panas dan dingin`
          : `${entry.label}, ${formatRupiah(entry.minPrice)}`
      }
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.card,
        pressed && styles.cardPressed,
        disabled && styles.cardDisabled,
      ]}>
      <Text style={styles.name} numberOfLines={3}>
        {entry.label}
      </Text>

      <View style={styles.footer}>
        <Text style={styles.price}>{price}</Text>
        {hasVariants ? (
          <View style={styles.variantTag}>
            <Text style={styles.variantTagLabel}>Panas/Dingin</Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

/**
 * Di-memo karena grid produk bisa berisi ratusan kartu dan induknya menulis
 * ulang state tiap kali keranjang berubah. Tanpa ini, menambah satu item
 * merender ulang seluruh grid.
 */
export default memo(ProductCardBase);

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minHeight: cashierLayout.productCardMinHeight,
    justifyContent: "space-between",
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: semantic.border,
    backgroundColor: semantic.surface,
  },
  cardPressed: {
    borderColor: colors.primary[600],
    backgroundColor: colors.primary[50],
  },
  cardDisabled: {
    opacity: 0.5,
  },
  name: {
    ...textStyles.bodyStrong,
    color: semantic.textPrimary,
  },
  footer: {
    marginTop: spacing.sm,
    gap: spacing.xs,
  },
  price: {
    ...textStyles.price,
    color: semantic.textPrimary,
  },
  variantTag: {
    alignSelf: "flex-start",
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
    backgroundColor: colors.primary[50],
  },
  variantTagLabel: {
    ...textStyles.statusBadge,
    fontSize: 10,
    color: colors.primary[600],
  },
});
```

Kalau `colors.primary[50]` atau `colors.primary[600]` tidak ada di `mobile/theme/colors.ts`, pakai nama yang benar-benar ada di sana — jangan menambah warna baru.

- [ ] **Step 2: Ubah `ProductGrid` mengelompokkan lalu melaporkan entry**

Di `mobile/components/ProductGrid.tsx`, ganti impor, props, dan `renderItem`:

```tsx
import { useCallback, useMemo } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";

import { useLayoutMode } from "../lib/use-layout-mode";
import {
  groupProductVariants,
  type ProductEntry,
} from "../lib/product-variants";
import type { ProductRow } from "../db/types";
import { cashierLayout, semantic, spacing, textStyles } from "../theme";
import ProductCard from "./ProductCard";

interface ProductGridProps {
  products: ProductRow[];
  disabled?: boolean;
  emptyHint: string;
  onSelect: (entry: ProductEntry) => void;
}
```

Di dalam komponen, tambahkan pengelompokan dan ganti `renderItem`:

```tsx
  // Daftar produk berubah tiap kali kategori atau pencarian berubah.
  // Mengelompokkan 293 baris di setiap render adalah persis jenis latensi yang
  // menjegal penarikan katalog di langkah 3.
  const entries = useMemo(() => groupProductVariants(products), [products]);

  const renderItem = useCallback(
    ({ item }: { item: ProductEntry }) => (
      <ProductCard
        entry={item}
        disabled={disabled}
        onPress={() => onSelect(item)}
      />
    ),
    [disabled, onSelect]
  );
```

Ganti pemeriksaan kosong dan `FlatList` supaya memakai `entries`:

```tsx
  if (entries.length === 0) {
```

```tsx
      data={entries}
      keyExtractor={(item) => item.key}
```

Prop `key` untuk remount saat jumlah kolom berubah, `numColumns`, `columnWrapperStyle`,
`contentContainerStyle`, `keyboardShouldPersistTaps`, dan `removeClippedSubviews={false}`
**tidak berubah** — semuanya sudah diputuskan atas alasan yang masih berlaku.

- [ ] **Step 3: Pasang di `CashierScreen`**

Tambahkan impor:

```tsx
import VariantSheet from "../components/VariantSheet";
import type { ProductEntry } from "../lib/product-variants";
```

Tambahkan state, di sebelah `cartOpen`:

```tsx
  const [variantEntry, setVariantEntry] = useState<ProductEntry | null>(null);
```

Tambahkan penangan di sebelah `addProduct` yang sudah ada (`addProduct` **tidak diubah** — ia tetap menerima `productId`):

```tsx
  // Satu suhu berarti tidak ada yang perlu ditanyakan; kasir menekan sekali
  // seperti sebelumnya. Lembar hanya muncul kalau memang ada pilihan.
  const selectEntry = useCallback((entry: ProductEntry) => {
    if (entry.options.length === 1) {
      addProduct(entry.options[0].product.id);
      return;
    }
    setVariantEntry(entry);
  }, [addProduct]);
```

Ganti pemakaian `ProductGrid` — ada di dalam `grid`, cari `onAddItem={` dan ganti jadi `onSelect={selectEntry}`.

Render lembarnya. Letakkan bersebelahan dengan lembar keranjang yang sudah ada, di **kedua** cabang (ponsel dan tablet), atau di luar percabangan supaya ditulis sekali:

```tsx
      {variantEntry ? (
        <VariantSheet
          entry={variantEntry}
          onPick={(productId) => {
            addProduct(productId);
            setVariantEntry(null);
          }}
          onCancel={() => setVariantEntry(null)}
        />
      ) : null}
```

- [ ] **Step 4: Pasang di `EditOrderScreen`**

Perlakuan yang sama. Tanpa ini, menambah item ke order yang sudah ada akan diam-diam memasukkan varian panas.

Perhatikan `handleAdd` di berkas ini (baris 80-91): selain menambah item, ia juga memanggil
`setAdding(false)` dan `setSearch("")` — panel tambah item ikut tertutup. Karena itu
`selectEntry` **tidak boleh** memanggil `handleAdd` saat entry punya dua suhu; kalau
dipanggil, panelnya tertutup sebelum kasir sempat memilih.

Impor:

```tsx
import VariantSheet from "../components/VariantSheet";
import type { ProductEntry } from "../lib/product-variants";
```

State, di sebelah `voidReason`:

```tsx
  const [variantEntry, setVariantEntry] = useState<ProductEntry | null>(null);
```

Penangan, tepat di bawah `handleAdd`:

```tsx
  // Lembar suhu dibuka tanpa menyentuh handleAdd, karena handleAdd juga menutup
  // panel tambah item. Panel baru boleh tertutup setelah suhu dipilih.
  const selectEntry = (entry: ProductEntry) => {
    if (entry.options.length === 1) {
      handleAdd(entry.options[0].product.id);
      return;
    }
    setVariantEntry(entry);
  };
```

Ganti pemakaian grid di baris 216-219:

```tsx
            <ProductGrid
              products={visibleProducts}
              onSelect={selectEntry}
```

Pertahankan prop lain yang sudah ada di sana (`emptyHint`, `disabled`, dan sebagainya) apa
adanya — hanya `onAddItem` yang diganti.

Render lembarnya, sejajar dengan lembar lain di layar ini:

```tsx
      {variantEntry ? (
        <VariantSheet
          entry={variantEntry}
          onPick={(productId) => {
            setVariantEntry(null);
            handleAdd(productId);
          }}
          onCancel={() => setVariantEntry(null)}
        />
      ) : null}
```

- [ ] **Step 5: Typecheck**

```bash
cd mobile && npm run typecheck
```

Expected: PASS. Kalau masih ada `onAddItem` tersisa, typecheck yang akan menemukannya.

- [ ] **Step 6: Lihat di perangkat**

Muat ulang, buka tab Kasir, pilih kategori MILKY.

```bash
adb shell screencap -p /sdcard/s.png && adb pull /sdcard/s.png
```

Expected: kartu bernama tanpa akhiran suhu, harga berakhiran `+`, penanda `Panas/Dingin`. Minta Heika menekan `Coklat`; lembar muncul berisi Panas 17.000 dan Dingin 20.000.

- [ ] **Step 7: Commit**

```bash
git add mobile/components/ProductCard.tsx mobile/components/ProductGrid.tsx mobile/screens/CashierScreen.tsx mobile/screens/EditOrderScreen.tsx
git commit -m "mobile: satu kartu per menu, suhu dipilih setelah kartu ditekan"
```

---

### Task 4: Verifikasi menyeluruh di perangkat dan catatan

**Files:**
- Modify: `MIGRATION.md`
- Modify: `mobile/README.md`

**Interfaces:**
- Consumes: seluruh hasil Task 1-3.
- Produces: tidak ada kode.

- [ ] **Step 1: Jalankan sepuluh langkah verifikasi spesifikasi**

Seluruhnya di perangkat, dibantu Heika untuk sentuhan. Urutannya ada di bagian **Verifikasi** pada `docs/superpowers/specs/2026-07-30-varian-suhu-produk-design.md`. Yang paling mudah terlewat dan paling mahal kalau salah:

- Menambah item lewat `EditOrderScreen` juga menampilkan lembar suhu (langkah 7).
- Order yang dibuat lewat alur ini terkirim dan diterima server dengan total yang cocok (langkah 10) — ini yang membuktikan `productId` asli benar-benar terkirim, bukan hasil pengelompokan.
- Menggulir 255 kartu tetap mulus (langkah 9). `MIGRATION.md` mencatat dua kali bahwa lapisan ini gagal lewat latensi, bukan pengecualian.

- [ ] **Step 2: Catat di `MIGRATION.md`**

Tambahkan di bagian langkah 5, setelah paragraf tentang tata letak tegak:

```markdown
**Varian suhu digabung jadi satu kartu.** Panas dan dingin tetap dua produk terpisah di
database — kode dan harga sendiri-sendiri, dan laporan memang perlu membedakannya — tapi di
grid keduanya jadi satu kartu, dan suhunya ditanyakan setelah kartu ditekan. Logikanya
disalin dari `lib/product-variants.ts` milik web, bukan ditulis ulang: penanda suhunya tidak
seragam (kategori Kopi memakai akhiran "S" untuk dingin dan tanpa akhiran untuk panas), dan
implementasi yang menganggap hanya ada "Panas"/"Dingin" gagal menggabungkan delapan kartu
kategori Kopi tanpa memunculkan satu pun error. Kedua berkas itu sekarang harus berubah
bersama, sama seperti `db/orders.ts` dengan RPC Postgres.

Konsekuensinya, **kode produk hilang dari kartu** — satu kartu gabungan punya dua kode.
Ini menyimpang dari `DESIGN.md`, yang membesarkan kode karena kasir membacanya lebih dulu.
Diambil sadar: kolom pencarian tetap menyapu kode, dan mencari lewat kode selalu
menghasilkan satu produk sehingga langsung masuk keranjang tanpa lembar suhu.
```

- [ ] **Step 3: Catat di `mobile/README.md`**

Sisipkan setelah bagian "Local database (`db/`)":

```markdown
## Varian suhu (`lib/product-variants.ts`)

Salinan `lib/product-variants.ts` milik aplikasi web, bukan implementasi terpisah. Panas dan
dingin tetap dua produk di database; penggabungan hanya terjadi di layar, dan `productId`
yang masuk keranjang selalu produk aslinya.

Penanda suhu di menu tidak seragam — kategori Kopi memakai akhiran "S" untuk dingin dan
tanpa akhiran untuk panas, sisanya memakai "Panas"/"Dingin". Baca komentar di berkas
sumbernya sebelum mengubah apa pun di sini, dan ubah kedua berkas bersamaan.

Verifikasinya ada di layar **Uji** → **Uji pengelompokan varian**: 255 kartu, 38 di
antaranya berpasangan. Kalau angka itu berubah tanpa katalog berubah, aturan akhirannya
rusak.
```

- [ ] **Step 4: Commit**

```bash
git add MIGRATION.md mobile/README.md
git commit -m "docs: catat penggabungan varian suhu dan penyimpangan kode produk"
```

---

## Catatan untuk pelaksana

**Yang tidak boleh dilakukan:**

- Jangan menyentuh `mobile/db/`. Pengelompokan ini murni tampilan; begitu ia masuk ke lapisan basis data, `productId` yang tersimpan bisa berbeda dari yang dipilih kasir.
- Jangan "merapikan" regex akhiran. `/\s+(panas|dingin|es|s)$/i` sengaja mengenali `s` sebagai kata terpisah. Mengubahnya jadi `/s$/` akan memotong "Kopi Milo Susu" jadi "Kopi Milo Susu" tanpa huruf terakhir, dan tidak ada yang menyadarinya sampai kasir mengeluh.
- Jangan menambah jest atau library tes. Kalau merasa butuh, hentikan dan tanya Heika — itu keputusan dependensi tersendiri.
- Jangan mengubah `mobile/components/Sheet.tsx` maupun `Button.tsx`. Kalau props-nya tidak cocok dengan contoh di rencana ini, contoh di rencana ini yang salah; ikuti berkasnya.
