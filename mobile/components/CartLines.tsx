import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { draftLineKey, formatRupiah, type DraftItem } from "../lib/types";
import {
  colors,
  radius,
  semantic,
  spacing,
  textStyles,
  touchTarget,
} from "../theme";

interface CartLinesProps {
  items: DraftItem[];
  disabled?: boolean;
  onUpdateQuantity: (productId: string, quantity: number) => void;
  onRemove: (productId: string) => void;
}

/**
 * Port dari components/DraftCart.tsx milik web, bagian daftar itemnya saja.
 * Tombol total dan aksi sengaja tidak ikut: di ponsel keduanya menempel di
 * bawah lembar, di tablet di kaki panel — jadi penempatannya milik layar,
 * bukan milik komponen ini.
 */
export default function CartLines({
  items,
  disabled,
  onUpdateQuantity,
  onRemove,
}: CartLinesProps) {
  if (items.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>Keranjang kosong</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.content}>
      {items.map((item) => {
        const lineKey = draftLineKey(item);
        return (
        <View key={lineKey} style={styles.line}>
          <View style={styles.lineHeader}>
            <View style={styles.lineTitle}>
              <Text style={styles.name}>{item.productName}</Text>
              {item.notes ? (
                <Text style={styles.notes}>{item.notes}</Text>
              ) : null}
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Hapus ${item.productName}`}
              onPress={() => onRemove(lineKey)}
              disabled={disabled}
              style={({ pressed }) => [
                styles.remove,
                pressed && styles.removePressed,
                disabled && styles.stepperDisabled,
              ]}>
              <Text style={styles.removeLabel}>✕</Text>
            </Pressable>
          </View>

          <View style={styles.lineFooter}>
            <View style={styles.stepper}>
              <Step
                label="−"
                accessibilityLabel="Kurangi jumlah"
                disabled={disabled}
                onPress={() =>
                  onUpdateQuantity(lineKey, item.quantity - 1)
                }
              />
              <Text style={styles.quantity}>{item.quantity}</Text>
              <Step
                label="+"
                accessibilityLabel="Tambah jumlah"
                disabled={disabled}
                onPress={() =>
                  onUpdateQuantity(lineKey, item.quantity + 1)
                }
              />
            </View>

            <View style={styles.amounts}>
              <Text style={styles.unitPrice}>
                {formatRupiah(item.unitPrice)}
              </Text>
              <Text style={styles.subtotal}>
                {formatRupiah(item.unitPrice * item.quantity)}
              </Text>
            </View>
          </View>
        </View>
        );
      })}
    </ScrollView>
  );
}

function Step({
  label,
  accessibilityLabel,
  disabled,
  onPress,
}: {
  label: string;
  accessibilityLabel: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.step,
        pressed && styles.stepPressed,
        disabled && styles.stepperDisabled,
      ]}>
      <Text style={styles.stepLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.md,
    gap: spacing.sm,
  },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
  },
  emptyText: {
    ...textStyles.body,
    color: semantic.textSecondary,
  },
  line: {
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: semantic.border,
    backgroundColor: semantic.surface,
  },
  lineHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  lineTitle: {
    flex: 1,
  },
  name: {
    ...textStyles.bodyStrong,
    color: semantic.textPrimary,
  },
  notes: {
    ...textStyles.caption,
    fontStyle: "italic",
    color: semantic.textSecondary,
  },
  remove: {
    width: touchTarget.min,
    height: touchTarget.min,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.sm,
  },
  removePressed: {
    backgroundColor: colors.status.voidLight,
  },
  removeLabel: {
    ...textStyles.bodyStrong,
    color: colors.status.void,
  },
  lineFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: spacing.sm,
  },
  stepper: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  step: {
    width: touchTarget.min,
    height: touchTarget.min,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.sm,
    backgroundColor: colors.neutral[100],
  },
  stepPressed: {
    backgroundColor: colors.neutral[200],
  },
  stepperDisabled: {
    opacity: 0.4,
  },
  stepLabel: {
    ...textStyles.actionButton,
    color: semantic.textPrimary,
  },
  quantity: {
    ...textStyles.bodyStrong,
    minWidth: 32,
    textAlign: "center",
    color: semantic.textPrimary,
  },
  amounts: {
    alignItems: "flex-end",
  },
  unitPrice: {
    ...textStyles.caption,
    color: semantic.textSecondary,
  },
  subtotal: {
    ...textStyles.price,
    color: semantic.textPrimary,
  },
});
