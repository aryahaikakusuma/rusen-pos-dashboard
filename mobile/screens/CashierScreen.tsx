import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";

import CategoryChips from "../components/CategoryChips";
import MenuButton from "../components/MenuButton";
import ProductGrid from "../components/ProductGrid";
import ShiftBanner from "../components/ShiftBanner";
import { useToast } from "../components/Toast";
import VariantSheet from "../components/VariantSheet";
import { listCategories, pullCatalog } from "../db/catalog";
import type { CategoryRow, ProductRow } from "../db/types";
import { useCart } from "../lib/cart-context";
import type { ProductEntry } from "../lib/product-variants";
import { useGateShift, useShift } from "../lib/shift-context";
import { formatRupiah } from "../lib/types";
import { useShortViewport } from "../lib/use-layout-mode";
import {
  colors,
  radius,
  semantic,
  spacing,
  textStyles,
  touchTarget,
} from "../theme";

/**
 * Port dari components/CashierScreen.tsx milik web. Alur simpannya sama persis:
 * kode meja diperiksa lebih dulu, kalau sudah ada order belum lunas kasir yang
 * memutuskan gabung atau pisah, baru menulis — hanya saja langkah-langkah itu
 * kini tinggal di CartProvider, bukan di sini.
 *
 * Yang tersisa di layar ini adalah memilih produk: grid, pencarian, kategori,
 * kode meja, dan batang keranjang di bawah. Keranjangnya sendiri halaman
 * tersendiri (app/cart.tsx) — di lembar, daftar item hanya kebagian sisa ruang
 * di bawah grid.
 */
export default function CashierScreen({
  onOpenMenu,
  refreshToken,
}: {
  /** Membuka lembar menu milik AppShell — nama kasir, Katalog/Uji, Keluar. */
  onOpenMenu: () => void;
  /**
   * Berubah nilainya saat layar Katalog/Uji ditutup. Layar ini tidak pernah
   * di-unmount — AppShell menahannya tetap terpasang supaya keranjang tidak
   * hilang saat pindah tab — jadi tanpa penanda ini kategori yang baru ditarik
   * tidak akan pernah terbaca, dan grid tetap kosong sampai aplikasi dimatikan.
   */
  refreshToken: number;
}) {
  const db = useSQLiteContext();
  const toast = useToast();
  const router = useRouter();
  const { aktif: shiftAktif } = useShift();
  const gateShift = useGateShift();
  const short = useShortViewport();
  const {
    items,
    tableCode,
    orderKind,
    saving,
    total,
    itemCount,
    products,
    testMode,
    setTableCode,
    setOrderKind,
    setError,
    addProduct,
    reloadProducts,
  } = useCart();

  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState("");
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [variantEntry, setVariantEntry] = useState<ProductEntry | null>(null);

  useEffect(() => {
    let cancelled = false;
    void listCategories(db).then((cats) => {
      if (cancelled) return;
      setCategories(cats);
      setSelectedCategoryId((current) => current || (cats[0]?.id ?? ""));
    });
    return () => {
      cancelled = true;
    };
  }, [db, refreshToken]);

  /**
   * Geser grid dari atas untuk menarik ulang katalog.
   *
   * Sebelumnya satu-satunya jalan adalah layar Katalog/Uji lewat menu ☰ — layar
   * diagnostik, bukan tempat kasir bekerja. Harga yang berubah pagi hari karena
   * itu baru sampai ke ponsel kalau ada yang ingat membuka layar itu.
   *
   * Keranjang sengaja TIDAK disentuh. Menarik katalog di tengah order yang belum
   * disimpan harus aman: baris keranjang membawa sendiri harga dan namanya, dan
   * harga yang mengikat tetap milik server saat create_order dijalankan.
   */
  const [refreshingCatalog, setRefreshingCatalog] = useState(false);
  const refreshCatalog = useCallback(async () => {
    setRefreshingCatalog(true);
    try {
      const hasil = await pullCatalog(db);
      const cats = await listCategories(db);
      setCategories(cats);
      setSelectedCategoryId((current) => current || (cats[0]?.id ?? ""));
      // Daftar produknya dimiliki CartProvider — harga hanya boleh punya satu
      // salinan — jadi di sini ia diminta membaca ulang.
      await reloadProducts();
      toast.success(`Katalog segar — ${hasil.products} produk.`);
    } catch (e) {
      // Pesan aslinya ditampilkan, bukan "periksa koneksi Anda". Sebagian besar
      // kegagalan di sini bukan soal sinyal dan tidak akan membaik dengan
      // mencoba lagi (mobile/AGENTS.md).
      toast.error(
        `Tarik katalog gagal: ${e instanceof Error ? e.message : String(e)}`
      );
    } finally {
      setRefreshingCatalog(false);
    }
  }, [db, toast, reloadProducts]);

  // Saat mencari, kategori diabaikan: dengan 293 produk kasir sering tidak
  // hafal suatu menu ada di kategori mana, jadi pencarian menyapu seluruh menu.
  const keyword = search.trim().toLowerCase();
  // Dibungkus useMemo supaya identitasnya stabil selama products/keyword/
  // kategori tidak berubah — tanpa ini array baru lahir tiap render (mis.
  // tiap keranjang berubah) dan menggagalkan memo ProductGrid & ProductCard.
  // Pencarian menyapu seluruh menu, jadi saat ada kata kunci kategori diabaikan
  // dan seluruh katalog diserahkan ke ProductGrid. Penyaringan kata kuncinya
  // sendiri terjadi di sana, setelah pengelompokan varian — menyaringnya di
  // sini merobek keluarga varian (lihat filterProductEntries).
  const visibleProducts = useMemo(
    () =>
      keyword
        ? products
        : products.filter((p) => p.category_id === selectedCategoryId),
    [products, keyword, selectedCategoryId]
  );

  // Satu suhu berarti tidak ada yang perlu ditanyakan; kasir menekan sekali
  // seperti sebelumnya. Lembar hanya muncul kalau memang ada pilihan.
  const selectEntry = useCallback(
    (entry: ProductEntry) => {
      // Dijaga di sini juga, bukan hanya di addProduct: kalau tidak, kartu
      // dengan beberapa varian tetap membuka lembar pilihannya dan penolakan
      // baru datang sesudah kasir memilih.
      if (!gateShift("menambah item")) return;
      if (entry.options.length === 1) {
        addProduct(entry.options[0].product.id);
        return;
      }
      setVariantEntry(entry);
    },
    [addProduct, gateShift]
  );

  const controls = (
    <View style={[styles.controls, short && styles.controlsShort]}>
      <MenuButton onPress={onOpenMenu} />
      {!searchOpen ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Buka pencarian produk"
          onPress={() => setSearchOpen(true)}
          disabled={saving}
          style={({ pressed }) => [
            styles.searchIconButton,
            pressed && styles.searchIconPressed,
            saving && styles.searchIconDisabled,
          ]}>
          <SearchGlyph />
        </Pressable>
      ) : null}
      <View style={styles.tableControl}>
        <TextInput
          value={tableCode}
          onChangeText={(text) => {
            setTableCode(text);
            setError("");
          }}
          placeholder="Kode meja"
          accessibilityLabel="Kode meja atau order, contoh A3"
          placeholderTextColor={semantic.textSecondary}
          style={[styles.input, short && styles.inputShort, styles.tableInput, orderKind === "takeaway" && styles.disabledTableInput]}
          editable={!saving && orderKind === "meja"}
          autoCapitalize="characters"
        />
        <View style={styles.modeSwitch}>
          <Switch
            accessibilityLabel="Mode meja atau Takeaway"
            value={orderKind === "takeaway"}
            onValueChange={(takeaway) => {
              setOrderKind(takeaway ? "takeaway" : "meja");
              setTableCode(takeaway ? "Takeaway" : "");
              setError("");
            }}
            trackColor={{ false: semantic.border, true: colors.primary[500] }}
            thumbColor={orderKind === "takeaway" ? colors.primary[600] : semantic.surface}
            style={styles.verticalSwitch}
            disabled={saving}
          />
        </View>
      </View>
      {searchOpen ? (
        <View style={[styles.searchOverlay, short && styles.searchOverlayShort]}>
          <View style={styles.searchField}>
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Cari produk"
              accessibilityLabel="Cari nama atau kode produk"
              placeholderTextColor={semantic.textSecondary}
              style={[styles.input, short && styles.inputShort, styles.searchFieldInput]}
              editable={!saving}
              autoFocus
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Tutup pencarian produk"
              onPress={() => {
                setSearch("");
                setSearchOpen(false);
              }}
              disabled={saving}
              style={({ pressed }) => [
                styles.searchCloseButton,
                pressed && styles.searchIconPressed,
              ]}>
              <Text style={styles.searchCloseText}>×</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );

  const grid = (
    <ProductGrid
      products={visibleProducts}
      keyword={keyword}
      disabled={saving}
      onSelect={selectEntry}
      onRefresh={() => void refreshCatalog()}
      refreshing={refreshingCatalog}
      emptyHint={
        keyword
          ? `Tidak ada produk cocok dengan "${search.trim()}"`
          : products.length === 0
            ? // Petunjuknya menyebut tempat tombolnya berada sekarang. Sebelumnya
              // tertulis "Buka tab Order", dan tombol itu tidak pernah ada di
              // sana — kasir yang menurut pada petunjuk ini akan mencari-cari
              // sesuatu yang tidak ada, tepat saat aplikasi belum bisa dipakai.
              "Katalog belum ditarik. Geser layar ini dari atas ke bawah."
            : "Pilih kategori lain"
      }
    />
  );

  return (
    <View style={[styles.screen, testMode && styles.screenUji]}>
      {/* Pita, BUKAN watermark di belakang isi. Watermark harus tipis supaya
          harga dan nama produk tetap terbaca, dan yang tipis justru berhenti
          terlihat sesudah dua hari — mata berhenti mendaftarkannya persis saat
          ia paling dibutuhkan. Pita ini memakan ruang, tidak bisa ditembus
          pandang, dan menyebutkan akibatnya dengan kata-kata. Bersama bingkai
          merah di tepi layar, keduanya menjawab "kenapa" sekaligus "sedang".

          Alasannya ikut ditampilkan apa adanya: itu yang diketik kasir semenit
          lalu, dan melihatnya kembali adalah cara tercepat menyadari mode ini
          masih menyala dari pekerjaan yang sudah selesai. */}
      {testMode ? (
        <View style={styles.ujiBanner} accessibilityRole="alert">
          <Text style={styles.ujiBannerTitle}>
            MODE UJI — order ini tidak masuk laporan
          </Text>
          <Text style={styles.ujiBannerReason} numberOfLines={2}>
            {testMode.reason}
          </Text>
        </View>
      ) : null}
      {!shiftAktif ? <ShiftBanner /> : null}
      {controls}
      <CategoryChips
        categories={categories}
        selectedId={selectedCategoryId}
        onSelect={(id) => {
          // Memilih kategori membatalkan pencarian, supaya kategori yang
          // tersorot selalu sama dengan yang tampil di grid.
          setSearch("");
          setSelectedCategoryId(id);
        }}
      />
      <View style={styles.gridArea}>{grid}</View>

      {/* Batang keranjang, kini pintu menuju halamannya. Tetap mati saat
          keranjang kosong: halaman kosong tidak menjawab apa pun, dan
          satu-satunya jalan keluarnya adalah menekan Kembali. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Buka keranjang"
        onPress={() => router.push("/cart")}
        disabled={items.length === 0}
        style={({ pressed }) => [
          styles.cartBar,
          pressed && styles.cartBarPressed,
          items.length === 0 && styles.cartBarEmpty,
        ]}>
        <Text style={styles.cartBarText}>
          {items.length === 0
            ? "Keranjang kosong"
            : `${itemCount} item · ${formatRupiah(total)}`}
        </Text>
        {items.length > 0 ? (
          <Text style={styles.cartBarChevron}>Lihat ▶</Text>
        ) : null}
      </Pressable>

      {variantEntry ? (
        <VariantSheet
          entry={variantEntry}
          onPick={(productId, notes) => {
            addProduct(productId, notes);
            setVariantEntry(null);
          }}
          onCancel={() => setVariantEntry(null)}
        />
      ) : null}
    </View>
  );
}

function SearchGlyph() {
  return (
    <View style={styles.searchGlyph}>
      <View style={styles.searchGlyphCircle} />
      <View style={styles.searchGlyphHandle} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: semantic.surfaceMuted,
  },
  // Bingkai, bukan latar berwarna. Mewarnai latar akan menggeser seluruh
  // kontras layar dan membuat warna semantik lain — kuning "belum lunas",
  // hijau "lunas" — terbaca berbeda dari biasanya. Bingkai tidak menyentuh
  // apa pun di dalamnya.
  screenUji: {
    borderWidth: 4,
    borderColor: colors.status.void,
  },
  ujiBanner: {
    backgroundColor: colors.status.void,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: 2,
  },
  ujiBannerTitle: {
    ...textStyles.body,
    color: semantic.surface,
    fontWeight: "700",
  },
  ujiBannerReason: {
    ...textStyles.caption,
    color: semantic.surface,
  },
  controls: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: semantic.surface,
    borderBottomWidth: 1,
    borderBottomColor: semantic.border,
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
  controlsShort: {
    padding: spacing.sm,
  },
  // Tetap di ambang sentuh 48dp DESIGN.md, hanya kehilangan kelonggarannya.
  inputShort: {
    minHeight: touchTarget.min,
  },
  searchIconButton: {
    width: touchTarget.min,
    height: touchTarget.min,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
  },
  searchIconPressed: {
    backgroundColor: semantic.surfaceMuted,
  },
  searchIconDisabled: {
    opacity: 0.45,
  },
  searchGlyph: {
    width: 24,
    height: 24,
  },
  searchGlyphCircle: {
    position: "absolute",
    top: 2,
    left: 2,
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: semantic.textPrimary,
  },
  searchGlyphHandle: {
    position: "absolute",
    top: 15,
    left: 15,
    width: 8,
    height: 2,
    borderRadius: 1,
    backgroundColor: semantic.textPrimary,
    transform: [{ rotate: "45deg" }],
  },
  searchOverlay: {
    position: "absolute",
    left: spacing.md + touchTarget.min + spacing.sm,
    right: spacing.md,
    top: spacing.md,
    bottom: spacing.md,
    zIndex: 2,
    elevation: 4,
    flexDirection: "row",
    alignItems: "center",
  },
  searchOverlayShort: {
    left: spacing.sm + touchTarget.min + spacing.sm,
    right: spacing.sm,
    top: spacing.sm,
    bottom: spacing.sm,
  },
  searchField: {
    flex: 1,
    height: "100%",
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 2,
    borderColor: semantic.border,
    borderRadius: radius.md,
    backgroundColor: semantic.surface,
    overflow: "hidden",
  },
  searchFieldInput: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    height: "100%",
    borderWidth: 0,
    borderRadius: 0,
    backgroundColor: "transparent",
    paddingVertical: 0,
    paddingRight: spacing.xs,
    textAlignVertical: "center",
  },
  searchCloseButton: {
    width: touchTarget.min,
    height: touchTarget.min,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
  },
  searchCloseText: {
    ...textStyles.bodyStrong,
    fontSize: 28,
    color: semantic.textSecondary,
    lineHeight: touchTarget.min,
  },
  tableControl: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    flexGrow: 1,
    flexShrink: 1,
  },
  modeSwitch: {
    width: 54,
    minHeight: touchTarget.comfortable,
    alignItems: "center",
    justifyContent: "center",
  },
  verticalSwitch: {
    transform: [{ rotate: "90deg" }],
    marginVertical: -4,
  },
  // Lebar tetap, bukan bagian dari flex: isinya selalu pendek ("A3"), jadi
  // sisa ruang lebih berguna untuk kolom pencarian.
  tableInput: {
    flex: 1,
    borderColor: colors.primary[100],
    backgroundColor: colors.primary[50],
  },
  disabledTableInput: {
    opacity: 0.5,
  },
  gridArea: {
    flex: 1,
  },
  cartBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: touchTarget.primaryAction,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.primary[600],
  },
  cartBarPressed: {
    backgroundColor: colors.primary[700],
  },
  cartBarEmpty: {
    backgroundColor: semantic.surface,
    borderTopWidth: 1,
    borderTopColor: semantic.border,
  },
  cartBarText: {
    ...textStyles.actionButton,
    color: colors.neutral[0],
  },
  cartBarChevron: {
    ...textStyles.caption,
    color: colors.neutral[0],
  },
  errorText: {
    ...textStyles.caption,
    color: colors.status.void,
  },
});
