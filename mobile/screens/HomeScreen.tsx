import { useCallback, useEffect, useState } from "react";
import { useSQLiteContext } from "expo-sqlite";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { catalogPulledAt, listProducts, pullCatalog } from "../db/catalog";
import { translateOrderError } from "../db/errors";
import {
  appendToOrder,
  checkTableCode,
  createOrder,
  listRecentOrders,
  payOrder,
  voidOrderItem,
} from "../db/orders";
import { useAuth } from "../lib/auth-context";
import {
  border,
  colors,
  radius,
  semantic,
  spacing,
  textStyles,
  touchTarget,
} from "../theme";

/**
 * Layar sementara langkah 3. Bukan UI kasir — layar itu baru dibangun di
 * langkah 5. Tugas layar ini cuma satu: membuktikan lapisan database lokal
 * berperilaku sama dengan fungsi Postgres yang ditirunya, tanpa perlu ada UI.
 *
 * Cara pakainya: matikan koneksi, tekan "Jalankan uji lokal", baca hasilnya.
 * Semua baris harus OK. Kalau ada yang GAGAL, itu penyimpangan nyata antara
 * port lokal dan aturan di 0001_init.sql.
 */
export default function HomeScreen() {
  const { session, logout } = useAuth();
  const db = useSQLiteContext();

  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [catalog, setCatalog] = useState("Katalog belum pernah ditarik.");
  const [orders, setOrders] = useState<
    Array<{ id: string; label: string; status: string; sync: string }>
  >([]);

  const append = (line: string) => setLog((prev) => [...prev, line]);

  const refreshOrders = useCallback(async () => {
    const rows = await listRecentOrders(db, 10);
    setOrders(
      rows.map((o) => ({
        id: o.id,
        label: `${o.table_code}${o.table_seq > 1 ? ` (${o.table_seq})` : ""} · ${
          o.items.length
        } item · ${rupiah(o.total)}`,
        status: o.status,
        sync: o.sync_status,
      }))
    );
  }, [db]);

  useEffect(() => {
    catalogPulledAt(db).then(async (at) => {
      if (!at) return;
      const products = await listProducts(db);
      setCatalog(`${products.length} produk lokal · ditarik ${short(at)}`);
    });
    refreshOrders();
  }, [db, refreshOrders]);

  async function handlePull() {
    setBusy(true);
    setCatalog("Menarik katalog dari server…");
    try {
      const result = await pullCatalog(db);
      setCatalog(
        `${result.products} produk, ${result.categories} kategori · ditarik ${short(
          result.pulledAt
        )}`
      );
      append(`OK  tarik katalog: ${result.products} produk`);
    } catch (error) {
      setCatalog("Tarik katalog gagal.");
      append(`GAGAL tarik katalog: ${(error as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleSelfTest() {
    if (!session) return;
    setBusy(true);
    setLog([]);
    try {
      await runSelfTest(db, session.employeeId, append);
    } catch (error) {
      append(`GAGAL tak terduga: ${translateOrderError(error)}`);
    } finally {
      await refreshOrders();
      setBusy(false);
    }
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Halo, {session?.name}</Text>
          <Text style={styles.role}>{session?.role}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={logout}
          style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
          <Text style={styles.buttonLabel}>Keluar</Text>
        </Pressable>
      </View>

      <Text style={styles.caption}>{catalog}</Text>

      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={handlePull}
          style={({ pressed }) => [
            styles.button,
            busy && styles.disabled,
            pressed && styles.pressed,
          ]}>
          <Text style={styles.buttonLabel}>Tarik katalog</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={handleSelfTest}
          style={({ pressed }) => [
            styles.button,
            styles.buttonPrimary,
            busy && styles.disabled,
            pressed && styles.pressed,
          ]}>
          <Text style={[styles.buttonLabel, styles.buttonPrimaryLabel]}>
            Jalankan uji lokal
          </Text>
        </Pressable>
      </View>

      {busy ? <ActivityIndicator color={colors.primary[600]} /> : null}

      <ScrollView style={styles.logBox} contentContainerStyle={styles.logInner}>
        {log.map((line, index) => (
          <Text
            key={index}
            style={[
              styles.logLine,
              line.startsWith("GAGAL") && styles.logLineFail,
            ]}>
            {line}
          </Text>
        ))}
        {log.length === 0 ? (
          <Text style={styles.caption}>
            Belum ada hasil. Tarik katalog sekali saat online, lalu uji lokal
            boleh dijalankan dalam mode pesawat.
          </Text>
        ) : null}
      </ScrollView>

      <Text style={styles.caption}>Order lokal terbaru</Text>
      <ScrollView style={styles.orderBox} contentContainerStyle={styles.logInner}>
        {orders.map((o) => (
          <View key={o.id} style={styles.orderRow}>
            <Text style={styles.orderLabel}>{o.label}</Text>
            <Text style={styles.orderMeta}>
              {o.status} · sync {o.sync}
            </Text>
          </View>
        ))}
        {orders.length === 0 ? (
          <Text style={styles.caption}>Belum ada order lokal.</Text>
        ) : null}
      </ScrollView>
    </View>
  );
}

/**
 * Menjalankan seluruh daftar verifikasi langkah 3 dalam satu tekan. Setiap
 * pemeriksaan menyebut aturan mana di 0001_init.sql yang sedang diuji, supaya
 * kegagalan langsung menunjuk ke penyebabnya.
 */
async function runSelfTest(
  db: ReturnType<typeof useSQLiteContext>,
  employeeId: string,
  append: (line: string) => void
) {
  const products = await listProducts(db);
  if (products.length < 2) {
    append("GAGAL: butuh minimal 2 produk lokal. Tarik katalog dulu.");
    return;
  }
  const [a, b] = products;
  const tableCode = `UJI-${Date.now().toString().slice(-5)}`;

  const check = async (label: string, fn: () => Promise<void>) => {
    try {
      await fn();
      append(`OK  ${label}`);
    } catch (error) {
      append(`GAGAL ${label}: ${translateOrderError(error)}`);
      throw error;
    }
  };

  const expectThrows = async (label: string, code: string, fn: () => Promise<unknown>) => {
    try {
      await fn();
      append(`GAGAL ${label}: seharusnya ditolak dengan ${code}`);
    } catch (error) {
      const actual = (error as { code?: string }).code;
      if (actual === code) append(`OK  ${label} ditolak (${code})`);
      else append(`GAGAL ${label}: dapat ${actual ?? error} bukan ${code}`);
    }
  };

  let orderId = "";
  let version = 1;

  await check("buat order + total dari subtotal", async () => {
    orderId = await createOrder(db, {
      tableCode,
      employeeId,
      items: [
        { productId: a.id, quantity: 2, notes: "" },
        { productId: b.id, quantity: 1, notes: "tanpa gula" },
      ],
    });
    const order = await db.getFirstAsync<{ total: number }>(
      "select total from orders where id = ?",
      [orderId]
    );
    const expected = a.price * 2 + b.price;
    if (order?.total !== expected) {
      throw new Error(`total ${order?.total} bukan ${expected}`);
    }
  });

  await check("idempoten: createOrder dengan id sama", async () => {
    const again = await createOrder(db, {
      tableCode,
      employeeId,
      items: [{ productId: a.id, quantity: 9, notes: "" }],
      orderId,
    });
    if (again !== orderId) throw new Error("id berbeda");
    const n = await db.getFirstAsync<{ n: number }>(
      "select count(*) as n from order_items where order_id = ?",
      [orderId]
    );
    if (n?.n !== 2) throw new Error(`item jadi ${n?.n}, seharusnya tetap 2`);
  });

  await check("table_seq naik pada kode meja yang sama", async () => {
    const second = await createOrder(db, {
      tableCode,
      employeeId,
      items: [{ productId: a.id, quantity: 1, notes: "" }],
    });
    const row = await db.getFirstAsync<{ table_seq: number }>(
      "select table_seq from orders where id = ?",
      [second]
    );
    if (row?.table_seq !== 2) throw new Error(`table_seq ${row?.table_seq}`);
    const conflicts = await checkTableCode(db, tableCode);
    if (conflicts.length !== 2) throw new Error("checkTableCode tidak lengkap");
  });

  await check("append menggabung item yang identik", async () => {
    version = await appendToOrder(db, {
      orderId,
      expectedVersion: 1,
      items: [{ productId: a.id, quantity: 3, notes: "" }],
    });
    const item = await db.getFirstAsync<{ quantity: number }>(
      "select quantity from order_items where order_id = ? and product_id = ? and notes = ''",
      [orderId, a.id]
    );
    if (item?.quantity !== 5) throw new Error(`quantity ${item?.quantity}`);
  });

  await expectThrows("append dengan version basi", "STALE_ORDER", () =>
    appendToOrder(db, {
      orderId,
      expectedVersion: 1,
      items: [{ productId: a.id, quantity: 1, notes: "" }],
    })
  );

  await check("void sebagian menulis jejak & menurunkan total", async () => {
    const before = await db.getFirstAsync<{ total: number }>(
      "select total from orders where id = ?",
      [orderId]
    );
    const item = await db.getFirstAsync<{ id: string }>(
      "select id from order_items where order_id = ? and product_id = ? and notes = ''",
      [orderId, a.id]
    );
    version = await voidOrderItem(db, {
      orderId,
      itemId: item!.id,
      quantity: 2,
      employeeId,
      reason: "uji",
      expectedVersion: version,
    });
    const after = await db.getFirstAsync<{ total: number }>(
      "select total from orders where id = ?",
      [orderId]
    );
    const trace = await db.getFirstAsync<{ n: number }>(
      "select count(*) as n from order_item_voids where order_id = ?",
      [orderId]
    );
    if (trace?.n !== 1) throw new Error("jejak void tidak tertulis");
    if (after!.total !== before!.total - a.price * 2) {
      throw new Error(`total ${after!.total}`);
    }
  });

  await expectThrows("bayar tunai kurang dari total", "INSUFFICIENT_AMOUNT", () =>
    payOrder(db, {
      orderId,
      method: "cash",
      amountReceived: 1,
      employeeId,
    })
  );

  await check("pelunasan tunai + kembalian benar", async () => {
    const order = await db.getFirstAsync<{ total: number }>(
      "select total from orders where id = ?",
      [orderId]
    );
    const received = order!.total + 50_000;
    await payOrder(db, { orderId, method: "cash", amountReceived: received, employeeId });
    const paid = await db.getFirstAsync<{
      status: string;
      change_amount: number;
      sync_status: string;
    }>("select status, change_amount, sync_status from orders where id = ?", [orderId]);
    if (paid?.status !== "paid") throw new Error("status bukan paid");
    if (paid.change_amount !== 50_000) throw new Error(`kembalian ${paid.change_amount}`);
    if (paid.sync_status !== "pending") throw new Error("sync_status bukan pending");
  });

  await check("pelunasan idempoten, payments tetap satu baris", async () => {
    await payOrder(db, { orderId, method: "cash", amountReceived: 999_999, employeeId });
    const n = await db.getFirstAsync<{ n: number }>(
      "select count(*) as n from payments where order_id = ?",
      [orderId]
    );
    if (n?.n !== 1) throw new Error(`payments ${n?.n} baris`);
  });

  await expectThrows("ubah order yang sudah lunas", "ORDER_NOT_EDITABLE", () =>
    appendToOrder(db, {
      orderId,
      expectedVersion: version,
      items: [{ productId: a.id, quantity: 1, notes: "" }],
    })
  );

  await check("void seluruh item mengubah order jadi void", async () => {
    const fresh = await createOrder(db, {
      tableCode: `${tableCode}-V`,
      employeeId,
      items: [{ productId: b.id, quantity: 1, notes: "" }],
    });
    const item = await db.getFirstAsync<{ id: string }>(
      "select id from order_items where order_id = ?",
      [fresh]
    );
    await voidOrderItem(db, {
      orderId: fresh,
      itemId: item!.id,
      quantity: 1,
      employeeId,
      reason: "uji habis",
      expectedVersion: 1,
    });
    const row = await db.getFirstAsync<{ status: string; total: number }>(
      "select status, total from orders where id = ?",
      [fresh]
    );
    if (row?.status !== "void" || row.total !== 0) {
      throw new Error(`status ${row?.status}, total ${row?.total}`);
    }
  });

  append("— selesai —");
}

const rupiah = (n: number) => `Rp${n.toLocaleString("id-ID")}`;
const short = (iso: string) => new Date(iso).toLocaleString("id-ID");

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    gap: spacing.sm,
    padding: spacing.lg,
    backgroundColor: semantic.surfaceMuted,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  greeting: { ...textStyles.screenTitle, color: semantic.textPrimary },
  role: { ...textStyles.statusBadge, color: semantic.textSecondary },
  caption: { ...textStyles.caption, color: semantic.textSecondary },
  actions: { flexDirection: "row", gap: spacing.sm },
  button: {
    minHeight: touchTarget.min,
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    borderWidth: border.hairline,
    borderColor: semantic.border,
    backgroundColor: colors.neutral[0],
  },
  buttonPrimary: {
    backgroundColor: colors.primary[600],
    borderColor: colors.primary[600],
  },
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.4 },
  buttonLabel: { ...textStyles.bodyStrong, color: semantic.textPrimary },
  buttonPrimaryLabel: { color: colors.neutral[0] },
  logBox: {
    flex: 1,
    borderRadius: radius.md,
    borderWidth: border.hairline,
    borderColor: semantic.border,
    backgroundColor: colors.neutral[0],
  },
  orderBox: {
    maxHeight: 160,
    borderRadius: radius.md,
    borderWidth: border.hairline,
    borderColor: semantic.border,
    backgroundColor: colors.neutral[0],
  },
  logInner: { padding: spacing.md, gap: spacing.xs },
  logLine: { ...textStyles.caption, color: semantic.textPrimary },
  logLineFail: { color: colors.status.void },
  orderRow: { gap: 2 },
  orderLabel: { ...textStyles.body, color: semantic.textPrimary },
  orderMeta: { ...textStyles.caption, color: semantic.textSecondary },
});
