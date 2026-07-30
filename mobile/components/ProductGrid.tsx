import { useCallback, useMemo } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";

import { useLayoutMode } from "../lib/use-layout-mode";
import {
  groupProductVariants,
  type ProductEntry,
} from "../lib/product-variants";
import type { ProductRow } from "../db/types";
import { cashierLayout, semantic, spacing, textStyles } from "../theme";
import ProductCard from "./ProductCard";

interface ProductGridProps {
  products: ProductRow[];
  disabled?: boolean;
  emptyHint: string;
  onSelect: (entry: ProductEntry) => void;
}

/**
 * FlatList, bukan map di dalam ScrollView. Pencarian menyapu seluruh 293 produk,
 * dan merender semuanya sekaligus adalah persis jenis kegagalan yang menjegal
 * penarikan katalog di langkah 3: tidak ada error, aplikasinya cuma diam.
 */
export default function ProductGrid({
  products,
  disabled,
  emptyHint,
  onSelect,
}: ProductGridProps) {
  const mode = useLayoutMode();
  const columns =
    mode === "tablet"
      ? cashierLayout.productGridColumns
      : cashierLayout.productGridColumnsPhone;

  // Daftar produk berubah tiap kali kategori atau pencarian berubah.
  // Mengelompokkan 293 baris di setiap render adalah persis jenis latensi yang
  // menjegal penarikan katalog di langkah 3.
  const entries = useMemo(() => groupProductVariants(products), [products]);

  const renderItem = useCallback(
    ({ item }: { item: ProductEntry }) => (
      <ProductCard
        entry={item}
        disabled={disabled}
        onPress={() => onSelect(item)}
      />
    ),
    [disabled, onSelect]
  );

  if (entries.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>{emptyHint}</Text>
      </View>
    );
  }

  return (
    <FlatList
      // Jumlah kolom berubah saat perangkat diputar, dan FlatList tidak bisa
      // mengubahnya pada instance yang sama. Key memaksa remount.
      key={`grid-${columns}`}
      data={entries}
      keyExtractor={(item) => item.key}
      renderItem={renderItem}
      numColumns={columns}
      columnWrapperStyle={styles.row}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      // Kasir sering menekan kartu tepat setelah menggulir; tanpa ini sentuhan
      // pertama hanya menghentikan gulungan dan item tidak masuk keranjang.
      removeClippedSubviews={false}
    />
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.md,
    gap: spacing.md,
  },
  row: {
    gap: spacing.md,
  },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
  },
  emptyText: {
    ...textStyles.body,
    textAlign: "center",
    color: semantic.textSecondary,
  },
});
