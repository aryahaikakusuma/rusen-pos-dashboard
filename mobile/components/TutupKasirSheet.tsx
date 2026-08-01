import { useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import type { OpenShift, ShiftTotals } from "../db/shift";
import { kasSeharusnya } from "../lib/receipt";
import { formatRupiah } from "../lib/types";
import { colors, radius, semantic, spacing, textStyles, touchTarget } from "../theme";
import Button from "./Button";
import Sheet from "./Sheet";

interface TutupKasirSheetProps {
  shift: OpenShift;
  totals: ShiftTotals;
  /** true kalau kasir yang sedang login bukan yang membuka sif ini. */
  differentCashier: string | null;
  printing: boolean;
  onClose: () => void;
  onPrint: (kasFisik: number) => void;
}

/**
 * Komponen bodoh seperti BillSheet: menerima totals + sif sebagai prop dan
 * satu onPrint, tidak mengimpor printer sama sekali. Menampilkan seluruh
 * angka yang akan tercetak sebelum kertas keluar.
 *
 * HITUNG BUTA yang disengaja: "Kas Seharusnya" dan selisihnya baru muncul
 * SETELAH kasir mengetik hasil hitungan fisiknya, bukan sebelumnya. Kalau
 * angka yang diharapkan sudah tampil di layar, kasir tinggal mengetik ulang
 * angka itu dan selisih akan selalu nol — termasuk pada sif yang benar-benar
 * kurang uang. Itu membuat kontrolnya jadi teater, lebih buruk daripada
 * tidak ada, karena laporan yang selalu "COCOK" akan dipercaya.
 *
 * Selisih TIDAK memblokir pencetakan atau penutupan sif — berapa pun
 * hasilnya, kasir tetap bisa mencetak. Menghalangi hanya mendorong kasir
 * mengetik angka yang "aman" supaya bisa pulang, yang mengembalikan masalah
 * yang sama dengan menampilkan angka harapan di muka.
 */
export default function TutupKasirSheet({
  shift,
  totals,
  differentCashier,
  printing,
  onClose,
  onPrint,
}: TutupKasirSheetProps) {
  // String, bukan number: "" berarti belum dihitung, dan itu HARUS berbeda
  // dari "0" (laci memang dihitung dan hasilnya kosong). Menyamakan
  // keduanya (pola `Number(x) || 0`) membuat Kas Seharusnya tampil sebelum
  // kasir selesai mengetik.
  const [kasText, setKasText] = useState("");
  const sudahDihitung = kasText.trim().length > 0;
  const kasFisik = Number(kasText.replace(/[^0-9]/g, "")) || 0;

  const penerimaan = totals.tunai + totals.nonTunai;
  const saldoAkhir = shift.modalAwal + penerimaan - totals.refund;
  // Rumusnya dipusatkan di lib/receipt.ts — layar dan kertas wajib memakai
  // hitungan yang sama persis, dan menambah suku kas ke dua tempat terpisah
  // adalah cara paling pasti membuat keduanya berselisih diam-diam.
  const kasHarus = kasSeharusnya({
    modalAwal: shift.modalAwal,
    tunai: totals.tunai,
    refundTunai: totals.refundTunai,
    kasMasukTunai: totals.kasMasukTunai,
    kasKeluarTunai: totals.kasKeluarTunai,
  });
  const selisih = kasFisik - kasHarus;
  const labelSelisih =
    selisih === 0 ? "Kas Cocok" : selisih > 0 ? "Selisih Lebih" : "Selisih Kurang";

  return (
    <Sheet
      title="Tutup Kasir"
      subtitle={shift.employeeName}
      onClose={onClose}
      footer={
        <Button
          label="Cetak Tutup Kasir"
          variant="primary"
          loading={printing}
          loadingLabel="Mencetak…"
          disabled={!sudahDihitung}
          onPress={() => onPrint(kasFisik)}
        />
      }>
      <ScrollView contentContainerStyle={styles.content}>
        {differentCashier ? (
          <Text style={styles.warning}>
            Sif ini dibuka oleh {differentCashier}. Kasir yang login sekarang
            berbeda — periksa sebelum mencetak.
          </Text>
        ) : null}

        <Row label="Modal Awal" value={formatRupiah(shift.modalAwal)} />
        <Row label="Tunai" value={formatRupiah(totals.tunai)} />
        <Row label="Non Tunai" value={formatRupiah(totals.nonTunai)} />
        <Row label="Total Penerimaan" value={formatRupiah(penerimaan)} strong />
        <Row label="Refund" value={`-${formatRupiah(totals.refund)}`} />
        <Row label="Saldo Akhir" value={formatRupiah(saldoAkhir)} strong />

        {/* Angka kas boleh tampil sebelum kasir menghitung laci: ini fakta
            yang ia catat sendiri, bukan jawaban yang sedang diujikan
            kepadanya. Yang tetap disembunyikan sampai kasText terisi hanya
            Kas Seharusnya — lihat catatan HITUNG BUTA di atas. */}
        <Row label="Masuk Tunai" value={formatRupiah(totals.kasMasukTunai)} />
        <Row label="Masuk Non Tunai" value={formatRupiah(totals.kasMasukNonTunai)} />
        <Row label="Keluar Tunai" value={formatRupiah(totals.kasKeluarTunai)} />
        <Row label="Keluar Non Tunai" value={formatRupiah(totals.kasKeluarNonTunai)} />

        <View style={styles.hitungBlock}>
          <Text style={styles.fieldLabel}>Hitung Kas Fisik</Text>
          <Text style={styles.hint}>
            Hitung uang tunai di laci lalu ketik hasilnya di sini. Angka yang
            diharapkan baru tampil setelah Anda mengisi.
          </Text>
          <TextInput
            value={kasText}
            onChangeText={setKasText}
            placeholder="0"
            placeholderTextColor={semantic.textSecondary}
            keyboardType="number-pad"
            editable={!printing}
            style={styles.input}
            accessibilityLabel="Hasil hitung kas fisik"
          />
        </View>

        {sudahDihitung ? (
          <>
            <Row label="Refund Tunai" value={`-${formatRupiah(totals.refundTunai)}`} />
            <Row label="Kas Seharusnya" value={formatRupiah(kasHarus)} />
            <Row label="Kas Dihitung" value={formatRupiah(kasFisik)} />
            <Row
              label={labelSelisih}
              value={formatRupiah(Math.abs(selisih))}
              strong
              warn={selisih !== 0}
            />
          </>
        ) : null}

        <Row label="Pajak (PBJT)" value={formatRupiah(totals.pajak)} />
        <Row label="Transaksi Selesai" value={String(totals.transaksiSelesai)} />
        <Row
          label="Transaksi Belum Terbayar"
          value={String(totals.transaksiPending)}
        />
      </ScrollView>
    </Sheet>
  );
}

function Row({
  label,
  value,
  strong,
  warn,
}: {
  label: string;
  value: string;
  strong?: boolean;
  warn?: boolean;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text
        style={[
          strong ? styles.valueStrong : styles.value,
          warn && styles.valueWarn,
        ]}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.sm },
  warning: {
    ...textStyles.caption,
    color: semantic.textPrimary,
    backgroundColor: semantic.surfaceMuted,
    padding: spacing.sm,
    borderRadius: radius.md,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  label: { ...textStyles.body, color: semantic.textSecondary },
  value: { ...textStyles.bodyStrong, color: semantic.textPrimary },
  valueStrong: { ...textStyles.grandTotal, color: semantic.textPrimary },
  valueWarn: { color: colors.status.void },
  hitungBlock: {
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: semantic.border,
  },
  fieldLabel: { ...textStyles.bodyStrong, color: semantic.textPrimary },
  hint: { ...textStyles.caption, color: semantic.textSecondary },
  input: {
    minHeight: touchTarget.comfortable,
    borderWidth: 2,
    borderColor: colors.primary[100],
    backgroundColor: colors.primary[50],
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    textAlign: "right",
    ...textStyles.grandTotal,
    color: semantic.textPrimary,
  },
});
