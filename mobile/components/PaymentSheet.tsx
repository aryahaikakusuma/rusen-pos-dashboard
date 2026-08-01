import { useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import type { OrderRow } from "../db/types";
import { hitungPbjt, labelPbjt } from "../lib/tax";
import {
  formatRupiah,
  tableLabel,
  type PaymentMethod,
  type TaxStatus,
} from "../lib/types";
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
  /** Tarif PBJT dari app_state. Hanya untuk menampilkan rinciannya. */
  taxRateBps: number;
  submitting: boolean;
  error: string;
  onClose: () => void;
  onSubmit: (
    method: PaymentMethod,
    amountReceived: number | null,
    taxStatus: TaxStatus,
    taxExemptReason: string | null
  ) => void;
}

/** Port dari components/PaymentModal.tsx. */
export default function PaymentSheet({
  order,
  taxRateBps,
  submitting,
  error,
  onClose,
  onSubmit,
}: PaymentSheetProps) {
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [taxStatus, setTaxStatus] = useState<TaxStatus>("taxable");
  const [exemptReason, setExemptReason] = useState("");
  const [amountInput, setAmountInput] = useState("");

  // `order.total` pada order pending masih angka PRA-pajak — pajaknya baru
  // diputuskan di lembar ini. Membandingkan nominal diterima terhadap angka itu
  // akan menampilkan kembalian 10% terlalu besar, dan kasir sudah menyerahkan
  // uangnya sebelum siapa pun sempat memeriksa. Semua perbandingan di bawah
  // memakai `tagihan`.
  const subtotal = order.subtotal;
  // Basisnya taxable_subtotal, bukan subtotal: rokok bukan objek PBJT. Angka di
  // layar ini harus sama persis dengan yang dihitung payOrder, kalau tidak
  // kasir menagih satu angka lalu mencatat angka lain.
  const tax =
    taxStatus === "exempt" ? 0 : hitungPbjt(order.taxable_subtotal, taxRateBps);
  const tagihan = subtotal + tax;

  const hasAmount = amountInput !== "";
  const amountReceived = hasAmount ? Number(amountInput) : 0;
  const change = amountReceived - tagihan;

  // Pemeriksaan di sini hanya untuk umpan balik cepat. payOrder() tetap
  // memvalidasi ulang dan melempar INSUFFICIENT_AMOUNT — kebenaran uang
  // ditentukan di lapisan database, bukan di layar.
  const cashReady = method === "cash" ? hasAmount && amountReceived >= tagihan : true;
  const reasonReady = taxStatus === "taxable" || exemptReason.trim() !== "";
  const ready = cashReady && reasonReady;

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
            onSubmit(
              method,
              method === "cash" ? amountReceived : null,
              taxStatus,
              taxStatus === "exempt" ? exemptReason : null
            )
          }
        />
      }>
      <ScrollView contentContainerStyle={styles.content}>
        <View>
          <Text style={styles.fieldLabel}>Status Pajak</Text>
          <View style={styles.methodRow}>
            {(
              [
                ["taxable", "Kena Pajak"],
                ["exempt", "Bebas Pajak"],
              ] as const
            ).map(([option, label]) => (
              <Button
                key={option}
                label={label}
                style={[
                  styles.methodButton,
                  taxStatus === option && styles.taxActive,
                ]}
                onPress={() => {
                  setTaxStatus(option);
                  // Keterangan dibuang saat kembali ke kena pajak. Keterangan
                  // yang menempel pada transaksi yang akhirnya dipungut pajak
                  // adalah jejak audit yang berbohong — dan constraint di
                  // Postgres menolaknya juga.
                  if (option === "taxable") setExemptReason("");
                }}
              />
            ))}
          </View>
        </View>

        {taxStatus === "exempt" ? (
          <View>
            <Text style={styles.fieldLabel}>Keterangan Bebas Pajak</Text>
            <TextInput
              value={exemptReason}
              onChangeText={setExemptReason}
              placeholder="Nama instansi atau alasannya"
              placeholderTextColor={semantic.textSecondary}
              style={styles.input}
              editable={!submitting}
            />
            <Text style={styles.hint}>
              Wajib diisi. Tercatat atas nama Anda sebagai yang menyetujui.
            </Text>
          </View>
        ) : null}

        <View style={styles.totalBox}>
          {taxStatus === "taxable" ? (
            <View style={styles.breakdown}>
              <View style={styles.breakdownRow}>
                <Text style={styles.breakdownLabel}>Subtotal</Text>
                <Text style={styles.breakdownValue}>{formatRupiah(subtotal)}</Text>
              </View>
              <View style={styles.breakdownRow}>
                <Text style={styles.breakdownLabel}>{labelPbjt(taxRateBps)}</Text>
                <Text style={styles.breakdownValue}>{formatRupiah(tax)}</Text>
              </View>
            </View>
          ) : null}
          <Text style={styles.boxLabel}>Total Tagihan</Text>
          <Text style={styles.total}>{formatRupiah(tagihan)}</Text>
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
  // Netral gelap, bukan biru. DESIGN.md menyimpan biru untuk aksi utama, dan di
  // lembar ini aksi utamanya "Konfirmasi Lunas". Status pajak adalah pilihan,
  // bukan tombol yang dituju kasir — kalau ikut biru, mata tidak bisa
  // membedakan "ini tombol" dari "ini status" dalam sekali lihat.
  taxActive: {
    borderColor: semantic.sidebarActive,
    backgroundColor: semantic.surfaceMuted,
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
  hint: {
    ...textStyles.caption,
    marginTop: spacing.xs,
    color: semantic.textSecondary,
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
