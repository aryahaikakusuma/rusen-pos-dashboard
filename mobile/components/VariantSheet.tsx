import { Pressable, StyleSheet, Text, View } from "react-native";

import { formatRupiah } from "../lib/types";
import { VARIANT_LABEL, type ProductEntry } from "../lib/product-variants";
import {
  colors,
  radius,
  semantic,
  spacing,
  textStyles,
  touchTarget,
} from "../theme";
import Button from "./Button";
import Sheet from "./Sheet";

interface VariantSheetProps {
  entry: ProductEntry;
  onPick: (productId: string) => void;
  onCancel: () => void;
}

/**
 * Langkah kedua setelah kasir memilih menu: menentukan panas atau dingin.
 *
 * Memakai Sheet yang sama dengan keranjang, bukan overlay baru — aplikasi ini
 * sudah punya satu bentuk dialog, dan bentuk kedua membuat dua hal yang sama
 * terlihat berbeda tanpa alasan.
 *
 * Harga tiap suhu ditampilkan karena sering berbeda, dan kasir kadang perlu
 * menyebutkannya ke pelanggan sebelum menekan.
 */
export default function VariantSheet({
  entry,
  onPick,
  onCancel,
}: VariantSheetProps) {
  return (
    <Sheet
      title={entry.label}
      subtitle="Pilih suhu minuman"
      onClose={onCancel}
      footer={<Button label="Batal" variant="secondary" onPress={onCancel} />}>
      <View style={styles.options}>
        {/* Keduanya netral, tidak ada yang ditandai aksi utama: DESIGN.md
            hanya mengizinkan satu tombol biru per layar, dan di sini tidak ada
            pilihan yang lebih benar dari yang lain. */}
        {entry.options.map(({ product, variant }) => (
          <Pressable
            key={product.id}
            accessibilityRole="button"
            accessibilityLabel={`${VARIANT_LABEL[variant]}, ${formatRupiah(product.price)}`}
            onPress={() => onPick(product.id)}
            style={({ pressed }) => [
              styles.option,
              pressed && styles.optionPressed,
            ]}>
            <Text style={styles.variant}>{VARIANT_LABEL[variant]}</Text>
            <Text style={styles.price}>{formatRupiah(product.price)}</Text>
          </Pressable>
        ))}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  options: {
    flexDirection: "row",
    gap: spacing.md,
    padding: spacing.lg,
  },
  option: {
    flex: 1,
    minHeight: touchTarget.comfortable,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    padding: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: semantic.border,
    backgroundColor: semantic.surface,
  },
  optionPressed: {
    borderColor: colors.primary[600],
    backgroundColor: colors.primary[50],
  },
  variant: {
    ...textStyles.sectionTitle,
    color: semantic.textPrimary,
  },
  price: {
    ...textStyles.price,
    color: semantic.textSecondary,
  },
});
