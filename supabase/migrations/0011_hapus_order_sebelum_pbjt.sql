-- Mengosongkan orders sebelum PBJT masuk skema.
--
-- Keputusan Heika: order lama DIHAPUS, bukan di-backfill. Alasannya jujur —
-- transaksi itu memang tidak pernah dipungut pajak, jadi menandainya "kena
-- pajak Rp 0" akan salah, sementara menandainya "bebas pajak" mengarang alasan
-- pembebasan yang tidak pernah ada.
--
-- SAAT DITULIS, KEDUA BASIS DATA SUDAH KOSONG. Dihitung lebih dulu, bukan
-- diasumsikan: Postgres lokal nol baris, dan dump data dari proyek terhosting
-- tidak memuat satu pun baris orders/order_items/payments. Jadi berkas ini
-- kemungkinan besar tidak menghapus apa pun di mana pun.
--
-- Lalu kenapa tetap ditulis? Karena 0012 memasang constraint `tax_arithmetic`,
-- dan constraint itu tidak bisa dipasang selama ada satu saja baris lama —
-- baris lama punya subtotal 0 (kolomnya baru lahir dengan default 0) sementara
-- total-nya bukan nol, dan itu langsung melanggar `total = subtotal + tax_amount`.
-- Tanpa berkas ini, urutan migrasi hanya kebetulan berhasil di dua basis data
-- yang kebetulan kosong, dan gagal di basis data ketiga mana pun. Berkas ini
-- yang membuat prasyarat 0012 dijamin, bukan diharapkan.
--
-- Urutannya bukan selera, sama seperti 0007: payments dan refunds
-- mereferensikan orders TANPA `on delete cascade`, jadi keduanya harus lebih
-- dulu. order_items dan order_item_voids ikut lewat cascade; refund_items ikut
-- lewat cascade dari refunds.

begin;

delete from refunds
where order_id in (select id from orders);

delete from payments
where order_id in (select id from orders);

delete from orders;

-- Jaring pengaman yang sama seperti 0007: kalau ada baris yang lolos — misalnya
-- karena kelak ada tabel baru yang mereferensikan orders — seluruh transaksi
-- dibatalkan daripada meninggalkan basis data setengah bersih dan membuat 0012
-- gagal di tengah jalan.
do $$
declare sisa int;
begin
  select count(*) into sisa from orders;
  if sisa > 0 then
    raise exception 'Masih ada % order tersisa setelah penghapusan', sisa;
  end if;
end $$;

commit;
