import { useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";

import { colors, radius, semantic, spacing, textStyles } from "../theme";
import Button from "./Button";
import Sheet from "./Sheet";

/**
 * Menyalakan mode uji — satu order berikutnya tidak dihitung sebagai penjualan.
 *
 * BUKAN saklar, dan itu keputusan yang diminta pemilik. Saklar bisa tersenggol
 * di tengah jam ramai, dan akibatnya tidak terlihat sama sekali: order tetap
 * tersimpan, struk tetap tercetak, uang tetap masuk laci — hanya laporannya
 * yang diam-diam kehilangan angka itu. Dialog yang menyebutkan akibatnya, plus
 * alasan yang wajib diketik, membuat mode ini mustahil menyala tanpa disengaja.
 *
 * Alasannya wajib karena `created_by` sudah menjawab SIAPA; yang tidak bisa
 * dijawab siapa pun kelak adalah KENAPA. "Cek fitur topping baru" dan "demo ke
 * calon karyawan" adalah dua hal yang sangat berbeda kalau suatu hari ada yang
 * menelusuri kenapa order ini tidak masuk laporan.
 *
 * Kolomnya nullable di SQLite dan tidak ada CHECK di sana (lihat V8 di
 * db/migrations.ts), jadi lembar ini dan `createOrder` yang menegakkannya di
 * perangkat. Postgres menegakkannya lagi lewat constraint `test_data_reason`.
 */
export default function ModeUjiSheet({
  onConfirm,
  onCancel,
}: {
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState("");
  const isi = reason.trim();

  return (
    <Sheet
      title="Nyalakan mode uji"
      subtitle="Berlaku untuk satu order berikutnya saja"
      onClose={onCancel}
      footer={
        <>
          <Button
            label="Nyalakan mode uji"
            variant="danger"
            disabled={!isi}
            onPress={() => onConfirm(isi)}
          />
          <Button label="Batal" onPress={onCancel} />
        </>
      }>
      <View style={styles.content}>
        {/* Akibatnya disebut lebih dulu, sebelum kolom isian. Kalimat inilah
            alasan lembar ini ada — kasir yang membacanya tidak bisa lagi
            berkata ia tidak tahu. */}
        <Text style={styles.warn}>
          Order berikutnya TIDAK akan masuk laporan penjualan, laporan PBJT,
          maupun Tutup Kasir. Uangnya tidak akan pernah terhitung.
        </Text>

        <Text style={styles.body}>
          Mode ini mati sendiri begitu satu order tersimpan. Untuk order uji
          berikutnya, nyalakan lagi dari sini.
        </Text>

        <Text style={styles.label}>Alasan (wajib)</Text>
        <TextInput
          value={reason}
          onChangeText={setReason}
          placeholder="Contoh: cek fitur topping baru"
          accessibilityLabel="Alasan order uji ini dibuat"
          placeholderTextColor={semantic.textSecondary}
          style={styles.input}
          autoFocus
          multiline
        />
        <Text style={styles.hint}>
          Tersimpan bersama ordernya. Nama kasir sudah tercatat sendiri, jadi
          yang perlu ditulis di sini adalah untuk apa order uji ini dibuat.
        </Text>
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
  label: {
    ...textStyles.body,
    color: semantic.textPrimary,
    fontWeight: "600",
  },
  input: {
    ...textStyles.body,
    minHeight: 72,
    borderWidth: 1,
    borderColor: semantic.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: semantic.textPrimary,
    textAlignVertical: "top",
  },
  hint: {
    ...textStyles.caption,
    color: semantic.textSecondary,
  },
});
