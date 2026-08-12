import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useSQLiteContext } from "expo-sqlite";

import { useToast } from "../components/Toast";
import { listProducts } from "../db/catalog";
import { translateOrderError } from "../db/errors";
import { appendToOrder, checkTableCode, createOrder } from "../db/orders";
import { pushPending, pushPendingShifts } from "../db/push";
import type { OrderItemInput, ProductRow, TableConflict } from "../db/types";
import { useAuth } from "./auth-context";
import { useGateShift } from "./shift-context";
import { draftLineKey, type DraftItem } from "./types";

interface CartValue {
  items: DraftItem[];
  tableCode: string;
  orderKind: "meja" | "takeaway";
  saving: boolean;
  error: string;
  conflicts: TableConflict[] | null;
  total: number;
  itemCount: number;
  /** Katalog produk. Dibaca di sini supaya harga hanya punya satu salinan. */
  products: ProductRow[];
  testMode: { reason: string } | null;
  /**
   * Naik satu tiap kali sebuah order berhasil tersimpan. AppShell menyimaknya
   * untuk menyegarkan daftar order dan berpindah ke tab Order — arah datanya
   * satu jalur, jadi tidak ada callback yang harus didaftarkan dari bawah.
   */
  savedTick: number;
  setTableCode: (value: string) => void;
  setOrderKind: (value: "meja" | "takeaway") => void;
  setError: (value: string) => void;
  setConflicts: (value: TableConflict[] | null) => void;
  setTestMode: (value: { reason: string } | null) => void;
  reloadProducts: () => Promise<void>;
  addProduct: (productId: string, notes?: string) => void;
  updateQuantity: (lineKey: string, quantity: number) => void;
  removeItem: (lineKey: string) => void;
  resetCart: () => void;
  handleSave: () => Promise<void>;
  createNewOrder: () => Promise<void>;
  mergeIntoExisting: (conflict: TableConflict) => Promise<void>;
}

const CartContext = createContext<CartValue | null>(null);

/**
 * Keranjang yang sedang diisi, beserta katalog dan mode uji yang menyertainya.
 *
 * Dulu semuanya state lokal CashierScreen, dan itu cukup selama keranjang
 * hanyalah lembar di atas layar yang sama. Sejak keranjang jadi halaman
 * tersendiri (app/cart.tsx), ia rute SEBELAH app/index.tsx — bukan anaknya.
 * Provider yang dipasang di dalam AppShell tidak akan terbaca dari sana, jadi
 * tempatnya di app/_layout.tsx, membungkus Slot.
 *
 * Katalog dan mode uji ikut ke sini karena keduanya dibaca saat menyimpan
 * order: harga dicari dari katalog, dan penanda uji menentukan order ini masuk
 * laporan atau tidak. Dua salinan yang dimuat terpisah bisa menyimpang, dan
 * yang menyimpang di situ adalah uang.
 */
export function CartProvider({ children }: { children: ReactNode }) {
  const db = useSQLiteContext();
  const toast = useToast();
  const { session } = useAuth();
  const gateShift = useGateShift();

  const [products, setProducts] = useState<ProductRow[]>([]);
  // Mode uji. `null` = mati. Penandanya harus tetap terlihat saat kasir
  // menengok tab Order, dan mematikannya adalah keputusan yang menyangkut
  // kedua layar.
  const [testMode, setTestMode] = useState<{ reason: string } | null>(null);
  const [savedTick, setSavedTick] = useState(0);
  const [items, setItems] = useState<DraftItem[]>([]);
  const [tableCode, setTableCode] = useState("");
  const [orderKind, setOrderKind] = useState<"meja" | "takeaway">("meja");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [conflicts, setConflicts] = useState<TableConflict[] | null>(null);

  const total = items.reduce(
    (sum, item) => sum + item.unitPrice * item.quantity,
    0
  );
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);

  const reloadProducts = useCallback(async () => {
    setProducts(await listProducts(db));
  }, [db]);

  useEffect(() => {
    void reloadProducts();
  }, [reloadProducts]);

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

  const resetCart = useCallback(() => {
    setItems([]);
    setTableCode("");
    setOrderKind("meja");
    setError("");
    setConflicts(null);
  }, []);

  const toInput = useCallback(
    (): OrderItemInput[] =>
      items.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
        notes: item.notes,
      })),
    [items]
  );

  const showError = useCallback(
    (caught: unknown) => {
      const message = translateOrderError(caught);
      setError(message);
      setConflicts(null);
      toast.error(message);
    },
    [toast]
  );

  const createNewOrder = useCallback(async () => {
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
      if (testMode) {
        setTestMode(null);
        toast.success("Mode uji dimatikan. Order berikutnya dihitung normal.");
      }
      setSavedTick((n) => n + 1);
      // Satu-satunya pengiriman untuk order yang baru lahir; sesudah ini ia
      // diam sampai lunas atau void. Tanpa await dan tanpa suara — offline
      // adalah keadaan wajar di sini, dan layar kasir tidak boleh menggantung
      // menunggu jaringan. Kalau gagal, badge di tab Order yang memberi tahu,
      // dan percobaan saat aplikasi dibuka (AppShell) yang menyusulkannya.
      //
      // Sengaja di sini, bukan di onSaved: mergeIntoExisting memanggil onSaved
      // yang sama, dan itu penyuntingan — persis lalu lintas yang dihemat.
      //
      // savedTick dinaikkan DUA kali, dan yang kedua itu wajib. Kenaikan di
      // atas menyegarkan layar Order sebelum pengiriman selesai, jadi hasilnya
      // tidak pernah sampai ke layar: order yang sudah terkirim tetap bertanda
      // "Belum terkirim" sampai ada hal lain yang kebetulan menyegarkannya.
      // Pola yang sama dipakai di AppShell.tsx (`.then(bumpOrders)`).
      void pushPending(db)
        .catch(() => {})
        .then(() => pushPendingShifts(db))
        .catch(() => {})
        .then(() => setSavedTick((n) => n + 1));
    } catch (caught) {
      showError(caught);
    } finally {
      setSaving(false);
    }
  }, [
    db,
    session,
    tableCode,
    toInput,
    testMode,
    resetCart,
    toast,
    showError,
    gateShift,
  ]);

  /** Langkah 1: cek bentrok kode meja sebelum menulis apa pun. */
  const handleSave = useCallback(async () => {
    if (!gateShift("menyimpan order")) return;
    if (!tableCode.trim()) {
      // Bukan toast: banner itu menutupi tombol "Kembali" di bagian atas
      // layar Keranjang. Teks di atas tombol Simpan Order sudah tepat di
      // tempat kasir sedang melihat.
      setError("Masukkan kode meja/order");
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
        return;
      }
      await createNewOrder();
    } catch (caught) {
      showError(caught);
    } finally {
      setSaving(false);
    }
  }, [
    db,
    tableCode,
    items,
    createNewOrder,
    gateShift,
    toast,
    showError,
  ]);

  const mergeIntoExisting = useCallback(
    async (conflict: TableConflict) => {
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
        setSavedTick((n) => n + 1);
      } catch (caught) {
        showError(caught);
      } finally {
        setSaving(false);
      }
    },
    [db, tableCode, toInput, testMode, resetCart, toast, showError, gateShift]
  );

  return (
    <CartContext.Provider
      value={{
        items,
        tableCode,
        orderKind,
        saving,
        error,
        conflicts,
        total,
        itemCount,
        products,
        testMode,
        savedTick,
        setTableCode,
        setOrderKind,
        setError,
        setConflicts,
        setTestMode,
        reloadProducts,
        addProduct,
        updateQuantity,
        removeItem,
        resetCart,
        handleSave,
        createNewOrder,
        mergeIntoExisting,
      }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart(): CartValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart dipakai di luar CartProvider");
  return ctx;
}
