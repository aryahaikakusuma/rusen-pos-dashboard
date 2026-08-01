import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSQLiteContext } from "expo-sqlite";

import Button from "../components/Button";
import ProductGrid from "../components/ProductGrid";
import Sheet from "../components/Sheet";
import StatusBadge from "../components/StatusBadge";
import { useToast } from "../components/Toast";
import VariantSheet from "../components/VariantSheet";
import { listProducts } from "../db/catalog";
import { translateOrderError } from "../db/errors";
import {
  appendToOrder,
  changeTableCode,
  getOrder,
  voidAllOrderItems,
  voidOrderItem,
} from "../db/orders";
import type { OrderItemRow, OrderRow, ProductRow } from "../db/types";
import { useAuth } from "../lib/auth-context";
import type { ProductEntry } from "../lib/product-variants";
import { formatRupiah, tableLabel } from "../lib/types";
import {
  colors,
  radius,
  semantic,
  spacing,
  textStyles,
  touchTarget,
} from "../theme";

interface EditOrderScreenProps {
  orderId: string;
  onClose: () => void;
}

/**
 * Menambah dan membatalkan item pada order yang sudah tersimpan.
 *
 * Order dibaca ulang setelah setiap tulisan, bukan disunting di memori.
 * appendToOrder dan voidOrderItem sama-sama memakai `expectedVersion`, dan
 * keduanya menaikkan version — memakai salinan lama pada aksi berikutnya
 * langsung berujung STALE_ORDER. Membaca ulang lebih murah daripada mengarang
 * aturan sendiri tentang kapan version naik.
 */
export default function EditOrderScreen({
  orderId,
  onClose,
}: EditOrderScreenProps) {
  const db = useSQLiteContext();
  const toast = useToast();
  const { session } = useAuth();

  const [order, setOrder] = useState<(OrderRow & { items: OrderItemRow[] }) | null>(
    null
  );
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [search, setSearch] = useState("");
  const [voiding, setVoiding] = useState<OrderItemRow | null>(null);
  const [voidQty, setVoidQty] = useState("");
  const [voidReason, setVoidReason] = useState("");
  const [variantEntry, setVariantEntry] = useState<ProductEntry | null>(null);
  const [changingTable, setChangingTable] = useState(false);
  const [newTableCode, setNewTableCode] = useState("");
  const [clearing, setClearing] = useState(false);
  const [clearReason, setClearReason] = useState("");

  const reload = useCallback(async () => {
    setOrder(await getOrder(db, orderId));
  }, [db, orderId]);

  useEffect(() => {
    void reload();
    void listProducts(db).then(setProducts);
  }, [db, reload]);

  const run = useCallback(
    async (label: string, action: () => Promise<unknown>) => {
      setBusy(true);
      try {
        await action();
        toast.success(label);
      } catch (caught) {
        toast.error(translateOrderError(caught));
      } finally {
        await reload();
        setBusy(false);
      }
    },
    [toast, reload]
  );

  /**
   * Menambah satu item TANPA menutup sheet-nya. Pesanan yang datang ke kasir
   * hampir tidak pernah satu item, dan menutup lembar tiap kali berarti kasir
   * membuka ulang, mengetik ulang pencariannya, lalu menggulir lagi — untuk
   * tiap baris pesanan. Sheet baru tertutup kalau kasir menekan (x).
   *
   * `busyRef` ada karena `appendToOrder` memakai `expectedVersion`, dan version
   * baru diketahui setelah `reload()`. Dengan sheet yang tetap terbuka, dua
   * ketukan cepat bisa keduanya membawa version yang sama; yang kedua ditolak
   * STALE_ORDER padahal kasir tidak melakukan kesalahan apa pun. State `busy`
   * tidak cukup untuk itu — ia baru terbaca setelah render berikutnya.
   */
  const busyRef = useRef(false);

  const handleAdd = useCallback(
    (productId: string, notes = "") => {
      if (!order || busyRef.current) return;
      busyRef.current = true;
      void run("Item ditambahkan", () =>
        appendToOrder(db, {
          orderId,
          items: [{ productId, quantity: 1, notes }],
          expectedVersion: order.version,
        })
      ).finally(() => {
        busyRef.current = false;
      });
    },
    [order, db, orderId, run]
  );

  // Sheet "tambah item" harus ditutup dulu sebelum VariantSheet dibuka: RN
  // Modal tidak mendukung dua Modal tampil bersamaan (z-order dan tombol
  // back jadi tidak terdefinisi di Android). Ia dibuka lagi setelah varian
  // dipilih atau dibatalkan, supaya dari sudut pandang kasir lembarnya tidak
  // pernah menutup sendiri. Jalur satu opsi tidak menutup apa-apa.
  const selectEntry = useCallback(
    (entry: ProductEntry) => {
      if (entry.options.length === 1) {
        handleAdd(entry.options[0].product.id);
        return;
      }
      setAdding(false);
      setVariantEntry(entry);
    },
    [handleAdd]
  );

  const handleVoid = () => {
    if (!order || !voiding || !session) return;
    const quantity = Number(voidQty);
    const item = voiding;
    setVoiding(null);
    void run("Item dibatalkan", () =>
      voidOrderItem(db, {
        orderId,
        itemId: item.id,
        quantity,
        employeeId: session.employeeId,
        reason: voidReason,
        expectedVersion: order.version,
      })
    );
  };

  const handleClearAll = () => {
    if (!order || !session) return;
    setClearing(false);
    void run("Semua item dibatalkan", () =>
      voidAllOrderItems(db, {
        orderId,
        employeeId: session.employeeId,
        reason: clearReason,
        expectedVersion: order.version,
      })
    );
  };

  const openChangeTable = () => {
    setNewTableCode(order?.table_code ?? "");
    setChangingTable(true);
  };

  const handleChangeTable = async () => {
    if (!order) return;
    setBusy(true);
    try {
      await changeTableCode(db, {
        orderId,
        tableCode: newTableCode,
        expectedVersion: order.version,
      });
      const refreshed = await getOrder(db, orderId);
      setOrder(refreshed);
      setChangingTable(false);
      if (refreshed) {
        toast.success(
          `Order ${tableLabel(order.table_code, order.table_seq)} dipindah ke ${tableLabel(refreshed.table_code, refreshed.table_seq)}`
        );
      }
    } catch (caught) {
      toast.error(translateOrderError(caught));
    } finally {
      setBusy(false);
    }
  };

  const keyword = search.trim().toLowerCase();
  // Seluruh katalog diserahkan apa adanya — identitasnya stabil, jadi
  // ProductGrid tidak mengelompokkan ulang tiap render (mis. saat busy
  // berganti).
  //
  // Dulu di sini ada `products.slice(0, 30)`, dan itu adalah bug yang tampil di
  // layar: layar ini tidak punya pemilih kategori, jadi tanpa kata kunci ia
  // memotong daftar produk MENTAH yang terurut menurut kode. Kode "138" dan
  // "139" — Indomie Goreng Telur dan Indomie Kuah Telur — mengurut paling atas
  // secara teks, sementara saudara toppingnya "K130".."K137" ada jauh di bawah
  // dan tidak ikut terpotong. Keduanya lalu tinggal satu opsi, dan
  // groupProductVariants dengan benar mengembalikannya jadi kartu biasa bernama
  // lengkap tanpa lembar topping. Dua kartu pertama layar ini adalah dua mi
  // telur yatim, dan tidak ada satu pun error yang menyertainya.
  //
  // Pembatasannya sekarang dihitung dalam KARTU, di ProductGrid, setelah
  // pengelompokan — sehingga sebuah keluarga varian selalu ikut utuh.
  const visibleProducts = products;

  if (!order) {
    return (
      <View style={styles.screen}>
        <Text style={styles.empty}>Order tidak ditemukan.</Text>
        <Button label="Kembali" onPress={onClose} />
      </View>
    );
  }

  const editable = order.status === "pending";

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View style={styles.headerStatus}>
          <StatusBadge status={order.status} />
        </View>
        <View style={styles.headerRow}>
          <View style={styles.headerText}>
            <Text style={styles.title}>
              {tableLabel(order.table_code, order.table_seq)}
            </Text>
          </View>
          <View style={styles.headerActions}>
            {/* Ikon saja, karena tiga tombol berlabel penuh tidak muat di baris
                ini. Tetap "secondary" walau aksinya merusak — warna merah di
                header membuatnya menonjol persis seperti tombol yang memang
                dituju kasir, padahal ini justru yang paling tidak boleh
                tertekan tanpa sengaja. Peringatannya ada di konfirmasi. */}
            {editable && order.items.length > 0 ? (
              <Button
                label="🧹"
                accessibilityLabel="Bersihkan semua item"
                disabled={busy}
                onPress={() => {
                  setClearReason("");
                  setClearing(true);
                }}
                style={styles.iconButton}
                labelStyle={styles.iconLabel}
              />
            ) : null}
            {editable ? (
              <Button
                label="Ganti Meja"
                disabled={busy}
                onPress={openChangeTable}
                style={styles.headerButton}
              />
            ) : null}
            <Button label="Kembali" onPress={onClose} style={styles.headerButton} />
          </View>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.list}>
        {order.items.map((item) => (
          <View key={item.id} style={styles.item}>
            <View style={styles.itemHeader}>
              <Text style={styles.itemName}>
                {item.product_code} · {item.product_name}
              </Text>
              <Text style={styles.itemSubtotal}>
                {formatRupiah(item.subtotal)}
              </Text>
            </View>
            <Text style={styles.itemMeta}>
              {item.quantity} × {formatRupiah(item.unit_price)}
              {item.notes ? ` · ${item.notes}` : ""}
            </Text>
            {editable ? (
              <Button
                label="Batalkan item"
                variant="danger"
                disabled={busy}
                style={styles.itemAction}
                onPress={() => {
                  setVoiding(item);
                  setVoidQty(String(item.quantity));
                  setVoidReason("");
                }}
              />
            ) : null}
          </View>
        ))}

        {order.items.length === 0 ? (
          <Text style={styles.empty}>Order ini sudah tidak punya item.</Text>
        ) : null}
      </ScrollView>

      <View style={styles.footer}>
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.total}>{formatRupiah(order.total)}</Text>
        </View>
        {editable ? (
          <Button
            label="Tambah item"
            variant="primary"
            disabled={busy}
            onPress={() => setAdding(true)}
          />
        ) : (
          <Text style={styles.locked}>
            Order yang sudah lunas atau dibatalkan tidak bisa diubah.
          </Text>
        )}
      </View>

      {adding ? (
        <Sheet
          title="Tambah item"
          // Lembarnya kini menutupi daftar item, jadi jumlah dan totalnya
          // dibawa ke sini — tanpa itu kasir menambah beberapa item sambil
          // buta terhadap apa yang sudah masuk.
          subtitle={`${tableLabel(order.table_code, order.table_seq)} · ${order.items.length} item · ${formatRupiah(order.total)}`}
          onClose={() => {
            setAdding(false);
            setSearch("");
          }}>
          <View style={styles.searchWrap}>
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Cari nama atau kode produk"
              placeholderTextColor={semantic.textSecondary}
              style={styles.input}
              autoFocus
            />
          </View>
          <View style={styles.gridWrap}>
            <ProductGrid
              products={visibleProducts}
              keyword={keyword}
              // Tanpa kata kunci, layar ini hanya memajang segenggam kartu
              // pertama supaya kasir mengetik alih-alih menggulir 247 kartu.
              // Batasnya dihitung dalam kartu, bukan produk.
              limit={keyword ? undefined : 30}
              onSelect={selectEntry}
              emptyHint="Tidak ada produk cocok"
            />
          </View>
        </Sheet>
      ) : null}

      {changingTable ? (
        <Sheet
          title="Ganti Meja"
          subtitle={tableLabel(order.table_code, order.table_seq)}
          anchor="top"
          onClose={() => setChangingTable(false)}
          footer={
            <Button
              label="Simpan"
              loading={busy}
              onPress={() => void handleChangeTable()}
            />
          }>
          <View style={styles.tableForm}>
            <View style={styles.tableKindRow}>
              <Button
                label="Meja"
                onPress={() => {
                  if (newTableCode === "Takeaway") setNewTableCode("");
                }}
                style={[
                  styles.kindButton,
                  newTableCode !== "Takeaway" && styles.kindButtonSelected,
                ]}
              />
              <Button
                label="Takeaway"
                onPress={() => setNewTableCode("Takeaway")}
                style={[
                  styles.kindButton,
                  newTableCode === "Takeaway" && styles.kindButtonSelected,
                ]}
              />
            </View>
            <TextInput
              value={newTableCode}
              onChangeText={(text) => setNewTableCode(text.toUpperCase())}
              autoCapitalize="characters"
              autoFocus
              editable={!busy && newTableCode !== "Takeaway"}
              placeholder="Kode meja"
              placeholderTextColor={semantic.textSecondary}
              style={[styles.input, newTableCode === "Takeaway" && styles.disabledInput]}
            />
          </View>
        </Sheet>
      ) : null}

      {/* Menyebut angka, bukan bertanya "yakin?" — pertanyaan tanpa angka cuma
          menghasilkan satu ketukan refleks. Sama seperti ClearHistoryDialog. */}
      {clearing ? (
        <Sheet
          title="Bersihkan semua item"
          subtitle={tableLabel(order.table_code, order.table_seq)}
          onClose={() => setClearing(false)}
          footer={
            <>
              <Button
                label={`Batalkan ${order.items.length} item`}
                variant="danger"
                disabled={busy}
                onPress={handleClearAll}
              />
              <Button
                label="Jangan jadi"
                disabled={busy}
                onPress={() => setClearing(false)}
              />
            </>
          }>
          <View style={styles.voidForm}>
            <Text style={styles.body}>
              Seluruh {order.items.length} item senilai{" "}
              {formatRupiah(order.total)} dibatalkan sekaligus, dan order ini
              ikut batal. Tidak ada yang tersisa untuk dilunasi.
            </Text>
            <Text style={styles.fieldLabel}>Alasan (opsional)</Text>
            <TextInput
              value={clearReason}
              onChangeText={setClearReason}
              placeholder="Contoh: pelanggan batal pesan"
              placeholderTextColor={semantic.textSecondary}
              style={styles.input}
            />
            <Text style={styles.hint}>
              Tiap item tetap tercatat satu per satu di laporan void, persis
              seperti dibatalkan sendiri-sendiri. Order tidak bisa dibuka lagi
              setelah ini — buat order baru kalau pelanggan berubah pikiran.
            </Text>
          </View>
        </Sheet>
      ) : null}

      {variantEntry ? (
        <VariantSheet
          entry={variantEntry}
          onPick={(productId, notes) => {
            setVariantEntry(null);
            setAdding(true);
            handleAdd(productId, notes);
          }}
          onCancel={() => {
            setVariantEntry(null);
            setAdding(true);
          }}
        />
      ) : null}

      {voiding ? (
        <Sheet
          title="Batalkan item"
          subtitle={`${voiding.product_name} · ${voiding.quantity} tersimpan`}
          onClose={() => setVoiding(null)}
          footer={
            <Button
              label="Batalkan item ini"
              variant="danger"
              onPress={handleVoid}
            />
          }>
          <View style={styles.voidForm}>
            <Text style={styles.fieldLabel}>Jumlah yang dibatalkan</Text>
            <TextInput
              value={voidQty}
              onChangeText={(text) => setVoidQty(text.replace(/[^0-9]/g, ""))}
              keyboardType="number-pad"
              style={styles.input}
            />
            <Text style={styles.fieldLabel}>Alasan (opsional)</Text>
            <TextInput
              value={voidReason}
              onChangeText={setVoidReason}
              placeholder="Contoh: salah pesan"
              placeholderTextColor={semantic.textSecondary}
              style={styles.input}
            />
            <Text style={styles.hint}>
              Pembatalan selalu meninggalkan jejak — inilah satu-satunya sumber
              laporan void, jadi item tidak pernah hilang begitu saja.
            </Text>
          </View>
        </Sheet>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: semantic.surfaceMuted,
  },
  header: {
    gap: spacing.xs,
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: semantic.border,
    backgroundColor: semantic.surface,
  },
  headerText: {
    flex: 1,
    gap: spacing.xs,
  },
  title: {
    ...textStyles.screenTitle,
    color: semantic.textPrimary,
  },
  back: {
    paddingHorizontal: spacing.lg,
  },
  headerStatus: {
    minHeight: 22,
    alignItems: "flex-end",
    justifyContent: "center",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  headerActions: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  headerButton: {
    paddingHorizontal: spacing.md,
  },
  iconButton: {
    paddingHorizontal: spacing.md,
  },
  iconLabel: {
    fontSize: 22,
    lineHeight: 26,
  },
  list: {
    padding: spacing.md,
    gap: spacing.sm,
  },
  item: {
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: semantic.border,
    backgroundColor: semantic.surface,
  },
  itemHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  itemName: {
    ...textStyles.bodyStrong,
    flex: 1,
    color: semantic.textPrimary,
  },
  itemSubtotal: {
    ...textStyles.price,
    color: semantic.textPrimary,
  },
  itemMeta: {
    ...textStyles.caption,
    color: semantic.textSecondary,
  },
  itemAction: {
    marginTop: spacing.sm,
  },
  empty: {
    ...textStyles.body,
    padding: spacing.lg,
    textAlign: "center",
    color: semantic.textSecondary,
  },
  footer: {
    gap: spacing.sm,
    padding: spacing.md,
    borderTopWidth: 1,
    borderTopColor: semantic.border,
    backgroundColor: semantic.surface,
  },
  totalRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  totalLabel: {
    ...textStyles.caption,
    color: semantic.textSecondary,
  },
  total: {
    ...textStyles.grandTotal,
    color: semantic.textPrimary,
  },
  locked: {
    ...textStyles.caption,
    color: semantic.textSecondary,
  },
  searchWrap: {
    padding: spacing.md,
  },
  gridWrap: {
    height: 320,
  },
  input: {
    ...textStyles.bodyStrong,
    minHeight: touchTarget.comfortable,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: semantic.border,
    color: semantic.textPrimary,
  },
  disabledInput: {
    opacity: 0.5,
  },
  tableForm: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  tableKindRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  kindButton: {
    flex: 1,
    minHeight: touchTarget.min,
  },
  kindButtonSelected: {
    borderColor: colors.primary[600],
    backgroundColor: colors.primary[50],
  },
  voidForm: {
    padding: spacing.lg,
    gap: spacing.sm,
  },
  fieldLabel: {
    ...textStyles.bodyStrong,
    color: semantic.textPrimary,
  },
  body: {
    ...textStyles.body,
    color: semantic.textPrimary,
  },
  hint: {
    ...textStyles.caption,
    marginTop: spacing.sm,
    color: colors.status.pending,
  },
});
