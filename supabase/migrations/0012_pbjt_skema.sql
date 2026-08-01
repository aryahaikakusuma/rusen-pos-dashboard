-- PBJT (Pajak Barang dan Jasa Tertentu) — skema.
--
-- Kasir memilih status pajak saat mengonfirmasi pelunasan: kena pajak (bawaan)
-- atau bebas pajak. Bebas pajak wajib disertai keterangan dan mencatat siapa
-- yang memutuskan.
--
-- ============================================================================
-- TIGA KEPUTUSAN YANG MENENTUKAN BENTUK BERKAS INI
-- ============================================================================
--
-- 1. `orders.total` BERUBAH ARTI: dari "jumlah subtotal item" menjadi "uang
--    yang ditagih ke pelanggan" (subtotal + pajak). Kolom baru `subtotal` yang
--    memegang jumlah item.
--
--    Alternatifnya — `total` tetap jumlah item, tambah `grand_total` — ditolak,
--    dan alasannya bukan selera. Ada dua belas tempat yang membaca `total`
--    sebagai "uang": check_table_code, get_sales_summary, get_sales_trend,
--    payments.amount, penjaga INSUFFICIENT_AMOUNT di push_order, lib/queries.ts,
--    Receipt.tsx, PaymentModal.tsx, PaymentSheet.tsx, OrdersScreen.tsx,
--    OrderDetailSheet.tsx, TableConflictDialog.tsx. Dengan `grand_total`, setiap
--    tempat yang lupa diperbarui melaporkan uang KURANG 10% dan tidak ada error
--    di mana pun. Dengan `total` sebagai angka tagihan, tempat yang belum
--    disentuh justru sudah benar. Arah kegagalannya dibalik dari diam-diam-salah
--    jadi benar-secara-bawaan.
--
--    Konsekuensi yang harus diketahui, bukan disembunyikan: selama order masih
--    `pending`, status pajak belum diputuskan, jadi `total` masih sama dengan
--    `subtotal` dan tax_amount masih 0. Struk sementara "BELUM LUNAS" karena itu
--    mencetak angka pra-pajak, dan struk finalnya lebih tinggi. Itu benar, tapi
--    terlihat seperti bug kalau kasir tidak diberi tahu.
--
-- 2. PAJAK DIHITUNG SEKALI ATAS SUBTOTAL ORDER, TIDAK PERNAH PER BARIS ITEM.
--    Per baris lalu dijumlahkan memberi angka yang berbeda. Bentuk struknya
--    (satu Subtotal, satu PBJT) sudah menyiratkan ini; ditulis di sini supaya
--    tidak jadi tafsir.
--
-- 3. `tax_rate_bps` DI-SNAPSHOT PER ORDER, TERMASUK PADA ORDER BEBAS PAJAK.
--    Snapshot itulah riwayat tarifnya — karena itu tidak ada tabel riwayat
--    tarif di sini, dan jangan ditambahkan. Tanpa snapshot pada baris bebas
--    pajak, pertanyaan "berapa pajak yang tidak jadi dipungut periode lalu"
--    tidak bisa dihitung ulang begitu perda mengubah tarif — laporan bulan lalu
--    akan ikut berubah angkanya, diam-diam dan tanpa error.
--
-- Tarif disimpan dalam basis point (1 bps = 0,01%) supaya tarif pecahan seperti
-- 7,5% tetap bilangan bulat dan tidak pernah menyentuh floating point.

begin;

-- ---------------------------------------------------------------- tipe status
do $$
begin
  create type tax_status as enum ('taxable', 'exempt');
exception
  when duplicate_object then null;   -- sudah ada, migrasi dijalankan ulang
end $$;

-- ------------------------------------------------------------- tarif di outlet
-- Satu-satunya sumber tarif. Mengubah tarif = satu UPDATE di sini, tanpa build
-- APK dan tanpa deploy web. Itu permintaan eksplisit Heika: perda bisa berubah
-- sewaktu-waktu, dan tarif yang tertanam di kode berarti tiga tempat yang wajib
-- diubah bersamaan.
alter table outlets
  add column if not exists tax_rate_bps int not null default 1000;   -- 10%

do $$
begin
  alter table outlets add constraint outlets_tax_rate_masuk_akal
    check (tax_rate_bps between 0 and 10000);
exception
  when duplicate_object then null;
end $$;

-- ------------------------------------------------------------ kolom di orders
alter table orders
  add column if not exists subtotal          bigint     not null default 0,
  add column if not exists tax_status        tax_status not null default 'taxable',
  add column if not exists tax_rate_bps      int        not null default 0,
  add column if not exists tax_amount        bigint     not null default 0,
  add column if not exists tax_exempt_reason text,
  add column if not exists tax_approved_by   uuid references employees (id);

-- Constraint dilepas dulu lalu dipasang lagi, supaya berkas ini idempoten.
-- `add constraint` biasa akan gagal pada jalan kedua.
alter table orders drop constraint if exists orders_subtotal_wajar;
alter table orders drop constraint if exists orders_tax_amount_wajar;
alter table orders drop constraint if exists orders_tax_rate_masuk_akal;
alter table orders drop constraint if exists tax_arithmetic;
alter table orders drop constraint if exists tax_exempt_fields_consistent;

alter table orders
  add constraint orders_subtotal_wajar      check (subtotal   >= 0),
  add constraint orders_tax_amount_wajar    check (tax_amount >= 0),
  add constraint orders_tax_rate_masuk_akal check (tax_rate_bps between 0 and 10000);

-- Aritmetika pajak sebagai constraint, bukan sekadar penjaga di dalam fungsi.
-- Ini yang membuat basis data SECARA FISIK tidak bisa menyimpan baris yang
-- pembulatannya berbeda dari server — untuk penulis mana pun, bukan cuma
-- push_order. Perangkat menghitung pajaknya sendiri saat offline; constraint ini
-- yang memastikan hasilnya tidak pernah menyimpang tanpa ketahuan.
--
-- Rumus pembagiannya bilangan bulat dan memotong ke bawah. Untuk operan
-- non-negatif itu sama dengan floor, dan sama persis dengan Math.floor di
-- TypeScript (lib/tax.ts dan mobile/lib/tax.ts).
alter table orders
  add constraint tax_arithmetic check (
    tax_amount = case
                   when tax_status = 'exempt' then 0
                   else (subtotal * tax_rate_bps + 5000) / 10000
                 end
    and total = subtotal + tax_amount
  );

-- Cabang `else` di bawah bukan hiasan: ia mencegah keterangan dan penyetuju
-- lama tertinggal kalau kasir sempat memilih bebas pajak lalu kembali ke kena
-- pajak. Keterangan yang menempel pada order yang akhirnya dipungut pajak
-- adalah jejak audit yang berbohong.
alter table orders
  add constraint tax_exempt_fields_consistent check (
    case
      when tax_status = 'exempt'
        then btrim(coalesce(tax_exempt_reason, '')) <> ''
             and tax_approved_by is not null
      else tax_exempt_reason is null
           and tax_approved_by is null
    end
  );

-- --------------------------------------------------- akses tarif dari ponsel
-- Perangkat harus tahu tarifnya untuk menghitung pajak saat offline. Ditarik
-- bersama katalog dan disimpan di app_state lokal (mobile/db/catalog.ts).
--
-- Grant tingkat kolom, mengikuti preseden 0003: setiap GRANT adalah lubang, dan
-- outlets memuat alamat yang tidak ada urusannya dengan aplikasi kasir.
-- `revoke ... from authenticated` di 0001 adalah pernyataan sekali jalan dan
-- tidak membatalkan grant yang diberikan sesudahnya.
grant select (id, name, tax_rate_bps) on outlets to authenticated;

drop policy if exists outlets_read_own_outlet on outlets;
create policy outlets_read_own_outlet on outlets
  for select
  to authenticated
  using (id = (select e.outlet_id from employees e where e.id = (select auth.uid())));

commit;
