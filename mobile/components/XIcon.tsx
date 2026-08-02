import { StyleSheet, View } from "react-native";

import { colors } from "../theme";

interface XIconProps {
  /** Sisi kotak ikonnya, dalam dp. Kedua palangnya diskalakan dari angka ini. */
  size?: number;
  color?: string;
}

/**
 * Silang, digambar dari dua View yang diputar.
 *
 * Alasannya sama dengan TrashIcon: tidak ada satu pun pustaka ikon di aplikasi
 * ini, dan karakter "✕" tidak dipakai di sini karena ia ikut lebar dan tinggi
 * font — dua baris silang di dua perangkat berbeda tidak pernah sama besarnya,
 * sementara pembatalan item butuh sasaran sentuh yang ukurannya bisa dipastikan.
 */
export default function XIcon({
  size = 16,
  color = colors.status.void,
}: XIconProps) {
  // Di bawah 1.5dp garisnya hilang timbul saat layar menskalakan.
  const stroke = Math.max(1.5, size * 0.12);
  const bar = {
    position: "absolute" as const,
    width: size,
    height: stroke,
    borderRadius: stroke,
    backgroundColor: color,
  };

  return (
    <View
      style={[styles.box, { width: size, height: size }]}
      // Bentuknya sudah diwakili accessibilityLabel tombol pembungkusnya.
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
      <View style={[bar, { transform: [{ rotate: "45deg" }] }]} />
      <View style={[bar, { transform: [{ rotate: "-45deg" }] }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    alignItems: "center",
    justifyContent: "center",
  },
});
