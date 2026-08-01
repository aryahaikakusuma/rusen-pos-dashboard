import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import type { OrderItemRow, OrderRow } from "../db/types";
import { hitungPbjt, labelPbjt } from "../lib/tax";
import { formatRupiah, tableLabel, type TaxStatus } from "../lib/types";
import { colors, radius, semantic, spacing, textStyles, touchTarget } from "../theme";
import Button from "./Button";
import Sheet from "./Sheet";

interface BillSheetProps {
  order: OrderRow & { items: OrderItemRow[] };
  taxRateBps: number | null;
  printing: boolean;
  onClose: () => void;
  onPrint: (selectedItemIds: string[], taxStatus: TaxStatus) => void;
}

/** Pemilih baris penuh untuk tagihan sementara; tidak pernah menulis ke order. */
export default function BillSheet({ order, taxRateBps, printing, onClose, onPrint }: BillSheetProps) {
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(order.items.map((item) => item.id))
  );
  const [taxStatus, setTaxStatus] = useState<TaxStatus>(
    taxRateBps === null ? "exempt" : "taxable"
  );
  const subtotal = order.items.reduce(
    (total, item) => total + (selected.has(item.id) ? item.subtotal : 0),
    0
  );
  // Basis pajak dijumlahkan dari baris terpilih yang objek PBJT. Dihitung dari
  // pilihan, bukan dari order.taxable_subtotal: lembar ini boleh memilih
  // sebagian item, dan basis milik seluruh order akan menagih pajak atas barang
  // yang tidak ikut dicetak.
  const kena = order.items.reduce(
    (total, item) =>
      total + (selected.has(item.id) && item.taxable === 1 ? item.subtotal : 0),
    0
  );
  const tax = taxStatus === "taxable" && taxRateBps !== null
    ? hitungPbjt(kena, taxRateBps)
    : 0;

  const toggle = (itemId: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  };

  return (
    <Sheet
      title="Cetak Bill"
      subtitle={`Meja/Order: ${tableLabel(order.table_code, order.table_seq)}`}
      onClose={onClose}
      footer={
        <Button
          label="Cetak Bill"
          variant="primary"
          loading={printing}
          loadingLabel="Mencetak…"
          disabled={selected.size === 0}
          onPress={() => onPrint([...selected], taxStatus)}
        />
      }>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.hint}>Pilih item dan cara penghitungan bill. Pilihan ini tidak mengubah pelunasan order.</Text>
        <View>
          <Text style={styles.fieldLabel}>Pajak pada Bill</Text>
          <View style={styles.taxChoices}>
            <Button
              label="Kena PBJT"
              disabled={taxRateBps === null}
              onPress={() => setTaxStatus("taxable")}
              style={[styles.taxChoice, taxStatus === "taxable" && styles.taxChoiceActive]}
            />
            <Button
              label="Biasa"
              onPress={() => setTaxStatus("exempt")}
              style={[styles.taxChoice, taxStatus === "exempt" && styles.taxChoiceActive]}
            />
          </View>
          {taxRateBps === null ? <Text style={styles.rateHint}>Tarif belum tersedia; hanya Bill Biasa yang dapat dicetak.</Text> : null}
        </View>
        {order.items.map((item) => {
          const checked = selected.has(item.id);
          return (
            <Pressable
              key={item.id}
              accessibilityRole="checkbox"
              accessibilityState={{ checked, disabled: printing }}
              accessibilityLabel={`${item.product_name}, ${item.quantity} buah`}
              disabled={printing}
              onPress={() => toggle(item.id)}
              style={({ pressed }) => [styles.item, checked && styles.itemChecked, pressed && styles.pressed]}>
              <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
                <Text style={styles.checkmark}>{checked ? "✓" : ""}</Text>
              </View>
              <View style={styles.itemText}>
                <Text style={styles.itemName}>{item.product_name}</Text>
                {item.notes ? <Text style={styles.note}>Catatan: {item.notes}</Text> : null}
                <Text style={styles.itemMeta}>{item.quantity} x {formatRupiah(item.unit_price)}</Text>
              </View>
              <Text style={styles.amount}>{formatRupiah(item.subtotal)}</Text>
            </Pressable>
          );
        })}
        <View style={styles.totalBox}>
          <Text style={styles.totalLabel}>Subtotal Tagihan</Text>
          <Text style={styles.summaryAmount}>{formatRupiah(subtotal)}</Text>
          {taxStatus === "taxable" && taxRateBps !== null ? (
            <>
              <Text style={styles.totalLabel}>{labelPbjt(taxRateBps)}</Text>
              <Text style={styles.summaryAmount}>{formatRupiah(tax)}</Text>
              <Text style={styles.totalLabel}>Total Tagihan</Text>
              <Text style={styles.total}>{formatRupiah(subtotal + tax)}</Text>
            </>
          ) : null}
        </View>
      </ScrollView>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.md },
  hint: { ...textStyles.caption, color: semantic.textSecondary },
  fieldLabel: { ...textStyles.bodyStrong, color: semantic.textPrimary },
  taxChoices: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.xs },
  taxChoice: { flex: 1 },
  taxChoiceActive: { borderColor: semantic.sidebarActive, backgroundColor: semantic.surfaceMuted },
  rateHint: { ...textStyles.caption, marginTop: spacing.xs, color: colors.status.void },
  item: { minHeight: touchTarget.min, flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.sm, borderWidth: 1, borderColor: semantic.border, borderRadius: radius.md },
  itemChecked: { backgroundColor: colors.primary[50], borderColor: colors.primary[600] },
  pressed: { opacity: 0.8 },
  checkbox: { width: 24, height: 24, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: semantic.border, borderRadius: radius.sm },
  checkboxChecked: { borderColor: colors.primary[600], backgroundColor: colors.primary[600] },
  checkmark: { ...textStyles.bodyStrong, color: colors.neutral[0] },
  itemText: { flex: 1 },
  itemName: { ...textStyles.bodyStrong, color: semantic.textPrimary },
  note: { ...textStyles.caption, color: semantic.textSecondary },
  itemMeta: { ...textStyles.caption, color: semantic.textSecondary },
  amount: { ...textStyles.bodyStrong, color: semantic.textPrimary },
  totalBox: { padding: spacing.md, borderRadius: radius.md, backgroundColor: semantic.surfaceMuted },
  totalLabel: { ...textStyles.caption, color: semantic.textSecondary },
  summaryAmount: { ...textStyles.body, color: semantic.textPrimary },
  total: { ...textStyles.grandTotal, color: semantic.textPrimary },
});
