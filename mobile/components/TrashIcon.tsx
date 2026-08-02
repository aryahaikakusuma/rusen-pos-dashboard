import { StyleSheet, View } from "react-native";

import { colors } from "../theme";

interface TrashIconProps {
  /** Sisi kotak ikonnya, dalam dp. Semua bagian diskalakan dari angka ini. */
  size?: number;
  color?: string;
}

/**
 * Tong sampah, digambar dari View biasa.
 *
 * Bukan dari pustaka ikon karena aplikasi ini tidak punya satu pun —
 * `@expo/vector-icons`, `lucide-react-native`, dan `react-native-svg` semuanya
 * tidak terpasang, dan menambahnya berarti aset font/modul baru masuk ke bundel
 * demi satu glif.
 *
 * Bukan emoji 🗑️ karena `color` tidak pernah berlaku padanya: Android
 * merendernya lewat font emoji berwarna, jadi `color: colors.status.void` di
 * gaya tombolnya tidak mengubah apa pun dan ikonnya tidak pernah benar-benar
 * merah — persis yang dikira sudah terjadi. Bentuk yang digambar sendiri
 * mewarisi warna yang diminta, di semua perangkat.
 */
export default function TrashIcon({
  size = 22,
  color = colors.status.void,
}: TrashIconProps) {
  // Tebal garis ikut ukuran, tapi tidak pernah setipis sub-piksel: di bawah
  // 1.5dp garisnya hilang timbul saat layar menskalakan.
  const stroke = Math.max(1.5, size * 0.09);

  return (
    <View
      style={[styles.box, { width: size, height: size }]}
      // Bentuknya sudah diwakili accessibilityLabel tombol pembungkusnya.
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
      <View
        style={{
          width: size * 0.36,
          height: size * 0.16,
          borderColor: color,
          borderWidth: stroke,
          borderBottomWidth: 0,
          borderTopLeftRadius: stroke,
          borderTopRightRadius: stroke,
        }}
      />
      <View
        style={{
          width: size,
          height: stroke,
          marginTop: stroke * 0.4,
          borderRadius: stroke,
          backgroundColor: color,
        }}
      />
      <View
        style={{
          width: size * 0.74,
          flex: 1,
          marginTop: size * 0.08,
          marginBottom: size * 0.04,
          borderColor: color,
          borderWidth: stroke,
          borderTopWidth: 0,
          borderBottomLeftRadius: stroke * 1.6,
          borderBottomRightRadius: stroke * 1.6,
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    alignItems: "center",
    justifyContent: "flex-start",
  },
});
