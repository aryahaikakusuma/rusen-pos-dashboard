import { ScrollView, StyleSheet, Text, View } from "react-native";

import Button from "../components/Button";
import { semantic, spacing, textStyles } from "../theme";

interface PengaturanScreenProps {
  /** Owner mendapat alat uji; peran lain hanya penarikan katalog. */
  isOwner: boolean;
  modeUjiMenyala: boolean;
  /** Baris info versi: saluran, bundel, hasil pemeriksaan terakhir. */
  saluran: string;
  bundel: string;
  pembaruan: string | null;
  memeriksaPembaruan: boolean;
  onKatalog: () => void;
  onModeUji: () => void;
  onMatikanModeUji: () => void;
  onPeriksaPembaruan: () => void;
  onPrinter: () => void;
  onClose: () => void;
}

/**
 * Empat tombol yang dipakai sekali lalu dilupakan — Katalog/Uji, Mode Uji,
 * Periksa Pembaruan, Printer — dipindah keluar dari menu utama ke sini.
 *
 * Alasannya sama seperti kenapa batang kepala dulu dibongkar jadi lembar menu:
 * yang dipakai terus-menerus di menu cuma Kas dan tombol sif, dan empat tombol
 * lain di atasnya membuat keduanya harus dicari tiap kali. Tidak ada yang
 * hilang di sini, hanya turun satu ketukan.
 *
 * Layar, bukan lembar: ia dibuka dari dalam lembar menu, dan RN Modal tidak
 * mendukung dua Modal tampil bersamaan di Android (lihat EditOrderScreen).
 */
export default function PengaturanScreen({
  isOwner,
  modeUjiMenyala,
  saluran,
  bundel,
  pembaruan,
  memeriksaPembaruan,
  onKatalog,
  onModeUji,
  onMatikanModeUji,
  onPeriksaPembaruan,
  onPrinter,
  onClose,
}: PengaturanScreenProps) {
  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.title}>Pengaturan</Text>
        <Button label="Kembali" onPress={onClose} style={styles.back} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Labelnya ikut peran: tombol "Uji" yang membuka layar berjudul
            "Katalog" membingungkan. */}
        <Button label={isOwner ? "Uji" : "Tarik Katalog"} onPress={onKatalog} />

        {/* TIDAK dibatasi isOwner, mengikuti preseden pembebasan pajak: setiap
            kasir boleh memilihnya, dan yang menjadi catatan adalah jejaknya —
            nama kasir plus alasan yang wajib diketik — bukan gerbang perannya. */}
        {modeUjiMenyala ? (
          <Button
            label="Matikan mode uji"
            variant="danger"
            onPress={onMatikanModeUji}
          />
        ) : (
          <Button label="Mode Uji" onPress={onModeUji} />
        )}

        {/* Versinya ditampilkan tanpa ditekan apa pun. Yang mau dijawab adalah
            "ponsel ini menerima rilis atau tidak", dan jawaban yang harus
            dicari dulu tidak akan pernah dibaca oleh orang yang sedang jaga.
            Saluran selain `production` berarti APK-nya dibangun dengan profil
            yang salah: ia tidak error, ia hanya diam di versi lama selamanya. */}
        <Button
          label="Periksa Pembaruan"
          disabled={memeriksaPembaruan}
          onPress={onPeriksaPembaruan}
        />
        <Text style={styles.versiBaris}>Saluran: {saluran}</Text>
        <Text style={styles.versiBaris}>{bundel}</Text>
        {pembaruan ? (
          <Text style={styles.versiBaris}>{pembaruan}</Text>
        ) : null}

        {/* Dipilih sekali lalu tersimpan, jadi tempatnya memang di layar yang
            jarang dibuka — bukan di layar kasir. */}
        <Button label="Printer" onPress={onPrinter} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: semantic.surface,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: semantic.border,
  },
  title: {
    ...textStyles.sectionTitle,
    color: semantic.textPrimary,
  },
  back: {
    paddingHorizontal: spacing.lg,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.sm,
  },
  versiBaris: { ...textStyles.caption, color: semantic.textSecondary },
});
