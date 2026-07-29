import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import type { TableConflict } from "../db/types";
import { formatRupiah, tableLabel } from "../lib/types";
import { radius, semantic, spacing, textStyles, touchTarget } from "../theme";
import Sheet from "./Sheet";

interface TableConflictDialogProps {
  tableCode: string;
  conflicts: TableConflict[];
  busy: boolean;
  onSameCustomer: (conflict: TableConflict) => void;
  onDifferentCustomer: () => void;
  onCancel: () => void;
}

const formatTime = (iso: string) =>
  new Intl.DateTimeFormat("id-ID", { timeStyle: "short" }).format(new Date(iso));

/**
 * Port dari components/TableConflictDialog.tsx, termasuk keputusan desainnya:
 * kode meja kembar bukan error, melainkan percabangan yang hanya kasir yang
 * tahu jawabannya. Kedua pilihan sengaja TIDAK diberi warna aksi utama — salah
 * pilih langsung berdampak ke tagihan pelanggan, jadi tidak ada default aman.
 *
 * Bedanya dengan web: nama kasir tidak ditampilkan. Perangkat sengaja tidak
 * menyimpan tabel employees (pin_hash tidak boleh turun ke sini), jadi datanya
 * memang tidak ada. Jam dan jumlah item sudah cukup untuk mengenali order.
 */
export default function TableConflictDialog({
  tableCode,
  conflicts,
  busy,
  onSameCustomer,
  onDifferentCustomer,
  onCancel,
}: TableConflictDialogProps) {
  return (
    <Sheet
      title={`Meja ${tableCode} sudah punya order belum lunas`}
      subtitle="Pelanggan yang sama, atau pelanggan berbeda?"
      onClose={onCancel}>
      <ScrollView contentContainerStyle={styles.content}>
        {conflicts.map((conflict) => (
          <Pressable
            key={conflict.orderId}
            accessibilityRole="button"
            onPress={() => onSameCustomer(conflict)}
            disabled={busy}
            style={({ pressed }) => [
              styles.option,
              pressed && styles.optionPressed,
              busy && styles.optionDisabled,
            ]}>
            <View style={styles.optionHeader}>
              <Text style={styles.optionTitle}>
                {tableLabel(tableCode, conflict.tableSeq)}
              </Text>
              <Text style={styles.optionTitle}>
                {formatRupiah(conflict.total)}
              </Text>
            </View>
            <Text style={styles.optionMeta}>
              {conflict.itemCount} item · {formatTime(conflict.createdAt)}
            </Text>
            <Text style={styles.optionAction}>
              Pelanggan sama — gabungkan ke order ini
            </Text>
          </Pressable>
        ))}

        <Pressable
          accessibilityRole="button"
          onPress={onDifferentCustomer}
          disabled={busy}
          style={({ pressed }) => [
            styles.option,
            pressed && styles.optionPressed,
            busy && styles.optionDisabled,
          ]}>
          <Text style={styles.optionAction}>Pelanggan berbeda</Text>
          <Text style={styles.optionMeta}>
            Buat order terpisah dengan kode {tableCode} ({conflicts.length + 1})
          </Text>
        </Pressable>
      </ScrollView>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  option: {
    minHeight: touchTarget.comfortable,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: semantic.border,
  },
  optionPressed: {
    borderColor: semantic.textSecondary,
    backgroundColor: semantic.surfaceMuted,
  },
  optionDisabled: {
    opacity: 0.5,
  },
  optionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  optionTitle: {
    ...textStyles.bodyStrong,
    color: semantic.textPrimary,
  },
  optionMeta: {
    ...textStyles.caption,
    marginTop: spacing.xs,
    color: semantic.textSecondary,
  },
  optionAction: {
    ...textStyles.bodyStrong,
    marginTop: spacing.sm,
    color: semantic.textPrimary,
  },
});
