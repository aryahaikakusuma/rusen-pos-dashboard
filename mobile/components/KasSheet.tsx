import { useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import type {
  CashDirection,
  CashMethod,
  CashMovement,
  CashTotals,
} from "../db/cash";
import { formatRupiah } from "../lib/types";
import { colors, radius, semantic, spacing, textStyles, touchTarget } from "../theme";
import Button from "./Button";
import Sheet from "./Sheet";
import ShiftBanner from "./ShiftBanner";

interface KasSheetProps {
  entries: CashMovement[];
  totals: CashTotals;
  saving: boolean;
  /**
   * Sif belum dimulai. Lembar tetap boleh dibuka — kasir yang menengok ke sini
   * untuk melihat pengeluaran hari ini tidak sedang menulis apa pun — tapi
   * setiap entri kas milik satu sif (`cash_movements.shift_id`), jadi tanpa sif
   * tidak ada tempat untuk menyimpannya.
   */
  readOnly?: boolean;
  onClose: () => void;
  /**
   * Mengembalikan true kalau entrinya benar-benar tersimpan. Lembar ini
   * mengosongkan isiannya hanya atas jawaban itu: kalau ia mengosongkan
   * begitu tombol ditekan, sebuah simpan yang gagal akan menghapus nominal
   * dan keterangan yang baru saja diketik kasir, dan ia harus mengetik ulang
   * sambil menebak apa yang tadi ia tulis.
   */
  onSimpan: (params: {
    direction: CashDirection;
    method: CashMethod;
    amount: number;
    note: string;
  }) => Promise<boolean>;
  onBatalkan: (id: string) => void;
}

/**
 * Pencatatan uang laci yang bukan penjualan — beli gas, es batu, galon;
 * setoran pemilik. Komponen bodoh seperti TutupKasirSheet: daftar entri dan
 * totalnya datang sebagai prop, dan ia tidak menyentuh SQLite maupun printer.
 *
 * Empat total berjalan ada di kepala lembar, bukan di bawah daftar, supaya
 * kasir melihat akibat tiap entri tanpa menggulir — angka inilah yang nanti
 * mengubah Kas Seharusnya di Tutup Kasir, dan salah ketik yang tidak terlihat
 * baru ketahuan saat laci dihitung.
 */
export default function KasSheet({
  entries,
  totals,
  saving,
  readOnly = false,
  onClose,
  onSimpan,
  onBatalkan,
}: KasSheetProps) {
  const [direction, setDirection] = useState<CashDirection>("out");
  const [method, setMethod] = useState<CashMethod>("cash");
  const [nominalText, setNominalText] = useState("");
  const [note, setNote] = useState("");
  const [konfirmasi, setKonfirmasi] = useState<CashMovement | null>(null);

  const amount = Number(nominalText.replace(/[^0-9]/g, "")) || 0;
  // Keterangan wajib adalah inti fitur ini: entri tanpa keterangan tidak bisa
  // dibedakan dari uang hilang, yang persis masalah yang mau dihapus. Jadi ia
  // dijaga di tombol — mati selama salah satu belum diisi — bukan lewat
  // peringatan sesudah ditekan, yang baru mengajari setelah kasir salah.
  const bolehSimpan = !readOnly && amount > 0 && note.trim().length > 0;

  const simpan = async () => {
    const tersimpan = await onSimpan({ direction, method, amount, note });
    if (!tersimpan) return;
    // Arah dan metode sengaja tidak ikut dikosongkan: kasir sering mencatat
    // beberapa pengeluaran tunai berturut-turut, dan memilih ulang "Keluar"
    // tiap kali hanya menambah ketukan tanpa mencegah kesalahan apa pun.
    setNominalText("");
    setNote("");
  };

  return (
    <>
      <Sheet
        title="Kas Masuk / Keluar"
        subtitle="Uang laci yang bukan penjualan"
        anchor="top"
        onClose={onClose}
        footer={
          <Button
            label="Simpan"
            variant="primary"
            loading={saving}
            loadingLabel="Menyimpan…"
            disabled={!bolehSimpan}
            onPress={() => void simpan()}
          />
        }>
        <ScrollView contentContainerStyle={styles.content}>
          {readOnly ? <ShiftBanner /> : null}
          <View style={styles.totalBox}>
            <Row label="Masuk Tunai" value={formatRupiah(totals.masukTunai)} />
            <Row label="Masuk Non Tunai" value={formatRupiah(totals.masukNonTunai)} />
            <Row label="Keluar Tunai" value={formatRupiah(totals.keluarTunai)} />
            <Row label="Keluar Non Tunai" value={formatRupiah(totals.keluarNonTunai)} />
          </View>

          <View>
            <Text style={styles.fieldLabel}>Arah</Text>
            <View style={styles.choices}>
              <Button
                label="Masuk"
                onPress={() => setDirection("in")}
                style={[styles.choice, direction === "in" && styles.choiceActive]}
              />
              <Button
                label="Keluar"
                onPress={() => setDirection("out")}
                style={[styles.choice, direction === "out" && styles.choiceActive]}
              />
            </View>
          </View>

          <View>
            <Text style={styles.fieldLabel}>Metode</Text>
            <View style={styles.choices}>
              <Button
                label="Tunai"
                onPress={() => setMethod("cash")}
                style={[styles.choice, method === "cash" && styles.choiceActive]}
              />
              <Button
                label="Non Tunai"
                onPress={() => setMethod("non_cash")}
                style={[styles.choice, method === "non_cash" && styles.choiceActive]}
              />
            </View>
            {method === "non_cash" ? (
              <Text style={styles.hint}>
                Entri non tunai tercetak sebagai catatan; uangnya tidak lewat
                laci, jadi ia tidak mengubah Kas Seharusnya.
              </Text>
            ) : null}
          </View>

          <View>
            <Text style={styles.fieldLabel}>Nominal</Text>
            <TextInput
              value={nominalText}
              onChangeText={setNominalText}
              placeholder="0"
              placeholderTextColor={semantic.textSecondary}
              keyboardType="number-pad"
              editable={!saving && !readOnly}
              style={styles.nominalInput}
              accessibilityLabel="Nominal kas"
            />
          </View>

          <View>
            <Text style={styles.fieldLabel}>Keterangan</Text>
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder="Contoh: beli gas 3kg"
              placeholderTextColor={semantic.textSecondary}
              editable={!saving && !readOnly}
              style={styles.noteInput}
              accessibilityLabel="Keterangan kas"
            />
          </View>

          <View style={styles.list}>
            <Text style={styles.fieldLabel}>Entri Sif Ini</Text>
            {entries.length === 0 ? (
              <Text style={styles.hint}>
                Belum ada entri kas pada sif ini.
              </Text>
            ) : (
              // Terbaru di atas: yang baru saja dicatat adalah yang paling
              // mungkin salah ketik dan paling mungkin dibatalkan. Kertas
              // tetap mencetaknya berurutan waktu — itu urutan kejadian.
              [...entries].reverse().map((entry) => (
                <View key={entry.id} style={styles.entry}>
                  <View style={styles.entryText}>
                    <Text style={styles.entryNote}>{entry.note}</Text>
                    <Text style={styles.entryMeta}>
                      {entry.direction === "in" ? "Masuk" : "Keluar"} ·{" "}
                      {entry.method === "cash" ? "Tunai" : "Non Tunai"}
                    </Text>
                  </View>
                  <View style={styles.entryRight}>
                    <Text
                      style={[
                        styles.entryAmount,
                        entry.direction === "in"
                          ? styles.entryAmountMasuk
                          : styles.entryAmountKeluar,
                      ]}>
                      {formatRupiah(entry.amount)}
                    </Text>
                    <Button
                      label="Batalkan"
                      onPress={() => setKonfirmasi(entry)}
                      disabled={saving || readOnly}
                      style={styles.entryAction}
                    />
                  </View>
                </View>
              ))
            )}
          </View>
        </ScrollView>
      </Sheet>

      {konfirmasi ? (
        <Sheet
          title="Batalkan entri kas"
          subtitle={konfirmasi.note}
          onClose={() => setKonfirmasi(null)}
          footer={
            <>
              <Button
                label={`Batalkan ${formatRupiah(konfirmasi.amount)}`}
                variant="danger"
                disabled={saving}
                onPress={() => {
                  onBatalkan(konfirmasi.id);
                  setKonfirmasi(null);
                }}
              />
              <Button
                label="Kembali"
                disabled={saving}
                onPress={() => setKonfirmasi(null)}
              />
            </>
          }>
          <View style={styles.konfirmasi}>
            {/* Menyebut angka dan arahnya, bukan bertanya "yakin?" — pola
                ClearHistoryDialog. Pertanyaan tanpa angka hanya menghasilkan
                satu ketukan refleks. */}
            <Text style={styles.konfirmasiBody}>
              {konfirmasi.direction === "in" ? "Kas masuk" : "Kas keluar"}{" "}
              {konfirmasi.method === "cash" ? "tunai" : "non tunai"} sebesar{" "}
              {formatRupiah(konfirmasi.amount)} tidak akan lagi ikut dihitung
              dan tidak tercetak di Tutup Kasir. Barisnya tetap tersimpan di
              ponsel ini sebagai jejak, jadi pembatalan bukan penghapusan.
            </Text>
          </View>
        </Sheet>
      ) : null}
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.md },
  totalBox: {
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: semantic.surfaceMuted,
    gap: spacing.xs,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  label: { ...textStyles.body, color: semantic.textSecondary },
  value: { ...textStyles.bodyStrong, color: semantic.textPrimary },
  fieldLabel: { ...textStyles.bodyStrong, color: semantic.textPrimary },
  hint: { ...textStyles.caption, marginTop: spacing.xs, color: semantic.textSecondary },
  choices: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.xs },
  choice: { flex: 1 },
  choiceActive: {
    borderColor: semantic.sidebarActive,
    backgroundColor: semantic.surfaceMuted,
  },
  nominalInput: {
    marginTop: spacing.xs,
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
  noteInput: {
    marginTop: spacing.xs,
    minHeight: touchTarget.min,
    borderWidth: 2,
    borderColor: semantic.border,
    backgroundColor: semantic.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    ...textStyles.body,
    color: semantic.textPrimary,
  },
  list: { gap: spacing.sm },
  entry: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: semantic.border,
    borderRadius: radius.md,
  },
  entryText: { flex: 1 },
  entryNote: { ...textStyles.bodyStrong, color: semantic.textPrimary },
  entryMeta: { ...textStyles.caption, color: semantic.textSecondary },
  entryRight: { alignItems: "flex-end", gap: spacing.xs },
  entryAmount: { ...textStyles.bodyStrong },
  // Arah dibedakan warna, bukan hanya kata: sekilas pandang di daftar yang
  // panjang, "Masuk" dan "Keluar" terbaca sama panjangnya.
  entryAmountMasuk: { color: colors.status.paid },
  entryAmountKeluar: { color: colors.status.void },
  entryAction: {
    minHeight: touchTarget.min,
    paddingHorizontal: spacing.md,
  },
  konfirmasi: { padding: spacing.lg },
  konfirmasiBody: { ...textStyles.body, color: semantic.textPrimary },
});
