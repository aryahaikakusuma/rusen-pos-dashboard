# Varian suhu produk di aplikasi mobile — desain

Tanggal: 2026-07-30
Status: disetujui, siap direncanakan

## Masalah

Di database, panas dan dingin adalah dua produk terpisah dengan kode dan harga
masing-masing: `K26 Coklat Panas` Rp 17.000 dan `K27 Coklat Dingin` Rp 20.000. Itu benar
untuk pencatatan — laporan penjualan perlu tahu mana yang laku — tapi memaksa kasir
memindai dua kartu untuk satu menu.

Aplikasi web sudah menyelesaikan ini: `lib/product-variants.ts`, `components/ProductCard.tsx`,
dan `components/VariantDialog.tsx`. Aplikasi mobile belum, jadi grid kasir di ponsel masih
menampilkan setiap suhu sebagai kartu terpisah.

## Data

Dihitung dari `supabase/seed.sql` memakai regex pengelompokan web:

| | |
| --- | --- |
| Produk total | 293 |
| Kartu setelah digabung | 255 (berkurang 38) |
| Kartu berpasangan | 38 |
| — harga kedua suhu sama | 4 |
| — harga berbeda | 34 |

Sebaran kartu berpasangan: MILKY 13, TEH 11, KOPI 8, JAHE 4, JERUK 1, MNLL 1.

**Penanda suhu tidak seragam**, dan ini yang membuat pengelompokan tidak sesederhana
mencari kata "Panas". Kategori Kopi memakai akhiran `S` atau `Es` untuk versi dingin, dan
versi panasnya ditulis tanpa akhiran sama sekali:

```
Kopi              Rp 11.000   ← panas
Kopi S            Rp 15.000   ← dingin
Kopi Susu Panas   Rp 13.000
Kopi Susu S       Rp 18.000
```

Akhiran `S` inilah yang menentukan hasil, dan gampang diremehkan. Analisis awal yang hanya
mencari kata "Panas"/"Dingin" menyimpulkan `Kopi SGM`, `Kopi Susu`, dan `Teh Jahe` tidak
punya pasangan — padahal ketiganya berpasangan lewat `KPSGS`, `KSS`, dan `TJS`. Kalau
pengelompokan ditulis ulang dari nol dengan asumsi itu, delapan kartu di kategori Kopi
gagal tergabung tanpa satu pun error.

Yang benar-benar tunggal hanya satu: **`KCES Kopi Cendol S`**, versi dingin tanpa pasangan
panas. Kartunya berdiri sendiri dengan nama utuh dan tanpa lembar pilihan.

## Keputusan pokok

**Ini port, bukan desain ulang.** Logika pengelompokan disalin dari
`lib/product-variants.ts` apa adanya. Alasannya sama dengan `db/orders.ts` di langkah 3:
kalau web dan mobile mengelompokkan berbeda, kasir melihat isi kartu yang berbeda di dua
perangkat untuk katalog yang sama, dan tidak ada satu pun tes yang akan menangkapnya.
Menulis ulang lebih mahal daripada menyalin.

**Pengelompokan murni tampilan.** Yang masuk keranjang tetap `productId` asli. Harga,
struk, dan laporan tidak berubah sedikit pun. Tidak ada perubahan skema, tidak ada migrasi
baru, tidak ada perubahan di `mobile/db/`.

**Kode produk dihilangkan dari kartu.** Kartu gabungan punya dua kode, dan menampilkan
keduanya justru membingungkan. Ini mengikuti web, tapi **menyalahi `DESIGN.md`** yang
menyatakan kasir membaca kode lebih dulu sehingga kode dibuat lebih besar dari nama.
Penyimpangan ini diambil sadar dan dicatat di `MIGRATION.md`, bukan diselipkan diam-diam.

## Komponen

### `mobile/lib/product-variants.ts` (baru)

Salinan `lib/product-variants.ts`. Dua penyesuaian, keduanya wajib:

- `Product` → `ProductRow` dari `mobile/db/types.ts`
- `product.categoryId` → `product.category_id` — mobile mengikuti nama kolom Postgres

Ekspor yang dipertahankan: `TemperatureVariant`, `ProductOption`, `ProductEntry`,
`groupProductVariants`, `VARIANT_LABEL`. Regex akhiran, kunci grup per kategori, urutan
panas-di-kiri, dan penanganan nama dasar kembar disalin tanpa perubahan.

### `mobile/components/ProductCard.tsx` (diubah)

Props `code` / `name` / `price` diganti satu `entry: ProductEntry`.

Isi kartu, dari atas: nama (`entry.label`, maksimal dua baris), harga, penanda suhu.
Harga menampilkan `formatRupiah(minPrice)` bila `minPrice === maxPrice`, dan
`` `${formatRupiah(minPrice)}+` `` bila berbeda. Penanda `Panas/Dingin` hanya muncul saat
`entry.options.length > 1`.

`memo` dipertahankan — grid berisi ratusan kartu dan induknya menulis ulang state setiap
kali keranjang berubah. `accessibilityLabel` menyebutkan suhu yang tersedia, supaya
informasi yang hilang dari visual tidak ikut hilang bagi pembaca layar.

### `mobile/components/VariantSheet.tsx` (baru)

Memakai `components/Sheet.tsx` yang sudah ada, bukan komponen overlay baru. Aplikasi sudah
punya satu pola lembar untuk keranjang; menambah pola kedua membuat dua hal yang sama
terlihat berbeda tanpa alasan.

Isinya dua tombol berdampingan, masing-masing menampilkan `VARIANT_LABEL[variant]` dan
harga produknya, ditambah Batal. **Keduanya netral, tidak ada yang biru:** `DESIGN.md`
menyimpan biru untuk satu aksi utama per layar, dan di sini tidak ada pilihan yang lebih
benar dari yang lain. Harga ditampilkan karena kasir kadang perlu menyebutkannya ke
pelanggan sebelum menekan.

Tinggi tombol mengikuti `touchTarget.comfortable`.

### `mobile/components/ProductGrid.tsx` (diubah)

Memanggil `groupProductVariants(products)` lalu merender per entry. `keyExtractor` memakai
`entry.key`. Prop `onAddItem: (productId: string) => void` diganti
`onSelect: (entry: ProductEntry) => void`.

`FlatList`, `numColumns`, kunci remount saat jumlah kolom berubah, dan
`removeClippedSubviews={false}` tetap seperti sekarang — semuanya sudah diputuskan atas
alasan yang tidak berubah.

Pengelompokan dibungkus `useMemo` dengan dependensi `products`. Daftar produk berubah
setiap kali kategori atau pencarian berubah, dan menghitung ulang 293 baris di setiap
render adalah persis jenis latensi yang menjegal langkah 3.

### `mobile/screens/CashierScreen.tsx` dan `mobile/screens/EditOrderScreen.tsx` (diubah)

**Keduanya**, bukan hanya layar kasir. `EditOrderScreen` memakai `ProductGrid` yang sama
(baris 216); kalau dilewat, menambah item ke order yang sudah ada akan langsung memasukkan
varian panas tanpa bertanya.

Aturan yang sama di kedua layar:

- `entry.options.length === 1` → langsung masuk keranjang seperti sekarang
- lebih dari satu → buka `VariantSheet`; setelah dipilih, jalankan alur tambah item yang
  ada dengan `productId` terpilih

State lembar varian bersifat lokal per layar (`useState<ProductEntry | null>`).

## Yang tidak berubah

- `mobile/db/` — tidak ada perubahan sama sekali
- Skema Postgres maupun SQLite, tidak ada migrasi baru
- Alur simpan, pembayaran, dan antrean kirim langkah 4
- Tata letak tablet tiga kolom; pengelompokan berlaku di kedua mode

## Verifikasi

Dijalankan di perangkat lewat `adb reverse tcp:8081`, bukan hanya typecheck — pelajaran
langkah 3 dan langkah 5 sama: lapisan ini gagal lewat latensi dan tata letak, dan keduanya
tidak muncul di typecheck.

1. Kategori MILKY menampilkan 13 kartu berpasangan dengan penanda `Panas/Dingin`; jumlah
   kartu berkurang sesuai tabel di atas.
2. `Coklat` menampilkan `17.000+`; menekannya membuka lembar berisi Panas 17.000 dan
   Dingin 20.000; memilih Dingin memasukkan `K27` dengan harga 20.000 ke keranjang.
3. Pasangan berharga sama menampilkan satu angka tanpa `+`. Hanya ada empat:
   `Teh Manis` 7.000, `Teh Tawar` 5.000, `Jahe` 7.000, `Lemon` 10.000.
4. `Kopi Cendol S` — satu-satunya minuman tanpa pasangan — tetap satu kartu dengan nama
   utuh, tanpa penanda, dan langsung masuk keranjang tanpa lembar.
5. Kategori KOPI menampilkan 8 kartu berpasangan, termasuk `Kopi` (KP/KPS),
   `Kopi SGM` (K7/KPSGS), dan `Kopi Susu` (KS/KSS). Ini yang membuktikan akhiran `S`/`Es`
   ikut terbawa — kalau gagal, jumlahnya nol dan tidak ada error apa pun.
6. `Kopi Milo Susu` dan `Kopi Susu Pancung` **tidak** ikut terpotong akhirannya.
7. Menambah item lewat `EditOrderScreen` juga menampilkan lembar varian.
8. Batal di lembar tidak menambah apa pun ke keranjang.
9. Menggulir grid penuh 255 kartu tetap mulus; pencarian mengetik cepat tidak tersendat.
10. Order yang dibuat lewat alur ini terkirim dan diterima server dengan total yang cocok.

## Catatan setelah selesai

`MIGRATION.md` diperbarui: penyimpangan kode produk dari `DESIGN.md`, dan fakta bahwa
pengelompokan varian kini ada di dua sisi sehingga keduanya harus berubah bersama —
seperti `db/orders.ts` dengan RPC Postgres.
