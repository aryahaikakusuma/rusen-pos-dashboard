import { StyleSheet, Text, View } from "react-native";

import type { OrderStatus } from "../lib/types";
import { colors, radius, spacing, textStyles } from "../theme";

/** Warna semantik status order, sama dengan aplikasi web (DESIGN.md). */
const TONE: Record<OrderStatus, { bg: string; fg: string; label: string }> = {
  pending: {
    bg: colors.status.pendingLight,
    fg: colors.status.pending,
    label: "Belum Lunas",
  },
  paid: {
    bg: colors.status.paidLight,
    fg: colors.status.paid,
    label: "Lunas",
  },
  void: {
    bg: colors.status.voidLight,
    fg: colors.status.void,
    label: "Dibatalkan",
  },
};

export default function StatusBadge({ status }: { status: OrderStatus }) {
  const tone = TONE[status];
  return (
    <View style={[styles.badge, { backgroundColor: tone.bg }]}>
      <Text style={[styles.label, { color: tone.fg }]}>{tone.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: "flex-start",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
  },
  label: {
    ...textStyles.statusBadge,
  },
});
