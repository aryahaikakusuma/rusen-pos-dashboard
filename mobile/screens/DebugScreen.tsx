import { useCallback, useEffect, useState } from "react";
import { useSQLiteContext } from "expo-sqlite";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import Button from "../components/Button";
import { catalogPulledAt, listProducts, pullCatalog } from "../db/catalog";
import { translateOrderError } from "../db/errors";
import {
  appendToOrder,
  checkTableCode,
  clearTestOrders,
  createOrder,
  payOrder,
  TEST_TABLE_PREFIX,
  voidOrderItem,
} from "../db/orders";
import { useAuth } from "../lib/auth-context";
import {
  groupProductVariants,
  type ProductEntry,
} from "../lib/product-variants";
import {
  border,
  colors,
  radius,
  semantic,
  spacing,
  textStyles,
} from "../theme";

/**
 * Bukan layar kasir — ini satu-satunya rangkaian uji regresi yang dimiliki
 * proyek ini, dan sengaja tidak dibuang saat layar kasir sungguhan dibangun.
 *
 * Isinya membuktikan lapisan database lokal berperilaku sama dengan fungsi
 * Postgres yang ditirunya. Cara pakainya: matikan koneksi, tekan "Jalankan uji
 * lokal", baca hasilnya. Semua baris harus OK; satu GAGAL berarti ada
 * penyimpangan nyata terhadap aturan di 0001_init.sql.
 */
export default function DebugScreen({ onClose }: { onClose: () => void }) {
  const { session } = useAuth();
  const db = useSQLiteContext();

  /**
   * Alat uji hanya untuk owner. Menarik katalog tetap terbuka untuk semua peran
   * karena itu bukan pengujian — tanpa katalog, kasir tidak punya produk sama
   * sekali dan aplikasinya tidak bisa dipakai.
   *
   * Ini pagar tampilan, bukan pagar keamanan, dan memang cukup di sini: semua
   * aksi di layar ini hanya menyentuh SQLite di perangkat, tidak ada satu pun
   * yang menulis ke server. Kalau nanti ada aksi yang menyentuh data outlet,
   * pagar sungguhan harus dipasang di RLS, bukan di sini.
   */
  const isOwner = session?.role === "owner";

  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [catalog, setCatalog] = useState("Katalog belum pernah ditarik.");

  const append = (line: string) => setLog((prev) => [...prev, line]);

  const describeCatalog = useCallback(async () => {
    const at = await catalogPulledAt(db);
    if (!at) return;
    const products = await listProducts(db);
    setCatalog(`${products.length} produk lokal · ditarik ${short(at)}`);
  }, [db]);

  useEffect(() => {
    void describeCatalog();
  }, [describeCatalog]);

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

  async function handleClearTests() {
    setBusy(true);
    try {
      const removed = await clearTestOrders(db);
      append(`OK  hapus ${removed} order uji`);
    } catch (error) {
      append(`GAGAL hapus data uji: ${(error as Error).message}`);
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
      setBusy(false);
    }
  }

  async function handleVariantChecks() {
    setBusy(true);
    setLog([]);
    try {
      await runVariantChecks(db, append);
    } catch (error) {
      append(`GAGAL tak terduga: ${translateOrderError(error)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.title}>
          {isOwner ? "Uji lapisan lokal" : "Katalog"}
        </Text>
        <Button label="Tutup" onPress={onClose} style={styles.close} />
      </View>

      <Text style={styles.caption}>{catalog}</Text>

      <View style={styles.actions}>
        <Button
          label="Tarik katalog"
          // Tanpa alat uji di sekitarnya, menarik katalog adalah satu-satunya
          // tindakan di layar ini — jadi ia yang jadi aksi utama.
          variant={isOwner ? "secondary" : "primary"}
          disabled={busy}
          onPress={() => void handlePull()}
          style={styles.action}
        />
        {isOwner ? (
          <>
            <Button
              label="Jalankan uji lokal"
              variant="primary"
              disabled={busy}
              onPress={() => void handleSelfTest()}
              style={styles.action}
            />
            <Button
              label="Hapus data uji"
              disabled={busy}
              onPress={() => void handleClearTests()}
              style={styles.action}
            />
            <Button
              label="Uji pengelompokan varian"
              variant="secondary"
              disabled={busy}
              onPress={() => void handleVariantChecks()}
              style={styles.action}
            />
          </>
        ) : null}
        {busy ? <ActivityIndicator color={colors.primary[600]} /> : null}
      </View>

      <View style={styles.panel}>
        <ScrollView contentContainerStyle={styles.panelInner}>
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
              {isOwner
                ? "Belum ada hasil. Tarik katalog sekali saat online, lalu uji lokal boleh dijalankan dalam mode pesawat."
                : "Tarik katalog sekali saat online supaya daftar produk tersedia. Setelah itu kasir bisa bekerja tanpa koneksi."}
            </Text>
          ) : null}
        </ScrollView>
      </View>
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
  // Awalannya dipakai bersama tombol "Hapus data uji" untuk mengenali order
  // buangan; order sungguhan tidak pernah memakai kode meja berawalan ini.
  const tableCode = `${TEST_TABLE_PREFIX}${Date.now().toString().slice(-5)}`;

  const check = async (label: string, fn: () => Promise<void>) => {
    try {
      await fn();
      append(`OK  ${label}`);
    } catch (error) {
      append(`GAGAL ${label}: ${translateOrderError(error)}`);
      throw error;
    }
  };

  const expectThrows = async (
    label: string,
    code: string,
    fn: () => Promise<unknown>
  ) => {
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

  await expectThrows(
    "bayar tunai kurang dari total",
    "INSUFFICIENT_AMOUNT",
    () =>
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
    await payOrder(db, {
      orderId,
      method: "cash",
      amountReceived: received,
      employeeId,
    });
    const paid = await db.getFirstAsync<{
      status: string;
      change_amount: number;
      sync_status: string;
    }>("select status, change_amount, sync_status from orders where id = ?", [
      orderId,
    ]);
    if (paid?.status !== "paid") throw new Error("status bukan paid");
    if (paid.change_amount !== 50_000) {
      throw new Error(`kembalian ${paid.change_amount}`);
    }
    if (paid.sync_status !== "pending") {
      throw new Error("sync_status bukan pending");
    }
  });

  await check("pelunasan idempoten, payments tetap satu baris", async () => {
    await payOrder(db, {
      orderId,
      method: "cash",
      amountReceived: 999_999,
      employeeId,
    });
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

/**
 * Pemeriksaan pengelompokan varian suhu. Dijalankan atas katalog lokal yang
 * sesungguhnya, bukan data buatan: yang mau dibuktikan justru bahwa aturan
 * akhiran cocok dengan penamaan menu yang dipakai outlet ini.
 */
async function runVariantChecks(
  db: ReturnType<typeof useSQLiteContext>,
  append: (line: string) => void
) {
  const products = await listProducts(db);
  if (products.length === 0) {
    append("GAGAL: katalog lokal kosong. Tarik katalog dulu.");
    return;
  }

  const entries = groupProductVariants(products);
  const paired = entries.filter((e) => e.options.length > 1);

  const ok = (label: string) => append(`OK  ${label}`);
  const fail = (label: string, detail: string) =>
    append(`GAGAL ${label}: ${detail}`);

  // Asersi sifat, bukan jumlah. Menambah atau menghapus menu tidak boleh
  // membuat pemeriksaan ini merah — yang diuji aturannya, bukan isi katalog.

  // 1. Tidak ada produk yang hilang atau terhitung dua kali. Ini yang menangkap
  //    kegagalan paling mahal: menu yang lenyap dari grid tanpa error.
  const grouped = entries.flatMap((e) => e.options.map((o) => o.product.id));
  const uniqueGrouped = new Set(grouped);
  if (grouped.length !== products.length || uniqueGrouped.size !== products.length) {
    fail(
      "semua produk terwakili tepat sekali",
      `${products.length} produk jadi ${grouped.length} opsi (${uniqueGrouped.size} unik)`
    );
  } else {
    ok("semua produk terwakili tepat sekali");
  }

  // 2. Satu entry tidak boleh punya dua opsi bersuhu sama — itu akan memunculkan
  //    lembar dengan dua tombol "Panas".
  const duplicateVariant = entries.find(
    (e) => new Set(e.options.map((o) => o.variant)).size !== e.options.length
  );
  if (duplicateVariant) {
    fail("tidak ada suhu kembar dalam satu kartu", `"${duplicateVariant.label}"`);
  } else {
    ok("tidak ada suhu kembar dalam satu kartu");
  }

  // 3. Panas selalu opsi pertama, supaya posisi tombol tidak berpindah antar menu.
  const wrongOrder = paired.find((e) => e.options[0].variant !== "panas");
  if (wrongOrder) {
    fail("panas selalu di urutan pertama", `"${wrongOrder.label}"`);
  } else {
    ok("panas selalu di urutan pertama");
  }

  // 4. Rentang harga cocok dengan opsi yang benar-benar ada.
  const wrongPrice = entries.find((e) => {
    const prices = e.options.map((o) => o.product.price);
    return e.minPrice !== Math.min(...prices) || e.maxPrice !== Math.max(...prices);
  });
  if (wrongPrice) {
    fail("rentang harga cocok dengan opsinya", `"${wrongPrice.label}"`);
  } else {
    ok("rentang harga cocok dengan opsinya");
  }

  // 5. Kartu tunggal memakai nama utuh, kartu gabungan memakai nama dasar.
  const wrongLabel = entries.find(
    (e) => e.options.length === 1 && e.label !== e.options[0].product.name
  );
  if (wrongLabel) {
    fail("kartu tunggal memakai nama utuh", `"${wrongLabel.label}"`);
  } else {
    ok("kartu tunggal memakai nama utuh");
  }

  // 6. Inti aturannya: dua produk sekategori yang namanya hanya berbeda pada
  //    penanda suhu WAJIB berada di kartu yang sama. Normalisasi di bawah ini
  //    sengaja ditulis ulang di sini, tidak diimpor dari modulnya — kalau ia
  //    mengimpor regex yang sama, pemeriksaan ini jadi memutar dan selalu lolos
  //    meski aturannya rusak. Inilah yang menangkap hilangnya akhiran "S".
  const strip = (name: string) =>
    name.replace(/\s+(panas|dingin|es|s)$/i, "").trim().toLowerCase();
  const entryOfProduct = new Map<string, ProductEntry>();
  for (const entry of entries) {
    for (const option of entry.options) entryOfProduct.set(option.product.id, entry);
  }
  let separated: string | null = null;
  for (const a of products) {
    for (const b of products) {
      if (a.id === b.id || a.category_id !== b.category_id) continue;
      if (a.name === b.name || strip(a.name) !== strip(b.name)) continue;
      if (entryOfProduct.get(a.id) !== entryOfProduct.get(b.id)) {
        separated = `"${a.name}" dan "${b.name}"`;
        break;
      }
    }
    if (separated) break;
  }
  if (separated) {
    fail("pasangan suhu selalu satu kartu", separated);
  } else {
    ok("pasangan suhu selalu satu kartu");
  }

  // Informasi, bukan asersi. Angkanya berguna dilihat manusia — saat rencana ini
  // ditulis katalog seed menghasilkan 255 kartu, 38 di antaranya berpasangan —
  // tapi menegaskannya membuat uji merah setiap kali menu bertambah.
  append(
    `info: ${products.length} produk → ${entries.length} kartu, ${paired.length} berpasangan`
  );
}

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
    gap: spacing.md,
  },
  title: {
    ...textStyles.screenTitle,
    flex: 1,
    color: semantic.textPrimary,
  },
  close: {
    paddingHorizontal: spacing.lg,
  },
  caption: { ...textStyles.caption, color: semantic.textSecondary },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: spacing.sm,
  },
  action: {
    flexGrow: 1,
  },
  panel: {
    flex: 1,
    borderRadius: radius.md,
    borderWidth: border.hairline,
    borderColor: semantic.border,
    backgroundColor: colors.neutral[0],
  },
  panelInner: { padding: spacing.md, gap: spacing.xs },
  logLine: { ...textStyles.caption, color: semantic.textPrimary },
  logLineFail: { color: colors.status.void },
});
