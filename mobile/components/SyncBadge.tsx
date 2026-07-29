import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import {
  colors,
  radius,
  semantic,
  spacing,
  textStyles,
  touchTarget,
} from "../theme";

interface SyncBadgeProps {
  /** Berapa order yang belum sampai ke server. */
  unsent: number;
  busy: boolean;
  onPress: () => void;
}

/**
 * Satu-satunya tempat kasir melihat keadaan sinkronisasi.
 *
 * Sengaja bukan indikator sinyal atau status koneksi: yang perlu dijawab kasir
 * bukan "apakah ada internet", tapi "apakah ada order yang belum sampai".
 * Kalau nol, komponennya hilang sama sekali — tanda hijau permanen hanya jadi
 * hiasan yang lama-lama tidak dilihat lagi.
 */
export default function SyncBadge({ unsent, busy, onPress }: SyncBadgeProps) {
  if (unsent === 0 && !busy) return null;

  return (
    <View style={styles.bar}>
      <Text style={styles.count}>
        {busy && unsent === 0
          ? "Mengirim…"
          : `${unsent} order belum terkirim`}
      </Text>
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        disabled={busy}
        style={({ pressed }) => [
          styles.action,
          pressed && styles.actionPressed,
          busy && styles.actionBusy,
        ]}>
        {busy ? (
          <ActivityIndicator color={colors.status.pending} size="small" />
        ) : (
          <Text style={styles.actionLabel}>Kirim ulang</Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    paddingLeft: spacing.md,
    paddingRight: spacing.xs,
    paddingVertical: spacing.xs,
    borderRadius: radius.md,
    backgroundColor: colors.status.pendingLight,
  },
  count: {
    ...textStyles.caption,
    flex: 1,
    color: colors.status.pending,
  },
  action: {
    minHeight: touchTarget.min,
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
  },
  actionPressed: {
    backgroundColor: semantic.surface,
  },
  actionBusy: {
    opacity: 0.6,
  },
  actionLabel: {
    ...textStyles.caption,
    fontFamily: textStyles.bodyStrong.fontFamily,
    color: colors.status.pending,
  },
});
