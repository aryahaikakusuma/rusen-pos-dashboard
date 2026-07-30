import { useCallback, useEffect, useMemo, useState } from "react";
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
import { appendToOrder, getOrder, voidOrderItem } from "../db/orders";
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

  const handleAdd = useCallback(
    (productId: string) => {
      if (!order) return;
      setAdding(false);
      setSearch("");
      void run("Item ditambahkan", () =>
        appendToOrder(db, {
          orderId,
          items: [{ productId, quantity: 1, notes: "" }],
          expectedVersion: order.version,
        })
      );
    },
    [order, db, orderId, run]
  );

  // Sheet "tambah item" harus ditutup dulu sebelum VariantSheet dibuka: RN
  // Modal tidak mendukung dua Modal tampil bersamaan (z-order dan tombol
  // back jadi tidak terdefinisi di Android). Jalur satu opsi tetap lewat
  // handleAdd, yang sudah menutup sheet ini sendiri.
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

  const keyword = search.trim().toLowerCase();
  // Identitas array harus stabil kalau keyword & products tidak berubah,
  // supaya ProductGrid tidak mengelompokkan ulang dan ProductCard tidak
  // dianggap berubah props pada tiap render (mis. saat busy berganti).
  const visibleProducts = useMemo(
    () =>
      keyword
        ? products.filter(
            (p) =>
              p.name.toLowerCase().includes(keyword) ||
              p.code.toLowerCase().includes(keyword)
          )
        : products.slice(0, 30),
    [products, keyword]
  );

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
        <View style={styles.headerText}>
          <Text style={styles.title}>
            {tableLabel(order.table_code, order.table_seq)}
          </Text>
          <StatusBadge status={order.status} />
        </View>
        <Button label="Kembali" onPress={onClose} style={styles.back} />
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
          subtitle={tableLabel(order.table_code, order.table_seq)}
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
              onSelect={selectEntry}
              emptyHint="Tidak ada produk cocok"
            />
          </View>
        </Sheet>
      ) : null}

      {variantEntry ? (
        <VariantSheet
          entry={variantEntry}
          onPick={(productId) => {
            setVariantEntry(null);
            handleAdd(productId);
          }}
          onCancel={() => setVariantEntry(null)}
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
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
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
  voidForm: {
    padding: spacing.lg,
    gap: spacing.sm,
  },
  fieldLabel: {
    ...textStyles.bodyStrong,
    color: semantic.textPrimary,
  },
  hint: {
    ...textStyles.caption,
    marginTop: spacing.sm,
    color: colors.status.pending,
  },
});
