import { useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import Button from "../components/Button";
import CartLines from "../components/CartLines";
import TableConflictDialog from "../components/TableConflictDialog";
import { useCart } from "../lib/cart-context";
import { formatRupiah } from "../lib/types";
import { useShift } from "../lib/shift-context";
import { colors, semantic, spacing, textStyles } from "../theme";

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
        <View style={styles.headerText}>
          <Text style={styles.title}>Keranjang</Text>
          <Text style={styles.subtitle}>
            {itemCount} item · {formatRupiah(total)}
          </Text>
        </View>
        <Button label="Kembali" onPress={() => router.back()} />
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
    ...textStyles.body,
    color: semantic.textSecondary,
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
