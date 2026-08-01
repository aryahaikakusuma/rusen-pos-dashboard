import { useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";

import { colors, radius, semantic, spacing, textStyles, touchTarget } from "../theme";
import Button from "./Button";
import Sheet from "./Sheet";

/** Modal laci baku satu sif. Kasir boleh mengubah, tapi tidak boleh mengosongkan. */
const MODAL_AWAL_DEFAULT = 500000;

interface ModalAwalSheetProps {
  cashierName: string;
  saving: boolean;
  onOpen: (modalAwal: number) => void;
  onCancel: () => void;
}

/**
 * Pengisian Modal Awal. Dulu `ModalAwalGate`: gerbang penuh layar tanpa tombol
 * batal yang menutup seluruh aplikasi sesudah login. Sekarang lembar biasa yang
 * dipanggil dari tombol "Mulai Shift" di menu — melihat katalog dan riwayat
 * order tidak butuh sif, jadi memblokirnya hanya menghalangi.
 *
 * `anchor="top"`: isinya kolom angka, dan papan ketik naik dari bawah menutupi
 * lembar yang berlabuh di sana (lihat komentar di Sheet.tsx).
 *
 * Satu tombol utama, satu isian — DESIGN.md.
 */
export default function ModalAwalSheet({
  cashierName,
  saving,
  onOpen,
  onCancel,
}: ModalAwalSheetProps) {
  const [text, setText] = useState(String(MODAL_AWAL_DEFAULT));
  const modalAwal = Number(text.replace(/[^0-9]/g, "")) || 0;
  const kosong = modalAwal <= 0;

  return (
    <Sheet
      title="Mulai Sif"
      subtitle={cashierName}
      anchor="top"
      onClose={onCancel}
      footer={
        <>
          <Button
            label="Mulai Sif"
            variant="primary"
            disabled={kosong}
            loading={saving}
            loadingLabel="Menyimpan…"
            onPress={() => onOpen(modalAwal)}
          />
          <Button label="Batal" disabled={saving} onPress={onCancel} />
        </>
      }>
      <View style={styles.card}>
        <Text style={styles.hint}>
          Masukkan modal awal laci sebelum mulai melayani. Angka ini akan
          muncul di laporan Tutup Kasir nanti.
        </Text>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder={String(MODAL_AWAL_DEFAULT)}
          placeholderTextColor={semantic.textSecondary}
          keyboardType="number-pad"
          editable={!saving}
          style={[styles.input, kosong && styles.inputSalah]}
          accessibilityLabel="Modal awal laci"
        />
        {kosong ? (
          <Text style={styles.salah}>Modal awal tidak boleh kosong atau nol.</Text>
        ) : null}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  hint: {
    ...textStyles.caption,
    color: semantic.textSecondary,
  },
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
  inputSalah: {
    borderColor: colors.status.void,
    backgroundColor: semantic.surface,
  },
  salah: {
    ...textStyles.caption,
    color: colors.status.void,
  },
});
