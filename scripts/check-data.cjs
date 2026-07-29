const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  "http://127.0.0.1:54321",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU"
);

async function main() {
  console.log("=== Orders ===");
  const { data: orders, error: oe } = await supabase.from("orders").select("*").order("created_at", { ascending: false });
  if (oe) { console.error("Orders error:", oe); return; }
  console.log(orders?.length, "orders");
  if (orders?.length) orders.forEach(o => console.log(" ", o.id.slice(0,8), o.table_code, o.table_seq, o.status, o.total, o.created_at));

  console.log("\n=== Payments ===");
  const { data: payments, error: pe } = await supabase.from("payments").select("*");
  if (pe) { console.error("Payments error:", pe); return; }
  console.log(payments?.length, "payments");

  console.log("\n=== Order Items ===");
  const { data: items, error: ie } = await supabase.from("order_items").select("*");
  if (ie) { console.error("Items error:", ie); return; }
  console.log(items?.length, "order_items");
  if (items?.length) items.forEach(i => console.log(" ", i.product_name, "x" + i.quantity, "@" + i.unit_price));

  console.log("\n=== Attendance Logs ===");
  const { data: att, error: ate } = await supabase.from("attendance_logs").select("*, employees(name)");
  if (ate) { console.error("Attendance error:", ate); return; }
  console.log(att?.length, "attendance_logs");
  if (att?.length) att.forEach(a => console.log(" ", a.employees?.name, "clock_in:", a.clock_in, "clock_out:", a.clock_out));

  console.log("\n=== Order Item Voids ===");
  const { data: voids } = await supabase.from("order_item_voids").select("*");
  console.log(voids?.length, "voids");

  console.log("\n=== Refunds ===");
  const { data: refunds } = await supabase.from("refunds").select("*");
  console.log(refunds?.length, "refunds");
}

main().catch(console.error);
