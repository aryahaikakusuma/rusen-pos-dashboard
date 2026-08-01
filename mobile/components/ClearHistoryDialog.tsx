import { StyleSheet, Text, View } from "react-native";

import type { HistorySweep } from "../db/orders";
import { HISTORY_KEEP_HOURS } from "../db/orders";
import { colors, semantic, spacing, textStyles } from "../theme";
import Button from "./Button";
import Sheet from "./Sheet";

interface ClearHistoryDialogProps {
  sweep: HistorySweep;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Konfirmasi pembersihan histori.
 *
 * Menyebut angka, bukan bertanya "yakin?". Pertanyaan tanpa angka hanya
 * menghasilkan satu ketukan refleks; angka membuat kasir tahu persis apa yang
 * hilang sebelum ia hilang.
 *
 * Tombolnya "danger", bukan aksi utama. Tidak ada yang perlu dipercepat di
 * sini, dan DESIGN.md menyimpan warna aksi utama untuk pekerjaan yang memang
 * dituju kasir — Pelunasan, bukan penghapusan.
 */
export default function ClearHistoryDialog({
  sweep,
  busy,
  onConfirm,
  onCancel,
}: ClearHistoryDialogProps) {
  const kosong = sweep.hapus === 0;

  return (
    <Sheet
      title="Bersihkan histori"
      subtitle={`Order yang selesai lebih dari ${HISTORY_KEEP_HOURS} jam lalu`}
      onClose={onCancel}
      footer={
        <>
          <Button
            label={`Hapus ${sweep.hapus} order`}
            variant="danger"
            disabled={kosong}
            loading={busy}
            loadingLabel="Menghapus…"
            onPress={onConfirm}
          />
          <Button label="Batal" onPress={onCancel} disabled={busy} />
        </>
      }>
      <View style={styles.content}>
        {kosong ? (
          <Text style={styles.body}>
            Belum ada yang bisa dibersihkan. Order yang selesai dalam{" "}
            {HISTORY_KEEP_HOURS} jam terakhir sengaja ditahan supaya struknya
            masih bisa dicetak ulang dari ponsel.
          </Text>
        ) : (
          <Text style={styles.body}>
            {sweep.hapus} order akan hilang dari daftar di ponsel ini. Catatan
            penjualannya tetap utuh di server — yang dibersihkan hanya
            tampilannya di sini, dan struknya tidak bisa lagi dicetak ulang dari
            ponsel.
          </Text>
        )}

        {/* Bukan peringatan sopan. Order lunas yang belum terkirim adalah uang
            yang belum tercatat di mana pun selain ponsel ini, dan pembersihan
            memang melewatinya — tapi kasir perlu tahu bahwa order itu ada,
            karena selama tidak terkirim ia tidak akan muncul di laporan. */}
        {sweep.tahan > 0 ? (
          <Text style={styles.warn}>
            {sweep.tahan} order dilewati karena belum terkirim ke server. Order
            itu tetap di sini dan tidak akan dihapus. Kirimkan dulu lewat
            &ldquo;Kirim ulang&rdquo; supaya masuk laporan.
          </Text>
        ) : null}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  body: {
    ...textStyles.body,
    color: semantic.textPrimary,
  },
  warn: {
    ...textStyles.body,
    color: colors.status.void,
  },
});
