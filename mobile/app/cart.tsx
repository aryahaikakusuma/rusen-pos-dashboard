import { useRouter } from "expo-router";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import Button from "../components/Button";
import CartLines from "../components/CartLines";
import TableConflictDialog from "../components/TableConflictDialog";
import { useCart } from "../lib/cart-context";
import { formatRupiah } from "../lib/types";
import { useShift } from "../lib/shift-context";
import { colors, radius, semantic, spacing, textStyles, touchTarget } from "../theme";

/**
 * Keranjang, dulu lembar di atas layar kasir (dan panel tetap di layar lebar).
 *
 * Jadi halaman sendiri supaya daftar item punya seluruh tinggi layar: di lembar
 * ponsel ia hanya kebagian sisa di bawah grid, dan pesanan enam item sudah
 * harus digulir di dalam kotak setinggi tiga baris.
 */
export default function CartScreen() {
  const router = useRouter();
  const { aktif: shiftAktif } = useShift();
  const {
    items,
    tableCode,
    setTableCode,
    orderKind,
    setError,
    total,
    itemCount,
    saving,
    error,
    conflicts,
    updateQuantity,
    removeItem,
    resetCart,
    handleSave,
    createNewOrder,
    mergeIntoExisting,
    setConflicts,
  } = useCart();

  return (
    <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
      <View style={styles.header}>
        {/* Judul sendirian di baris pertama — berbagi baris dengan tombol
            Kembali dan kolom kode meja pernah membuatnya terpotong dua baris
            di layar sempit. Baris kedua boleh berbagi karena subjudulnya
            pendek dan tidak pernah tumbuh melebihi lebar layar. */}
        <Text style={styles.title}>Keranjang</Text>
        <View style={styles.headerRow}>
          <Text style={styles.subtitle}>
            {itemCount} item · {formatRupiah(total)}
          </Text>
          {/* Cermin dari kolom kode meja di layar produk, bukan salinan
              independen: sumbernya tetap sama (useCart), jadi kasir yang lupa
              mengisinya di awal tidak perlu kembali ke layar sebelumnya. */}
          <TextInput
            value={tableCode}
            onChangeText={(text) => {
              setTableCode(text);
              setError("");
            }}
            placeholder="Kode meja"
            accessibilityLabel="Kode meja atau order, contoh A3"
            placeholderTextColor={semantic.textSecondary}
            style={styles.tableInput}
            editable={!saving && orderKind === "meja"}
            autoCapitalize="characters"
          />
          <Button label="Kembali" onPress={() => router.back()} />
        </View>
      </View>

      <View style={styles.body}>
        <CartLines
          items={items}
          disabled={saving}
          onUpdateQuantity={updateQuantity}
          onRemove={removeItem}
        />
      </View>

      <View style={styles.footer}>
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        <Button
          label="Simpan Order"
          loadingLabel="Menyimpan…"
          variant="primary"
          loading={saving}
          disabled={items.length === 0 || !shiftAktif}
          onPress={() => void handleSave()}
        />
        <Button
          label="Kosongkan Keranjang"
          variant="danger"
          disabled={saving || items.length === 0}
          onPress={resetCart}
        />
      </View>

      {conflicts ? (
        <TableConflictDialog
          tableCode={tableCode.trim()}
          conflicts={conflicts}
          busy={saving}
          onSameCustomer={(conflict) => void mergeIntoExisting(conflict)}
          onDifferentCustomer={() => void createNewOrder()}
          onCancel={() => setConflicts(null)}
        />
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: semantic.surfaceMuted,
  },
  header: {
    gap: spacing.xs,
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: semantic.border,
    backgroundColor: semantic.surface,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  title: {
    ...textStyles.sectionTitle,
    color: semantic.textPrimary,
  },
  subtitle: {
    ...textStyles.body,
    flex: 1,
    color: semantic.textSecondary,
  },
  tableInput: {
    ...textStyles.bodyStrong,
    width: 124,
    minHeight: touchTarget.primaryAction,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.primary[100],
    color: semantic.textPrimary,
    backgroundColor: colors.primary[50],
  },
  body: {
    flex: 1,
  },
  footer: {
    gap: spacing.sm,
    padding: spacing.md,
    borderTopWidth: 1,
    borderTopColor: semantic.border,
    backgroundColor: semantic.surface,
  },
  errorText: {
    ...textStyles.caption,
    color: colors.status.void,
  },
});
