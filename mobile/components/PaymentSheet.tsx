import { useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import type { OrderRow } from "../db/types";
import { formatRupiah, tableLabel, type PaymentMethod } from "../lib/types";
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

interface PaymentSheetProps {
  order: OrderRow;
  submitting: boolean;
  error: string;
  onClose: () => void;
  onSubmit: (method: PaymentMethod, amountReceived: number | null) => void;
}

/** Port dari components/PaymentModal.tsx. */
export default function PaymentSheet({
  order,
  submitting,
  error,
  onClose,
  onSubmit,
}: PaymentSheetProps) {
  const total = order.total;
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [amountInput, setAmountInput] = useState("");

  const hasAmount = amountInput !== "";
  const amountReceived = hasAmount ? Number(amountInput) : 0;
  const change = amountReceived - total;

  // Pemeriksaan di sini hanya untuk umpan balik cepat. payOrder() tetap
  // memvalidasi ulang dan melempar INSUFFICIENT_AMOUNT — kebenaran uang
  // ditentukan di lapisan database, bukan di layar.
  const ready = method === "cash" ? hasAmount && amountReceived >= total : true;

  const tone = !hasAmount ? "neutral" : change >= 0 ? "ok" : "short";

  return (
    <Sheet
      title="Pelunasan Order"
      subtitle={`Meja/Order: ${tableLabel(order.table_code, order.table_seq)}`}
      onClose={onClose}
      // Berlabuh di atas, bukan di bawah seperti lembar lain: papan ketik
      // angka naik dari bawah dan menutupi kolom nominal beserta kotak
      // kembalian — justru dua hal yang harus terlihat saat mengetik.
      anchor="top"
      footer={
        <Button
          label="Konfirmasi Lunas"
          loadingLabel="Memproses…"
          variant="primary"
          loading={submitting}
          disabled={!ready}
          onPress={() =>
            onSubmit(method, method === "cash" ? amountReceived : null)
          }
        />
      }>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.totalBox}>
          <Text style={styles.boxLabel}>Total Tagihan</Text>
          <Text style={styles.total}>{formatRupiah(total)}</Text>
        </View>

        <View>
          <Text style={styles.fieldLabel}>Metode Pembayaran</Text>
          <View style={styles.methodRow}>
            {(["cash", "non_cash"] as const).map((option) => (
              <Button
                key={option}
                label={option === "cash" ? "Cash" : "Non Cash"}
                style={[
                  styles.methodButton,
                  method === option && styles.methodActive,
                ]}
                onPress={() => {
                  setMethod(option);
                  if (option === "non_cash") setAmountInput("");
                }}
              />
            ))}
          </View>
        </View>

        {method === "cash" ? (
          <View style={styles.cashBlock}>
            <Text style={styles.fieldLabel}>Nominal Diterima</Text>
            <TextInput
              value={amountInput}
              onChangeText={(text) =>
                setAmountInput(text.replace(/[^0-9]/g, ""))
              }
              keyboardType="number-pad"
              placeholder="0"
              placeholderTextColor={semantic.textSecondary}
              style={styles.input}
              editable={!submitting}
            />

            {/* Uang kurang punya kotaknya sendiri, bukan kembalian bernilai
                nol: kasir perlu tahu berapa lagi yang harus diminta, dan
                "Rp 0" tidak menjawab itu. Labelnya ikut berganti supaya
                angka bertanda minus tidak terbaca sebagai kembalian. */}
            <View style={[styles.changeBox, styles[`${tone}Box`]]}>
              <Text style={styles.boxLabel}>
                {tone === "short" ? "Kurang" : "Kembalian"}
              </Text>
              <Text style={[styles.change, styles[`${tone}Text`]]}>
                {!hasAmount
                  ? "-"
                  : change < 0
                    ? `− ${formatRupiah(-change)}`
                    : formatRupiah(change)}
              </Text>
            </View>
          </View>
        ) : null}

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
    gap: spacing.lg,
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
  fieldLabel: {
    ...textStyles.bodyStrong,
    marginBottom: spacing.sm,
    color: semantic.textPrimary,
  },
  methodRow: {
    flexDirection: "row",
    gap: spacing.md,
  },
  methodButton: {
    flex: 1,
  },
  methodActive: {
    borderColor: colors.primary[600],
    backgroundColor: colors.primary[50],
  },
  cashBlock: {
    gap: spacing.md,
  },
  input: {
    ...textStyles.actionButton,
    minHeight: touchTarget.comfortable,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: semantic.border,
    color: semantic.textPrimary,
  },
  changeBox: {
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 2,
  },
  change: {
    ...textStyles.screenTitle,
  },
  neutralBox: {
    borderColor: semantic.border,
    backgroundColor: semantic.surfaceMuted,
  },
  neutralText: {
    color: semantic.textSecondary,
  },
  okBox: {
    borderColor: colors.status.paid,
    backgroundColor: colors.status.paidLight,
  },
  okText: {
    color: colors.status.paid,
  },
  shortBox: {
    borderColor: colors.status.void,
    backgroundColor: colors.status.voidLight,
  },
  shortText: {
    color: colors.status.void,
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
