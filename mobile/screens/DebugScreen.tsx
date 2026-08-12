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
import {
  catalogPulledAt,
  listProducts,
  pullCatalog,
  taxRateBps,
} from "../db/catalog";
import { OrderError, translateOrderError } from "../db/errors";
import {
  appendToOrder,
  checkTableCode,
  clearTestOrders,
  createOrder,
  createRefund,
  payOrder,
  voidOrderItem,
} from "../db/orders";
import { useAuth } from "../lib/auth-context";
import {
  groupProductVariants,
  TOPPING_BOXES,
  toppingMask,
  toppingValue,
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
  // Kode mejanya sekarang biasa saja. Yang menandai order ini sebagai buangan
  // adalah `testMode` di setiap createOrder di bawah, yang menyalakan kolom
  // is_test_data — penanda yang sama yang dibaca "Hapus data uji" dan yang
  // membuat order ini tidak pernah masuk laporan mana pun, di perangkat maupun
  // di server. Sampai V8 penandanya awalan `UJI-` pada kode meja ini.
  const tableCode = `UJI ${Date.now().toString().slice(-5)}`;
  // Dipakai berulang di bawah; alasannya wajib, jadi tidak boleh kosong.
  const testMode = { reason: "Uji mandiri layar Debug" };

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
      testMode,
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

  await check("order pending: subtotal = total, pajak belum ada", async () => {
    // Pajak baru diputuskan saat pelunasan, jadi selama pending kedua angka itu
    // wajib sama. Kalau berpisah lebih awal, struk sementara dan struk final
    // akan bercerita dua hal berbeda tentang order yang sama.
    const row = await db.getFirstAsync<{
      subtotal: number;
      total: number;
      tax_amount: number;
      tax_status: string;
    }>(
      "select subtotal, total, tax_amount, tax_status from orders where id = ?",
      [orderId]
    );
    if (row!.subtotal !== row!.total) {
      throw new Error(`subtotal ${row!.subtotal} != total ${row!.total}`);
    }
    if (row!.tax_amount !== 0) throw new Error(`pajak ${row!.tax_amount}`);
    if (row!.tax_status !== "taxable") throw new Error(row!.tax_status);
  });

  await check("idempoten: createOrder dengan id sama", async () => {
    const again = await createOrder(db, {
      tableCode,
      employeeId,
      testMode,
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
      testMode,
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
        channel: "cash",
        amountReceived: 1,
        employeeId,
        taxStatus: "taxable",
      })
  );

  // Dulu di sini ada expectThrows("bebas pajak tanpa keterangan",
  // "TAX_EXEMPT_REASON_REQUIRED"). Kewajiban itu dibuang di 0026 — kasir tidak
  // punya kolomnya lagi. Kebalikannya yang sekarang dijaga, dan penjagaannya
  // ada di check "pelunasan bebas pajak" di bawah: tanpa keterangan HARUS
  // berhasil, dan penyetujunya tetap tercatat.

  await check("pelunasan kena pajak: aritmetika + kembalian benar", async () => {
    const order = await db.getFirstAsync<{ subtotal: number }>(
      "select subtotal from orders where id = ?",
      [orderId]
    );
    // Tarif dibaca dari app_state, sama seperti payOrder membacanya. Bukan
    // angka 1000 yang ditulis di sini: tarif yang dipatok di uji akan tetap
    // hijau justru ketika tarif sungguhannya salah.
    const rate = await taxRateBps(db);
    if (rate === null) throw new Error("tarif PBJT belum ditarik ke perangkat");

    const subtotal = order!.subtotal;
    // Dihitung ulang di sini, TIDAK dengan memanggil hitungPbjt(). Mengimpor
    // fungsi yang sedang diuji membuat pemeriksaannya melingkar dan selalu
    // hijau — pola yang sama dengan regex `strip` di uji varian.
    const pajak = Math.floor((subtotal * rate + 5000) / 10000);
    const tagihan = subtotal + pajak;
    const received = tagihan + 50_000;

    await payOrder(db, {
      orderId,
      channel: "cash",
      amountReceived: received,
      employeeId,
      taxStatus: "taxable",
    });

    const paid = await db.getFirstAsync<{
      status: string;
      subtotal: number;
      total: number;
      tax_status: string;
      tax_rate_bps: number;
      tax_amount: number;
      tax_exempt_reason: string | null;
      tax_approved_by: string | null;
      change_amount: number;
      sync_status: string;
    }>(
      `select status, subtotal, total, tax_status, tax_rate_bps, tax_amount,
              tax_exempt_reason, tax_approved_by, change_amount, sync_status
       from orders where id = ?`,
      [orderId]
    );
    if (paid?.status !== "paid") throw new Error("status bukan paid");
    if (paid.subtotal !== subtotal) throw new Error(`subtotal ${paid.subtotal}`);
    if (paid.tax_amount !== pajak) throw new Error(`pajak ${paid.tax_amount}`);
    if (paid.total !== tagihan) throw new Error(`total ${paid.total}`);
    if (paid.tax_rate_bps !== rate) throw new Error(`tarif ${paid.tax_rate_bps}`);
    if (paid.tax_status !== "taxable") throw new Error(paid.tax_status);
    // Order kena pajak tidak boleh membawa sisa keterangan pembebasan —
    // constraint di Postgres menolaknya, jadi order seperti itu tidak akan
    // pernah bisa disinkronkan.
    if (paid.tax_exempt_reason !== null || paid.tax_approved_by !== null) {
      throw new Error("keterangan bebas pajak tertinggal di order kena pajak");
    }
    if (paid.change_amount !== 50_000) {
      throw new Error(`kembalian ${paid.change_amount}`);
    }
    if (paid.sync_status !== "pending") {
      throw new Error("sync_status bukan pending");
    }
  });

  await check("pelunasan idempoten, pajak tidak berlipat", async () => {
    const sebelum = await db.getFirstAsync<{ total: number; tax_amount: number }>(
      "select total, tax_amount from orders where id = ?",
      [orderId]
    );
    await payOrder(db, {
      orderId,
      channel: "cash",
      amountReceived: 999_999,
      employeeId,
      taxStatus: "taxable",
    });
    const sesudah = await db.getFirstAsync<{ total: number; tax_amount: number }>(
      "select total, tax_amount from orders where id = ?",
      [orderId]
    );
    if (sesudah!.total !== sebelum!.total) {
      throw new Error(`total berubah jadi ${sesudah!.total}`);
    }
    if (sesudah!.tax_amount !== sebelum!.tax_amount) {
      throw new Error(`pajak berubah jadi ${sesudah!.tax_amount}`);
    }
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

  // Sejak 0026: TANPA keterangan sama sekali. Itu yang membuat check ini juga
  // menjadi penjaga bahwa pembebasan tidak lagi bisa digagalkan oleh kolom yang
  // sudah tidak ada — kalau constraint atau payOrder diam-diam menuntutnya
  // kembali, panggilan di bawah melempar dan check ini merah.
  await check("pelunasan bebas pajak: nol pajak, tanpa keterangan", async () => {
    const bebas = await createOrder(db, {
      tableCode: `${tableCode}-BP`,
      employeeId,
      testMode,
      items: [{ productId: b.id, quantity: 1, notes: "" }],
    });
    await payOrder(db, {
      orderId: bebas,
      channel: "transfer",
      amountReceived: null,
      employeeId,
      taxStatus: "exempt",
    });
    const row = await db.getFirstAsync<{
      subtotal: number;
      total: number;
      tax_status: string;
      tax_rate_bps: number;
      tax_amount: number;
      tax_exempt_reason: string;
      tax_approved_by: string;
    }>(
      `select subtotal, total, tax_status, tax_rate_bps, tax_amount,
              tax_exempt_reason, tax_approved_by
       from orders where id = ?`,
      [bebas]
    );
    if (row!.tax_status !== "exempt") throw new Error(row!.tax_status);
    if (row!.tax_amount !== 0) throw new Error(`pajak ${row!.tax_amount}`);
    if (row!.total !== row!.subtotal) {
      throw new Error(`total ${row!.total} != subtotal ${row!.subtotal}`);
    }
    // Keterangan tidak diminta lagi (0026), jadi yang tersimpan harus null —
    // bukan string kosong. Kolom kosong yang bukan null lolos begitu saja di
    // laporan sebagai keterangan yang "ada tapi hampa".
    if (row!.tax_exempt_reason !== null) {
      throw new Error(`keterangan tertulis "${row!.tax_exempt_reason}"`);
    }
    // Yang justru menjadi satu-satunya jejak audit yang tersisa. Kalau baris
    // ini merah, pembebasan pajak sudah tidak bisa dipertanggungjawabkan ke
    // siapa pun — dan push_order akan menolak kirimannya.
    if (row!.tax_approved_by !== employeeId) {
      throw new Error("penyetuju bukan kasir yang sedang login");
    }
    // Tarif tetap di-snapshot walau tidak dipungut. Tanpa ini, "berapa pajak
    // yang tidak jadi ditagih" hilang begitu perda mengubah tarif.
    if (row!.tax_rate_bps <= 0) {
      throw new Error("tarif tidak ikut tersimpan pada order bebas pajak");
    }
  });

  // ---------------------------------------------------------------- refund
  //
  // Aritmetika refund gagal DIAM-DIAM: pajak yang salah sedikit tetap tampil
  // wajar di layar, dan baru terlihat saat laporan pajak tidak cocok dengan
  // laci. Pemeriksaan di bawah menghitung ulang angkanya secara inline, bukan
  // dengan memanggil hitungPbjt — mengimpor fungsi yang sedang diuji membuat
  // pemeriksaannya melingkar dan selalu hijau.
  await check("refund sebagian: pajak proporsional, order tak berubah", async () => {
    const rate = await taxRateBps(db);
    if (rate === null) throw new Error("tarif PBJT belum ditarik ke perangkat");

    const oid = await createOrder(db, {
      tableCode: `${tableCode}-R1`,
      employeeId,
      testMode,
      items: [{ productId: a.id, quantity: 2, notes: "" }],
    });
    await payOrder(db, {
      orderId: oid,
      channel: "transfer",
      amountReceived: null,
      employeeId,
      taxStatus: "taxable",
    });

    const sebelum = await db.getFirstAsync<{
      subtotal: number;
      tax_amount: number;
      total: number;
      version: number;
    }>("select subtotal, tax_amount, total, version from orders where id = ?", [
      oid,
    ]);
    const item = await db.getFirstAsync<{ id: string; unit_price: number }>(
      "select id, unit_price from order_items where order_id = ?",
      [oid]
    );

    await createRefund(db, {
      orderId: oid,
      employeeId,
      reason: "salah pesan",
      items: [{ orderItemId: item!.id, quantity: 1 }],
    });

    const refund = await db.getFirstAsync<{
      subtotal: number;
      tax_amount: number;
      amount: number;
      reason: string;
    }>("select subtotal, tax_amount, amount, reason from refunds where order_id = ?", [
      oid,
    ]);

    const pokok = item!.unit_price;
    const pajak = Math.floor((pokok * rate + 5000) / 10000);
    if (refund!.subtotal !== pokok) throw new Error(`pokok ${refund!.subtotal}`);
    if (refund!.tax_amount !== pajak) throw new Error(`pajak ${refund!.tax_amount}`);
    if (refund!.amount !== pokok + pajak) throw new Error(`jumlah ${refund!.amount}`);

    // Yang paling penting: baris order TIDAK bergeser sepeser pun. `total`
    // adalah yang sudah ditagihkan dan sudah tercetak di struk pelanggan.
    const sesudah = await db.getFirstAsync<{
      subtotal: number;
      tax_amount: number;
      total: number;
      version: number;
      sync_status: string;
    }>(
      `select subtotal, tax_amount, total, version, sync_status
       from orders where id = ?`,
      [oid]
    );
    if (
      sesudah!.subtotal !== sebelum!.subtotal ||
      sesudah!.tax_amount !== sebelum!.tax_amount ||
      sesudah!.total !== sebelum!.total
    ) {
      throw new Error("baris order berubah oleh refund");
    }
    // Versi WAJIB naik: push_order langsung return kalau versinya tidak lebih
    // tinggi, dan refundnya tidak akan pernah tersisip — dengan jawaban sukses.
    if (sesudah!.version <= sebelum!.version) {
      throw new Error("versi tidak naik, refund tidak akan pernah terkirim");
    }
    if (sesudah!.sync_status !== "pending") {
      throw new Error("order tidak kembali ke antrean kirim");
    }
  });

  await check("refund sampai habis menutup pajak PERSIS", async () => {
    const oid = await createOrder(db, {
      tableCode: `${tableCode}-R2`,
      employeeId,
      testMode,
      items: [{ productId: a.id, quantity: 3, notes: "" }],
    });
    await payOrder(db, {
      orderId: oid,
      channel: "transfer",
      amountReceived: null,
      employeeId,
      taxStatus: "taxable",
    });
    const item = await db.getFirstAsync<{ id: string }>(
      "select id from order_items where order_id = ?",
      [oid]
    );

    // Dipecah tiga. Kalau tiap bagian hanya memakai rumus, pembulatannya bisa
    // menyisakan rupiah yang tidak pernah bisa dikembalikan; aturan "sisa" di
    // refund terakhir yang menutupnya.
    for (let i = 0; i < 3; i += 1) {
      await createRefund(db, {
        orderId: oid,
        employeeId,
        reason: null,
        items: [{ orderItemId: item!.id, quantity: 1 }],
      });
    }

    const total = await db.getFirstAsync<{
      pokok: number;
      pajak: number;
      uang: number;
    }>(
      `select coalesce(sum(subtotal), 0) as pokok,
              coalesce(sum(tax_amount), 0) as pajak,
              coalesce(sum(amount), 0) as uang
       from refunds where order_id = ?`,
      [oid]
    );
    const order = await db.getFirstAsync<{
      subtotal: number;
      tax_amount: number;
      total: number;
    }>("select subtotal, tax_amount, total from orders where id = ?", [oid]);

    if (total!.pokok !== order!.subtotal) throw new Error(`pokok ${total!.pokok}`);
    if (total!.pajak !== order!.tax_amount) throw new Error(`pajak ${total!.pajak}`);
    if (total!.uang !== order!.total) throw new Error(`uang ${total!.uang}`);
  });

  await check("refund order bebas pajak mengembalikan pajak nol", async () => {
    const oid = await createOrder(db, {
      tableCode: `${tableCode}-R3`,
      employeeId,
      testMode,
      items: [{ productId: b.id, quantity: 1, notes: "" }],
    });
    await payOrder(db, {
      orderId: oid,
      channel: "transfer",
      amountReceived: null,
      employeeId,
      taxStatus: "exempt",
    });
    const item = await db.getFirstAsync<{ id: string }>(
      "select id from order_items where order_id = ?",
      [oid]
    );
    await createRefund(db, {
      orderId: oid,
      employeeId,
      reason: null,
      items: [{ orderItemId: item!.id, quantity: 1 }],
    });
    const refund = await db.getFirstAsync<{ tax_amount: number; amount: number; subtotal: number }>(
      "select tax_amount, amount, subtotal from refunds where order_id = ?",
      [oid]
    );
    if (refund!.tax_amount !== 0) throw new Error(`pajak ${refund!.tax_amount}`);
    if (refund!.amount !== refund!.subtotal) {
      throw new Error("jumlah tidak sama dengan pokok pada order bebas pajak");
    }
  });

  await check("refund melebihi sisa ditolak", async () => {
    const oid = await createOrder(db, {
      tableCode: `${tableCode}-R4`,
      employeeId,
      testMode,
      items: [{ productId: b.id, quantity: 1, notes: "" }],
    });
    await payOrder(db, {
      orderId: oid,
      channel: "transfer",
      amountReceived: null,
      employeeId,
      taxStatus: "taxable",
    });
    const item = await db.getFirstAsync<{ id: string }>(
      "select id from order_items where order_id = ?",
      [oid]
    );
    let ditolak = false;
    try {
      await createRefund(db, {
        orderId: oid,
        employeeId,
        reason: null,
        items: [{ orderItemId: item!.id, quantity: 2 }],
      });
    } catch (caught) {
      ditolak = caught instanceof OrderError
        && caught.code === "REFUND_QUANTITY_INVALID";
    }
    if (!ditolak) throw new Error("refund melebihi jumlah item tidak ditolak");

    // Dan tidak boleh ada baris yang tertinggal dari percobaan yang gagal.
    const n = await db.getFirstAsync<{ n: number }>(
      "select count(*) as n from refunds where order_id = ?",
      [oid]
    );
    if (n?.n !== 0) throw new Error(`${n?.n} refund tertinggal setelah ditolak`);
  });

  await expectThrows("refund order yang belum lunas", "REFUND_NOT_ALLOWED", async () => {
    const oid = await createOrder(db, {
      tableCode: `${tableCode}-R5`,
      employeeId,
      testMode,
      items: [{ productId: b.id, quantity: 1, notes: "" }],
    });
    const item = await db.getFirstAsync<{ id: string }>(
      "select id from order_items where order_id = ?",
      [oid]
    );
    await createRefund(db, {
      orderId: oid,
      employeeId,
      reason: null,
      items: [{ orderItemId: item!.id, quantity: 1 }],
    });
  });

  await check("void seluruh item mengubah order jadi void", async () => {
    const fresh = await createOrder(db, {
      tableCode: `${tableCode}-V`,
      employeeId,
      testMode,
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

  // 2. Satu entry tidak boleh punya dua opsi bervarian sama — itu akan
  //    memunculkan lembar dengan dua tombol "Panas".
  const duplicateVariant = entries.find(
    (e) => new Set(e.options.map((o) => o.value)).size !== e.options.length
  );
  if (duplicateVariant) {
    fail("tidak ada varian kembar dalam satu kartu", `"${duplicateVariant.label}"`);
  } else {
    ok("tidak ada varian kembar dalam satu kartu");
  }

  // 3. Panas selalu opsi pertama, supaya posisi tombol tidak berpindah antar menu.
  const wrongOrder = paired
    .filter((e) => e.kind === "suhu")
    .find((e) => e.options[0].value !== "panas");
  if (wrongOrder) {
    fail("panas selalu di urutan pertama", `"${wrongOrder.label}"`);
  } else {
    ok("panas selalu di urutan pertama");
  }

  // 3b. Poros saus: Ori pertama DAN tersorot lebih dulu. Keduanya diperiksa
  //     bersama karena urutan tanpa sorotan hanya menghasilkan tombol yang
  //     kebetulan di kiri atas, bukan varian bawaan.
  const saus = paired.filter((e) => e.kind === "saus");
  const wrongOri = saus.find(
    (e) => e.options[0].value !== "ori" || e.defaultValue !== "ori"
  );
  if (wrongOri) {
    fail("ori selalu pertama dan jadi bawaan", `"${wrongOri.label}"`);
  } else {
    ok("ori selalu pertama dan jadi bawaan");
  }

  // 3b-2. Poros topping: Polos pertama dan jadi bawaan, kedelapan kombinasinya
  //       ada, dan harganya benar-benar penjumlahan. Ketiganya diam kalau salah
  //       — kombinasi yang hilang cuma membuat kotaknya mati di layar, dan satu
  //       harga yang salah ketik tetap terlihat wajar; selisihnya baru muncul
  //       saat laporan tidak cocok dengan laci.
  const topping = paired.filter((e) => e.kind === "topping");
  const wrongTopping = topping.find((e) => {
    if (e.options[0].value !== "polos" || e.defaultValue !== "polos") return true;
    if (e.options.length !== 1 << TOPPING_BOXES.length) return true;
    const harga = new Map(e.options.map((o) => [o.value, o.product.price]));
    const dasar = harga.get("polos");
    if (dasar === undefined) return true;
    const tambahan = TOPPING_BOXES.map(
      (_, bit) => (harga.get(toppingValue(1 << bit)) ?? NaN) - dasar
    );
    return e.options.some((o) => {
      const mask = toppingMask(o.value);
      const jumlah = tambahan.reduce(
        (n, t, bit) => n + (mask & (1 << bit) ? t : 0),
        dasar
      );
      return o.product.price !== jumlah;
    });
  });
  if (wrongTopping) {
    fail("topping lengkap dan harganya menjumlah", `"${wrongTopping.label}"`);
  } else {
    ok("topping lengkap dan harganya menjumlah");
  }

  // 3b-3. Jenis kuah hanya menempel di Indomie Kuah, dan wajib dipilih. Kalau
  //       ia bocor ke Indomie Goreng, kasir diminta memilih kuah untuk mi
  //       goreng dan tombol Tambah tidak akan pernah menyala sebelum ia menebak.
  const salahKuah = entries.find(
    (e) =>
      Boolean(e.extra) !== (e.kind === "topping" && /\bkuah\b/i.test(e.label)) ||
      (e.extra ? e.extra.defaultValue !== null : false)
  );
  if (salahKuah) {
    fail("jenis kuah hanya di menu berkuah", `"${salahKuah.label}"`);
  } else {
    ok("jenis kuah hanya di menu berkuah");
  }

  // 3c. Poros suhu TIDAK boleh punya varian bawaan. Menyorot panas lebih dulu
  //     berarti menaruh ibu jari di timbangan menu yang laku, dan itu keputusan
  //     produk yang tidak pernah diambil siapa pun.
  const suhuBawaan = paired.find(
    (e) => e.kind === "suhu" && e.defaultValue !== null
  );
  if (suhuBawaan) {
    fail("suhu tidak punya varian bawaan", `"${suhuBawaan.label}"`);
  } else {
    ok("suhu tidak punya varian bawaan");
  }

  // 3d. Satu kartu tidak pernah mencampur dua poros. Kalau ini merah, ada nama
  //     produk yang terbaca sebagai suhu sekaligus saus.
  const campur = paired.find((e) => e.kind === null);
  if (campur) {
    fail("kartu gabungan selalu punya satu poros", `"${campur.label}"`);
  } else {
    ok("kartu gabungan selalu punya satu poros");
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
  //    penanda varian WAJIB berada di kartu yang sama. Normalisasi di bawah ini
  //    sengaja ditulis ulang di sini, tidak diimpor dari modulnya — kalau ia
  //    mengimpor regex yang sama, pemeriksaan ini jadi memutar dan selalu lolos
  //    meski aturannya rusak. Inilah yang menangkap hilangnya akhiran "S".
  const strip = (name: string) =>
    name
      .replace(
        /\s+(panas|dingin|es|s|mayonnaise|bangkok|mentega|lada hitam|teriyaki|polos|sayur \+ telur \+ sosis|sayur \+ telur|telur \+ sosis|sayur \+ sosis|sayur|telur|sosis)$/i,
        ""
      )
      .trim()
      .toLowerCase();
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
    fail("pasangan varian selalu satu kartu", separated);
  } else {
    ok("pasangan varian selalu satu kartu");
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
