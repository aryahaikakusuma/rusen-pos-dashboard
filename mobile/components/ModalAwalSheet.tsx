import { useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";

import type { ShiftLabel } from "../db/shift";
import { colors, radius, semantic, spacing, textStyles, touchTarget } from "../theme";
import Button from "./Button";
import Sheet from "./Sheet";

/** Modal laci baku satu sif. Kasir boleh mengubah, tapi tidak boleh mengosongkan. */
const MODAL_AWAL_DEFAULT = 500000;

const LABEL_OPTIONS: readonly [ShiftLabel, string][] = [
  ["pagi", "Pagi"],
  ["sore", "Sore"],
];

interface ModalAwalSheetProps {
  cashierName: string;
  saving: boolean;
  onOpen: (modalAwal: number, label: ShiftLabel) => void;
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
  const [label, setLabel] = useState<ShiftLabel | null>(null);
  const modalAwal = Number(text.replace(/[^0-9]/g, "")) || 0;
  // Kosong berarti isiannya benar-benar tidak ada, BUKAN nilainya nol —
  // "0" adalah modal awal yang sah (laci memang belum diisi apa-apa pagi ini).
  // Menyamakan keduanya (pola lama `modalAwal <= 0`) menolak "0" yang justru
  // sah, dan itu berbeda dari kosong yang memang harus ditolak.
  const kosong = text.trim().length === 0;
  const bolehMulai = !kosong && label !== null;

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
            disabled={!bolehMulai}
            loading={saving}
            loadingLabel="Menyimpan…"
            onPress={() => {
              if (label) onOpen(modalAwal, label);
            }}
          />
          <Button label="Batal" disabled={saving} onPress={onCancel} />
        </>
      }>
      <View style={styles.card}>
        <Text style={styles.hint}>Pilih sif yang sedang dijalani.</Text>
        <View style={styles.labelRow}>
          {LABEL_OPTIONS.map(([option, optionLabel]) => (
            <Button
              key={option}
              label={optionLabel}
              disabled={saving}
              style={[styles.labelButton, label === option && styles.labelActive]}
              onPress={() => setLabel(option)}
            />
          ))}
        </View>

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
          <Text style={styles.salah}>Modal awal tidak boleh kosong.</Text>
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
  labelRow: {
    flexDirection: "row",
    gap: spacing.md,
  },
  labelButton: {
    flex: 1,
  },
  // Netral gelap, bukan biru: DESIGN.md menyimpan biru untuk aksi utama
  // ("Mulai Sif"), dan pilihan Pagi/Sore adalah status, bukan tombol yang
  // dituju kasir.
  labelActive: {
    borderColor: semantic.sidebarActive,
    backgroundColor: semantic.surfaceMuted,
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
