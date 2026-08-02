import { StyleSheet, View } from "react-native";

import { semantic } from "../theme";

interface ChevronIconProps {
  /** Sisi kotak ikonnya, dalam dp. Semua bagian diskalakan dari angka ini. */
  size?: number;
  color?: string;
  /** Arah ujung runcingnya. */
  direction?: "up" | "down";
}

/**
 * Chevron, digambar dari View biasa — alasannya sama persis dengan TrashIcon:
 * aplikasi ini tidak punya pustaka ikon sama sekali, dan menambah satu demi
 * satu glif berarti aset font atau modul native baru masuk ke bundel.
 *
 * Bentuknya satu kotak yang hanya dua sisinya berbatas, lalu diputar 45°.
 * Diputar, bukan dua batang yang masing-masing dimiringkan: dua batang harus
 * dipertemukan ujungnya dengan aritmetika yang berubah tiap ukuran, dan
 * sambungannya selalu terlihat retak di layar berkerapatan rendah.
 */
export default function ChevronIcon({
  size = 16,
  color = semantic.textPrimary,
  direction = "up",
}: ChevronIconProps) {
  // Tebal garis ikut ukuran, tapi tidak pernah setipis sub-piksel: di bawah
  // 1.5dp garisnya hilang timbul saat layar menskalakan.
  const stroke = Math.max(1.5, size * 0.14);
  // Sisi kotaknya, bukan `size`: kotak yang diputar 45° tingginya jadi sisi
  // dikali √2. Dibagi balik supaya ikon tetap muat di kotak yang diminta.
  const side = size / Math.SQRT2;

  return (
    <View
      style={[styles.box, { width: size, height: size }]}
      // Bentuknya sudah diwakili accessibilityLabel tombol pembungkusnya.
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
      <View
        style={{
          width: side,
          height: side,
          borderColor: color,
          borderTopWidth: stroke,
          borderLeftWidth: stroke,
          borderTopLeftRadius: stroke * 0.5,
          transform: [
            { rotate: direction === "up" ? "45deg" : "-135deg" },
            // Digeser SETELAH diputar, jadi sumbunya ikut miring: ini yang
            // menaruh titik temu kedua garis di tengah kotak, bukan sudut
            // kotaknya.
            { translateX: stroke * 0.35 },
            { translateY: stroke * 0.35 },
          ],
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
});
