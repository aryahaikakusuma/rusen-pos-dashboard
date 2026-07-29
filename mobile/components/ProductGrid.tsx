import { useCallback } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";

import { useLayoutMode } from "../lib/use-layout-mode";
import type { ProductRow } from "../db/types";
import { cashierLayout, semantic, spacing, textStyles } from "../theme";
import ProductCard from "./ProductCard";

interface ProductGridProps {
  products: ProductRow[];
  disabled?: boolean;
  emptyHint: string;
  onAddItem: (productId: string) => void;
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
  onAddItem,
}: ProductGridProps) {
  const mode = useLayoutMode();
  const columns =
    mode === "tablet"
      ? cashierLayout.productGridColumns
      : cashierLayout.productGridColumnsPhone;

  const renderItem = useCallback(
    ({ item }: { item: ProductRow }) => (
      <ProductCard
        code={item.code}
        name={item.name}
        price={item.price}
        disabled={disabled}
        onPress={() => onAddItem(item.id)}
      />
    ),
    [disabled, onAddItem]
  );

  if (products.length === 0) {
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
      data={products}
      keyExtractor={(item) => item.id}
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
