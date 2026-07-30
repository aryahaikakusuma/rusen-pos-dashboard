import { useCallback, useEffect, useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSQLiteContext } from "expo-sqlite";

import Button from "../components/Button";
import CartLines from "../components/CartLines";
import CategoryChips from "../components/CategoryChips";
import ProductGrid from "../components/ProductGrid";
import Sheet from "../components/Sheet";
import TableConflictDialog from "../components/TableConflictDialog";
import { useToast } from "../components/Toast";
import VariantSheet from "../components/VariantSheet";
import { listCategories, listProducts } from "../db/catalog";
import { translateOrderError } from "../db/errors";
import { appendToOrder, checkTableCode, createOrder } from "../db/orders";
import type {
  CategoryRow,
  OrderItemInput,
  ProductRow,
  TableConflict,
} from "../db/types";
import { useAuth } from "../lib/auth-context";
import type { ProductEntry } from "../lib/product-variants";
import { formatRupiah, type DraftItem } from "../lib/types";
import { useLayoutMode } from "../lib/use-layout-mode";
import {
  cashierLayout,
  colors,
  radius,
  semantic,
  spacing,
  textStyles,
  touchTarget,
} from "../theme";

/**
 * Port dari components/CashierScreen.tsx milik web. Alur simpannya sama persis:
 * kode meja diperiksa lebih dulu, kalau sudah ada order belum lunas kasir yang
 * memutuskan gabung atau pisah, baru menulis.
 *
 * Bedanya hanya bentuk. Di layar tegak tiga kolom tidak muat, jadi kategori
 * jadi deretan chip mendatar dan keranjang jadi lembar yang dipanggil dari
 * batang bawah. Keranjang tidak dibuat panel tetap karena di ~400dp ia akan
 * menyisakan grid produk setinggi dua baris.
 */
export default function CashierScreen({
  onSaved,
}: {
  /** Dipanggil setelah order tersimpan, supaya daftar order ikut segar. */
  onSaved: () => void;
}) {
  const db = useSQLiteContext();
  const toast = useToast();
  const { session } = useAuth();
  const phone = useLayoutMode() === "phone";

  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState("");
  const [search, setSearch] = useState("");
  const [tableCode, setTableCode] = useState("");
  const [items, setItems] = useState<DraftItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [conflicts, setConflicts] = useState<TableConflict[] | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [variantEntry, setVariantEntry] = useState<ProductEntry | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [cats, prods] = await Promise.all([
        listCategories(db),
        listProducts(db),
      ]);
      if (cancelled) return;
      setCategories(cats);
      setProducts(prods);
      setSelectedCategoryId((current) => current || (cats[0]?.id ?? ""));
    })();
    return () => {
      cancelled = true;
    };
  }, [db]);

  const total = items.reduce(
    (sum, item) => sum + item.unitPrice * item.quantity,
    0
  );
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);

  // Saat mencari, kategori diabaikan: dengan 293 produk kasir sering tidak
  // hafal suatu menu ada di kategori mana, jadi pencarian menyapu seluruh menu.
  const keyword = search.trim().toLowerCase();
  const visibleProducts = keyword
    ? products.filter(
        (p) =>
          p.name.toLowerCase().includes(keyword) ||
          p.code.toLowerCase().includes(keyword)
      )
    : products.filter((p) => p.category_id === selectedCategoryId);

  const addProduct = useCallback(
    (productId: string) => {
      const product = products.find((p) => p.id === productId);
      if (!product) return;
      setError("");

      setItems((current) => {
        const existing = current.find((item) => item.productId === productId);
        if (existing) {
          return current.map((item) =>
            item.productId === productId
              ? { ...item, quantity: item.quantity + 1 }
              : item
          );
        }
        return [
          ...current,
          {
            productId: product.id,
            productCode: product.code,
            productName: product.name,
            quantity: 1,
            unitPrice: product.price,
            notes: "",
          },
        ];
      });
    },
    [products]
  );

  // Satu suhu berarti tidak ada yang perlu ditanyakan; kasir menekan sekali
  // seperti sebelumnya. Lembar hanya muncul kalau memang ada pilihan.
  const selectEntry = useCallback(
    (entry: ProductEntry) => {
      if (entry.options.length === 1) {
        addProduct(entry.options[0].product.id);
        return;
      }
      setVariantEntry(entry);
    },
    [addProduct]
  );

  const updateQuantity = useCallback((productId: string, quantity: number) => {
    if (quantity <= 0) {
      setItems((current) =>
        current.filter((item) => item.productId !== productId)
      );
      return;
    }
    setItems((current) =>
      current.map((item) =>
        item.productId === productId ? { ...item, quantity } : item
      )
    );
  }, []);

  const removeItem = useCallback((productId: string) => {
    setItems((current) =>
      current.filter((item) => item.productId !== productId)
    );
  }, []);

  const resetCart = () => {
    setItems([]);
    setTableCode("");
    setError("");
    setConflicts(null);
    setCartOpen(false);
  };

  const toInput = (): OrderItemInput[] =>
    items.map((item) => ({
      productId: item.productId,
      quantity: item.quantity,
      notes: item.notes,
    }));

  /** Langkah 1: cek bentrok kode meja sebelum menulis apa pun. */
  const handleSave = async () => {
    if (!tableCode.trim()) {
      setError("Masukkan kode meja/order");
      toast.error("Kode meja/order belum diisi");
      return;
    }
    if (items.length === 0) {
      setError("Keranjang kosong");
      toast.error("Keranjang masih kosong");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const found = await checkTableCode(db, tableCode);
      if (found.length > 0) {
        setConflicts(found);
        setCartOpen(false);
        return;
      }
      await createNewOrder();
    } catch (caught) {
      showError(caught);
    } finally {
      setSaving(false);
    }
  };

  const createNewOrder = async () => {
    if (!session) return;
    const label = tableCode.trim();
    setSaving(true);
    try {
      await createOrder(db, {
        tableCode,
        employeeId: session.employeeId,
        items: toInput(),
      });
      toast.success(`Order meja ${label} tersimpan`);
      resetCart();
      onSaved();
    } catch (caught) {
      showError(caught);
    } finally {
      setSaving(false);
    }
  };

  const mergeIntoExisting = async (conflict: TableConflict) => {
    const label = tableCode.trim();
    setSaving(true);
    try {
      await appendToOrder(db, {
        orderId: conflict.orderId,
        items: toInput(),
        expectedVersion: conflict.version,
      });
      toast.success(`Item ditambahkan ke order meja ${label}`);
      resetCart();
      onSaved();
    } catch (caught) {
      showError(caught);
    } finally {
      setSaving(false);
    }
  };

  const showError = (caught: unknown) => {
    const message = translateOrderError(caught);
    setError(message);
    setConflicts(null);
    toast.error(message);
  };

  const controls = (
    <View style={styles.controls}>
      <TextInput
        value={search}
        onChangeText={setSearch}
        placeholder="Cari nama atau kode produk"
        placeholderTextColor={semantic.textSecondary}
        style={styles.input}
        editable={!saving}
      />
      <TextInput
        value={tableCode}
        onChangeText={(text) => {
          setTableCode(text);
          setError("");
        }}
        placeholder="Kode meja — contoh: A3"
        placeholderTextColor={semantic.textSecondary}
        style={[styles.input, styles.tableInput]}
        editable={!saving}
        autoCapitalize="characters"
      />
    </View>
  );

  const grid = (
    <ProductGrid
      products={visibleProducts}
      disabled={saving}
      onSelect={selectEntry}
      emptyHint={
        keyword
          ? `Tidak ada produk cocok dengan "${search.trim()}"`
          : products.length === 0
            ? "Katalog belum ditarik. Buka tab Order lalu tekan Tarik katalog."
            : "Pilih kategori lain"
      }
    />
  );

  const cartBody = (
    <CartLines
      items={items}
      disabled={saving}
      onUpdateQuantity={updateQuantity}
      onRemove={removeItem}
    />
  );

  const cartFooter = (
    <>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      <Button
        label="Simpan Order"
        loadingLabel="Menyimpan…"
        variant="primary"
        loading={saving}
        disabled={items.length === 0}
        onPress={() => void handleSave()}
      />
      <Button
        label="Kosongkan Keranjang"
        variant="danger"
        disabled={saving || items.length === 0}
        onPress={resetCart}
      />
    </>
  );

  return (
    <View style={styles.screen}>
      {phone ? (
        <>
          {controls}
          <CategoryChips
            categories={categories}
            selectedId={selectedCategoryId}
            onSelect={(id) => {
              // Memilih kategori membatalkan pencarian, supaya kategori yang
              // tersorot selalu sama dengan yang tampil di grid.
              setSearch("");
              setSelectedCategoryId(id);
            }}
          />
          <View style={styles.gridArea}>{grid}</View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Buka keranjang"
            onPress={() => setCartOpen(true)}
            disabled={items.length === 0}
            style={({ pressed }) => [
              styles.cartBar,
              pressed && styles.cartBarPressed,
              items.length === 0 && styles.cartBarEmpty,
            ]}>
            <Text style={styles.cartBarText}>
              {items.length === 0
                ? "Keranjang kosong"
                : `${itemCount} item · ${formatRupiah(total)}`}
            </Text>
            {items.length > 0 ? (
              <Text style={styles.cartBarChevron}>Lihat ▲</Text>
            ) : null}
          </Pressable>

          {cartOpen ? (
            <Sheet
              title="Keranjang"
              subtitle={`${itemCount} item · ${formatRupiah(total)}`}
              onClose={() => setCartOpen(false)}
              footer={cartFooter}>
              {cartBody}
            </Sheet>
          ) : null}
        </>
      ) : (
        <View style={styles.wide}>
          <CategoryChips
            categories={categories}
            selectedId={selectedCategoryId}
            onSelect={(id) => {
              setSearch("");
              setSelectedCategoryId(id);
            }}
          />
          <View style={styles.wideCenter}>
            {controls}
            {grid}
          </View>
          <View style={styles.wideCart}>
            <View style={styles.wideCartHeader}>
              <Text style={styles.wideCartTitle}>Keranjang</Text>
              <Text style={styles.wideCartTotal}>{formatRupiah(total)}</Text>
            </View>
            {cartBody}
            <View style={styles.wideCartFooter}>{cartFooter}</View>
          </View>
        </View>
      )}

      {variantEntry ? (
        <VariantSheet
          entry={variantEntry}
          onPick={(productId) => {
            addProduct(productId);
            setVariantEntry(null);
          }}
          onCancel={() => setVariantEntry(null)}
        />
      ) : null}

      {conflicts ? (
        <TableConflictDialog
          tableCode={tableCode.trim()}
          conflicts={conflicts}
          busy={saving}
          onSameCustomer={(conflict) => void mergeIntoExisting(conflict)}
          onDifferentCustomer={() => void createNewOrder()}
          onCancel={() => setConflicts(null)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: semantic.surfaceMuted,
  },
  controls: {
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: semantic.surface,
    borderBottomWidth: 1,
    borderBottomColor: semantic.border,
  },
  input: {
    ...textStyles.bodyStrong,
    minHeight: touchTarget.comfortable,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: semantic.border,
    color: semantic.textPrimary,
    backgroundColor: semantic.surface,
  },
  tableInput: {
    borderColor: colors.primary[100],
  },
  gridArea: {
    flex: 1,
  },
  cartBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: touchTarget.primaryAction,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.primary[600],
  },
  cartBarPressed: {
    backgroundColor: colors.primary[700],
  },
  cartBarEmpty: {
    backgroundColor: semantic.surface,
    borderTopWidth: 1,
    borderTopColor: semantic.border,
  },
  cartBarText: {
    ...textStyles.actionButton,
    color: colors.neutral[0],
  },
  cartBarChevron: {
    ...textStyles.caption,
    color: colors.neutral[0],
  },
  errorText: {
    ...textStyles.caption,
    color: colors.status.void,
  },
  wide: {
    flex: 1,
    flexDirection: "row",
  },
  wideCenter: {
    flex: 1,
    backgroundColor: semantic.surface,
  },
  wideCart: {
    width: cashierLayout.cartWidth,
    borderLeftWidth: 1,
    borderLeftColor: semantic.border,
    backgroundColor: semantic.surface,
  },
  wideCartHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: semantic.border,
  },
  wideCartTitle: {
    ...textStyles.sectionTitle,
    color: semantic.textPrimary,
  },
  wideCartTotal: {
    ...textStyles.price,
    color: semantic.textPrimary,
  },
  wideCartFooter: {
    gap: spacing.sm,
    padding: spacing.md,
    borderTopWidth: 1,
    borderTopColor: semantic.border,
  },
});
