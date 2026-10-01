/** Real Postgres regression gate; uses a disposable, offline container only. */
import fs from "node:fs";
import { spawnSync } from "node:child_process";

const eigen = !process.env.PENDAPATAN_CONTAINER;
const container = process.env.PENDAPATAN_CONTAINER ?? `rusen-pendapatan-${process.pid}`;
const lama = fs.readFileSync("supabase/migrations/0027_laporan_dashboard.sql", "utf8");
const mulai = lama.indexOf("create function laporan_penjualan_harian(");
const akhir = lama.indexOf("-- ============================================================ 2.", mulai);
const migrasi = "supabase/migrations/0035_pendapatan_bersih.sql";
const baru = fs.existsSync(migrasi) ? fs.readFileSync(migrasi, "utf8") : "";
const sql = `
begin;
create schema rusen_pendapatan_check;
set search_path to rusen_pendapatan_check, public;
create table orders (id int primary key, status text, paid_at timestamptz,
  subtotal bigint, taxable_subtotal bigint, tax_amount bigint, total bigint,
  tax_status text, payment_method text, is_test_data boolean);
create table refunds (order_id int, created_at timestamptz,
  amount bigint, subtotal bigint, tax_amount bigint);
${lama.slice(mulai, akhir)}
insert into orders values
 (1,'paid','2026-09-30 16:59Z',10000,10000,1000,11000,'taxable','cash',false),
 (2,'paid','2026-09-30 17:00Z',20000,10000,1000,21000,'taxable','non_cash',false),
 (3,'paid','2026-10-01 03:00Z',10000,10000,0,10000,'exempt','cash',false),
 (4,'paid','2026-10-01 04:00Z',10005,10005,1001,11006,'taxable','cash',false),
 (5,'paid','2026-10-01 05:00Z',90000,90000,9000,99000,'taxable','cash',true),
 (6,'pending',null,99000,99000,0,99000,'taxable','cash',false);
insert into refunds values
 (1,'2026-10-01 06:00Z',5500,5000,500),
 (2,'2026-10-01 07:00Z',10500,10000,500),
 (3,'2026-10-01 08:00Z',5000,5000,0),
 (4,'2026-10-01 09:00Z',5503,5003,500),
 (4,'2026-10-02 09:00Z',5503,5002,501),
 (5,'2026-10-01 10:00Z',99000,90000,9000);
create temporary table hasil_v1_lama as
  select * from laporan_penjualan_harian('2026-09-30','2026-10-03');
${baru.replace(/^begin;|^commit;/gm, "")}
do $$
declare r record;
begin
 select * into r from laporan_penjualan_harian_v2('2026-10-01','2026-10-01');
 if (r.omzet_kotor,r.omzet_bersih,r.tertagih_bersih,r.refund_pbjt,r.pbjt_bersih)
    is distinct from (40005::bigint,15002::bigint,15503::bigint,1500::bigint,501::bigint)
 then raise exception 'taxed/mixed/exempt/partial/cross-period refund: %',row_to_json(r); end if;
 if r.jumlah_order <> 3 or r.dasar_pbjt <> 20005 or r.total_refund <> 26503
 then raise exception 'gross/test exclusion changed'; end if;
 select * into r from laporan_penjualan_harian_v2('2026-10-02','2026-10-02');
 if (r.omzet_bersih,r.tertagih_bersih,r.pbjt_bersih)
    is distinct from (-5002::bigint,-5503::bigint,-501::bigint)
 then raise exception 'refund-only day/remainder lost: %',row_to_json(r); end if;
 select * into r from laporan_penjualan_harian_v2('2026-10-03','2026-10-03');
 if r.tertagih_bersih <> 0 or r.pbjt_bersih <> 0 then raise exception 'empty day'; end if;
 select * into r from laporan_penjualan_harian_v2('2026-10-01','2026-10-01',true);
 if r.jumlah_order <> 4 or r.total_refund <> 125503 or r.tertagih_bersih <> 15503
 then raise exception 'include-test behavior changed'; end if;
 if exists (select 1 from laporan_penjualan_harian_v2('2026-09-30','2026-10-03')
   where tertagih_bersih <> omzet_bersih + pbjt_bersih)
 then raise exception 'net income reconciliation'; end if;
 if (select count(*) from laporan_penjualan_harian_v2('2026-09-30','2026-10-03')) <> 4
 then raise exception 'WIB date series'; end if;
 if exists (
   select tanggal,jumlah_order,omzet_kotor,total_refund,omzet_bersih,dasar_pbjt,
     pbjt,omzet_bebas_order,omzet_bukan_objek,tertagih,tertagih_tunai,tertagih_non_tunai
   from laporan_penjualan_harian_v2('2026-09-30','2026-10-03')
   except select * from laporan_penjualan_harian('2026-09-30','2026-10-03'))
 then raise exception 'v1 compatibility'; end if;
 if exists (select * from hasil_v1_lama
   except select * from laporan_penjualan_harian('2026-09-30','2026-10-03'))
   or exists (select * from laporan_penjualan_harian('2026-09-30','2026-10-03')
   except select * from hasil_v1_lama)
 then raise exception 'original v1 results changed'; end if;
end $$;
do $$ begin
 if has_function_privilege('anon','laporan_penjualan_harian_v2(date,date,boolean)','EXECUTE')
   or has_function_privilege('authenticated','laporan_penjualan_harian_v2(date,date,boolean)','EXECUTE')
   or not has_function_privilege('service_role','laporan_penjualan_harian_v2(date,date,boolean)','EXECUTE')
 then raise exception 'report execute privileges changed'; end if;
end $$;
-- A second application must preserve every result and the v1 return shape.
create temporary table sebelum as select * from laporan_penjualan_harian_v2('2026-09-30','2026-10-03');
${baru.replace(/^begin;|^commit;/gm, "")}
do $$ begin
 if exists (select * from sebelum except select * from laporan_penjualan_harian_v2('2026-09-30','2026-10-03'))
 then raise exception 'migration rerun changed results'; end if;
end $$;
rollback;
`;
try {
  if (eigen) {
    const dibuat = spawnSync("docker", ["run", "--pull", "never", "-d", "--name", container, "--network", "none",
      "-e", "POSTGRES_HOST_AUTH_METHOD=trust", "postgres:17"], { encoding: "utf8" });
    if (dibuat.status !== 0) throw new Error(dibuat.stderr || "Postgres test container gagal dibuat.");
    let siap = false;
    for (let i = 0; i < 60; i++) {
      const ping = spawnSync("docker", ["exec", container, "pg_isready", "-U", "postgres"], { encoding: "utf8" });
      if (ping.status === 0) { siap = true; break; }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    if (!siap) throw new Error("Postgres test container belum siap.");
    const roles = spawnSync("docker", ["exec", "-i", container, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1"],
      { input: "create role anon; create role authenticated; create role service_role;", encoding: "utf8" });
    if (roles.status !== 0) throw new Error(roles.stderr);
  }
  const hasil = spawnSync("docker", ["exec", "-i", container, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1"],
    { input: sql, encoding: "utf8" });
  if (hasil.status !== 0) throw new Error(hasil.stderr || hasil.error?.message);
  console.log("Pendapatan: taxed, exempt, mixed goods, refunds, WIB, test exclusion, v1 compatibility and rerun passed.");
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  if (eigen) spawnSync("docker", ["rm", "-f", container], { encoding: "utf8" });
}
