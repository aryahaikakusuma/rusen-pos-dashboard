import { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { formatRupiah } from "../lib/types";
import type { ProductEntry } from "../lib/product-variants";
import {
  cashierLayout,
  colors,
  radius,
  semantic,
  spacing,
  textStyles,
} from "../theme";

interface ProductCardProps {
  entry: ProductEntry;
  disabled?: boolean;
  onPress: () => void;
}

/**
 * Kode produk sengaja tidak ditampilkan, mengikuti kartu di aplikasi web.
 * Kartu gabungan punya dua kode ("Coklat" adalah K26 dan K27 sekaligus) dan
 * menampilkan keduanya justru membingungkan.
 *
 * Ini menyimpang dari DESIGN.md, yang menyatakan kasir membaca kode lebih dulu
 * sehingga kode dibuat lebih besar dari nama. Penyimpangan diambil sadar:
 * kolom pencarian tetap menyapu kode, jadi kasir yang hafal kode masih bisa
 * mengetiknya — dan hasil pencarian kode selalu satu produk, sehingga langsung
 * masuk keranjang tanpa lembar suhu.
 *
 * Nama dibatasi dua baris supaya tinggi kartu seragam; grid dengan tinggi
 * baris berbeda-beda terlihat berantakan dan menyulitkan menyasar jari.
 */
function ProductCardBase({ entry, disabled, onPress }: ProductCardProps) {
  const hasVariants = entry.options.length > 1;
  const price =
    entry.minPrice === entry.maxPrice
      ? formatRupiah(entry.minPrice)
      : // Rentang harga: panas dan dingin sering beda tarif.
        `${formatRupiah(entry.minPrice)}+`;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        hasVariants
          ? `${entry.label}, mulai ${formatRupiah(entry.minPrice)}, tersedia panas dan dingin`
          : `${entry.label}, ${formatRupiah(entry.minPrice)}`
      }
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.card,
        pressed && styles.cardPressed,
        disabled && styles.cardDisabled,
      ]}>
      <Text style={styles.name} numberOfLines={2}>
        {entry.label}
      </Text>

      <View style={styles.footer}>
        <Text style={styles.price}>{price}</Text>
        {/* Kartu tanpa penanda tetap menyisakan ruang setinggi penanda. Tanpa
            ini harganya turun ke dasar kartu sementara harga di kartu
            bersebelahan yang berpenanda duduk lebih tinggi, dan barisnya
            terlihat tidak rata. */}
        {hasVariants ? (
          <View style={styles.variantTag}>
            <Text style={styles.variantTagLabel}>Panas/Dingin</Text>
          </View>
        ) : (
          <View style={styles.variantTagSpacer} />
        )}
      </View>
    </Pressable>
  );
}

/**
 * Di-memo karena grid produk bisa berisi ratusan kartu dan induknya menulis
 * ulang state tiap kali keranjang berubah. Tanpa ini, menambah satu item
 * merender ulang seluruh grid.
 */
export default memo(ProductCardBase);

/**
 * Tinggi tetap, bukan hasil padding, supaya penanda dan ruang penggantinya
 * dijamin sama tinggi tanpa bergantung pada metrik font.
 */
const VARIANT_TAG_HEIGHT = 20;

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
  name: {
    ...textStyles.bodyStrong,
    color: semantic.textPrimary,
  },
  footer: {
    marginTop: spacing.sm,
    gap: spacing.xs,
  },
  price: {
    ...textStyles.price,
    color: semantic.textPrimary,
  },
  variantTag: {
    alignSelf: "flex-start",
    height: VARIANT_TAG_HEIGHT,
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.primary[50],
  },
  variantTagSpacer: {
    height: VARIANT_TAG_HEIGHT,
  },
  variantTagLabel: {
    ...textStyles.statusBadge,
    fontSize: 10,
    color: colors.primary[600],
  },
});
