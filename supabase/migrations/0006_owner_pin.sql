-- Mengganti PIN akun Owner. Yang disimpan hanya hash bcrypt cost 10, sama
-- seperti seed.sql; plaintext-nya sengaja tidak ada di repo mana pun.
--
-- Ini migrasi data, bukan skema, dan ditulis sebagai migrasi justru karena
-- itu: kredensial diubah di basis data yang sedang berjalan, dan perubahan
-- semacam itu harus meninggalkan jejak yang bisa dilacak — bukan satu perintah
-- yang diketik di SQL Editor lalu hilang.
--
-- Alasannya bukan kerapian. PIN lama 000000 dapat ditebak dalam satu tebakan,
-- dan gerbang layar uji di DebugScreen hanya sekuat PIN ini.

update employees
set pin_hash = '$2b$10$OGm53hMvN33t9ZqKZTignugMDGCwtzxWnuM5iWo2rh5ImR8CFemyu'
where name = 'Owner'
  and outlet_id = '00000000-0000-0000-0000-000000000001';
