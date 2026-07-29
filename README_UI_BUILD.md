# Rusen Kopitiam POS — Implementation Notes

Gabungan dari `README_UI_BUILD.md` (build UI awal) dan `LOGIN_PAGE_REDESIGN.md`
(desain halaman login). Kedua dokumen itu ditulis pada fase **UI-first dengan mock
data**; isinya di sini sudah disamakan dengan keadaan kode saat ini — Supabase,
sesi cookie, PIN 6 digit. Riwayat perubahannya ada di [Changelog](#-changelog).

**Spesifikasi sumber:** `AGENTS.md` (urutan build & batasan Next.js 16),
`PRODUCT.md` (spesifikasi produk & ERD), `DESIGN.md` (spesifikasi visual).

---

## 🎯 Ikhtisar

POS satu outlet untuk warung kopi, dipakai di tablet Android landscape.
Dibangun UI dulu (menyimpang dari urutan di AGENTS.md) untuk memvalidasi alur
interaksi dengan cepat, lalu **mock data diganti Postgres/Supabase**.

Prinsip yang mengikat seluruh kode:

| Topik | Keputusan |
|---|---|
| Akses DB | **Server-only.** Browser tidak pernah memegang key Supabase. Semua query lewat Server Action dengan `service_role`. |
| Sesi | Cookie httpOnly bertanda tangan berisi `employee_id` + `role`. PIN diverifikasi bcrypt di server. |
| RLS | Aktif tanpa policy sebagai jaring pengaman (`service_role` bypass — disengaja). |
| Realtime | **Tidak dipakai.** Polling / refresh manual. |
| Offline | **Ditunda**, skema disiapkan: UUID dari klien, `client_created_at`, operasi idempoten. |
| Uang | `bigint` rupiah utuh — IDR tidak punya satuan pecahan. |
| Zona waktu | `Asia/Jakarta` untuk semua pengelompokan tanggal. |

---

## ✅ Yang Sudah Ada

### Halaman

1. **Login** (`/login`) — keypad PIN 6 digit, tema gelap. Detail desain di
   [bagian Login](#-halaman-login--soft-ui-evolution).
2. **Kasir** (`/cashier`) — 3 kolom sesuai DESIGN.md: sidebar kategori · pencarian +
   grid produk · keranjang. Keranjang hidup di klien sampai "Simpan Order" — satu
   tulisan per order, bukan per ketukan.
3. **Daftar Order** (`/orders`) — antrean order belum lunas, pelunasan, edit, cetak struk.
4. **Histori** (`/history`) — order yang sudah selesai.

### Komponen

| Berkas | Peran |
|---|---|
| `NavHeader.tsx` | Navbar biru, tombol putih berteks biru |
| `CategorySidebar.tsx` | Daftar kategori, sorotan dark-neutral (bukan biru) |
| `ProductGrid.tsx` | Grid 3 kolom + pengelompokan varian suhu + state dialog |
| `ProductCard.tsx` | Kartu menu: nama besar, harga, label "Panas / Dingin" |
| `VariantDialog.tsx` | Pilihan panas/dingin beserta harga masing-masing |
| `DraftCart.tsx` | Keranjang berjalan, qty, catatan, tombol simpan |
| `TableConflictDialog.tsx` | Konfirmasi kode meja kembar: pelanggan sama / berbeda |
| `OrdersTable.tsx` | Tabel antrean + tombol Edit / Cetak Struk / Pelunasan |
| `PaymentModal.tsx` | Pelunasan cash / non-cash, hitung kembalian |
| `EditOrderModal.tsx` | Tambah item & batalkan item (masuk laporan void) |
| `Receipt.tsx` | Struk thermal 72mm, di-portal ke `<body>` |
| `Toast.tsx` | `ToastProvider` + `useToast()` — notifikasi berhasil/gagal |

### Arah Desain (per DESIGN.md)

✅ **Warna**
- Aksen utama: biru `#2563eb` — **hanya** untuk tombol aksi utama
- Kategori terpilih: dark neutral, sengaja bukan biru (lihat [alasannya](#kenapa-kategori-terpilih-dark-neutral-bukan-biru))
- Status: amber (pending) → teal (lunas) → merah tua (void)
- Latar: putih / netral terang `#f8fafc`. Tanpa gradien, tanpa bayangan berlebihan.

✅ **Tipografi** — Poppins global, Inter khusus halaman login (`next/font/google`)

✅ **Sentuhan (tablet Android)** — target tap minimal 44×44px, layout landscape,
satu aksi utama per status supaya kasir tidak salah pencet saat ramai

✅ **Rupiah** — `formatRupiah()` di `lib/types.ts` untuk semua harga

---

## 🏗️ Arsitektur

### Tech Stack

- **Next.js 16.2.12** (App Router, Turbopack) + React 19.2.4 + TypeScript 5.9.3
- **Tailwind CSS v4** — dikonfigurasi di CSS, **tidak ada** `tailwind.config.ts`
- **Supabase / PostgreSQL 17** — `@supabase/supabase-js`, akses `service_role` server-only
- **Auth** — `bcryptjs` + `jose` (tanda tangan cookie), `server-only` sebagai pagar build

### Batasan Next.js 16 yang wajib dipatuhi

Diverifikasi dari `node_modules/next/dist/docs/` sesuai mandat `AGENTS.md`:

- `params`, `searchParams`, `cookies()`, `headers()` **semuanya async**
- `middleware.ts` **deprecated** → `proxy.ts` di root yang mengekspor fungsi `proxy`
- Server Actions dikirim berurutan per klien — jangan andalkan `Promise.all` dari klien
- `revalidateTag` butuh argumen kedua: `revalidateTag("orders", "max")`
- Setiap export di berkas `"use server"` harus async
- `next lint` sudah dihapus → pakai `eslint` langsung

### Peta Berkas

```
app/
  layout.tsx           → Poppins + Inter, <ToastProvider>
  page.tsx             → redirect ke /login
  globals.css          → @theme (token Tailwind v4) + aturan @media print
  login/page.tsx       → keypad PIN (client)
  login/actions.ts     → Server Action: bcrypt.compare + set cookie
  cashier/page.tsx     → Server Component, baca kategori & produk
  orders/page.tsx      → Server Component, baca antrean
  history/page.tsx     → Server Component, baca order selesai

components/            → lihat tabel di atas

lib/
  types.ts             → tipe murni + PIN_LENGTH + formatRupiah + tableLabel
  queries.ts           → baca (server-only)
  order-actions.ts     → Server Actions tulis
  product-variants.ts  → pengelompokan varian panas/dingin
  session.ts           → buat/baca/hapus sesi cookie
  session-token.ts     → tanda tangan & verifikasi JWT (jose)
  rpc-errors.ts        → terjemahan kode galat RPC ke pesan Indonesia
  supabase/server.ts   → klien service_role, diawali import "server-only"

supabase/
  migrations/0001_init.sql     → skema, RPC transaksi, RLS
  migrations/0002_reports.sql  → RPC laporan (dashboard & void)
  seed.sql                     → 4 pegawai, 23 kategori, 293 produk

proxy.ts               → gerbang sesi (pengganti middleware.ts)
```

### Basis Data

Tabel inti: `outlets`, `employees`, `categories`, `products`, `orders`, `order_items`,
`order_item_voids`, `payments`.

**Kolom snapshot wajib.** `order_items` menyimpan `product_code`, `product_name`, dan
`unit_price` saat transaksi. Kalau harga Cappuccino naik bulan depan, struk dan laporan
bulan lalu tidak boleh ikut berubah. Ini juga membuat halaman histori tidak perlu join
ke `products` sama sekali.

**Operasi atomik ditulis sebagai RPC**, bukan TypeScript, supaya penguncian baris dan
penulisan multi-tabel terjadi dalam satu transaksi:

| RPC | Guna |
|---|---|
| `check_table_code` | Cek order pending pada kode meja yang sama, sebelum menulis apa pun |
| `create_order` | Insert order + item, harga diambil dari tabel `products` (**tidak** percaya klien) |
| `append_to_order` | Tambah item ke order pending; tolak kalau `version` tidak cocok (`STALE_ORDER`) |
| `void_order_item` | **Satu-satunya** jalan mengurangi item; selalu menulis jejak ke `order_item_voids` |
| `pay_order` | `for update` + idempoten; total selalu dihitung ulang dari `order_items` |

---

## 🔐 Halaman Login — Soft UI Evolution

Desain: **Soft UI Evolution** (ui-ux-pro-max), pola Minimal Single Column.

### PIN

`PIN_LENGTH = 6` dikunci di `lib/types.ts` dan dipakai bersama oleh keypad maupun
validasi server; jumlah kotak indikator ikut otomatis. PIN **tidak pernah disimpan
plaintext** — `employees.pin_hash` berisi hash bcrypt, dibandingkan di server.

PIN uji coba dari `supabase/seed.sql` (**ganti sebelum dipakai di outlet**):

```
Budi    123456  cashier
Siti    567890  cashier
Ahmad   999999  manager
Owner   000000  owner
```

> Panel "Test PINs" yang dulu tampil di bawah kartu login **sudah dihapus** — ia
> memperlihatkan PIN seluruh pegawai kepada siapa pun yang membuka halaman.

### Palet & Tipografi

| Elemen | Warna | Hex | Guna |
|---|---|---|---|
| Primary | Dark Blue | `#1E3A5F` | Header, brand, focus |
| Accent (CTA) | Green | `#059669` | Tombol login, indikator PIN terisi |
| Background | Very Dark | `#0F172A` | Latar halaman |
| Muted | Dark Slate | `#10192E` | Elemen nonaktif |
| Border | White 8% | `rgba(255,255,255,0.08)` | Pembatas lembut |

Font **Inter** (halaman lain memakai Poppins): header 24px bold, label 14px,
numpad 18px semibold, caption 12px.

### Susunan

```
┌─────────────────────────────────────────┐
│  💳 Rusen Kopitiam                      │  ← ikon + brand (primary blue)
│     Point of Sale System                │  ← subjudul (muted)
│  ┌─────────────────────────────────────┐│
│  │ Masukkan PIN 6 digit                ││
│  │ ● ● ○ ○ ○ ○                         ││  ← hijau saat terisi
│  │ ┌───┬───┬───┐                       ││
│  │ │ 1 │ 2 │ 3 │                       ││
│  │ ├───┼───┼───┤                       ││
│  │ │ 4 │ 5 │ 6 │                       ││
│  │ ├───┼───┼───┤                       ││
│  │ │ 7 │ 8 │ 9 │                       ││
│  │ ├───────────┤                       ││
│  │ │     0     │                       ││
│  │ ├───┬───────┤                       ││
│  │ │BS │ Clear │                       ││
│  │ └───┴───────┘                       ││
│  │      [  Login →  ]                  ││  ← CTA hijau
│  └─────────────────────────────────────┘│
└─────────────────────────────────────────┘
```

### Alur Teknis

- `app/login/page.tsx` — Client Component (keypad butuh interaksi). Dukungan keyboard
  0-9, Backspace, Enter. Spinner saat memproses.
- `app/login/actions.ts` — Server Action: cari pegawai `active` → `bcrypt.compare` →
  buat cookie sesi httpOnly → `redirect("/cashier")`.
  Pesan galat **generik** ("PIN tidak dikenali") supaya tidak membocorkan pegawai mana
  yang ada.
- `proxy.ts` — memverifikasi cookie; `/cashier`, `/orders`, `/history` dialihkan ke
  `/login` bila belum masuk.

**Belum ada:** rate limit percobaan login. Rencananya kunci 30 detik setelah 5 kali gagal.

### Aksesibilitas

- Kontras teks putih di `#0F172A` ≈ 20:1 (WCAG AAA)
- `prefers-reduced-motion` dihormati di `globals.css`
- Focus ring terlihat, HTML semantik, target sentuh ≥44px

---

## 🚀 Cara Menjalankan

```bash
npm install

# Postgres lokal (butuh Docker berjalan)
npx supabase start
npx supabase db reset      # migrasi + seed: 4 pegawai, 23 kategori, 293 produk

npm run dev                # http://localhost:3000
```

Env di `.env.local` (contoh ada di `.env.example`). Perhatikan **tidak ada awalan
`NEXT_PUBLIC_`** — browser memang tidak pernah menyentuh Supabase:

```
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
SESSION_SECRET=            # ≥32 byte acak
```

Build produksi: `npm run build && npm run start`

---

## 🎮 Memakai Layar Kasir

1. Login dengan PIN 6 digit
2. Pilih kategori di sidebar, **atau** ketik kata kunci di kolom **Cari Produk**
   (pencarian menyapu seluruh 293 menu, kategori diabaikan)
3. Ketuk kartu menu → kalau menu punya versi panas & dingin, muncul dialog pilih suhu
4. Isi **Kode Meja / Order** (bebas: `A3`, `B7`, `12`)
5. **Simpan Order** → kalau kode meja itu sudah punya order belum lunas, muncul dialog:
   *pelanggan sama* (item digabung) atau *pelanggan berbeda* (order baru, tampil `A3 (2)`)
6. Di **Daftar Order**: **Edit** (tambah / batalkan item), **Cetak Struk**, **Pelunasan**

### Daur Hidup Order

```
Keranjang (klien) → Simpan → pending → Pelunasan → paid
                               │
                               ├─ Edit: tambah item (append_to_order)
                               └─ Edit: batalkan item (void_order_item → laporan void)
```

Order yang sudah `paid` tidak bisa diedit. Pembatalan item **selalu** tercatat di
`order_item_voids` — tidak ada jalur lain yang boleh menghapus baris `order_items`,
supaya laporan void tidak pernah bolong.

---

## ✨ Keputusan Desain & Alasannya

### Kenapa satu tombol utama per status?

Aturan DESIGN.md: jangan tampilkan lebih dari satu tombol aksi utama sekaligus, supaya
kasir tidak salah pencet saat ramai. Di `OrdersTable`, hanya **Pelunasan** yang berwarna
biru; Edit dan Cetak Struk netral.

### Kenapa kategori terpilih dark neutral, bukan biru?

Biru sudah dipesan untuk tombol aksi utama. Kalau kategori terpilih juga biru, mata tidak
bisa membedakan "ini tombol" dan "ini status" dalam sekali lihat.

### Kenapa kode produk dihapus dari kartu?

Dokumen asli menaruh kode produk lebih besar dari namanya ("kasir membaca kode dulu").
Dengan 293 menu asli, kode seperti `R041` atau `KPSGS` ternyata tidak membantu — kasir
mengingat nama. Kartu kini menampilkan nama dengan ukuran besar; kode tetap bisa dicari
lewat kolom pencarian.

### Kenapa panas/dingin digabung jadi satu kartu?

Di database keduanya produk terpisah dengan harga sendiri — itu benar untuk pencatatan,
tapi memaksa kasir memindai dua kartu untuk satu menu. Kategori MILKY saja punya 28 kartu.
Digabung jadi satu kartu, suhunya ditanyakan setelah ditekan. Detail aturan penanda suhu
ada di [changelog](#-changelog).

### Kenapa notifikasi gagal tidak hilang sendiri?

Notifikasi sukses hilang setelah 3 detik. Notifikasi **gagal** harus ditutup manual —
kasir perlu membaca penyebabnya, dan pesan yang lenyap sendiri mudah terlewat saat sibuk.

### Kenapa struk di-portal ke `<body>`?

Aturan cetak menyembunyikan seluruh anak `<body>` selain struk dengan `display: none`.
Dengan `visibility: hidden`, layout tetap memakan ruang dan `min-h-screen` akan
menyisakan halaman kosong di belakang struk.

### Target sentuh 44×44px

Standar minimum WCAG untuk perangkat sentuh. Berlaku untuk tombol, kartu produk, dan
kontrol qty.

---

## 🎨 Tailwind v4

Proyek ini memakai **Tailwind CSS v4**, dikonfigurasi di CSS. **Tidak ada**
`tailwind.config.ts`, dan menambahkannya kembali tidak berpengaruh kecuali dimuat
eksplisit dengan `@config`.

Token ada di blok `@theme` pada `app/globals.css`:

```css
@import "tailwindcss";

@theme {
  --color-primary-600: #2563eb;        /* -> bg-primary-600, text-primary-600 */
  --color-status-pending: #f59e0b;
  --color-status-paid: #0f766e;
  --color-status-void: #7f1d1d;
  --color-login-bg: #0f172a;
  --color-login-primary: #1e3a5f;
  --color-login-accent: #059669;
  --color-login-muted: #10192e;
}
```

Setiap `--color-<name>` otomatis menghasilkan `bg-<name>`, `text-<name>`,
`border-<name>`, dan varian opasitas `bg-<name>/20`. Ubah warna cukup di sini.

**Jebakan:** sintaks v3 (`@tailwind base;` + config JS) diam-diam setengah jalan di v4.
Utilitas struktural seperti `flex` tetap terkompilasi, tapi semua yang digerakkan
variabel tema (`bg-*`, `p-*`, `text-3xl`, `rounded-lg`, `shadow-*`) hilang, sehingga
halaman tampak nyaris tanpa gaya. Kalau itu terjadi, pastikan `globals.css` diawali
`@import "tailwindcss";`.

---

## 🖨️ Cetak Struk

Struk 72mm (menyesuaikan printer thermal 80mm yang lazim dipakai warung), dirender oleh
`components/Receipt.tsx` dan hanya muncul saat mencetak:

```css
@media print {
  body { background: #fff; }
  body > *:not(#receipt-print) { display: none !important; }
  #receipt-print { display: block !important; width: 72mm; color: #000; }
  @page { margin: 4mm; }
}
```

- `window.print()` dipanggil di `useEffect` **setelah** struk ter-render, bukan di `onClick`
- Order belum lunas dicetak bertanda `** BELUM LUNAS **` supaya tidak dikira bukti bayar
- Teks notifikasinya netral ("dikirim ke printer") karena browser tidak memberi tahu
  apakah dialog cetak dikonfirmasi atau dibatalkan
- **Belum diuji di printer thermal sungguhan** — baru dipastikan lolos build

---

## 🧪 Verifikasi

### Uji Alur

1. Login dengan PIN seed → pastikan cookie httpOnly terbentuk dan `sessionStorage` kosong
2. Buat order meja "A3" berisi 2 item → cek `orders`/`order_items`, `product_name`
   ter-snapshot → lunasi cash dengan nominal berlebih → `change_amount` benar,
   `status = 'paid'`, ada baris di `payments`
3. **Idempoten:** panggil `pay_order` dua kali → panggilan kedua mengembalikan order yang
   sama tanpa membuat baris `payments` kedua
4. **Harga snapshot:** ubah harga produk setelah order lunas → angka di `/history` tetap
5. **Auth:** buka `/orders` tanpa login → dialihkan `proxy.ts`
6. **Kode meja kembar:** simpan "A3" dua kali → dialog muncul; "Pelanggan Sama" menggabung,
   "Pelanggan Berbeda" memunculkan baris `A3 (2)`
7. **Edit + void:** tambah 1 item lalu batalkan 1 item dengan alasan → total berkurang,
   ada baris di `order_item_voids`, `version` naik dua kali
8. **Optimistic lock:** buka `EditOrderModal` di dua tab, submit keduanya → tab kedua
   menampilkan "Order sudah berubah", bukan menimpa diam-diam

### Checklist Login

- [ ] Ketik 1-9 via numpad atau keyboard; tombol 0 selebar penuh
- [ ] Backspace menghapus digit terakhir; Clear mengosongkan semua
- [ ] Enter mengirim (atau klik Login)
- [ ] Login dengan 123456 / 567890 / 999999 / 000000
- [ ] PIN salah menampilkan pesan generik
- [ ] Berhasil → diarahkan ke `/cashier`

### Yang Sudah Ditangani

- ✅ Kode meja/order kosong atau keranjang kosong ditolak dengan notifikasi
- ✅ Order `paid` tidak bisa diedit
- ✅ Tombol nonaktif selama proses simpan/bayar
- ✅ Pesan kosong saat keranjang atau hasil pencarian nihil
- ✅ `STALE_ORDER` ditampilkan sebagai "Order sudah berubah, muat ulang"

---

## 📱 Perilaku Responsif

- **Tablet landscape (target):** 3 kolom penuh
- **Tablet portrait:** grid menyusut, sidebar bisa menumpuk
- **Ponsel:** tidak dioptimalkan (POS = perangkat tablet, sesuai brief)

---

## 📋 Langkah Berikutnya

1. **Rate limit login** — kunci 30 detik setelah 5 kali gagal. Belum ada.
2. **Fase 5 — Dashboard** (`/dashboard`, owner & manager): KPI omzet/transaksi/rata-rata
   per struk dengan pembanding periode sebelumnya, tren omzet (**SVG buatan sendiri,
   tanpa library chart**), kontribusi kategori, produk terlaris. RPC-nya sudah ada di
   `0002_reports.sql`. Jangan aktifkan `cacheComponents` — halaman ini membaca cookie
   *dan* `searchParams`.
3. **Fase 6 — Laporan Void** (`/dashboard/void`): datanya sudah terkumpul sejak migrasi,
   tinggal lapisan tampilan. Catatan: nilai void **tidak** dikurangkan dari omzet — item
   yang di-void tidak pernah tertagih. Yang dikurangkan hanya refund.
4. **Cetak ESC/POS** — uji di printer thermal sungguhan, sesuaikan lebar bila meleset.
5. **Offline-first** — IndexedDB + antrean sinkron. Skema DB sudah disiapkan
   (UUID dari klien, `client_created_at`, RPC idempoten).

---

## 🛠️ Catatan Pengembangan

**Styling** — seluruhnya utility class Tailwind, tanpa CSS module atau SCSS. Ubah warna
di blok `@theme`, lalu restart dev server.

**State** — `useState` untuk state lokal. Keranjang sengaja tidak disinkronkan ke server
sebelum "Simpan Order". Belum perlu state library.

**Aplikasi tidak jalan?**
- Pastikan Docker berjalan sebelum `npx supabase start`
- Port 3000 terpakai? Next.js akan mencoba 3001, 3002, dst.
- Hapus `.next`: `rm -rf .next && npm run dev`

**Galat `permission denied for table ...`** — biasanya bukan RLS, melainkan GRANT
tingkat tabel yang belum diberikan pada migrasi.

**`.env.local` tidak terbaca** — PowerShell 5.1 `Out-File -Encoding utf8` menulis BOM
UTF-8 yang membuat baris pertama tidak terparse. Tulis ulang dengan
`[System.IO.File]::WriteAllText` + `UTF8Encoding($false)`.

---

## 🎯 Validasi Terhadap Spesifikasi

**DESIGN.md** — ✅ layout 3 kolom · ✅ biru hanya untuk aksi utama · ✅ kategori terpilih
dark-neutral · ✅ warna status semantik · ✅ Poppins global · ✅ landscape & touch-sized ·
✅ satu aksi utama per status · ✅ format rupiah · ✅ flat, tanpa gradien

**PRODUCT.md** — ✅ alur kasir lengkap sampai cetak struk · ✅ peran cashier/manager/owner ·
✅ skema mengikuti ERD · ✅ status pending/paid/void · ✅ catatan per item · ✅ manajemen qty ·
✅ jejak pegawai di setiap baris yang mencatat aksi · ✅ PIN 6 digit

**ui-ux-pro-max (halaman login)** — ✅ Soft UI Evolution · ✅ Minimal Single Column ·
✅ Inter · ✅ transisi 150–300ms · ✅ target 44×44px · ✅ kontras WCAG AAA · ✅ dark mode

---

## 📝 Changelog

Terbaru di atas.

### 2026-07-29 — Varian suhu panas/dingin jadi dua langkah

**Masalah:** panas dan dingin adalah dua produk terpisah di database, sehingga kasir
harus memindai dua kartu untuk satu menu.

- **Baru** `lib/product-variants.ts` — `groupProductVariants()` menggabungkan produk yang
  namanya hanya beda penanda suhu menjadi satu entri tampilan.
- **Baru** `components/VariantDialog.tsx` — dialog **Panas / Dingin**, masing-masing dengan
  harganya sendiri karena sering berbeda.
- **Ubah** `ProductCard.tsx` — menerima `ProductEntry`, bukan `Product`. Menampilkan nama
  dasar ("Coklat"), label kecil "Panas / Dingin", dan harga terendah bertanda `+`.
- **Ubah** `ProductGrid.tsx` — jadi `"use client"`, melakukan pengelompokan dan menyimpan
  state dialog. Produk yang hanya punya satu suhu **melewati** dialog.
- **Ubah** `EditOrderModal.tsx` — memakai `ProductGrid` yang sama. Efek samping: kode
  produk tidak lagi tampil di kartu modal edit.

**Aturan penanda suhu** (tidak seragam di daftar menu asli):

| Akhiran nama | Ditafsirkan | Contoh |
|---|---|---|
| `Panas` | panas | Coklat Panas |
| `Dingin` | dingin | Coklat Dingin |
| `S` / `Es` (kata terpisah) | dingin | Kopi Susu S, Kopi Milo Susu Es |
| tanpa akhiran | kandidat panas | Kopi, Kopi Cha |

Kunci grup menyertakan `categoryId` supaya nama mirip di kategori berbeda tidak tercampur.
Kalau dua produk punya nama dasar **dan** suhu yang sama, keduanya sengaja tidak digabung —
lebih baik dua kartu daripada dialog dengan dua tombol "Panas".

Hasil terhadap 293 produk seed: KOPI 26→18 kartu, TEH 22→11, MILKY 28→15, JAHE 8→4.
Semua kategori makanan tidak berubah. `Kopi Cendol S` berdiri sendiri karena versi
panasnya tidak ada di data.

### 2026-07-29 — Notifikasi, tata letak kasir, dan cetak struk

- **Baru** `components/Toast.tsx` — `ToastProvider` + `useToast()`, tanpa dependensi baru.
  Sukses hilang otomatis setelah 3 detik; gagal harus ditutup manual. Terpasang di simpan
  order, gabung order, pelunasan, tambah item, dan pembatalan item.
- **Ubah** `CashierScreen.tsx` — posisi **Cari Produk** (kiri, 2/3) dan **Kode Meja /
  Order** (kanan, 1/3) ditukar.
- **Baru** `components/Receipt.tsx` + aturan `@media print` di `globals.css` — struk 72mm,
  di-portal ke `<body>`, tanda `** BELUM LUNAS **` untuk order pending.
- **Ubah** `OrdersTable.tsx` — tombol **Cetak Struk** di setiap baris, termasuk yang sudah
  lunas (struk sering diminta ulang).

### 2026-07-29 — Kartu produk & pencarian

- **Ubah** `ProductCard.tsx` — kode produk dihapus dari kartu, nama diperbesar
  (`text-sm` → `text-lg`).
- **Ubah** `CashierScreen.tsx` — filter pencarian produk (nama atau kode). Saat mencari,
  **kategori diabaikan** dan seluruh menu disapu, karena kasir sering tidak hafal suatu
  menu ada di kategori mana. Jumlah hasil ditampilkan; memilih kategori membatalkan pencarian.

### 2026-07-29 — Impor data produk asli

- **Ubah** `supabase/seed.sql` — kategori & produk contoh diganti data asli dari
  `Daftar Produk.xlsx` (ekspor 29/07/2026): **293 produk, 23 kategori**, harga dari kolom
  "Harga Jual Satuan #1" sebagai rupiah utuh, `code` memakai SKU dari file.
- Tiga penyesuaian yang disengaja, dicatat di kepala `seed.sql`:
  1. Tiga produk berkategori "-" dipetakan manual (MLD & Surya Pro → Rokok,
     "snack 9 k" → Snack & Minuman Botol). Kategori "-" tidak dibuat.
  2. SKU `KPc` (Kopi Pancung) → **`KPCG`**, bentrok dengan `KPC` (Kopi Cha) — kolom `code`
     tidak membedakan huruf besar/kecil.
  3. SKU `k141` (+jahe) → **`ADDJHE`**, bentrok dengan `K141` (Nasi Goreng Ayam).

### 2026-07-29 — Migrasi Supabase / PostgreSQL (Fase 1–4)

Perubahan terbesar: dari mock data di memori menjadi Postgres, akses **server-only**.

- **Fase 1** — `lib/supabase/server.ts` (`import "server-only"`), env tanpa `NEXT_PUBLIC_`.
- **Fase 2** — skema + RPC transaksi + RLS deny-all. Uang `bigint`, kolom snapshot di
  `order_items`, jejak `order_item_voids`.
- **Fase 3** — cookie httpOnly menggantikan `sessionStorage`; `proxy.ts` menggantikan
  `middleware.ts`; PIN 4 → **6 digit** dengan bcrypt; panel "PIN uji coba" dihapus.
- **Fase 4** — `/cashier`, `/orders`, `/history` jadi Server Component async;
  `lib/mock-data.ts` **dihapus**, dipecah jadi `lib/types.ts`, `lib/queries.ts`,
  `lib/order-actions.ts`.
- **Baru** — edit order pending, void per item dengan alasan wajib, optimistic lock lewat
  `orders.version`, dan dialog kode meja kembar.

### 2026-07-29 — Navbar biru

- **Ubah** `components/NavHeader.tsx` — latar navbar biru, tombol navigasi putih berteks biru.

### Dokumen asli vs keadaan sekarang

Isi berkas ini sudah diperbarui mengikuti tabel berikut; tabelnya dipertahankan sebagai
catatan apa yang berubah dari dua dokumen sumber.

| Dokumen asli | Keadaan sekarang |
|---|---|
| `lib/mock-data.ts` | Dihapus → `lib/types.ts`, `lib/queries.ts`, `lib/order-actions.ts` |
| PIN 4 digit plaintext | **6 digit**, bcrypt, `PIN_LENGTH` di `lib/types.ts` |
| Panel "Test PINs" di layar | **Dihapus** — membocorkan PIN semua pegawai |
| `sessionStorage` untuk sesi | Cookie httpOnly bertanda tangan (`lib/session.ts`) |
| `tailwind.config.ts` | Tailwind v4 → token di blok `@theme` pada `app/globals.css` |
| `middleware.ts` | Next.js 16 → `proxy.ts` di root |
| Rencana API NestJS | Tidak jadi — Server Actions langsung ke Postgres |
| `OrderCart` + status di satu layar | `DraftCart` (kasir) + `OrdersTable` (antrean) terpisah |
| Kode produk lebih besar dari nama | Nama besar, kode hanya untuk pencarian |
| Fungsi console (`getCurrentOrder()` dll.) | Tidak ada — data di server, bukan modul global |
