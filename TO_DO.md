# TO_DO.md — yang belum selesai

Daftar pekerjaan terbuka, bukan changelog. Apa yang **sudah** dikerjakan dan **kenapa**
ada di `MIGRATION.md`; produknya ada di `PRODUCT.md`. Berkas ini hanya memuat yang belum
ada, beserta akibatnya kalau dibiarkan — supaya keputusan menunda tetap keputusan, bukan
kelupaan.

Urutannya adalah urutan risiko, bukan urutan besarnya pekerjaan.

---

## 0. HP kasir masih memakai APK runtime 2 — pasang ulang lewat adb

**Status: belum dikerjakan, butuh perangkat di tangan. Bernomor 0 karena selama ini belum
beres, tidak ada perbaikan JS apa pun yang bisa sampai ke toko.**

APK yang beredar di HP kasir dibangun sebelum 2026-08-02 09:33, jadi
`android/app/src/main/res/values/strings.xml` di dalamnya masih menulis
`expo_runtime_version = 2`, sementara `app.json` sudah `3`. Duduk perkaranya ada di
`MIGRATION.md § The two-places rule was already written down`.

**Akibatnya bukan "update tertunda", tapi terputus permanen.** Setiap `eas update` sejak
commit `2b92cdf` terbit sebagai runtime 3. HP yang mengaku runtime 2 dijawab jujur oleh
server: tidak ada update untuk runtime itu. Tidak ada error, tidak ada peringatan, aplikasi
jalan normal — dan tidak akan pernah berubah lagi. Dua update runtime 3 sudah menguap
begitu saja dengan cara ini (`08:45` dan `09:16` pada 2026-08-02).

Memeriksanya sepuluh detik, dan bisa dilakukan siapa saja tanpa laptop — menu →
**Pengaturan** → baris `Saluran:`

```
production · runtime 3   → aman
production · runtime 2   → terputus, wajib APK baru
```

Pemasangannya:

```
adb install -r mobile/android/app/build/outputs/apk/release/app-release.apk
```

Lalu buka aplikasinya dan **baca lagi baris `Saluran:`** — pemasangan yang berhasil bukan
bukti runtime-nya benar; keduanya harus dilihat terpisah. Kalau APK itu sudah tertimpa build
berikutnya, bangun ulang dulu dan pastikan `aapt2 dump resources` menunjukkan `"3"` sebelum
menyentuh HP.

**Yang belum diketahui: berapa HP yang beredar, dan mana saja.** Tidak ada cara memeriksanya
dari jarak jauh — HP yang terputus justru yang paling tidak bisa ditanyai. Tiap unit harus
dipegang satu per satu. Selesai memasang ke semua HP, barulah `eas update` berikutnya
bermakna; urutannya wajib APK dulu, publish belakangan
(`MIGRATION.md § Build the APK first, then publish`).

---

## 1. ~~Penghalang rilis — refund belum pernah sampai ke server~~ SELESAI

**Status: lulus 31 Juli 2026. Bukan lagi penghalang rilis.**

Ditutup oleh order Meja 20 (subtotal 30.000, PBJT 10% = 3.000, total 33.000) yang direfund
dua kali dari ponsel lalu diperiksa di hosted: `sum(refunds.tax_amount)` = 3.000 dan
`sum(refunds.amount)` = 33.000, sehingga **sisa pajak dan sisa uang tepat nol**. Tidak ada
rupiah yang tersangkut.

Kedua baris refundnya sama-sama berpajak 1.500, dan itu bukan tanda aturan-sisa tidak
bekerja: 15.000 dibagi menurut rumus menghasilkan 1.500 bulat, jadi rumus proporsional dan
pengembalian-sisa kebetulan sama. Yang membuktikan aturan-sisa ada adalah sisa nol itu
sendiri. **Belum diuji dengan subtotal yang tidak habis dibagi** — layak dicoba suatu saat,
tapi bukan risiko rilis, karena bentuk kegagalannya adalah selisih yang menetap dan kolom
sisa membuktikan ia tidak menetap.

### Sudah terbukti sebelumnya

Diperiksa langsung di hosted atas tiga order (A3, A1, Meja 9) yang direfund dari ponsel:

- **Refundnya benar-benar tertulis** — dua baris `refunds` pada A3 dan A1, satu pada Meja 9.
  Ini menutup jebakan terbesar: `push_order` pulang lebih awal ketika `version` tidak maju
  dan **melapor sukses tanpa menulis apa pun**. Kenaikan `orders.version` di `createRefund`
  bekerja. Perlu dicatat kenapa ini harus diperiksa di server: padamnya badge "Belum
  terkirim" adalah isyarat yang **sama persis** untuk berhasil dan untuk gagal diam-diam,
  jadi layar ponsel tidak akan pernah bisa membuktikannya.
- **`refund_items` ikut tertulis** (2, 3, 1 baris) — jalur foreign key selamat. Order `paid`
  yang punya `refund_items` berhasil diperbarui tanpa `delete from order_items` menabraknya,
  persis jebakan yang diramalkan komentar di `0014` dan dijaga oleh `0017`.
- **Angka order tidak tersentuh** — A3 tetap 29.000 dan A1 tetap 50.000 meski uangnya sudah
  kembali seluruhnya. Yang tersimpan tetap sama dengan yang tercetak di struk pelanggan.

> Catatan kueri: pakai `sum(r.amount)`, **bukan** `sum(distinct r.amount)`. Dua refund dengan
> nominal sama persis pada satu order akan dilipat jadi satu oleh `distinct`, dan totalnya
> kurang tanpa tanda apa pun. Kueri pemeriksaan pertama memuat kesalahan ini; hasilnya
> kebetulan tetap benar, tapi kebetulan bukan jaminan.

---

## 2. ~~Web belum punya refund sama sekali~~ TIDAK RELEVAN

**Status: ditutup. Web sudah tidak punya alur kasir sama sekali.**

Rencana `RefundSheet` versi web di bawah ini ditulis waktu web masih menjalankan kasir
(`/cashier`, `/orders`, dan seluruh komponennya). Sejak itu dihapus dan web dijadikan
dashboard/report shell murni untuk manajer, "refund di web" tidak lagi berarti apa-apa —
tidak ada layar transaksional di web untuk ditempeli tombol Refund. Refund tetap sepenuhnya
fitur mobile.

Order yang direfund tetap **tampil sebagai lunas penuh** di `/history` web (badge tiga
keadaan dan angka ganda hanya ada di mobile) — itu bukan bug yang perlu ditutup, karena
`/history` sekarang murni pelaporan read-only, bukan alat transaksi. Kalau laporan bersih
per order (menghitung refund) suatu saat dibutuhkan di dashboard, itu pertanyaan baru, bukan
kelanjutan rencana `RefundSheet` di bawah — dan `lib/product-variants.ts` yang disebut
rencana lama sudah tidak ada di root sama sekali (lihat AGENTS.md).

<details>
<summary>Rencana lama (arsip, sudah tidak berlaku)</summary>

- `RefundSheet` versi web di layar Histori, tombol Refund di kiri Cetak Struk.
- Badge tiga keadaan (Lunas / Refund Sebagian / Refund Penuh) dan angka ganda —
  tertagih dicoret, bersih tebal.
- Web memanggil `create_refund` langsung; ia tidak punya lapisan SQLite lokal, jadi tidak
  ada padanan `createRefund` yang perlu diduplikasi. Tidak ada migrasi baru.

</details>

---

## 3. Laporan tidak bisa dibuka siapa pun

**Status: belum dimulai. Bukan penghalang jualan, penghalang tutup buku.**

Dua hal terpisah, dan keduanya kurang:

1. **Tidak ada layarnya.** Tidak di web, tidak di mobile. SQL agregatnya sudah lengkap
   (`get_pbjt_summary`, `get_pbjt_harian`, `get_pbjt_exempt_report`, `get_refund_report`),
   sudah tahu refund, dan sudah diuji.
2. **Tidak ada yang berhak memanggilnya.** Fungsi-fungsi itu `security invoker` tanpa
   `grant execute`, dan `orders` tertutup dari `authenticated`. Jadi bahkan kalau layarnya
   dibuat hari ini, tiap panggilan berbalas `permission denied`.

Nomor 2 harus dijawab **sebelum** nomor 1, dan jawabannya adalah keputusan produk, bukan
teknis: siapa yang boleh melihat omzet. Peran pemilik sudah ada di `employees.role` tapi belum
pernah dipakai untuk menjaga apa pun. Membuka `grant execute` ke semua `authenticated` berarti
setiap kasir bisa membaca omzet seluruh outlet — mungkin itu memang tidak masalah di warung
keluarga, tapi itu harus dipilih, bukan terjadi.

Sesudah `0022`, kesepuluh fungsi itu punya parameter `p_include_test boolean default false`.
Bawaannya membuang data uji, jadi layar apa pun yang dibuat kelak sudah benar tanpa
melakukan apa-apa. Yang belum ada adalah gerbangnya: parameter itu **harus** dikunci ke peran
owner/manager di lapisan sesi Next.js, bukan diserahkan ke pemanggil. Kalau layarnya dibuat
tanpa memikirkan ini, kasir mana pun bisa mengirim `true` dan melihat angka yang bukan
haknya — dan itu satu-satunya cara data uji bisa masuk ke laporan sesudah pekerjaan ini.

---

## 3b. Web tidak tahu apa-apa soal data uji

**Status: belum dikerjakan, dan sudah menyimpang dari mobile sejak 2 Agustus 2026.**

Kolom `orders.is_test_data` sudah ada di hosted dan ponsel sudah mengisinya. Yang belum:
`lib/queries.ts` tidak menyaringnya sama sekali. Akibatnya **`/history` di web menampilkan
order uji berbaur dengan order sungguhan, tanpa satu pun penanda** — sementara di ponsel
order yang sama bertanda "UJI · di luar laporan" dan tidak ikut Tutup Kasir. Dua layar,
satu order, dua cerita berbeda.

Dua perubahan, dan keduanya kecil:

1. `getPaidOrders` menyaring `is_test_data = false`, dengan toggle khusus owner untuk
   menampilkannya — gerbangnya di lapisan sesi, sama seperti nomor 3 di atas.
2. `getOrderById` **jangan** disaring. Ia dipanggil dengan id yang sudah dipegang seseorang,
   dan menyembunyikan baris yang sengaja dibuka hanya menghasilkan "tidak ditemukan" yang
   membingungkan. Yang benar adalah menampilkannya dengan penanda jelas.

Risikonya bukan uang hilang — angka yang dipakai tutup buku datang dari fungsi laporan, yang
sudah menyaring. Risikonya kepercayaan: pemilik yang melihat order di `/history` yang tidak
muncul di laporan akan menyimpulkan laporannya bocor.

---

## 4. Beberapa HP kasir sekaligus

**Status: belum diperiksa. Jangan disebar ke lebih dari satu HP sebelum ini dijawab.**

Tiap perangkat memegang database SQLite-nya sendiri dan sinkron lewat `push_order`. Yang
belum pernah diuji dengan dua perangkat menyala bersamaan:

- Order dari HP A **tidak muncul** di histori HP B sebelum keduanya sinkron — dan tidak ada
  jalur tarik untuk order; yang ditarik hanya katalog. Jadi refund hanya bisa dilakukan di HP
  yang menyimpan order itu, dan kasir di HP lain akan yakin ordernya tidak ada.
- `orders.version` menyelesaikan pemutaran ulang dari satu perangkat. Ia belum pernah diuji
  sebagai penyelesai konflik antara dua perangkat yang menyentuh satu order.
- `table_seq` diberikan per perangkat. Dua HP bisa menerbitkan nomor meja yang sama di hari
  yang sama.

Satu HP: aman, dan itu keadaan sekarang. Dua HP butuh pekerjaan nyata lebih dulu, minimal
penarikan order dan penomoran meja yang tidak bertabrakan.

---

## 5. Tutup Kasir — belum lengkap dengan sengaja

**Status: fitur inti selesai (mobile) — termasuk selisih kas fisik dan Kas Masuk/Keluar.
Yang di bawah ini ditunda dengan sadar.**

- **Sif tidak naik ke server.** Tabel `shifts` (`db/migrations.ts` V4) lokal saja, tidak
  tersentuh `push.ts`. Kalau nanti pemilik ingin melihat rekap sif dari jauh, itu butuh migrasi
  Postgres baru, RLS, dan jalur push yang idempoten seperti `push_order` — bukan tambahan kecil.
- **Slip "PENJUALAN MENU / Produk Terjual" (rekap per produk) belum dibuat.** Datanya sudah ada
  di `order_items` lokal; yang belum ada hanya rendering strukmya. Ditunda karena hanya
  "TRANSAKSI PENJUALAN" yang diminta di iterasi ini.
- ~~**Kanal bayar berhenti di Tunai/Non Tunai.**~~ **Selesai** (`orders.payment_channel`,
  `supabase/migrations/0030_metode_pembayaran.sql`, `mobile/db/migrations.ts` V11). Tunai, QRIS,
  Transfer, Kartu — dipilih di app/pay.tsx, tertulis ke SQLite dan Postgres, dan tercetak
  rinciannya di struk Tutup Kasir. `payment_method` (cash/non_cash) tetap tidak berubah dan tetap
  satu-satunya sumber "masuk laci atau tidak" — `payment_channel` cuma menambah rincian di
  atasnya.
- **Kas Masuk/Keluar ikut lokal saja.** `cash_movements` (V6) menggantung pada `shifts`, dan
  `shifts` tidak naik ke server — jadi pengeluaran belanja stok tidak terlihat dari mana pun
  selain HP yang mencatatnya. Kalau nanti pemilik ingin merekap biaya dari jauh, ia ikut jalur
  push yang sama dengan `shifts` di butir pertama, bukan pekerjaan terpisah.
- **Tidak ada rekap kas per kategori.** Keterangannya teks bebas dengan sengaja (cepat diisi,
  tidak ada daftar kategori yang harus dipelihara lewat rilis), dan akibatnya "berapa yang
  habis untuk gas bulan ini" tidak bisa dijawab tanpa membaca satu per satu. Kalau pertanyaan
  itu benar-benar muncul, obatnya kolom kategori di `cash_movements` plus daftar tetap — bukan
  mengurai teks bebas belakangan.
- **Entri kas non tunai murni catatan.** Ia tidak mengubah `Kas Seharusnya` (uangnya tidak
  lewat laci) maupun `Saldo Akhir` (yang sengaja tetap murni penjualan). Jadi biaya yang
  dibayar transfer tercetak, tapi tidak ada satu pun angka ringkas di struk yang memuatnya.
  Itu keputusan, bukan kelalaian — lihat `MIGRATION.md § Kas Masuk / Kas Keluar`.
- **`refunds` tidak punya kolom kanal bayar sendiri.** Rekonsiliasi kas fisik (V5, `selisih`)
  menebak refund tunai dari metode bayar order yang direfund. Refund atas order non tunai yang
  pada praktiknya dibayar pakai uang laci tidak terhitung, dan tercetak sebagai selisih KURANG
  yang tidak bisa dibedakan dari salah hitung sungguhan. Obatnya kolom kanal di `refunds`
  sendiri — belum dikerjakan karena kasus ini belum pernah dilaporkan terjadi.

**Jebakan yang mengintai kalau sif dibiarkan berjalan lebih dari 12 jam:** `HISTORY_KEEP_HOURS`
(`db/orders.ts`) menghapus order selesai yang sudah tersinkron, dan `refunds` ikut terhapus lewat
`on delete cascade`. Tutup Kasir yang dicetak setelah pembersihan histori berjalan akan
kehilangan baris tanpa tanda apa pun — cetak sebelum menjalankan "Bersihkan histori" dari menu.

---

## 6. Yang sudah dibicarakan dan belum diputuskan

Bukan bug, tapi akan menggigit kalau tidak dipilih.

- **Dua database.** Web menunjuk Postgres lokal, ponsel menunjuk hosted. Selama keduanya
  hidup, tiap migrasi harus mencapai keduanya, dan lupa satu berarti menu muncul di satu
  perangkat saja dengan keduanya tampak normal. Kalau web tidak lagi dipakai di toko,
  mengarahkan web ke hosted menghapus seluruh kelas kesalahan ini.
- **PBJT eksklusif.** Pelanggan kena pajak membayar 10% di atas harga menu. Harga di daftar
  menu dan yang disebut kasir di depan pelanggan belum tentu sudah mencerminkan itu. Ini soal
  komunikasi di toko, bukan kode, tapi selisihnya muncul di kertas dan pelanggan yang
  menanyakannya berhadapan dengan kasir.
- **OTA.** `expo-updates` sudah terpasang tapi belum ada saluran rilis yang dipakai. Sampai
  itu disiapkan, tiap perbaikan berarti membangun APK dan mencolok HP. Untuk satu HP masih
  wajar; untuk beberapa HP itu berubah jadi beban tetap.
- **Takeaway tidak punya kolom, hanya string di `table_code`.** Kasir punya switch
  Meja/Takeaway, tapi `orderKind` cuma state UI (`mobile/lib/cart-context.tsx`) — yang sampai
  ke basis data adalah `table_code = 'Takeaway'`, string literal yang diketik
  `CashierScreen.tsx`. Itu konvensi pengetikan, kelas yang sama persis dengan awalan `UJI-`
  yang `0022` dibuat untuk membuangnya: satu ejaan berbeda ('takeaway', 'Take Away') dan
  ordernya diam-diam salah golong, tanpa CHECK apa pun yang menahannya. Akibatnya laporan
  dashboard (`0027`) sengaja TIDAK punya kolom jenis order — ia mengeluarkan `table_code` apa
  adanya, karena kolom yang isinya tebakan dari teks bebas akan runtuh kredibilitasnya begitu
  pemilik menemukan satu baris yang salah. Memperbaikinya berarti kolom `order_kind` di
  `orders` plus `push_order` dan `mobile/` berubah bersamaan — bukan pekerjaan tempelan.

---

## Yang sengaja tidak ada di sini

Persediaan bahan baku, multi-outlet aktif, dan pembayaran terbagi — semuanya di luar cakupan
menurut `PRODUCT.md`, bukan tertunda.
