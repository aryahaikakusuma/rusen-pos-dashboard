import { StyleSheet, Text, View } from "react-native";

import { colors, semantic, spacing, textStyles } from "../theme";

/**
 * Pita "sif belum dimulai". Dirender di layar Kasir dan Order selama
 * `useShift().aktif` bernilai false.
 *
 * Pita, bukan modal penuh layar seperti gerbang lama. Kasir boleh melihat
 * katalog dan riwayat order tanpa sif — keduanya tidak memindahkan uang. Yang
 * ditahan hanya aksi tulis, dan pita ini yang menjelaskan kenapa tombolnya
 * mati; tanpa ia, layar hanya terasa rusak.
 *
 * Kuning "pending", bukan merah: ini keadaan yang wajar di awal hari, bukan
 * kesalahan. Merah sudah dipakai pita MODE UJI, dan dua pita merah dengan arti
 * berbeda akan saling menumpulkan.
 */
export default function ShiftBanner() {
  return (
    <View style={styles.banner} accessibilityRole="alert">
      <Text style={styles.title}>Sif belum dimulai — belum bisa melayani</Text>
      <Text style={styles.body}>
        Buka menu ☰ lalu tekan &ldquo;Mulai Shift&rdquo; dan isi Modal Awal.
        Katalog dan daftar order tetap bisa dilihat.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: colors.status.pendingLight,
    borderBottomWidth: 2,
    borderBottomColor: colors.status.pending,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: 2,
  },
  title: {
    ...textStyles.body,
    color: semantic.textPrimary,
    fontWeight: "700",
  },
  body: {
    ...textStyles.caption,
    color: semantic.textSecondary,
  },
});
