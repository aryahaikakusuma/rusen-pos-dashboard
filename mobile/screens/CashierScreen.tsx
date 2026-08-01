import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useSQLiteContext } from "expo-sqlite";

import Button from "../components/Button";
import CartLines from "../components/CartLines";
import CategoryChips from "../components/CategoryChips";
import MenuButton from "../components/MenuButton";
import ProductGrid from "../components/ProductGrid";
import Sheet from "../components/Sheet";
import ShiftBanner from "../components/ShiftBanner";
import TableConflictDialog from "../components/TableConflictDialog";
import { useToast } from "../components/Toast";
import VariantSheet from "../components/VariantSheet";
import { listCategories, listProducts, pullCatalog } from "../db/catalog";
import { translateOrderError } from "../db/errors";
import { appendToOrder, checkTableCode, createOrder } from "../db/orders";
import { pushPending } from "../db/push";
import type {
  CategoryRow,
  OrderItemInput,
  ProductRow,
  TableConflict,
} from "../db/types";
import { useAuth } from "../lib/auth-context";
import type { ProductEntry } from "../lib/product-variants";
import { useGateShift, useShift } from "../lib/shift-context";
import { draftLineKey, formatRupiah, type DraftItem } from "../lib/types";
import { useLayoutMode, useShortViewport } from "../lib/use-layout-mode";
import {
  cashierLayout,
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
 * memutuskan gabung atau pisah, baru menulis.
 *
 * Bedanya hanya bentuk. Di layar tegak tiga kolom tidak muat, jadi kategori
 * jadi deretan chip mendatar dan keranjang jadi lembar yang dipanggil dari
 * batang bawah. Keranjang tidak dibuat panel tetap karena di ~400dp ia akan
 * menyisakan grid produk setinggi dua baris.
 */
export default function CashierScreen({
  onSaved,
  onOpenMenu,
  refreshToken,
  testMode,
  onTestOrderCreated,
}: {
  /** Dipanggil setelah order tersimpan, supaya daftar order ikut segar. */
  onSaved: () => void;
  /** Membuka lembar menu milik AppShell — nama kasir, Katalog/Uji, Keluar. */
  onOpenMenu: () => void;
  /**
   * Berubah nilainya saat layar Katalog/Uji ditutup. Layar ini tidak pernah
   * di-unmount — AppShell menahannya tetap terpasang supaya keranjang tidak
   * hilang saat pindah tab — jadi tanpa penanda ini katalog yang baru ditarik
   * tidak akan pernah terbaca, dan grid tetap kosong sampai aplikasi dimatikan.
   */
  refreshToken: number;
  /**
   * Mode uji, kalau sedang menyala. Dimiliki AppShell, bukan layar ini —
   * penandanya harus tetap terlihat saat kasir menengok tab Order, dan layar
   * ini tidak pernah di-unmount sehingga state di sini akan hidup terus tanpa
   * ada yang tahu.
   */
  testMode: { reason: string } | null;
  /** Dipanggil sesudah SATU order uji tersimpan. AppShell mematikan modenya. */
  onTestOrderCreated: () => void;
}) {
  const db = useSQLiteContext();
  const toast = useToast();
  const { session } = useAuth();
  const { aktif: shiftAktif } = useShift();
  const gateShift = useGateShift();
  const phone = useLayoutMode() === "phone";
  const short = useShortViewport();

  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState("");
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [tableCode, setTableCode] = useState("");
  const [orderKind, setOrderKind] = useState<"meja" | "takeaway">("meja");
  const [items, setItems] = useState<DraftItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [conflicts, setConflicts] = useState<TableConflict[] | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [variantEntry, setVariantEntry] = useState<ProductEntry | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [cats, prods] = await Promise.all([
        listCategories(db),
        listProducts(db),
      ]);
      if (cancelled) return;
      setCategories(cats);
      setProducts(prods);
      setSelectedCategoryId((current) => current || (cats[0]?.id ?? ""));
    })();
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
      const [cats, prods] = await Promise.all([
        listCategories(db),
        listProducts(db),
      ]);
      setCategories(cats);
      setProducts(prods);
      setSelectedCategoryId((current) => current || (cats[0]?.id ?? ""));
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
  }, [db, toast]);

  const total = items.reduce(
    (sum, item) => sum + item.unitPrice * item.quantity,
    0
  );
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);

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

  // `notes` ikut jadi kunci penggabungan, bukan sekadar ikut terbawa: Indomie
  // Kuah Soto dan Indomie Kuah Ayam Spesial adalah produk yang sama persis
  // dengan harga yang sama, dan tanpa ini keduanya menyatu jadi satu baris
  // "2x" yang tidak lagi menyebutkan salah satu kuahnya di struk dapur.
  const addProduct = useCallback(
    (productId: string, notes = "") => {
      // Gerbang paling awal: keranjang yang boleh terisi tanpa sif hanya
      // menunda penolakan sampai kasir sudah mengetik kode meja dan menekan
      // Simpan — momen terburuk untuk memberitahunya.
      if (!gateShift("menambah item")) return;
      const product = products.find((p) => p.id === productId);
      if (!product) return;
      setError("");

      setItems((current) => {
        const existing = current.find(
          (item) => item.productId === productId && item.notes === notes
        );
        if (existing) {
          return current.map((item) =>
            item === existing ? { ...item, quantity: item.quantity + 1 } : item
          );
        }
        return [
          ...current,
          {
            productId: product.id,
            productCode: product.code,
            productName: product.name,
            quantity: 1,
            unitPrice: product.price,
            notes,
          },
        ];
      });
    },
    [products, gateShift]
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

  const updateQuantity = useCallback((lineKey: string, quantity: number) => {
    if (quantity <= 0) {
      setItems((current) =>
        current.filter((item) => draftLineKey(item) !== lineKey)
      );
      return;
    }
    setItems((current) =>
      current.map((item) =>
        draftLineKey(item) === lineKey ? { ...item, quantity } : item
      )
    );
  }, []);

  const removeItem = useCallback((lineKey: string) => {
    setItems((current) =>
      current.filter((item) => draftLineKey(item) !== lineKey)
    );
  }, []);

  const resetCart = () => {
    setItems([]);
    setTableCode("");
    setOrderKind("meja");
    setError("");
    setConflicts(null);
    setCartOpen(false);
  };

  const toInput = (): OrderItemInput[] =>
    items.map((item) => ({
      productId: item.productId,
      quantity: item.quantity,
      notes: item.notes,
    }));

  /** Langkah 1: cek bentrok kode meja sebelum menulis apa pun. */
  const handleSave = async () => {
    if (!gateShift("menyimpan order")) return;
    if (!tableCode.trim()) {
      setError("Masukkan kode meja/order");
      toast.error("Kode meja/order belum diisi");
      return;
    }
    if (items.length === 0) {
      setError("Keranjang kosong");
      toast.error("Keranjang masih kosong");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const found = await checkTableCode(db, tableCode);
      if (found.length > 0) {
        setConflicts(found);
        setCartOpen(false);
        return;
      }
      await createNewOrder();
    } catch (caught) {
      showError(caught);
    } finally {
      setSaving(false);
    }
  };

  const createNewOrder = async () => {
    // Jalan masuk kedua: TableConflictDialog memanggilnya langsung, tanpa
    // melewati handleSave.
    if (!gateShift("menyimpan order")) return;
    if (!session) return;
    const label = tableCode.trim();
    setSaving(true);
    try {
      await createOrder(db, {
        tableCode,
        employeeId: session.employeeId,
        items: toInput(),
        testMode: testMode ?? undefined,
      });
      toast.success(
        testMode
          ? `Order UJI meja ${label} tersimpan — tidak masuk laporan`
          : `Order meja ${label} tersimpan`
      );
      resetCart();
      // Sesudah order tersimpan, bukan sebelum. Kalau createOrder melempar,
      // modenya harus tetap menyala — mematikannya di sini akan membuat
      // percobaan ulang kasir diam-diam menghasilkan order sungguhan.
      if (testMode) onTestOrderCreated();
      onSaved();
      // Satu-satunya pengiriman untuk order yang baru lahir; sesudah ini ia
      // diam sampai lunas atau void. Tanpa await dan tanpa suara — offline
      // adalah keadaan wajar di sini, dan lembar kasir tidak boleh menggantung
      // menunggu jaringan. Kalau gagal, badge di tab Order yang memberi tahu,
      // dan percobaan saat aplikasi dibuka (AppShell) yang menyusulkannya.
      //
      // Sengaja di sini, bukan di onSaved: mergeIntoExisting memanggil onSaved
      // yang sama, dan itu penyuntingan — persis lalu lintas yang dihemat.
      //
      // onSaved dipanggil DUA kali, dan yang kedua itu wajib. Panggilan di atas
      // menyegarkan layar Order sebelum pengiriman selesai, jadi hasilnya tidak
      // pernah sampai ke layar: order yang sudah terkirim tetap bertanda "Belum
      // terkirim" sampai ada hal lain yang kebetulan menyegarkannya. Pola yang
      // sama dipakai di AppShell.tsx (`.then(bumpOrders)`).
      void pushPending(db).then(onSaved).catch(() => {});
    } catch (caught) {
      showError(caught);
    } finally {
      setSaving(false);
    }
  };

  const mergeIntoExisting = async (conflict: TableConflict) => {
    if (!gateShift("menambah item ke order")) return;
    const label = tableCode.trim();
    // Penggabungan menambahkan item ke order yang SUDAH ADA, dan penanda uji
    // order itu tidak bisa diubah lagi — baik di sini maupun di server, di mana
    // push_order menolak menulisnya lewat cabang pembaruan. Jadi menggabung
    // saat mode uji menyala akan menaruh item uji ke dalam order sungguhan yang
    // ikut terhitung penuh di laporan, tanpa satu pun tanda. Ditahan di sini
    // karena tidak ada lapisan di bawah yang bisa melihat maksudnya.
    if (testMode) {
      const pesan =
        "Mode uji menyala. Order uji tidak bisa digabung ke order yang sudah " +
        "ada — pakai kode meja lain, atau matikan mode uji dulu.";
      setError(pesan);
      setConflicts(null);
      toast.error(pesan);
      return;
    }
    setSaving(true);
    try {
      await appendToOrder(db, {
        orderId: conflict.orderId,
        items: toInput(),
        expectedVersion: conflict.version,
      });
      toast.success(`Item ditambahkan ke order meja ${label}`);
      resetCart();
      onSaved();
    } catch (caught) {
      showError(caught);
    } finally {
      setSaving(false);
    }
  };

  const showError = (caught: unknown) => {
    const message = translateOrderError(caught);
    setError(message);
    setConflicts(null);
    toast.error(message);
  };

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

  const cartBody = (
    <CartLines
      items={items}
      disabled={saving}
      onUpdateQuantity={updateQuantity}
      onRemove={removeItem}
    />
  );

  // Dua tombol yang sama dipakai dua kali dengan bentuk berbeda: menumpuk di
  // lembar ponsel, berdampingan di kaki panel tablet. Gayanya jadi parameter
  // supaya isinya tidak perlu ditulis dua kali.
  const saveButton = (style?: StyleProp<ViewStyle>) => (
    <Button
      label="Simpan Order"
      loadingLabel="Menyimpan…"
      variant="primary"
      loading={saving}
      disabled={items.length === 0 || !shiftAktif}
      onPress={() => void handleSave()}
      style={style}
    />
  );

  const clearButton = (label: string, style?: StyleProp<ViewStyle>) => (
    <Button
      label={label}
      variant="danger"
      disabled={saving || items.length === 0}
      onPress={resetCart}
      style={style}
    />
  );

  const errorLine = error ? (
    <Text style={styles.errorText}>{error}</Text>
  ) : null;

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
      {phone ? (
        <>
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

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Buka keranjang"
            onPress={() => setCartOpen(true)}
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
              <Text style={styles.cartBarChevron}>Lihat ▲</Text>
            ) : null}
          </Pressable>

          {cartOpen ? (
            <Sheet
              title="Keranjang"
              subtitle={`${itemCount} item · ${formatRupiah(total)}`}
              onClose={() => setCartOpen(false)}
              footer={
                <>
                  {errorLine}
                  {saveButton()}
                  {clearButton("Kosongkan Keranjang")}
                </>
              }>
              {cartBody}
            </Sheet>
          ) : null}
        </>
      ) : (
        <View style={styles.wide}>
          <CategoryChips
            categories={categories}
            selectedId={selectedCategoryId}
            onSelect={(id) => {
              setSearch("");
              setSelectedCategoryId(id);
            }}
          />
          <View style={styles.wideCenter}>
            {controls}
            {grid}
          </View>
          <View style={[styles.wideCart, short && styles.wideCartShort]}>
            <View style={styles.wideCartHeader}>
              <Text style={styles.wideCartTitle}>Keranjang</Text>
              <Text style={styles.wideCartTotal}>{formatRupiah(total)}</Text>
            </View>
            {/* Pembungkus ber-flex, bukan CartLines langsung. Tanpa ini daftar
                item memakai tinggi aslinya dan kaki panel terdorong keluar
                kolom — di ponsel mendatar ia menimpa batang tab. */}
            <View style={styles.wideCartBody}>{cartBody}</View>
            <View style={styles.wideCartFooter}>
              {errorLine}
              {/* Berdampingan, bukan bertumpuk: dua tombol menumpuk memakan
                  ~150dp dari kolom setinggi ~230dp dan tidak menyisakan
                  ruang untuk satu baris item pun. */}
              <View style={styles.wideCartActions}>
                {saveButton(styles.wideCartAction)}
                {/* Satu kata pendek: kaki panel selebar 250dp memecah bahkan
                    "Kosongkan" di tengah kata, dan judul kolom di atasnya
                    sudah menyebut "Keranjang". */}
                {clearButton("Hapus", styles.wideCartAction)}
              </View>
            </View>
          </View>
        </View>
      )}

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
  wide: {
    flex: 1,
    flexDirection: "row",
  },
  wideCenter: {
    flex: 1,
    backgroundColor: semantic.surface,
  },
  wideCart: {
    width: cashierLayout.cartWidth,
    // Jaring pengaman: apa pun yang tetap tidak muat dipotong di batas kolom,
    // bukan digambar menimpa batang tab di bawahnya.
    overflow: "hidden",
    borderLeftWidth: 1,
    borderLeftColor: semantic.border,
    backgroundColor: semantic.surface,
  },
  wideCartHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: semantic.border,
  },
  wideCartTitle: {
    ...textStyles.sectionTitle,
    color: semantic.textPrimary,
  },
  wideCartTotal: {
    ...textStyles.price,
    color: semantic.textPrimary,
  },
  wideCartShort: {
    width: cashierLayout.cartWidthShort,
  },
  wideCartBody: {
    flex: 1,
  },
  wideCartFooter: {
    gap: spacing.sm,
    padding: spacing.md,
    borderTopWidth: 1,
    borderTopColor: semantic.border,
  },
  wideCartActions: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  wideCartAction: {
    flex: 1,
    paddingHorizontal: spacing.sm,
  },
});
