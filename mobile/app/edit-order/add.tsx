import { useCallback, useEffect, useRef, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSQLiteContext } from "expo-sqlite";

import Button from "../../components/Button";
import ProductGrid from "../../components/ProductGrid";
import { useToast } from "../../components/Toast";
import VariantSheet from "../../components/VariantSheet";
import { translateOrderError } from "../../db/errors";
import { appendToOrder, getOrder } from "../../db/orders";
import type { OrderItemRow, OrderRow } from "../../db/types";
import { useCart } from "../../lib/cart-context";
import type { ProductEntry } from "../../lib/product-variants";
import { useGateShift } from "../../lib/shift-context";
import { formatRupiah, tableLabel } from "../../lib/types";
import {
  radius,
  semantic,
  spacing,
  textStyles,
  touchTarget,
} from "../../theme";

/**
 * Menambah item ke order yang sudah tersimpan. Dulu lembar di dalam layar ubah
 * order; kini halaman sendiri, supaya grid produk dapat seluruh tinggi layar
 * alih-alih kotak setinggi 320dp.
 *
 * Halaman ini TIDAK menutup sendiri sesudah tiap item. Pesanan yang datang ke
 * kasir hampir tidak pernah satu item, dan menutup tiap kali berarti kasir
 * membuka ulang, mengetik ulang pencariannya, lalu menggulir lagi — untuk tiap
 * baris pesanan. Ia tertutup hanya kalau kasir menekan Kembali.
 *
 * Pencarian ikut terbuang saat halaman ditutup, karena state-nya milik halaman
 * ini; menambah item tidak membersihkannya.
 */
export default function AddItemScreen() {
  const router = useRouter();
  const db = useSQLiteContext();
  const toast = useToast();
  const gateShift = useGateShift();
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const { products } = useCart();

  const [order, setOrder] = useState<
    (OrderRow & { items: OrderItemRow[] }) | null
  >(null);
  const [search, setSearch] = useState("");
  const [variantEntry, setVariantEntry] = useState<ProductEntry | null>(null);

  const reload = useCallback(async () => {
    setOrder(await getOrder(db, orderId));
  }, [db, orderId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  /**
   * `busyRef` ada karena `appendToOrder` memakai `expectedVersion`, dan version
   * baru diketahui setelah `reload()`. Dengan halaman yang tetap terbuka, dua
   * ketukan cepat bisa keduanya membawa version yang sama; yang kedua ditolak
   * STALE_ORDER padahal kasir tidak melakukan kesalahan apa pun. State biasa
   * tidak cukup untuk itu — ia baru terbaca setelah render berikutnya.
   */
  const busyRef = useRef(false);

  const handleAdd = useCallback(
    (productId: string, notes = "") => {
      if (!gateShift("menambah item")) return;
      if (!order || busyRef.current) return;
      busyRef.current = true;
      void (async () => {
        try {
          await appendToOrder(db, {
            orderId,
            items: [{ productId, quantity: 1, notes }],
            expectedVersion: order.version,
          });
          toast.success("Item ditambahkan");
        } catch (caught) {
          toast.error(translateOrderError(caught));
        } finally {
          await reload();
          busyRef.current = false;
        }
      })();
    },
    [order, db, orderId, reload, toast, gateShift]
  );

  // Satu opsi berarti tidak ada yang perlu ditanyakan. VariantSheet boleh
  // tampil di atas halaman ini tanpa ditutup-buka lebih dulu: halaman ini rute,
  // bukan Modal, jadi tidak ada dua Modal yang berebut z-order.
  const selectEntry = useCallback(
    (entry: ProductEntry) => {
      if (entry.options.length === 1) {
        handleAdd(entry.options[0].product.id);
        return;
      }
      setVariantEntry(entry);
    },
    [handleAdd]
  );

  const keyword = search.trim().toLowerCase();

  return (
    <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.title}>Tambah item</Text>
          {/* Jumlah dan total order berjalan dibawa ke sini: halaman ini
              menutupi daftar item, dan tanpa keduanya kasir menambah beberapa
              item sambil buta terhadap apa yang sudah masuk. */}
          <Text style={styles.subtitle}>
            {order
              ? `${tableLabel(order.table_code, order.table_seq)} · ${
                  order.items.length
                } item · ${formatRupiah(order.total)}`
              : "Memuat order…"}
          </Text>
        </View>
        <Button label="Kembali" onPress={() => router.back()} />
      </View>

      <View style={styles.searchWrap}>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Cari nama atau kode produk"
          placeholderTextColor={semantic.textSecondary}
          style={styles.input}
          autoFocus
        />
      </View>

      <View style={styles.gridWrap}>
        <ProductGrid
          products={products}
          keyword={keyword}
          // Tanpa kata kunci, halaman ini hanya memajang segenggam kartu
          // pertama supaya kasir mengetik alih-alih menggulir 247 kartu.
          // Batasnya dihitung dalam KARTU, bukan produk — memotong daftar
          // produk mentah merobek keluarga varian.
          limit={keyword ? undefined : 30}
          onSelect={selectEntry}
          emptyHint="Tidak ada produk cocok"
        />
      </View>

      {variantEntry ? (
        <VariantSheet
          entry={variantEntry}
          onPick={(productId, notes) => {
            setVariantEntry(null);
            handleAdd(productId, notes);
          }}
          onCancel={() => setVariantEntry(null)}
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
    ...textStyles.caption,
    color: semantic.textSecondary,
  },
  searchWrap: {
    padding: spacing.md,
  },
  gridWrap: {
    flex: 1,
  },
  input: {
    ...textStyles.bodyStrong,
    minHeight: touchTarget.comfortable,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: semantic.border,
    color: semantic.textPrimary,
    backgroundColor: semantic.surface,
  },
});
