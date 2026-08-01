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

/**
 * Keadaan refund, diturunkan dari baris `refunds` — bukan dari `orders.status`,
 * yang sengaja tetap 'paid' setelah refund supaya enum order_status tidak perlu
 * ditambah nilai baru dan setiap pembaca status di dua aplikasi tidak ikut
 * tersentuh demi satu label. Lihat MIGRATION.md § Refund.
 */
export type RefundState = "partial" | "full";

/**
 * Kuning untuk sebagian dan merah untuk penuh bukan warna baru: keduanya sudah
 * dipakai di aplikasi ini dengan arti yang sama. Kuning = masih ada yang
 * menggantung (Belum Lunas), merah = transaksi ini tidak menghasilkan uang
 * (Dibatalkan). Kasir sudah menghafal keduanya.
 */
const REFUND_TONE: Record<RefundState, { bg: string; fg: string; label: string }> = {
  partial: {
    bg: colors.status.pendingLight,
    fg: colors.status.pending,
    label: "Refund Sebagian",
  },
  full: {
    bg: colors.status.voidLight,
    fg: colors.status.void,
    label: "Refund Penuh",
  },
};

export default function StatusBadge({
  status,
  refund,
}: {
  status: OrderStatus;
  refund?: RefundState;
}) {
  // Diabaikan kalau statusnya bukan 'paid'. Order pending dan void tidak bisa
  // punya refund, dan prop yang mampu memaksa label mustahil adalah persis cara
  // badge mulai berbohong tentang order.
  const tone = status === "paid" && refund ? REFUND_TONE[refund] : TONE[status];
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
