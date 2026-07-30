import { Pressable, StyleSheet, View } from "react-native";

import { radius, semantic, spacing, touchTarget } from "../theme";

/**
 * Tiga garis, digambar dengan View biasa. Tidak ada pustaka ikon di proyek ini
 * dan satu tombol tidak sepadan dengan menambahkannya — bentuknya cukup
 * sederhana untuk dibuat dari kotak, dan hasilnya tajam di kerapatan berapa pun
 * karena bukan gambar yang diperbesar.
 */
export default function MenuButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Buka menu"
      onPress={onPress}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
      <View style={styles.line} />
      <View style={styles.line} />
      <View style={styles.line} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: touchTarget.min,
    height: touchTarget.min,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    borderRadius: radius.md,
  },
  pressed: {
    backgroundColor: semantic.surfaceMuted,
  },
  line: {
    width: 22,
    height: 2,
    borderRadius: 1,
    backgroundColor: semantic.textPrimary,
  },
});
