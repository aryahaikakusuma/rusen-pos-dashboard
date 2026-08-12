-- Selaraskan privilege shifts/cash_movements dengan pola orders (0001_init).
--
-- 0029 membuat kedua tabel ini dengan RLS aktif tanpa satu policy pun —
-- deny-all yang benar untuk anon maupun authenticated selama tidak ada
-- policy. Tapi privilege GRANT-nya berbeda dari orders di DUA arah:
--
-- 1. anon/authenticated: orders di 0001 eksplisit di-`revoke all ...
--    from anon, authenticated`, sehingga \dp orders tidak menyisakan baris
--    anon/authenticated sama sekali. shifts dan cash_movements TIDAK pernah
--    di-revoke serupa, jadi keduanya masih membawa privilege bawaan skema
--    (anon=Dxtm, authenticated=Dxtm — TRUNCATE/REFERENCES/TRIGGER/MAINTAIN,
--    bukan SELECT/INSERT/UPDATE/DELETE) yang otomatis diberikan
--    Postgres/Supabase ke tabel baru mana pun.
--
--    Ini TIDAK berbahaya hari ini: Dxtm tidak mencakup arwd (SELECT/INSERT/
--    UPDATE/DELETE), dan RLS tanpa policy sudah menolak keduanya secara
--    independen (dibuktikan empiris di Langkah 3 sesi ini). Tapi perbedaan
--    tanpa alasan tercatat gampang ditiru sebagai pola oleh tabel berikutnya,
--    dan "pola yang benar" untuk tabel yang hanya boleh ditulis lewat fungsi
--    SECURITY DEFINER adalah tanpa privilege langsung sama sekali — persis
--    seperti orders.
--
-- 2. service_role: orders punya service_role=arwdDxtm (grant penuh, dari
--    `grant all privileges on all tables in schema public to service_role`
--    di 0001 — blanket statement yang hanya menjangkau tabel yang SUDAH ADA
--    saat itu). shifts dan cash_movements lahir di 0029, sesudah baris itu
--    berjalan, jadi keduanya tertinggal di service_role=Dxtm — tanpa arwd.
--    Ini BERBAHAYA, bukan sekadar rapi-rapi: dashboard Next.js membaca
--    Postgres lewat service_role (AGENTS.md § "service role key tidak boleh
--    sampai ke browser"), dan 0029 ada supaya dashboard bisa membaca dua
--    tabel ini. Tanpa grant ini, query pertama dashboard ke shifts atau
--    cash_movements gagal permission denied.
--
--    Dipakai grant bertarget (`grant ... on shifts, cash_movements ...`),
--    bukan mengulang statement blanket `all tables in schema public` dari
--    0001 — hasilnya identik (service_role=arwdDxtm) tanpa menyentuh tabel
--    lain yang privilegenya sudah benar.
--
-- Migrasi ini murni merapikan privilege, tidak menyentuh RLS maupun
-- push_shift/push_order.
--
-- Idempoten: REVOKE atas privilege yang sudah tidak ada, dan GRANT atas
-- privilege yang sudah ada, bukan error di Postgres — keduanya hanya tidak
-- mengubah apa pun pada jalan kedua.

begin;

revoke all on shifts, cash_movements from anon, authenticated;
grant all privileges on shifts, cash_movements to service_role;

commit;
