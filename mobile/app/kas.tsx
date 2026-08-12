import { useCallback, useEffect, useState } from "react";
import { useRouter } from "expo-router";
import { ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSQLiteContext } from "expo-sqlite";

import Button from "../components/Button";
import Sheet from "../components/Sheet";
import ShiftBanner from "../components/ShiftBanner";
import { useToast } from "../components/Toast";
import {
  CASH_CATEGORY_LABELS,
  cashCategoriesFor,
  cashTotals,
  recordCashMovement,
  reverseCashMovement,
  shiftCashMovements,
  type CashCategory,
  type CashDirection,
  type CashMethod,
  type CashMovement,
  type CashTotals,
} from "../db/cash";
import { useAuth } from "../lib/auth-context";
import { useGateShift, useShift } from "../lib/shift-context";
import { formatRupiah } from "../lib/types";
import {
  colors,
  fontFamily,
  radius,
  semantic,
  spacing,
  textStyles,
  touchTarget,
} from "../theme";

/**
 * Pencatatan uang laci yang bukan penjualan — beli gas, es batu, galon;
 * setoran pemilik.
 *
 * Empat total berjalan ada di kepala halaman, bukan di bawah daftar, supaya
 * kasir melihat akibat tiap entri tanpa menggulir — angka inilah yang nanti
 * mengubah Kas Seharusnya di Tutup Kasir, dan salah ketik yang tidak terlihat
 * baru ketahuan saat laci dihitung.
 *
 * Boleh dibuka tanpa sif, tapi hanya untuk dibaca. Tiap entri kas milik satu
 * sif (`cash_movements.shift_id`), jadi tanpa sif memang tidak ada tempat
 * untuk menyimpannya — dan tidak ada apa pun untuk ditampilkan. Nolnya yang
 * jujur, bukan angka sif lama.
 */
export default function KasScreen() {
  const router = useRouter();
  const db = useSQLiteContext();
  const toast = useToast();
  const { session } = useAuth();
  const { shift, aktif } = useShift();
  const gateShift = useGateShift();
  const readOnly = !aktif;

  // Entri dan totalnya dimuat bersama dan dimuat ulang bersama, supaya daftar
  // di layar tidak pernah menunjukkan entri yang belum ikut dihitung di
  // totalnya.
  const [entries, setEntries] = useState<CashMovement[]>([]);
  const [totals, setTotals] = useState<CashTotals | null>(null);
  const [saving, setSaving] = useState(false);
  const [direction, setDirection] = useState<CashDirection>("out");
  const [method, setMethod] = useState<CashMethod>("cash");
  const [category, setCategory] = useState<CashCategory | null>(null);
  const [nominalText, setNominalText] = useState("");
  const [note, setNote] = useState("");
  const [konfirmasi, setKonfirmasi] = useState<CashMovement | null>(null);

  // Kategori kas keluar dan kas masuk adalah dua daftar berbeda (db/cash.ts).
  // Pilihan lama dibuang begitu arah berganti supaya tidak ada kategori "Kasbon"
  // (kas keluar) yang diam-diam masih terpasang saat kasir memilih "Masuk".
  const ubahArah = (next: CashDirection) => {
    setDirection(next);
    setCategory(null);
  };

  const muatKas = useCallback(async () => {
    if (!shift) {
      setEntries([]);
      setTotals({
        masukTunai: 0,
        masukNonTunai: 0,
        keluarTunai: 0,
        keluarNonTunai: 0,
      });
      return;
    }
    const [loadedEntries, loadedTotals] = await Promise.all([
      shiftCashMovements(db, shift.id),
      cashTotals(db, shift.id),
    ]);
    setEntries(loadedEntries);
    setTotals(loadedTotals);
  }, [db, shift]);

  useEffect(() => {
    void muatKas();
  }, [muatKas]);

  const amount = Number(nominalText.replace(/[^0-9]/g, "")) || 0;
  // Keterangan wajib adalah inti fitur ini: entri tanpa keterangan tidak bisa
  // dibedakan dari uang hilang, yang persis masalah yang mau dihapus. Jadi ia
  // dijaga di tombol — mati selama salah satu belum diisi — bukan lewat
  // peringatan sesudah ditekan, yang baru mengajari setelah kasir salah.
  const bolehSimpan =
    !readOnly && amount > 0 && note.trim().length > 0 && category !== null;

  const simpan = async () => {
    if (!gateShift("mencatat kas")) return;
    if (!shift || !session || !category) return;
    setSaving(true);
    try {
      await recordCashMovement(db, {
        shiftId: shift.id,
        direction,
        method,
        category,
        amount,
        note,
        employeeId: session.employeeId,
        employeeName: session.name,
      });
      await muatKas();
      // Arah, metode, dan kategori sengaja tidak ikut dikosongkan: kasir sering
      // mencatat beberapa pengeluaran sejenis berturut-turut, dan memilih ulang
      // tiap kali hanya menambah ketukan tanpa mencegah kesalahan apa pun.
      //
      // Dikosongkan hanya kalau benar-benar tersimpan: mengosongkan begitu
      // tombol ditekan akan menghapus nominal dan keterangan yang baru saja
      // diketik kasir saat simpan gagal, dan ia harus mengetik ulang sambil
      // menebak apa yang tadi ia tulis.
      setNominalText("");
      setNote("");
    } catch (caught) {
      // recordCashMovement melempar kalimat berbahasa Indonesia yang memang
      // ditujukan ke kasir, jadi diteruskan apa adanya.
      toast.error(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSaving(false);
    }
  };

  // Entri yang sudah punya koreksinya sendiri tidak ditawari tombol kedua kali
  // — reverseCashMovement menolaknya juga, tapi mematikan tombolnya di sini
  // menghindari kasir menekan lalu membaca pesan gagal untuk hal yang sudah
  // jelas dari daftar. Entri yang MERUPAKAN koreksi (reversesId terisi) juga
  // tidak ditawari koreksi kedua — mengoreksi sebuah koreksi bukan alur yang
  // diminta, dan barisnya sendiri sudah menetralkan entri aslinya.
  const idYangSudahDikoreksi = new Set(
    entries.map((e) => e.reversesId).filter((id): id is string => id !== null)
  );

  const koreksi = async (id: string) => {
    if (!gateShift("mengoreksi entri kas")) return;
    if (!shift || !session) return;
    setSaving(true);
    try {
      await reverseCashMovement(db, {
        id,
        employeeId: session.employeeId,
        employeeName: session.name,
      });
      await muatKas();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSaving(false);
    }
  };

  if (!totals) return null;

  return (
    <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.title}>Kas Masuk / Keluar</Text>
          <Text style={styles.subtitle}>Uang laci yang bukan penjualan</Text>
        </View>
        <Button label="Kembali" onPress={() => router.back()} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {readOnly ? <ShiftBanner /> : null}
        <View style={styles.totalBox}>
          <Row label="Masuk Tunai" value={formatRupiah(totals.masukTunai)} />
          <Row
            label="Masuk Non Tunai"
            value={formatRupiah(totals.masukNonTunai)}
          />
          <Row label="Keluar Tunai" value={formatRupiah(totals.keluarTunai)} />
          <Row
            label="Keluar Non Tunai"
            value={formatRupiah(totals.keluarNonTunai)}
          />
        </View>

        <View>
          <Text style={styles.fieldLabel}>Arah</Text>
          <View style={styles.choices}>
            <Button
              label="Masuk"
              onPress={() => ubahArah("in")}
              style={[styles.choice, direction === "in" && styles.choiceActive]}
            />
            <Button
              label="Keluar"
              onPress={() => ubahArah("out")}
              style={[
                styles.choice,
                direction === "out" && styles.choiceActive,
              ]}
            />
          </View>
        </View>

        <View>
          <Text style={styles.fieldLabel}>Kategori</Text>
          <View style={styles.choicesWrap}>
            {cashCategoriesFor(direction).map(({ value, label }) => (
              <Button
                key={value}
                label={label}
                labelStyle={styles.choiceLabel}
                onPress={() => setCategory(value)}
                style={[
                  styles.choiceWrap,
                  category === value && styles.choiceActive,
                ]}
              />
            ))}
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
              style={[
                styles.choice,
                method === "non_cash" && styles.choiceActive,
              ]}
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
            <Text style={styles.hint}>Belum ada entri kas pada sif ini.</Text>
          ) : (
            // Terbaru di atas: yang baru saja dicatat adalah yang paling
            // mungkin salah ketik dan paling mungkin dibatalkan. Kertas
            // tetap mencetaknya berurutan waktu — itu urutan kejadian.
            [...entries].reverse().map((entry) => {
              const sudahDikoreksi = idYangSudahDikoreksi.has(entry.id);
              const iniKoreksi = entry.reversesId !== null;
              return (
                <View key={entry.id} style={styles.entry}>
                  <View style={styles.entryText}>
                    <Text style={styles.entryNote}>{entry.note}</Text>
                    <Text style={styles.entryMeta}>
                      {entry.direction === "in" ? "Masuk" : "Keluar"} ·{" "}
                      {entry.method === "cash" ? "Tunai" : "Non Tunai"}
                      {entry.category
                        ? ` · ${CASH_CATEGORY_LABELS[entry.category]}`
                        : ""}
                      {sudahDikoreksi ? " · Dikoreksi" : ""}
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
                    {/* Entri yang sudah dikoreksi atau yang MERUPAKAN koreksi
                        tidak ditawari tombol lagi — lihat catatan
                        idYangSudahDikoreksi di atas. */}
                    {sudahDikoreksi || iniKoreksi ? null : (
                      <Button
                        label="Koreksi"
                        onPress={() => setKonfirmasi(entry)}
                        disabled={saving || readOnly}
                        style={styles.entryAction}
                      />
                    )}
                  </View>
                </View>
              );
            })
          )}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Button
          label="Simpan"
          variant="primary"
          loading={saving}
          loadingLabel="Menyimpan…"
          disabled={!bolehSimpan}
          onPress={() => void simpan()}
        />
      </View>

      {konfirmasi ? (
        <Sheet
          title="Koreksi entri kas"
          subtitle={konfirmasi.note}
          onClose={() => setKonfirmasi(null)}
          footer={
            <>
              <Button
                label={`Koreksi ${formatRupiah(konfirmasi.amount)}`}
                variant="danger"
                disabled={saving}
                onPress={() => {
                  void koreksi(konfirmasi.id);
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
              Entri {konfirmasi.direction === "in" ? "kas masuk" : "kas keluar"}{" "}
              {konfirmasi.method === "cash" ? "tunai" : "non tunai"} sebesar{" "}
              {formatRupiah(konfirmasi.amount)} akan dikoreksi dengan entri baru
              berarah kebalikan dan nominal sama. Keduanya tetap ikut dihitung
              dan tercetak di Tutup Kasir sebagai jejak — bukan dihapus atau
              disembunyikan.
            </Text>
          </View>
        </Sheet>
      ) : null}
    </SafeAreaView>
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
  screen: {
    flex: 1,
    backgroundColor: semantic.surfaceMuted,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: semantic.border,
    backgroundColor: semantic.surface,
  },
  headerText: {
    flex: 1,
    gap: spacing.xs,
  },
  title: {
    ...textStyles.screenTitle,
    color: semantic.textPrimary,
  },
  subtitle: {
    ...textStyles.caption,
    color: semantic.textSecondary,
  },
  content: { padding: spacing.lg, gap: spacing.md },
  footer: {
    padding: spacing.md,
    borderTopWidth: 1,
    borderTopColor: semantic.border,
    backgroundColor: semantic.surface,
  },
  totalBox: {
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: semantic.surface,
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
  hint: {
    ...textStyles.caption,
    marginTop: spacing.xs,
    color: semantic.textSecondary,
  },
  choices: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.xs },
  choice: { flex: 1 },
  // Kategori bisa sampai enam pilihan (kas keluar) — tidak muat satu baris
  // seperti Arah/Metode yang selalu dua. Membungkus, bukan menyempitkan tiap
  // tombol sampai labelnya terpotong.
  choicesWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  choiceWrap: { flexGrow: 1, flexBasis: "30%" },
  // Button.label bawaan pakai textStyles.actionButton (18px semibold). Grid
  // tiga kolom membuat tiap kartu sempit, jadi bahkan bodyStrong (16px) masih
  // memutus "Pembelian" di tengah huruf ("Pemb" / "elian") pada perangkat
  // nyata — caption (14px) adalah gaya teks terkecil yang sudah didefinisikan
  // di theme/typography.ts, dan di situ barulah tiap kata utuh pindah baris
  // sendiri alih-alih terpotong.
  choiceLabel: { ...textStyles.caption, fontFamily: fontFamily.medium },
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
    backgroundColor: semantic.surface,
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
