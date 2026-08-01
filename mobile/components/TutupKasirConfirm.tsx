import { StyleSheet, Text, View } from "react-native";

import type { OpenShift } from "../db/shift";
import { formatRupiah } from "../lib/types";
import { semantic, spacing, textStyles } from "../theme";
import Button from "./Button";
import Sheet from "./Sheet";

interface TutupKasirConfirmProps {
  shift: OpenShift;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Konfirmasi sebelum lembar Tutup Kasir dibuka.
 *
 * Sebelumnya "Tutup Kasir" di menu langsung membuka lembar hitung fisik. Itu
 * berbahaya sekarang: tombolnya berbagi tempat dengan "Mulai Shift" dan
 * berganti label sendiri, jadi ketukan yang dimaksudkan untuk hal lain bisa
 * mendarat di penutupan sif.
 *
 * Menyebut angka, bukan bertanya "yakin?" — pola ClearHistoryDialog. Nama kasir
 * dan jam buka adalah cara tercepat menyadari yang akan ditutup adalah sif
 * orang lain, dan itu justru yang paling mahal untuk keliru.
 *
 * Ia HANYA pintu masuk. Perhitungan, blind count, dan urutan cetak-lalu-tutup
 * tetap di TutupKasirSheet dan printTutupKasir, tidak tersentuh.
 */
export default function TutupKasirConfirm({
  shift,
  onConfirm,
  onCancel,
}: TutupKasirConfirmProps) {
  return (
    <Sheet
      title="Tutup Kasir"
      subtitle={shift.employeeName}
      onClose={onCancel}
      footer={
        <>
          <Button label="Lanjut Tutup Kasir" variant="primary" onPress={onConfirm} />
          <Button label="Batal" onPress={onCancel} />
        </>
      }>
      <View style={styles.content}>
        <Text style={styles.body}>
          Sif {shift.employeeName} dibuka {jamTanggal(shift.openedAt)} dengan
          modal awal {formatRupiah(shift.modalAwal)}.
        </Text>
        <Text style={styles.body}>
          Langkah berikutnya menghitung uang laci lalu mencetak laporan. Sesudah
          laporan tercetak, sif ditutup dan aplikasi kembali ke keadaan belum
          bisa melayani sampai sif baru dimulai.
        </Text>
      </View>
    </Sheet>
  );
}

const jamTanggal = (iso: string) =>
  new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));

const styles = StyleSheet.create({
  content: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  body: {
    ...textStyles.body,
    color: semantic.textPrimary,
  },
});
