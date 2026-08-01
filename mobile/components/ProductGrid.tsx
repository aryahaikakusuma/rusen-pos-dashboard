import { useCallback, useMemo } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";

import { useLayoutMode } from "../lib/use-layout-mode";
import {
  filterProductEntries,
  groupProductVariants,
  type ProductEntry,
} from "../lib/product-variants";
import type { ProductRow } from "../db/types";
import { cashierLayout, semantic, spacing, textStyles } from "../theme";
import ProductCard from "./ProductCard";

interface ProductGridProps {
  /**
   * Boleh disaring per kategori, tapi JANGAN disaring per kata kunci — itu
   * tugas prop `keyword` di bawah, dan alasannya ada di filterProductEntries.
   */
  products: ProductRow[];
  /** Kata kunci pencarian. Disaring setelah pengelompokan. */
  keyword?: string;
  /** Batas jumlah KARTU, bukan produk. Dipotong setelah pengelompokan. */
  limit?: number;
  disabled?: boolean;
  emptyHint: string;
  onSelect: (entry: ProductEntry) => void;
  /**
   * Geser dari atas untuk menarik ulang katalog. Opsional: EditOrderScreen
   * memakai grid ini juga, dan di sana kasir sedang mengubah order yang sudah
   * jadi — menarik katalog di tengah pekerjaan itu tidak ada gunanya.
   */
  onRefresh?: () => void;
  refreshing?: boolean;
}

/**
 * FlatList, bukan map di dalam ScrollView. Pencarian menyapu seluruh 293 produk,
 * dan merender semuanya sekaligus adalah persis jenis kegagalan yang menjegal
 * penarikan katalog di langkah 3: tidak ada error, aplikasinya cuma diam.
 */
export default function ProductGrid({
  products,
  keyword,
  limit,
  disabled,
  emptyHint,
  onSelect,
  onRefresh,
  refreshing,
}: ProductGridProps) {
  const mode = useLayoutMode();
  const columns =
    mode === "tablet"
      ? cashierLayout.productGridColumns
      : cashierLayout.productGridColumnsPhone;

  // `products` hanya berganti identitas kalau kategori benar-benar berubah —
  // pemanggilnya (CashierScreen/EditOrderScreen) membungkus visibleProducts
  // dalam useMemo. Kalau syarat itu bergeser lagi, pengelompokan 293 baris balik
  // jalan di setiap render: persis jenis latensi yang menjegal penarikan katalog
  // di langkah 3.
  //
  // Pencarian dan pembatasan sengaja dikerjakan DI SINI, atas kartu yang sudah
  // jadi, bukan atas daftar produk di pemanggil. Keduanya memotong, dan
  // memotong sebelum mengelompokkan merobek keluarga varian — lihat
  // filterProductEntries untuk bentuk kegagalannya.
  const entries = useMemo(() => {
    const grouped = filterProductEntries(
      groupProductVariants(products),
      keyword ?? ""
    );
    return limit === undefined ? grouped : grouped.slice(0, limit);
  }, [products, keyword, limit]);

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

  const empty = entries.length === 0;

  return (
    <FlatList
      // Jumlah kolom berubah saat perangkat diputar, dan FlatList tidak bisa
      // mengubahnya pada instance yang sama. Key memaksa remount.
      //
      // Ikut menyebut `empty`: saat kosong daftar ini berjalan tanpa kolom
      // (numColumns 1), dan FlatList sama tidak bisanya berpindah dari 2 ke 1
      // pada instance yang sama.
      key={`grid-${columns}-${empty ? "kosong" : "isi"}`}
      data={entries}
      keyExtractor={(item) => item.key}
      renderItem={renderItem}
      // Keadaan kosong dulunya `return` lebih awal, sebelum FlatList sempat
      // ada. Itu membuat gerakan tarik-untuk-menyegarkan mati justru pada satu
      // keadaan yang paling membutuhkannya — katalog belum pernah ditarik, layar
      // kosong, dan tidak ada apa pun untuk digeser. Sekarang daftarnya selalu
      // terpasang dan pesannya jadi isi daftar.
      ListEmptyComponent={
        <View style={styles.empty}>
          <Text style={styles.emptyText}>{emptyHint}</Text>
        </View>
      }
      // columnWrapperStyle dilarang saat numColumns 1, dan FlatList melempar
      // kalau tetap diberikan.
      numColumns={empty ? 1 : columns}
      columnWrapperStyle={empty ? undefined : styles.row}
      contentContainerStyle={[styles.content, empty && styles.contentEmpty]}
      keyboardShouldPersistTaps="handled"
      // Kasir sering menekan kartu tepat setelah menggulir; tanpa ini sentuhan
      // pertama hanya menghentikan gulungan dan item tidak masuk keranjang.
      removeClippedSubviews={false}
      onRefresh={onRefresh}
      refreshing={onRefresh ? (refreshing ?? false) : undefined}
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
  // Tanpa flexGrow, daftar kosong setinggi teksnya saja dan gerakan menggeser
  // hanya hidup di beberapa piksel teratas layar.
  contentEmpty: {
    flexGrow: 1,
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
