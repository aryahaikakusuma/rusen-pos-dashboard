import { memo } from "react";
import { Pressable, StyleSheet, Text } from "react-native";

import { formatRupiah } from "../lib/types";
import {
  cashierLayout,
  colors,
  radius,
  semantic,
  spacing,
  textStyles,
} from "../theme";

interface ProductCardProps {
  code: string;
  name: string;
  price: number;
  disabled?: boolean;
  onPress: () => void;
}

/**
 * Kode di atas dan lebih besar dari nama — kasir membaca kode lebih dulu
 * (DESIGN.md). Nama dibatasi dua baris supaya tinggi kartu seragam; grid dengan
 * tinggi baris berbeda-beda terlihat berantakan dan menyulitkan menyasar jari.
 */
function ProductCardBase({
  code,
  name,
  price,
  disabled,
  onPress,
}: ProductCardProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${code} ${name}, ${formatRupiah(price)}`}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.card,
        pressed && styles.cardPressed,
        disabled && styles.cardDisabled,
      ]}>
      <Text style={styles.code} numberOfLines={1}>
        {code}
      </Text>
      <Text style={styles.name} numberOfLines={2}>
        {name}
      </Text>
      <Text style={styles.price}>{formatRupiah(price)}</Text>
    </Pressable>
  );
}

/**
 * Di-memo karena grid produk bisa berisi ratusan kartu dan induknya menulis
 * ulang state tiap kali keranjang berubah. Tanpa ini, menambah satu item
 * merender ulang seluruh grid.
 */
export default memo(ProductCardBase);

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minHeight: cashierLayout.productCardMinHeight,
    justifyContent: "space-between",
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: semantic.border,
    backgroundColor: semantic.surface,
  },
  cardPressed: {
    borderColor: colors.primary[600],
    backgroundColor: colors.primary[50],
  },
  cardDisabled: {
    opacity: 0.5,
  },
  code: {
    ...textStyles.productCode,
    color: semantic.textPrimary,
  },
  name: {
    ...textStyles.productName,
    marginTop: spacing.xs,
    color: semantic.textSecondary,
  },
  price: {
    ...textStyles.price,
    marginTop: spacing.sm,
    color: semantic.textPrimary,
  },
});
