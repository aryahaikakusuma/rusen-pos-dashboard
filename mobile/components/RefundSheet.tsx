import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import type { OrderItemRow, OrderRow, RefundItemInput } from "../db/types";
import { hitungPbjt, labelPbjt } from "../lib/tax";
import { formatRupiah, tableLabel } from "../lib/types";
import {
  colors,
  radius,
  semantic,
  spacing,
  textStyles,
  touchTarget,
} from "../theme";
import Button from "./Button";
import Sheet from "./Sheet";

interface RefundSheetProps {
  order: OrderRow & { items: OrderItemRow[] };
  /** Berapa banyak tiap item yang SUDAH pernah direfund. Kunci = order_item_id. */
  sudahDirefund: Record<string, number>;
  /** Pokok dan pajak yang sudah pernah dikembalikan untuk order ini. */
  sudahSubtotal: number;
  sudahPajak: number;
  submitting: boolean;
  error: string;
  onClose: () => void;
  onSubmit: (items: RefundItemInput[], reason: string | null) => void;
}

/**
 * Pengembalian uang atas order yang sudah lunas.
 *
 * Kasir memilih item dan jumlahnya; harga tidak pernah diketik. Angka yang
 * ditampilkan di sini murni pratinjau — createRefund menghitung ulang seluruhnya
 * dari order_items dan Postgres memvalidasinya sekali lagi. Layar tidak pernah
 * jadi sumber kebenaran soal uang.
 */
export default function RefundSheet({
  order,
  sudahDirefund,
  sudahSubtotal,
  sudahPajak,
  submitting,
  error,
  onClose,
  onSubmit,
}: RefundSheetProps) {
  const [dipilih, setDipilih] = useState<Record<string, number>>({});
  const [reason, setReason] = useState("");

  // Sisa per item, dihitung sekali. Item yang sudah habis direfund tetap
  // ditampilkan tapi tidak bisa ditambah — menyembunyikannya membuat kasir
  // mengira ia salah membuka order.
  const sisa = useMemo(() => {
    const map: Record<string, number> = {};
    for (const item of order.items) {
      map[item.id] = item.quantity - (sudahDirefund[item.id] ?? 0);
    }
    return map;
  }, [order.items, sudahDirefund]);

  const subtotal = order.items.reduce(
    (sum, item) => sum + (dipilih[item.id] ?? 0) * item.unit_price,
    0
  );

  // Bagian yang objek PBJT, dari SNAPSHOT di barisnya. Order lama yang rokoknya
  // memang pernah dipungut pajak tetap mengembalikan pajak itu.
  const kena = order.items.reduce(
    (sum, item) =>
      sum + (item.taxable === 1 ? (dipilih[item.id] ?? 0) * item.unit_price : 0),
    0
  );

  // Kembar dari refundTax di db/orders.ts dan hitung_pajak_refund di 0021.
  // Cabang kedua adalah yang membuat refund terakhir menutup pajaknya PERSIS,
  // tanpa menyisakan rupiah yang tidak bisa dikembalikan — dan ia sengaja
  // diukur dengan `subtotal`, bukan `kena`: order baru habis kalau rokoknya
  // ikut kembali.
  const pajak =
    order.tax_status === "exempt"
      ? 0
      : sudahSubtotal + subtotal >= order.subtotal
        ? order.tax_amount - sudahPajak
        : hitungPbjt(kena, order.tax_rate_bps);

  const total = subtotal + pajak;
  const ready = subtotal > 0;

  const ubah = (itemId: string, delta: number) =>
    setDipilih((current) => {
      const next = Math.min(
        Math.max((current[itemId] ?? 0) + delta, 0),
        sisa[itemId] ?? 0
      );
      return { ...current, [itemId]: next };
    });

  return (
    <Sheet
      title="Refund Order"
      subtitle={`Meja/Order: ${tableLabel(order.table_code, order.table_seq)}`}
      onClose={onClose}
      footer={
        <Button
          label="Konfirmasi Refund"
          loadingLabel="Memproses…"
          variant="primary"
          loading={submitting}
          disabled={!ready}
          onPress={() =>
            onSubmit(
              order.items
                .filter((item) => (dipilih[item.id] ?? 0) > 0)
                .map((item) => ({
                  orderItemId: item.id,
                  quantity: dipilih[item.id],
                })),
              reason.trim() || null
            )
          }
        />
      }>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.fieldLabel}>Item yang Dikembalikan</Text>

        {order.items.map((item) => {
          const habis = (sisa[item.id] ?? 0) === 0;
          const jumlah = dipilih[item.id] ?? 0;
          return (
            <View key={item.id} style={styles.item}>
              <View style={styles.itemText}>
                <Text style={styles.itemName}>{item.product_name}</Text>
                <Text style={styles.itemMeta}>
                  {habis
                    ? "Sudah direfund seluruhnya"
                    : `${formatRupiah(item.unit_price)} · sisa ${sisa[item.id]}`}
                </Text>
              </View>

              <View style={styles.stepper}>
                <Pressable
                  onPress={() => ubah(item.id, -1)}
                  disabled={submitting || jumlah === 0}
                  style={[styles.step, jumlah === 0 && styles.stepOff]}>
                  <Text style={styles.stepLabel}>−</Text>
                </Pressable>
                <Text style={styles.jumlah}>{jumlah}</Text>
                <Pressable
                  onPress={() => ubah(item.id, 1)}
                  disabled={submitting || jumlah >= (sisa[item.id] ?? 0)}
                  style={[
                    styles.step,
                    jumlah >= (sisa[item.id] ?? 0) && styles.stepOff,
                  ]}>
                  <Text style={styles.stepLabel}>+</Text>
                </Pressable>
              </View>
            </View>
          );
        })}

        <View style={styles.totalBox}>
          {order.tax_status === "taxable" ? (
            <View style={styles.breakdown}>
              <View style={styles.breakdownRow}>
                <Text style={styles.breakdownLabel}>Subtotal</Text>
                <Text style={styles.breakdownValue}>{formatRupiah(subtotal)}</Text>
              </View>
              <View style={styles.breakdownRow}>
                <Text style={styles.breakdownLabel}>
                  {labelPbjt(order.tax_rate_bps)}
                </Text>
                <Text style={styles.breakdownValue}>{formatRupiah(pajak)}</Text>
              </View>
            </View>
          ) : null}
          <Text style={styles.boxLabel}>Total Dikembalikan</Text>
          <Text style={styles.total}>{formatRupiah(total)}</Text>
        </View>

        <View>
          <Text style={styles.fieldLabel}>Alasan</Text>
          <TextInput
            value={reason}
            onChangeText={setReason}
            placeholder="Opsional"
            placeholderTextColor={semantic.textSecondary}
            style={styles.input}
            editable={!submitting}
          />
          <Text style={styles.hint}>
            Tercatat atas nama Anda sebagai yang mengembalikan.
          </Text>
        </View>

        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText} accessibilityRole="alert">
              {error}
            </Text>
          </View>
        ) : null}
      </ScrollView>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  fieldLabel: {
    ...textStyles.bodyStrong,
    color: semantic.textPrimary,
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  itemText: {
    flex: 1,
  },
  itemName: {
    ...textStyles.bodyStrong,
    color: semantic.textPrimary,
  },
  itemMeta: {
    ...textStyles.caption,
    color: semantic.textSecondary,
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
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: semantic.border,
    backgroundColor: semantic.surfaceMuted,
  },
  stepOff: {
    opacity: 0.4,
  },
  stepLabel: {
    ...textStyles.grandTotal,
    color: semantic.textPrimary,
  },
  jumlah: {
    ...textStyles.bodyStrong,
    minWidth: spacing.lg,
    textAlign: "center",
    color: semantic.textPrimary,
  },
  totalBox: {
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: semantic.border,
    backgroundColor: semantic.surfaceMuted,
  },
  boxLabel: {
    ...textStyles.caption,
    color: semantic.textSecondary,
  },
  total: {
    ...textStyles.grandTotal,
    color: semantic.textPrimary,
  },
  breakdown: {
    gap: spacing.xs,
    marginBottom: spacing.sm,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: semantic.border,
  },
  breakdownRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  breakdownLabel: {
    ...textStyles.body,
    color: semantic.textSecondary,
  },
  breakdownValue: {
    ...textStyles.bodyStrong,
    color: semantic.textPrimary,
  },
  input: {
    ...textStyles.body,
    minHeight: touchTarget.min,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: semantic.border,
    backgroundColor: semantic.surface,
    color: semantic.textPrimary,
  },
  hint: {
    ...textStyles.caption,
    marginTop: spacing.xs,
    color: semantic.textSecondary,
  },
  errorBox: {
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.status.void,
    backgroundColor: colors.status.voidLight,
  },
  errorText: {
    ...textStyles.caption,
    textAlign: "center",
    color: colors.status.void,
  },
});
