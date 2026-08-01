import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { formatRupiah } from "../lib/types";
import type { ProductEntry } from "../lib/product-variants";
import {
  TOPPING_BOXES,
  toppingMask,
  toppingToggle,
  toppingValue,
} from "../lib/product-variants";
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

interface VariantSheetProps {
  entry: ProductEntry;
  onPick: (productId: string, notes: string) => void;
  onCancel: () => void;
}

const SUBTITLE: Record<string, string> = {
  saus: "Pilih saus",
  suhu: "Pilih suhu minuman",
  topping: "Pilih topping",
};

/**
 * Langkah kedua setelah kasir memilih menu: menentukan variannya.
 *
 * Memakai Sheet yang sama dengan keranjang, bukan overlay baru — aplikasi ini
 * sudah punya satu bentuk dialog, dan bentuk kedua membuat dua hal yang sama
 * terlihat berbeda tanpa alasan.
 *
 * Harga tiap varian ditampilkan karena sering berbeda, dan kasir kadang perlu
 * menyebutkannya ke pelanggan sebelum menekan.
 *
 * ADA DUA CARA MEMILIH DI SINI, dan itu disengaja meski dua perilaku dalam satu
 * komponen biasanya patut dicurigai:
 *
 *   Tanpa varian bawaan (suhu) — sekali tekan langsung masuk keranjang. Ini
 *   perilaku lama dan jalur tersibuk di aplikasi; menambahkan tombol konfirmasi
 *   berarti menggandakan ketukan untuk setiap minuman yang dijual seharian.
 *
 *   Dengan varian bawaan (saus, topping) — pilihan dasarnya sudah tersorot,
 *   lalu ditegaskan lewat tombol Tambah. Kasus terbanyak tetap satu ketukan.
 *   Kalau di sini juga sekali tekan, "bawaan" tidak berarti apa-apa: kasir
 *   tetap harus menekan Ori sendiri, dan tidak ada yang otomatis.
 *
 * TOPPING DITAMPILKAN SEBAGAI KOTAK CENTANG walau di baliknya tetap satu produk
 * per kombinasi. Menampilkan kedelapannya sebagai tombol berarti kasir membaca
 * "Sayur + Telur + Sosis" dan mencocokkannya dengan apa yang diminta pelanggan;
 * mencentang satu per satu persis mengikuti cara pesanan itu diucapkan. Yang
 * masuk keranjang tetap satu produk, jadi laporan tidak ikut berubah.
 *
 * Kotak yang kombinasinya tidak punya baris produk dimatikan, bukan
 * disembunyikan. Keadaan itu semestinya tidak pernah terjadi — 0010 melengkapi
 * kedelapannya — tapi aplikasi ini membaca katalog dari database, dan database
 * yang belum dimigrasi harus membuat kasir melihat pilihan yang mati, bukan
 * menambahkan produk yang harganya tidak ada.
 */
export default function VariantSheet({
  entry,
  onPick,
  onCancel,
}: VariantSheetProps) {
  const [selected, setSelected] = useState<string | null>(entry.defaultValue);
  const [extra, setExtra] = useState<string | null>(
    entry.extra?.defaultValue ?? null
  );
  const konfirmasi = entry.defaultValue !== null;

  const chosen = entry.options.find((option) => option.value === selected);
  // Grup tambahan tanpa bawaan berarti wajib: tombol tetap mati sampai dipilih.
  const lengkap = Boolean(chosen) && (!entry.extra || extra !== null);

  const byValue = new Map(entry.options.map((o) => [o.value, o]));
  const mask = entry.kind === "topping" ? toppingMask(selected ?? "polos") : 0;
  const polos = byValue.get("polos")?.product.price;
  const kurang =
    entry.kind === "topping" && entry.options.length < 1 << TOPPING_BOXES.length;

  return (
    <Sheet
      title={entry.label}
      subtitle={SUBTITLE[entry.kind ?? ""] ?? "Pilih varian"}
      onClose={onCancel}
      footer={
        <>
          {konfirmasi ? (
            <Button
              label={
                chosen ? `Tambah — ${formatRupiah(chosen.product.price)}` : "Tambah"
              }
              variant="primary"
              disabled={!lengkap}
              onPress={() => chosen && onPick(chosen.product.id, extra ?? "")}
            />
          ) : null}
          <Button label="Batal" variant="secondary" onPress={onCancel} />
        </>
      }>
      {entry.kind === "topping" ? (
        <View style={styles.options}>
          {TOPPING_BOXES.map((label, box) => {
            const dicentang = Boolean(mask & (1 << box));
            // Yang ditunjukkan adalah TAMBAHAN topping ini sendiri, bukan harga
            // kombinasinya: angka itu tetap sama apa pun yang sudah tercentang,
            // jadi tidak berubah-ubah di bawah jari kasir saat mencentang.
            // Harga sesungguhnya yang dibayar ada di tombol Tambah.
            const sendiri = byValue.get(toppingValue(1 << box))?.product.price;
            const tambahan =
              polos !== undefined && sendiri !== undefined
                ? sendiri - polos
                : undefined;
            // Kombinasi yang akan dihasilkan kalau kotak ini ditekan. Kalau ia
            // tidak ada di katalog, kotaknya tidak bisa ditekan.
            const hasil = toppingToggle(selected ?? "polos", box);
            const bisa = byValue.has(hasil);
            return (
              <Pressable
                key={label}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: dicentang, disabled: !bisa }}
                accessibilityLabel={
                  tambahan !== undefined
                    ? `${label}, tambah ${formatRupiah(tambahan)}`
                    : label
                }
                disabled={!bisa}
                onPress={() =>
                  setSelected((current) => toppingToggle(current ?? "polos", box))
                }
                style={({ pressed }) => [
                  styles.row,
                  dicentang && styles.optionActive,
                  pressed && styles.optionPressed,
                  !bisa && styles.rowDisabled,
                ]}>
                <View style={[styles.box, dicentang && styles.boxOn]}>
                  {dicentang ? <Text style={styles.check}>✓</Text> : null}
                </View>
                <Text style={styles.rowLabel}>{label}</Text>
                {tambahan !== undefined ? (
                  <Text style={styles.price}>+{formatRupiah(tambahan)}</Text>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      ) : (
        <View style={styles.options}>
          {/* Tanpa konfirmasi, tidak ada tombol yang ditandai aksi utama: DESIGN.md
              hanya mengizinkan satu tombol biru per layar, dan di antara panas dan
              dingin tidak ada pilihan yang lebih benar. Dengan konfirmasi, yang biru
              adalah tombol Tambah di kaki, bukan salah satu saus. */}
          {entry.options.map((option) => {
            const aktif = konfirmasi && option.value === selected;
            return (
              <Pressable
                key={option.product.id}
                accessibilityRole={konfirmasi ? "radio" : "button"}
                accessibilityState={konfirmasi ? { selected: aktif } : undefined}
                accessibilityLabel={`${option.label}, ${formatRupiah(option.product.price)}`}
                onPress={() =>
                  konfirmasi
                    ? setSelected(option.value)
                    : onPick(option.product.id, "")
                }
                style={({ pressed }) => [
                  styles.option,
                  aktif && styles.optionActive,
                  pressed && styles.optionPressed,
                ]}>
                <Text style={styles.variant}>{option.label}</Text>
                <Text style={styles.price}>
                  {formatRupiah(option.product.price)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}

      {/* Keterangan ditaruh SESUDAH pilihannya, bukan sebelum: ia baru dicari
          setelah kasir melihat sesuatu yang tidak diduga, dan pada saat itu
          matanya sudah berada di daerah ini. */}
      {entry.note ? <Text style={styles.note}>{entry.note}</Text> : null}

      {/* Katalog yang tertinggal terlihat PERSIS seperti aturan lama: kalau
          kombinasi ber-Sosis belum ada, satu-satunya urutan mencentang yang
          berhasil adalah Sayur, lalu Telur, lalu Sosis — dan kotak yang bebas
          tampak seperti kotak yang saling mengunci. Tanpa kalimat ini kasir
          menyimpulkan aplikasinya belum berubah, bukan datanya. */}
      {kurang ? (
        <Text style={styles.note}>
          Sebagian kombinasi belum ada di katalog perangkat ini, jadi kotaknya
          mati. Tarik layar kasir ke bawah untuk menarik ulang katalog.
        </Text>
      ) : null}

      {entry.extra ? (
        <View style={styles.extra}>
          <Text style={styles.extraTitle}>{entry.extra.label}</Text>
          <View style={styles.extraOptions}>
            {entry.extra.options.map((option) => {
              const aktif = option.value === extra;
              return (
                <Pressable
                  key={option.value}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: aktif }}
                  accessibilityLabel={option.label}
                  onPress={() => setExtra(option.value)}
                  style={({ pressed }) => [
                    styles.option,
                    styles.extraOption,
                    aktif && styles.optionActive,
                    pressed && styles.optionPressed,
                  ]}>
                  <Text style={styles.variant}>{option.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  // Membungkus, bukan satu baris: dua tombol suhu muat berdampingan, enam saus
  // tidak — dipaksakan, masing-masing tinggal ~60dp dan "Mayonnaise" terpotong.
  options: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
    padding: spacing.lg,
  },
  option: {
    // Dua kolom pada lebar berapa pun: 48% menyisakan ruang untuk gap.
    flexBasis: "48%",
    flexGrow: 1,
    minHeight: touchTarget.comfortable,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    padding: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: semantic.border,
    backgroundColor: semantic.surface,
  },
  // Kotak centang selebar penuh, satu per baris. Tiga topping mendatar berarti
  // sasaran tekan sempit untuk tiga hal yang urutannya justru penting dibaca
  // dari atas ke bawah.
  row: {
    flexBasis: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    minHeight: touchTarget.comfortable,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: semantic.border,
    backgroundColor: semantic.surface,
  },
  rowDisabled: {
    opacity: 0.4,
  },
  rowLabel: {
    ...textStyles.sectionTitle,
    flex: 1,
    color: semantic.textPrimary,
  },
  box: {
    width: 26,
    height: 26,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.sm,
    borderWidth: 2,
    borderColor: semantic.border,
    backgroundColor: semantic.surface,
  },
  boxOn: {
    borderColor: colors.primary[600],
    backgroundColor: colors.primary[600],
  },
  check: {
    ...textStyles.sectionTitle,
    lineHeight: 22,
    color: colors.neutral[0],
  },
  optionActive: {
    borderWidth: 2,
    borderColor: colors.primary[600],
    backgroundColor: colors.primary[50],
  },
  optionPressed: {
    borderColor: colors.primary[600],
    backgroundColor: colors.primary[50],
  },
  variant: {
    ...textStyles.sectionTitle,
    color: semantic.textPrimary,
  },
  price: {
    ...textStyles.price,
    color: semantic.textSecondary,
  },
  note: {
    ...textStyles.caption,
    paddingHorizontal: spacing.lg,
    color: semantic.textSecondary,
  },
  extra: {
    gap: spacing.sm,
    padding: spacing.lg,
  },
  extraTitle: {
    ...textStyles.sectionTitle,
    color: semantic.textPrimary,
  },
  extraOptions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
  },
  extraOption: {
    paddingVertical: spacing.md,
  },
});
