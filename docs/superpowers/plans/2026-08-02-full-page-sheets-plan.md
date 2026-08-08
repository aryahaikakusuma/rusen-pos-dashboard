# Full-page migration (Keranjang, Tambah Item, Pelunasan, Kas Masuk/Keluar) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert four overlay sheets/modals in `mobile/` (cart, add-item, payment, kas masuk/keluar) plus the existing `PengaturanScreen` overlay into real `expo-router` screens, without changing any business logic.

**Architecture:** Install `expo-router` and its native deps. Add `mobile/app/` with a root layout that reproduces `App.tsx`'s provider tree and a `Stack`. `AppShell`'s tab switcher stays exactly as-is and becomes `app/index.tsx`. Cart state (currently local to `CashierScreen`) moves into a new `CartProvider` context so it survives navigating away to `/cart` and back — this is the one real refactor; everything else is a direct move of existing JSX/logic into a new file with `onClose`/`onPress` callbacks replaced by `router.back()` / `router.push()`.

**Tech Stack:** Expo SDK 57, expo-router (new), React Native 0.86, TypeScript, no test runner in this project — verification is `npm run typecheck`, `npm run periksa:varian`, `npm run preview:struk`, plus manual on-device checks (see `mobile/AGENTS.md`).

## Global Constraints

- No business logic changes: tax math, `busyRef` version guard, `voided_at` soft-delete, `shift_id` keying, print triggers, and validation must be byte-for-byte identical to today — only the container (Sheet/Modal → route) changes.
- `mobile/AGENTS.md`: JS-only changes ship via `eas update`; **this migration adds native modules (`react-native-screens`, `expo-linking`, `expo-constants`) and requires a full native rebuild** (`gradlew assembleRelease` + `adb install -r`) before anything in this plan can be verified on a device.
- `JAVA_HOME` must be set every shell: `$env:JAVA_HOME="C:\Program Files\Android\Android Studio\jbr"`.
- Cart on wide screens (`wideCart` panel) is being removed per the approved design — cart is always a route now, phone and tablet alike.
- `AppShell.tsx`'s tab switcher (`tab: "cashier" | "orders"`, `display:none` dual-mount) is untouched — do not fold it into expo-router.
- Follow existing code conventions: Indonesian comments only where they explain *why* (see existing files for tone/density), no comments that explain *what*.

---

### Task 1: Install expo-router and stand up the route shell

**Files:**
- Modify: `mobile/package.json`
- Modify: `mobile/app.json`
- Create: `mobile/app/_layout.tsx`
- Create: `mobile/app/index.tsx`
- Modify: `mobile/index.ts` (delete — expo-router supplies its own entry)
- Modify: `mobile/App.tsx` (delete — its contents move into `app/_layout.tsx`)

**Interfaces:**
- Produces: `app/_layout.tsx` exports a default `RootLayout` component that renders `SafeAreaProvider > SQLiteProvider > AuthProvider > Slot` (expo-router's `Slot`, not `children`), preserving the splash-screen/font-loading/auth-gate logic currently in `App.tsx`'s `Root()`. Later tasks' route files are children of this layout and can assume `useAuth()`, `useSQLiteContext()` are available.
- Produces: `app/index.tsx` renders `<AppShell />` unchanged — this is where the existing tab switcher continues to live.

- [ ] **Step 1: Install dependencies**

```powershell
cd mobile
npx expo install expo-router react-native-screens react-native-safe-area-context expo-linking expo-constants
```

`react-native-safe-area-context` is already a dependency at `~5.7.0` — `expo install` will report it's fine or bump it to the SDK-57-aligned version; accept whatever version it resolves, don't hand-pin.

- [ ] **Step 2: Set the router entry point**

Delete `mobile/index.ts`. Add to `mobile/package.json`:

```json
{
  "main": "expo-router/entry"
}
```

- [ ] **Step 3: Register the router plugin and a deep-link scheme in `app.json`**

Add `"expo-router"` to the `plugins` array (`mobile/app.json`, currently lines 27-39) and a `"scheme"` key at the top level (expo-router requires one even if deep links aren't used yet):

```json
"scheme": "rusenpos",
```

- [ ] **Step 4: Create `mobile/app/_layout.tsx`**, moving `App.tsx`'s contents in:

```tsx
import { useEffect } from "react";
import { useFonts } from "expo-font";
import * as SplashScreen from "expo-splash-screen";
import { SQLiteProvider } from "expo-sqlite";
import { StatusBar } from "expo-status-bar";
import { Slot } from "expo-router";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { migrateDbIfNeeded } from "../db/migrations";
import { AuthProvider, useAuth } from "../lib/auth-context";
import LoginScreen from "../screens/LoginScreen";
import { appFonts, colors } from "../theme";

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(appFonts);

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <SQLiteProvider databaseName="rusen-pos.db" onInit={migrateDbIfNeeded}>
        <AuthProvider>
          <Root />
        </AuthProvider>
      </SQLiteProvider>
    </SafeAreaProvider>
  );
}

function Root() {
  const { session, restoring } = useAuth();

  if (restoring) {
    return (
      <View style={styles.splash}>
        <StatusBar style="light" />
        <ActivityIndicator color={colors.neutral[0]} />
      </View>
    );
  }

  return (
    <>
      <StatusBar style={session ? "dark" : "light"} />
      {session ? <Slot /> : <LoginScreen />}
    </>
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.login.bg,
  },
});
```

Delete `mobile/App.tsx`.

- [ ] **Step 5: Create `mobile/app/index.tsx`**

```tsx
import AppShell from "../screens/AppShell";

export default function CashierTabs() {
  return <AppShell />;
}
```

- [ ] **Step 6: Typecheck and native rebuild**

```powershell
cd mobile
npm run typecheck
$env:JAVA_HOME="C:\Program Files\Android\Android Studio\jbr"
cd android
./gradlew.bat assembleRelease
adb install -r app/build/outputs/apk/release/app-release.apk
```

Expected: typecheck passes; app installs and boots to the same login/tab-shell UI as before (nothing user-visible has changed yet). Capture a screenshot with the `adb screencap` recipe in the root `AGENTS.md` to confirm.

- [ ] **Step 7: Commit**

```bash
git add mobile/package.json mobile/app.json mobile/app/_layout.tsx mobile/app/index.tsx
git rm mobile/index.ts mobile/App.tsx
git commit -m "mobile: install expo-router, move App.tsx into app/_layout.tsx"
```

---

### Task 2: Cart becomes a route — extract cart state into `CartProvider`

**Files:**
- Create: `mobile/lib/cart-context.tsx`
- Create: `mobile/app/cart.tsx`
- Modify: `mobile/screens/CashierScreen.tsx`
- Modify: `mobile/app/_layout.tsx` (wrap `Slot` with `CartProvider`)

**Interfaces:**
- Consumes: `DraftItem`, `draftLineKey`, `formatRupiah` from `../lib/types`; `createOrder`, `appendToOrder`, `checkTableCode` from `../db/orders`; `translateOrderError` from `../db/errors`; `pushPending` from `../db/push`; `useGateShift` from `../lib/shift-context`; `useAuth` from `../lib/auth-context`; `useToast` from `../components/Toast`.
- Produces: `mobile/lib/cart-context.tsx` exports `CartProvider` (wraps children) and `useCart()` returning:
  ```ts
  {
    items: DraftItem[];
    tableCode: string;
    orderKind: "meja" | "takeaway";
    saving: boolean;
    error: string;
    conflicts: TableConflict[] | null;
    total: number;
    itemCount: number;
    setTableCode: (v: string) => void;
    setOrderKind: (v: "meja" | "takeaway") => void;
    setError: (v: string) => void;
    addProduct: (productId: string, notes?: string) => void;
    updateQuantity: (lineKey: string, quantity: number) => void;
    removeItem: (lineKey: string) => void;
    resetCart: () => void;
    handleSave: () => Promise<void>;
    createNewOrder: () => Promise<void>;
    mergeIntoExisting: (conflict: TableConflict) => Promise<void>;
    setConflicts: (v: TableConflict[] | null) => void;
  }
  ```
  This is exactly `CashierScreen.tsx`'s existing state/handlers (lines 100-107, 190-396 today) moved verbatim into a context — same variable names, same logic, only the two `onSaved`/`testMode`/`onTestOrderCreated` props become context inputs supplied by `CartProvider`'s own props (see Step 2 below) so `CashierScreen` can still pass them through.

- [ ] **Step 1: Write `mobile/lib/cart-context.tsx`**

Move `CashierScreen.tsx`'s cart-related state and handlers verbatim:
- State: `items`, `tableCode`, `orderKind`, `saving`, `error`, `conflicts` (lines 100-105 in the current file). Drop `cartOpen` and `variantEntry` — those stay local to whichever screen renders the product grid / variant sheet (see Task 2 Step 3).
- Handlers: `addProduct`, `updateQuantity`, `removeItem`, `resetCart`, `toInput`, `handleSave`, `createNewOrder`, `mergeIntoExisting`, `showError` (lines 190-396 today) — move unchanged, including every comment. `addProduct` still needs `products` (the catalog) to look up price/name; accept `products: ProductRow[]` as a `CartProvider` prop, supplied by `CashierScreen` from its own catalog-loading `useEffect` (Task 2 Step 3) — do not duplicate the catalog fetch inside the context.
- `testMode`, `onTestOrderCreated`, `onSaved` also become `CartProvider` props, passed straight through into `createNewOrder`/`mergeIntoExisting` exactly as today.

```tsx
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { useSQLiteContext } from "expo-sqlite";

import { useToast } from "../components/Toast";
import { translateOrderError } from "../db/errors";
import { appendToOrder, checkTableCode, createOrder } from "../db/orders";
import { pushPending } from "../db/push";
import type { OrderItemInput, ProductRow, TableConflict } from "../db/types";
import { useAuth } from "./auth-context";
import { useGateShift } from "./shift-context";
import { draftLineKey, type DraftItem } from "./types";

interface CartProviderProps {
  children: ReactNode;
  products: ProductRow[];
  testMode: { reason: string } | null;
  onTestOrderCreated: () => void;
  onSaved: () => void;
}

interface CartValue {
  items: DraftItem[];
  tableCode: string;
  orderKind: "meja" | "takeaway";
  saving: boolean;
  error: string;
  conflicts: TableConflict[] | null;
  total: number;
  itemCount: number;
  setTableCode: (v: string) => void;
  setOrderKind: (v: "meja" | "takeaway") => void;
  setError: (v: string) => void;
  setConflicts: (v: TableConflict[] | null) => void;
  addProduct: (productId: string, notes?: string) => void;
  updateQuantity: (lineKey: string, quantity: number) => void;
  removeItem: (lineKey: string) => void;
  resetCart: () => void;
  handleSave: () => Promise<void>;
  createNewOrder: () => Promise<void>;
  mergeIntoExisting: (conflict: TableConflict) => Promise<void>;
}

const CartContext = createContext<CartValue | null>(null);

export function CartProvider({
  children,
  products,
  testMode,
  onTestOrderCreated,
  onSaved,
}: CartProviderProps) {
  const db = useSQLiteContext();
  const toast = useToast();
  const { session } = useAuth();
  const gateShift = useGateShift();

  const [tableCode, setTableCode] = useState("");
  const [orderKind, setOrderKind] = useState<"meja" | "takeaway">("meja");
  const [items, setItems] = useState<DraftItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [conflicts, setConflicts] = useState<TableConflict[] | null>(null);

  const total = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);

  const addProduct = useCallback(
    (productId: string, notes = "") => {
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
      setItems((current) => current.filter((item) => draftLineKey(item) !== lineKey));
      return;
    }
    setItems((current) =>
      current.map((item) => (draftLineKey(item) === lineKey ? { ...item, quantity } : item))
    );
  }, []);

  const removeItem = useCallback((lineKey: string) => {
    setItems((current) => current.filter((item) => draftLineKey(item) !== lineKey));
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

  const showError = useCallback((caught: unknown) => {
    const message = translateOrderError(caught);
    setError(message);
    setConflicts(null);
    toast.error(message);
  }, [toast]);

  const handleSave = useCallback(async () => {
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
        return;
      }
      await createNewOrder();
    } catch (caught) {
      showError(caught);
    } finally {
      setSaving(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, tableCode, items, gateShift, toast, showError]);

  const createNewOrder = useCallback(async () => {
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
      if (testMode) onTestOrderCreated();
      onSaved();
      void pushPending(db).then(onSaved).catch(() => {});
    } catch (caught) {
      showError(caught);
    } finally {
      setSaving(false);
    }
  }, [db, session, tableCode, toInput, testMode, onTestOrderCreated, onSaved, resetCart, toast, showError, gateShift]);

  const mergeIntoExisting = useCallback(
    async (conflict: TableConflict) => {
      if (!gateShift("menambah item ke order")) return;
      const label = tableCode.trim();
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
    },
    [db, tableCode, toInput, testMode, resetCart, onSaved, toast, showError, gateShift]
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
        setTableCode,
        setOrderKind,
        setError,
        setConflicts,
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
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
```

Note: `handleSave`'s `createNewOrder` reference needs `createNewOrder` declared before it in closure order, or referenced via a ref to avoid a circular `useCallback` dependency — declare `createNewOrder` first, then `handleSave`, matching the reordering above (already ordered correctly: `createNewOrder`/`mergeIntoExisting` before `handleSave` would be cleaner, but React allows forward reference here since `handleSave` only calls `createNewOrder` inside an async callback body executed after render, not during render — verify with `npm run typecheck`, and if TS complains about use-before-declaration, move `createNewOrder` above `handleSave`).

- [ ] **Step 2: Wrap the authenticated tree with `CartProvider` in `app/_layout.tsx`**

`CartProvider` needs `products` (the catalog) and the `testMode`/`onTestOrderCreated`/`onSaved` wiring that today lives in `AppShell`. Since `AppShell` already owns `testMode` state and `bumpOrders`, keep `CartProvider` mounted inside `app/index.tsx` (wrapping `<AppShell />`) rather than in the root layout — this matches today's ownership (`AppShell` owns `modeUji`) and avoids threading cart props through a layout that also renders the login screen.

Modify `mobile/app/index.tsx` from Task 1 Step 5 — but `AppShell` itself needs `products`, `testMode`, `onTestOrderCreated`, `onSaved` to hand to `CartProvider`. Simplest correct wiring: `CartProvider` mounts *inside* `AppShell.tsx`'s `Shell()`, wrapping the two tab `View`s, using the `modeUji`/`bumpOrders` state `Shell()` already owns, and a new `catalogProducts` state lifted from `CashierScreen` into `Shell()` (see Step 3) since both `CashierScreen` and the future `app/cart.tsx` need the same catalog list to resolve `addProduct`.

In `mobile/screens/AppShell.tsx`:
- Add `import { CartProvider } from "../lib/cart-context";` and `import { listProducts } from "../db/catalog";` and `import type { ProductRow } from "../db/types";`.
- Add state: `const [catalogProducts, setCatalogProducts] = useState<ProductRow[]>([]);`
- Add an effect that loads the catalog once (mirroring what `CashierScreen` did before, keyed on `refreshToken`):
  ```tsx
  useEffect(() => {
    void listProducts(db).then(setCatalogProducts);
  }, [db, refreshToken]);
  ```
- Wrap the two `<View style={[styles.content, ...]}>` blocks (current lines 326-347) in:
  ```tsx
  <CartProvider
    products={catalogProducts}
    testMode={modeUji}
    onTestOrderCreated={() => {
      setModeUji(null);
      toast.success("Mode uji dimatikan. Order berikutnya dihitung normal.");
    }}
    onSaved={() => {
      bumpOrders();
      setTab("orders");
    }}>
    {/* existing two <View> blocks unchanged */}
  </CartProvider>
  ```
  This is the exact same `onTestOrderCreated`/`onSaved` closures `CashierScreen` receives as props today (current `AppShell.tsx` lines 330-338) — moved up one level, unchanged in behavior.

- [ ] **Step 3: Simplify `CashierScreen.tsx` to consume `useCart()` instead of owning cart state**

Remove from `CashierScreen`: the `items`, `saving` (keep local `saving` only if still needed for grid `disabled` — it comes from `useCart().saving` now), `error`, `conflicts`, `tableCode`, `orderKind` state; the `addProduct`, `updateQuantity`, `removeItem`, `resetCart`, `toInput`, `handleSave`, `createNewOrder`, `mergeIntoExisting`, `showError` functions; the `total`/`itemCount` derivations; the `onSaved`/`testMode`/`onTestOrderCreated` props (now consumed by `CartProvider` in `AppShell`, not passed to `CashierScreen`).

Remove the catalog-loading `useEffect` (current lines 109-124) and `products`/`categories` fetch — `products` now comes from `AppShell`'s `catalogProducts` via a new prop; `categories` stays local (cart doesn't need it). Simplest: `CashierScreen` keeps its own `categories` state and effect, but receives `products: ProductRow[]` as a prop from `AppShell` instead of fetching it itself (`AppShell` already fetches it for `CartProvider`).

`CashierScreen`'s remaining responsibility: product grid, search, category chips, table-code/takeaway controls (these render `tableCode`/`orderKind`/`setTableCode`/`setOrderKind` from `useCart()`), the "Buka keranjang" bar, and `VariantSheet`. Replace `setCartOpen(true)` (current line 579) with `router.push("/cart")` (`import { useRouter } from "expo-router";`). Delete `cartOpen` state, the `<Sheet title="Keranjang" ...>` block (current lines 596-610), and the entire `wide` branch (current lines 612-650, including `wideCart*` styles) — cart is now always a route, so `CashierScreen` only ever renders the phone-style grid+bar layout. Delete the now-unused `useLayoutMode` import if nothing else in the file needs `phone`/`tablet` branching (category chips and controls still render the same on both — verify no other `phone` branch remains before deleting the import).

Selecting a product still calls `selectEntry` → `addProduct` from `useCart()`.

- [ ] **Step 4: Write `mobile/app/cart.tsx`**

This is the former `<Sheet title="Keranjang">` body from `CashierScreen.tsx` (current lines 500-522, 596-610), rendered as a full page instead. It reads everything from `useCart()`.

```tsx
import { useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import Button from "../components/Button";
import CartLines from "../components/CartLines";
import TableConflictDialog from "../components/TableConflictDialog";
import { useCart } from "../lib/cart-context";
import { formatRupiah } from "../lib/types";
import { colors, radius, semantic, spacing, textStyles, touchTarget } from "../theme";

export default function CartScreen() {
  const router = useRouter();
  const {
    items,
    total,
    itemCount,
    saving,
    error,
    conflicts,
    updateQuantity,
    removeItem,
    handleSave,
    createNewOrder,
    mergeIntoExisting,
    setConflicts,
  } = useCart();

  return (
    <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <Text style={styles.title}>Keranjang</Text>
        <Text style={styles.subtitle}>
          {itemCount} item · {formatRupiah(total)}
        </Text>
        <Button label="Kembali" onPress={() => router.back()} style={styles.backButton} />
      </View>

      <View style={styles.body}>
        <CartLines items={items} disabled={saving} onUpdateQuantity={updateQuantity} onRemove={removeItem} />
      </View>

      <View style={styles.footer}>
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        <Button
          label="Simpan Order"
          loadingLabel="Menyimpan…"
          variant="primary"
          loading={saving}
          disabled={items.length === 0}
          onPress={() => void handleSave()}
        />
      </View>

      {conflicts ? (
        <TableConflictDialog
          tableCode={items[0] ? "" : ""}
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
  screen: { flex: 1, backgroundColor: semantic.surfaceMuted },
  header: {
    gap: spacing.xs,
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: semantic.border,
    backgroundColor: semantic.surface,
  },
  title: { ...textStyles.screenTitle, color: semantic.textPrimary },
  subtitle: { ...textStyles.body, color: semantic.textSecondary },
  backButton: { alignSelf: "flex-start", marginTop: spacing.xs },
  body: { flex: 1 },
  footer: {
    gap: spacing.sm,
    padding: spacing.md,
    borderTopWidth: 1,
    borderTopColor: semantic.border,
    backgroundColor: semantic.surface,
  },
  errorText: { ...textStyles.caption, color: colors.status.void },
});
```

`TableConflictDialog`'s `tableCode` prop needs the actual code, not `""` — pull `tableCode` out of `useCart()` too (it's already in the context value) and pass it directly: `tableCode={tableCode}`. Fix the destructuring above to include `tableCode`.

- [ ] **Step 5: Typecheck, run periksa:varian, verify on device**

```powershell
cd mobile
npm run typecheck
npm run periksa:varian
```

Both must pass unchanged (cart grouping logic untouched). Rebuild native (`gradlew assembleRelease` + `adb install -r`, `JAVA_HOME` set) and manually verify: add items on the product grid → tap "Buka keranjang" → lands on full-page `/cart` → adjust quantity → back button returns to product grid with cart state intact → Simpan Order still creates the order and returns to the Order tab.

- [ ] **Step 6: Commit**

```bash
git add mobile/lib/cart-context.tsx mobile/app/cart.tsx mobile/screens/CashierScreen.tsx mobile/screens/AppShell.tsx
git commit -m "mobile: extract cart state to CartProvider, cart becomes a full-page route"
```

---

### Task 3: "Tambah item" becomes a route

**Files:**
- Create: `mobile/app/edit-order/add.tsx`
- Modify: `mobile/screens/EditOrderScreen.tsx`

**Interfaces:**
- Consumes: nothing new — `appendToOrder`, `getOrder`, `useGateShift`, all as `EditOrderScreen.tsx` already does.
- Produces: `app/edit-order/add.tsx` accepts `orderId` via route param (`useLocalSearchParams<{ orderId: string }>()`), and pushes back with `router.back()`.

Since `EditOrderScreen` itself is still a manually-managed overlay (owned by `AppShell`'s `editingId` state, not a route — out of scope per the approved design, which isolates the router migration to the four sheets + Pengaturan and does not touch `AppShell`'s overlay pattern for `EditOrderScreen`/`DebugScreen`), the add-item page needs the order id and a way back. Pass `orderId` as a route param when pushing, and have the add-item page call `router.back()` when done — `EditOrderScreen` re-reads the order via `getOrder(db, orderId)` on focus (expo-router re-runs effects on screen focus by default only if the component remounts; since `EditOrderScreen` stays mounted underneath as an `AppShell` overlay, it does **not** automatically reload when `/edit-order/add` pops — add an explicit `reload()` call `EditOrderScreen`'s parent triggers, see Step 3).

- [ ] **Step 1: Move the add-item state and handlers out of `EditOrderScreen.tsx`, keep them there**

Unlike cart, the add-item logic (`adding`, `search`, `busyRef`, `handleAdd`, `selectEntry`, `variantEntry`) doesn't need to survive navigating away and back — `EditOrderScreen` stays mounted the whole time (it's the screen underneath). So no context extraction is needed here: `EditOrderScreen` keeps `busyRef`, `handleAdd`, and `order`/`reload` exactly as they are (current lines 64-147), but stops rendering its own `<Sheet title="Tambah item">` (current lines 345-379) and instead navigates.

Replace the "Tambah item" button's `onPress` (current line 334, `onPress={() => setAdding(true)}`) with:

```tsx
onPress={() =>
  router.push({ pathname: "/edit-order/add", params: { orderId } })
}
```

Add `import { useRouter } from "expo-router";` and `const router = useRouter();` near the top of `EditOrderScreen`.

Delete the `adding` state (line 64) and the `<Sheet title="Tambah item">` block (lines 345-379). Delete the `search`/`setSearch` state from `EditOrderScreen` too — it moves to the new route (Step 2) since search-clears-on-exit only makes sense scoped to the page that owns the search box.

`selectEntry`'s "close `adding`, open `VariantSheet`, reopen `adding`" dance (current lines 132-147) simplifies: `EditOrderScreen` no longer renders `adding`/`VariantSheet` at all — both move to the new route (Step 2), since the whole point of the migration is that a route and a `Modal` don't compete for z-order, so the coordination is unnecessary there too. Delete `variantEntry` state and the `<VariantSheet>` block (current lines 474-487) from `EditOrderScreen`.

`handleAdd`, `busyRef`, and `run`/`reload` stay in `EditOrderScreen` (Step 3 below explains how the new route calls them).

- [ ] **Step 2: Write `mobile/app/edit-order/add.tsx`**

This owns `search` and `variantEntry` locally (they don't need to survive navigation away from this page — search clears on exit is exactly "unmount clears it", which a route gives for free). It needs `handleAdd` and `order` from `EditOrderScreen` — since `EditOrderScreen` isn't a route, the cleanest interface is a **second small context**, scoped just to this pair of screens, rather than threading `orderId` and re-fetching everything independently (which would duplicate `order`, `busyRef`, and the version-guard logic — exactly the kind of drift `AGENTS.md` warns about for `orders.total`/tax duplication).

Add to `mobile/screens/EditOrderScreen.tsx`: export a small context alongside the component.

```tsx
// near the top of EditOrderScreen.tsx, alongside the existing imports
import { createContext, useContext } from "react";
```

```tsx
// after the EditOrderScreenProps interface
interface AddItemContextValue {
  order: (OrderRow & { items: OrderItemRow[] }) | null;
  products: ProductRow[];
  handleAdd: (productId: string, notes?: string) => void;
}
const AddItemContext = createContext<AddItemContextValue | null>(null);
export function useAddItemContext(): AddItemContextValue {
  const ctx = useContext(AddItemContext);
  if (!ctx) throw new Error("useAddItemContext must be used within EditOrderScreen");
  return ctx;
}
```

Wrap `EditOrderScreen`'s returned JSX (the outer `<View style={styles.screen}>`, current line 244) with:

```tsx
<AddItemContext.Provider value={{ order, products, handleAdd }}>
  <View style={styles.screen}>
    {/* ...unchanged body... */}
  </View>
</AddItemContext.Provider>
```

Now `app/edit-order/add.tsx`:

```tsx
import { useCallback, useState } from "react";
import { useRouter } from "expo-router";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import Button from "../../components/Button";
import ProductGrid from "../../components/ProductGrid";
import VariantSheet from "../../components/VariantSheet";
import type { ProductEntry } from "../../lib/product-variants";
import { formatRupiah, tableLabel } from "../../lib/types";
import { useAddItemContext } from "../../screens/EditOrderScreen";
import { colors, radius, semantic, spacing, textStyles, touchTarget } from "../../theme";

export default function AddItemScreen() {
  const router = useRouter();
  const { order, products, handleAdd } = useAddItemContext();
  const [search, setSearch] = useState("");
  const [variantEntry, setVariantEntry] = useState<ProductEntry | null>(null);

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

  if (!order) {
    return (
      <SafeAreaView style={styles.screen}>
        <Text style={styles.empty}>Order tidak ditemukan.</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <Text style={styles.title}>Tambah item</Text>
        <Text style={styles.subtitle}>
          {tableLabel(order.table_code, order.table_seq)} · {order.items.length} item ·{" "}
          {formatRupiah(order.total)}
        </Text>
        <Button label="Kembali" onPress={() => router.back()} style={styles.backButton} />
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
  screen: { flex: 1, backgroundColor: semantic.surfaceMuted },
  header: {
    gap: spacing.xs,
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: semantic.border,
    backgroundColor: semantic.surface,
  },
  title: { ...textStyles.screenTitle, color: semantic.textPrimary },
  subtitle: { ...textStyles.body, color: semantic.textSecondary },
  backButton: { alignSelf: "flex-start", marginTop: spacing.xs },
  empty: { ...textStyles.body, padding: spacing.lg, textAlign: "center", color: semantic.textSecondary },
  searchWrap: { padding: spacing.md },
  gridWrap: { flex: 1 },
  input: {
    ...textStyles.bodyStrong,
    minHeight: touchTarget.comfortable,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: semantic.border,
    color: semantic.textPrimary,
  },
});
```

Note the file exports a **default** `AddItemScreen` (required by expo-router for route files) while `EditOrderScreen.tsx` exports both its existing `default EditOrderScreen` and the new named `useAddItemContext` — that's fine, expo-router only picks up the default export of files under `app/`.

- [ ] **Step 3: Verify "does not auto-close" and "search clears only on exit" still hold**

These two previously-fixed behaviors (mentioned explicitly in the task brief) now fall out of the architecture rather than needing code: the add-item page never closes itself (only `router.back()` on the header button closes it, exactly mirroring the old `onClose` which was also only wired to the sheet's × button — `handleAdd` never calls `router.back()`); search clears "on exit" for free because `search` is `useState` local to a route that unmounts on `router.back()`.

`EditOrderScreen`'s header/list re-renders live because `order` (in `AddItemContext`) is the same state object `EditOrderScreen` already re-fetches via `reload()` inside `run()` after every `handleAdd` — no additional wiring needed; the underlying screen was never unmounted so its state (including the freshly-reloaded `order`) is exactly what `AddItemContext.Provider value={{ order, ... }}` hands to the still-mounted `app/edit-order/add.tsx` on every render.

- [ ] **Step 4: Typecheck and verify on device**

```powershell
cd mobile
npm run typecheck
```

Native rebuild, then manually verify: open an order to edit → Tambah item → full page opens → add several items without the page closing → header total updates after each add → pick a multi-variant product → `VariantSheet` opens over the add-item page (not competing with any `Modal`) → pick a variant → item added, page still open → back → returns to `EditOrderScreen` with search cleared on next open → `busyRef` guard: rapidly tap the same product twice, confirm only one item is added (no `STALE_ORDER` toast).

- [ ] **Step 5: Commit**

```bash
git add mobile/screens/EditOrderScreen.tsx mobile/app/edit-order/add.tsx
git commit -m "mobile: Tambah item becomes a full-page route"
```

---

### Task 4: Payment ("Pelunasan") becomes a route

**Files:**
- Create: `mobile/app/pay.tsx`
- Modify: `mobile/screens/OrdersScreen.tsx`
- Delete: `mobile/components/PaymentSheet.tsx` (contents move into `app/pay.tsx`)

**Interfaces:**
- Consumes: `payOrder`, `getOrder` from `../db/orders`; `taxRateBps` from `../db/catalog`; `hitungPbjt`, `labelPbjt` from `../lib/tax`; `printOrder`, `translatePrinterError` from `../lib/printer`.
- Produces: `app/pay.tsx` takes `orderId` as a route param, loads the order itself via `getOrder`, and owns `submitting`/`payError`/print-trigger — this is different from Task 3's approach because `OrdersScreen` (unlike `EditOrderScreen`) is *not* kept mounted underneath in a way that's convenient to share via context: `paying` today is just one row out of `OrdersScreen`'s already-loaded list, and `app/pay.tsx` can independently `getOrder(db, orderId)` the same way `EditOrderScreen` already does, rather than adding a second cross-screen context. This keeps the interface simpler: `OrdersScreen` only needs to pass `orderId` and refresh its own list when it regains focus.

- [ ] **Step 1: `OrdersScreen.tsx` — replace `paying` state with navigation**

Delete `paying` state (line 95) and the `<PaymentSheet>` block (current lines 630-641). Find the button that calls `setPaying(order)` (around line 585, inside the pending-order actions) and the `rateBps`/`TAX_RATE_UNKNOWN` guard immediately above it (lines 576-585) — keep that guard (still needed before navigating: don't send the cashier to a payment page that can't compute tax), but replace `setPaying(order)` with:

```tsx
router.push({ pathname: "/pay", params: { orderId: order.id } });
```

Add `import { useRouter } from "expo-router";` and `const router = useRouter();` near the top of `OrdersScreen`.

Delete `handlePay`, `submitting`, `payError` from `OrdersScreen` — they move into `app/pay.tsx` (Step 2). `runPrint` and `printingRef`/`printingId` **stay** in `OrdersScreen` (they're also used by the "Cetak Struk" button on paid orders, current line 620) — `app/pay.tsx` needs its own print trigger since it's a different mounted component; see Step 2, it duplicates the `printOrder` call with the same "read fresh from SQLite, don't await, don't block the payment screen" shape as `runPrint`, because sharing `OrdersScreen`'s `printingRef` across a route boundary would require the same kind of context Task 3 used, and here there's no reason to: the two print sites (auto-print-after-pay, manual re-print from the list) don't need to share a busy-flag, since a cashier can't be on both screens paying and re-printing simultaneously — `printingRef.current` guards concurrent taps on one screen, not cross-screen races.

`OrdersScreen` needs to refresh its order list when the user backs out of `/pay` (whether they paid or cancelled) — expo-router re-focuses `OrdersScreen` automatically since it's a still-mounted `AppShell` tab (not itself a route), so **no explicit refresh wiring is needed**: `OrdersScreen`'s existing `refresh()` is already called on mount/`refreshToken` change, but paying doesn't change `refreshToken`. Add a `useFocusEffect` (from `expo-router` re-exporting `@react-navigation/native`'s hook, or import directly from `@react-navigation/native` if `expo-router` doesn't re-export it — check `npx expo install @react-navigation/native` isn't already pulled in as a transitive dep of `expo-router`; if the import `import { useFocusEffect } from "expo-router";` fails to typecheck, use `import { useFocusEffect } from "@react-navigation/native";` instead) that calls `refresh()`:

```tsx
useFocusEffect(
  useCallback(() => {
    void refresh();
  }, [refresh])
);
```

Place this near `OrdersScreen`'s existing `refresh` definition/effects.

- [ ] **Step 2: Write `mobile/app/pay.tsx`**, folding in `PaymentSheet.tsx`'s body and `OrdersScreen`'s `handlePay`/print-trigger

```tsx
import { useCallback, useEffect, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSQLiteContext } from "expo-sqlite";

import Button from "../components/Button";
import { useToast } from "../components/Toast";
import { taxRateBps as fetchTaxRateBps } from "../db/catalog";
import { translateOrderError } from "../db/errors";
import { getOrder, payOrder } from "../db/orders";
import type { OrderItemRow, OrderRow } from "../db/types";
import { useAuth } from "../lib/auth-context";
import { printOrder, translatePrinterError } from "../lib/printer";
import { useGateShift } from "../lib/shift-context";
import { hitungPbjt, labelPbjt } from "../lib/tax";
import {
  formatRupiah,
  tableLabel,
  type PaymentMethod,
  type TaxStatus,
} from "../lib/types";
import { colors, radius, semantic, spacing, textStyles, touchTarget } from "../theme";

export default function PayScreen() {
  const router = useRouter();
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const db = useSQLiteContext();
  const toast = useToast();
  const { session } = useAuth();
  const gateShift = useGateShift();

  const [order, setOrder] = useState<(OrderRow & { items: OrderItemRow[] }) | null>(null);
  const [rateBps, setRateBps] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [payError, setPayError] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [taxStatus, setTaxStatus] = useState<TaxStatus>("taxable");
  const [exemptReason, setExemptReason] = useState("");
  const [amountInput, setAmountInput] = useState("");

  useEffect(() => {
    void getOrder(db, orderId).then(setOrder);
    void fetchTaxRateBps(db).then(setRateBps);
  }, [db, orderId]);

  const handlePay = useCallback(async () => {
    if (!gateShift("melunasi order")) return;
    if (!order || !session) return;
    setSubmitting(true);
    setPayError("");
    try {
      await payOrder(db, {
        orderId: order.id,
        method,
        amountReceived: method === "cash" ? amountReceived : null,
        employeeId: session.employeeId,
        taxStatus,
        taxExemptReason: taxStatus === "exempt" ? exemptReason : null,
      });
      toast.success(`Order ${tableLabel(order.table_code, order.table_seq)} lunas`);
      const paidId = order.id;
      router.back();
      // Cetak otomatis, tidak menunggu: menyambung Bluetooth bisa beberapa
      // detik dan layar ini sudah ditutup (router.back di atas) — cocokkan
      // dengan perilaku lama di OrdersScreen.handlePay.
      void (async () => {
        try {
          const fresh = await getOrder(db, paidId);
          if (!fresh) return;
          await printOrder(db, fresh, fresh.items);
        } catch (caught) {
          toast.error(translatePrinterError(caught));
        }
      })();
    } catch (caught) {
      const message = translateOrderError(caught);
      setPayError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, order, session, method, taxStatus, exemptReason, gateShift, toast, router]);

  if (!order || rateBps === null) {
    return (
      <View style={styles.screen}>
        <Text style={styles.empty}>Memuat order…</Text>
      </View>
    );
  }

  const subtotal = order.subtotal;
  const tax = taxStatus === "exempt" ? 0 : hitungPbjt(order.taxable_subtotal, rateBps);
  const tagihan = subtotal + tax;
  const hasAmount = amountInput !== "";
  const amountReceived = hasAmount ? Number(amountInput) : 0;
  const change = amountReceived - tagihan;
  const cashReady = method === "cash" ? hasAmount && amountReceived >= tagihan : true;
  const reasonReady = taxStatus === "taxable" || exemptReason.trim() !== "";
  const ready = cashReady && reasonReady;
  const tone = !hasAmount ? "neutral" : change >= 0 ? "ok" : "short";

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.title}>Pelunasan Order</Text>
        <Text style={styles.subtitle}>
          Meja/Order: {tableLabel(order.table_code, order.table_seq)}
        </Text>
        <Button label="Kembali" onPress={() => router.back()} style={styles.backButton} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View>
          <Text style={styles.fieldLabel}>Status Pajak</Text>
          <View style={styles.methodRow}>
            {(
              [
                ["taxable", "Kena Pajak"],
                ["exempt", "Bebas Pajak"],
              ] as const
            ).map(([option, label]) => (
              <Button
                key={option}
                label={label}
                style={[styles.methodButton, taxStatus === option && styles.taxActive]}
                onPress={() => {
                  setTaxStatus(option);
                  if (option === "taxable") setExemptReason("");
                }}
              />
            ))}
          </View>
        </View>

        {taxStatus === "exempt" ? (
          <View>
            <Text style={styles.fieldLabel}>Keterangan Bebas Pajak</Text>
            <TextInput
              value={exemptReason}
              onChangeText={setExemptReason}
              placeholder="Nama instansi atau alasannya"
              placeholderTextColor={semantic.textSecondary}
              style={styles.input}
              editable={!submitting}
            />
            <Text style={styles.hint}>
              Wajib diisi. Tercatat atas nama Anda sebagai yang menyetujui.
            </Text>
          </View>
        ) : null}

        <View style={styles.totalBox}>
          {taxStatus === "taxable" ? (
            <View style={styles.breakdown}>
              <View style={styles.breakdownRow}>
                <Text style={styles.breakdownLabel}>Subtotal</Text>
                <Text style={styles.breakdownValue}>{formatRupiah(subtotal)}</Text>
              </View>
              <View style={styles.breakdownRow}>
                <Text style={styles.breakdownLabel}>{labelPbjt(rateBps)}</Text>
                <Text style={styles.breakdownValue}>{formatRupiah(tax)}</Text>
              </View>
            </View>
          ) : null}
          <Text style={styles.boxLabel}>Total Tagihan</Text>
          <Text style={styles.total}>{formatRupiah(tagihan)}</Text>
        </View>

        <View>
          <Text style={styles.fieldLabel}>Metode Pembayaran</Text>
          <View style={styles.methodRow}>
            {(["cash", "non_cash"] as const).map((option) => (
              <Button
                key={option}
                label={option === "cash" ? "Cash" : "Non Cash"}
                style={[styles.methodButton, method === option && styles.methodActive]}
                onPress={() => {
                  setMethod(option);
                  if (option === "non_cash") setAmountInput("");
                }}
              />
            ))}
          </View>
        </View>

        {method === "cash" ? (
          <View style={styles.cashBlock}>
            <Text style={styles.fieldLabel}>Nominal Diterima</Text>
            <TextInput
              value={amountInput}
              onChangeText={(text) => setAmountInput(text.replace(/[^0-9]/g, ""))}
              keyboardType="number-pad"
              placeholder="0"
              placeholderTextColor={semantic.textSecondary}
              style={styles.input}
              editable={!submitting}
            />
            <View style={[styles.changeBox, styles[`${tone}Box`]]}>
              <Text style={styles.boxLabel}>{tone === "short" ? "Kurang" : "Kembalian"}</Text>
              <Text style={[styles.change, styles[`${tone}Text`]]}>
                {!hasAmount ? "-" : change < 0 ? `− ${formatRupiah(-change)}` : formatRupiah(change)}
              </Text>
            </View>
          </View>
        ) : null}

        {payError ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText} accessibilityRole="alert">
              {payError}
            </Text>
          </View>
        ) : null}
      </ScrollView>

      <View style={styles.footer}>
        <Button
          label="Konfirmasi Lunas"
          loadingLabel="Memproses…"
          variant="primary"
          loading={submitting}
          disabled={!ready}
          onPress={() => void handlePay()}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: semantic.surfaceMuted },
  header: {
    gap: spacing.xs,
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: semantic.border,
    backgroundColor: semantic.surface,
  },
  title: { ...textStyles.screenTitle, color: semantic.textPrimary },
  subtitle: { ...textStyles.body, color: semantic.textSecondary },
  backButton: { alignSelf: "flex-start", marginTop: spacing.xs },
  empty: { ...textStyles.body, padding: spacing.lg, textAlign: "center", color: semantic.textSecondary },
  content: { padding: spacing.lg, gap: spacing.lg },
  footer: {
    padding: spacing.md,
    borderTopWidth: 1,
    borderTopColor: semantic.border,
    backgroundColor: semantic.surface,
  },
  totalBox: {
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: semantic.border,
    backgroundColor: semantic.surfaceMuted,
  },
  boxLabel: { ...textStyles.caption, color: semantic.textSecondary },
  total: { ...textStyles.grandTotal, color: semantic.textPrimary },
  fieldLabel: { ...textStyles.bodyStrong, marginBottom: spacing.sm, color: semantic.textPrimary },
  methodRow: { flexDirection: "row", gap: spacing.md },
  methodButton: { flex: 1 },
  methodActive: { borderColor: colors.primary[600], backgroundColor: colors.primary[50] },
  taxActive: { borderColor: semantic.sidebarActive, backgroundColor: semantic.surfaceMuted },
  breakdown: {
    gap: spacing.xs,
    marginBottom: spacing.sm,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: semantic.border,
  },
  breakdownRow: { flexDirection: "row", justifyContent: "space-between" },
  breakdownLabel: { ...textStyles.body, color: semantic.textSecondary },
  breakdownValue: { ...textStyles.bodyStrong, color: semantic.textPrimary },
  hint: { ...textStyles.caption, marginTop: spacing.xs, color: semantic.textSecondary },
  cashBlock: { gap: spacing.md },
  input: {
    ...textStyles.actionButton,
    minHeight: touchTarget.comfortable,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: semantic.border,
    color: semantic.textPrimary,
  },
  changeBox: { padding: spacing.md, borderRadius: radius.md, borderWidth: 2 },
  change: { ...textStyles.screenTitle },
  neutralBox: { borderColor: semantic.border, backgroundColor: semantic.surfaceMuted },
  neutralText: { color: semantic.textSecondary },
  okBox: { borderColor: colors.status.paid, backgroundColor: colors.status.paidLight },
  okText: { color: colors.status.paid },
  shortBox: { borderColor: colors.status.void, backgroundColor: colors.status.voidLight },
  shortText: { color: colors.status.void },
  errorBox: {
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.status.void,
    backgroundColor: colors.status.voidLight,
  },
  errorText: { ...textStyles.caption, textAlign: "center", color: colors.status.void },
});
```

- [ ] **Step 3: Add the back-navigation-while-submitting guard**

Per the design doc, a cashier hitting hardware/gesture back mid-submit shouldn't be able to leave with an ambiguous state. Since `payOrder` is a single awaited call and `submitting` is already `true` for its whole duration, block navigation with expo-router's `useNavigation().addListener("beforeRemove", ...)`:

```tsx
import { useNavigation } from "expo-router";
// inside PayScreen, after `submitting` is declared:
const navigation = useNavigation();
useEffect(() => {
  const unsubscribe = navigation.addListener("beforeRemove", (e) => {
    if (!submitting) return;
    e.preventDefault();
  });
  return unsubscribe;
}, [navigation, submitting]);
```

This blocks back navigation only while `submitting` is `true` (the single await inside `handlePay`) — once `payOrder` resolves or rejects, `submitting` flips to `false` in the `finally` block and back navigation works normally again. No new state, no new order-status ambiguity: the order is either still `pending` (request failed/pending) or `paid` (succeeded, and `handlePay` already calls `router.back()` itself in that case, before the listener would ever block it).

- [ ] **Step 4: Delete `mobile/components/PaymentSheet.tsx`**

```bash
git rm mobile/components/PaymentSheet.tsx
```

- [ ] **Step 5: Typecheck and verify on device**

```powershell
cd mobile
npm run typecheck
```

Native rebuild, then manually verify: Order tab → tap pay on a pending order → full-page pelunasan opens → change calculation and cash-sufficiency validation match old behavior → Bebas Pajak requires a reason before "Konfirmasi Lunas" enables → confirm → page closes, order shows paid, print fires automatically (check the printer or the toast/log) → mid-submit, try hardware back (only feasible to check by inspecting `submitting` timing manually, since a real payOrder call is usually too fast to interrupt — note in MIGRATION.md if this can't be verified live and rely on code review of the `beforeRemove` listener instead).

- [ ] **Step 6: Commit**

```bash
git add mobile/app/pay.tsx mobile/screens/OrdersScreen.tsx
git commit -m "mobile: Pelunasan becomes a full-page route"
```

---

### Task 5: Kas Masuk/Keluar becomes a route

**Files:**
- Create: `mobile/app/kas.tsx`
- Modify: `mobile/screens/AppShell.tsx`
- Delete: `mobile/components/KasSheet.tsx` (contents move into `app/kas.tsx`)

**Interfaces:**
- Consumes: `cashTotals`, `recordCashMovement`, `shiftCashMovements`, `voidCashMovement`, `CashMovement`, `CashTotals` from `../db/cash`; `useShift`, `useGateShift` from `../lib/shift-context`; `useAuth`.
- Produces: `app/kas.tsx` is self-contained — it loads its own `entries`/`totals` from `shift` (via `useShift()`), rather than receiving them as props from `AppShell`, since `AppShell` no longer needs to own this state once it's not rendering the sheet itself.

- [ ] **Step 1: Remove `kasOpen`/`kasEntries`/`kasTotals`/`savingKas` and their handlers from `AppShell.tsx`**

Delete state (current lines 107-110), `muatKas` (142-149), `openKas` (184-198), `simpanKas` (200-226), `batalkanKas` (228-238), and the `<KasSheet>` render block (current lines 473-483).

Replace the "Kas Masuk Keluar" button's `onPress` (current lines 380-383):

```tsx
<Button
  label="Kas Masuk Keluar"
  onPress={() => {
    setMenuOpen(false);
    router.push("/kas");
  }}
/>
```

Add `import { useRouter } from "expo-router";` and `const router = useRouter();` to `Shell()`.

- [ ] **Step 2: Write `mobile/app/kas.tsx`**, folding in `KasSheet.tsx`'s body plus the loading/save/void logic `AppShell` used to own

```tsx
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "expo-router";
import { ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSQLiteContext } from "expo-sqlite";

import Button from "../components/Button";
import ShiftBanner from "../components/ShiftBanner";
import { useToast } from "../components/Toast";
import {
  cashTotals,
  recordCashMovement,
  shiftCashMovements,
  voidCashMovement,
  type CashDirection,
  type CashMethod,
  type CashMovement,
  type CashTotals,
} from "../db/cash";
import { useAuth } from "../lib/auth-context";
import { useGateShift, useShift } from "../lib/shift-context";
import { formatRupiah } from "../lib/types";
import { colors, radius, semantic, spacing, textStyles, touchTarget } from "../theme";

export default function KasScreen() {
  const router = useRouter();
  const db = useSQLiteContext();
  const toast = useToast();
  const { session } = useAuth();
  const { shift, aktif } = useShift();
  const gateShift = useGateShift();
  const readOnly = !aktif;

  const [entries, setEntries] = useState<CashMovement[]>([]);
  const [totals, setTotals] = useState<CashTotals | null>(null);
  const [saving, setSaving] = useState(false);
  const [direction, setDirection] = useState<CashDirection>("out");
  const [method, setMethod] = useState<CashMethod>("cash");
  const [nominalText, setNominalText] = useState("");
  const [note, setNote] = useState("");
  const [konfirmasi, setKonfirmasi] = useState<CashMovement | null>(null);

  const muatKas = useCallback(async () => {
    if (!shift) {
      setEntries([]);
      setTotals({ masukTunai: 0, masukNonTunai: 0, keluarTunai: 0, keluarNonTunai: 0 });
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
  const bolehSimpan = !readOnly && amount > 0 && note.trim().length > 0;

  const simpan = async () => {
    if (!gateShift("mencatat kas")) return;
    if (!shift || !session) return;
    setSaving(true);
    try {
      await recordCashMovement(db, {
        shiftId: shift.id,
        direction,
        method,
        amount,
        note,
        employeeId: session.employeeId,
        employeeName: session.name,
      });
      await muatKas();
      setNominalText("");
      setNote("");
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSaving(false);
    }
  };

  const batalkan = async (id: string) => {
    if (!gateShift("membatalkan entri kas")) return;
    if (!shift) return;
    setSaving(true);
    try {
      await voidCashMovement(db, id);
      await muatKas();
    } finally {
      setSaving(false);
    }
  };

  if (!totals) return null;

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.title}>Kas Masuk / Keluar</Text>
        <Text style={styles.subtitle}>Uang laci yang bukan penjualan</Text>
        <Button label="Kembali" onPress={() => router.back()} style={styles.backButton} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {readOnly ? <ShiftBanner /> : null}
        <View style={styles.totalBox}>
          <Row label="Masuk Tunai" value={formatRupiah(totals.masukTunai)} />
          <Row label="Masuk Non Tunai" value={formatRupiah(totals.masukNonTunai)} />
          <Row label="Keluar Tunai" value={formatRupiah(totals.keluarTunai)} />
          <Row label="Keluar Non Tunai" value={formatRupiah(totals.keluarNonTunai)} />
        </View>

        <View>
          <Text style={styles.fieldLabel}>Arah</Text>
          <View style={styles.choices}>
            <Button label="Masuk" onPress={() => setDirection("in")} style={[styles.choice, direction === "in" && styles.choiceActive]} />
            <Button label="Keluar" onPress={() => setDirection("out")} style={[styles.choice, direction === "out" && styles.choiceActive]} />
          </View>
        </View>

        <View>
          <Text style={styles.fieldLabel}>Metode</Text>
          <View style={styles.choices}>
            <Button label="Tunai" onPress={() => setMethod("cash")} style={[styles.choice, method === "cash" && styles.choiceActive]} />
            <Button label="Non Tunai" onPress={() => setMethod("non_cash")} style={[styles.choice, method === "non_cash" && styles.choiceActive]} />
          </View>
          {method === "non_cash" ? (
            <Text style={styles.hint}>
              Entri non tunai tercetak sebagai catatan; uangnya tidak lewat laci, jadi ia tidak mengubah Kas Seharusnya.
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
            [...entries].reverse().map((entry) => (
              <View key={entry.id} style={styles.entry}>
                <View style={styles.entryText}>
                  <Text style={styles.entryNote}>{entry.note}</Text>
                  <Text style={styles.entryMeta}>
                    {entry.direction === "in" ? "Masuk" : "Keluar"} · {entry.method === "cash" ? "Tunai" : "Non Tunai"}
                  </Text>
                </View>
                <View style={styles.entryRight}>
                  <Text style={[styles.entryAmount, entry.direction === "in" ? styles.entryAmountMasuk : styles.entryAmountKeluar]}>
                    {formatRupiah(entry.amount)}
                  </Text>
                  <Button label="Batalkan" onPress={() => setKonfirmasi(entry)} disabled={saving || readOnly} style={styles.entryAction} />
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Button label="Simpan" variant="primary" loading={saving} loadingLabel="Menyimpan…" disabled={!bolehSimpan} onPress={() => void simpan()} />
      </View>

      {konfirmasi ? (
        <View style={styles.confirmOverlay}>
          <View style={styles.confirmCard}>
            <Text style={styles.konfirmasiBody}>
              {konfirmasi.direction === "in" ? "Kas masuk" : "Kas keluar"} {konfirmasi.method === "cash" ? "tunai" : "non tunai"} sebesar{" "}
              {formatRupiah(konfirmasi.amount)} tidak akan lagi ikut dihitung dan tidak tercetak di Tutup Kasir. Barisnya tetap tersimpan di ponsel ini
              sebagai jejak, jadi pembatalan bukan penghapusan.
            </Text>
            <Button
              label={`Batalkan ${formatRupiah(konfirmasi.amount)}`}
              variant="danger"
              disabled={saving}
              onPress={() => {
                void batalkan(konfirmasi.id);
                setKonfirmasi(null);
              }}
            />
            <Button label="Kembali" disabled={saving} onPress={() => setKonfirmasi(null)} />
          </View>
        </View>
      ) : null}
    </View>
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
  screen: { flex: 1, backgroundColor: semantic.surfaceMuted },
  header: {
    gap: spacing.xs,
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: semantic.border,
    backgroundColor: semantic.surface,
  },
  title: { ...textStyles.screenTitle, color: semantic.textPrimary },
  subtitle: { ...textStyles.body, color: semantic.textSecondary },
  backButton: { alignSelf: "flex-start", marginTop: spacing.xs },
  content: { padding: spacing.lg, gap: spacing.md },
  footer: { padding: spacing.md, borderTopWidth: 1, borderTopColor: semantic.border, backgroundColor: semantic.surface },
  totalBox: { padding: spacing.md, borderRadius: radius.md, backgroundColor: semantic.surfaceMuted, gap: spacing.xs },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  label: { ...textStyles.body, color: semantic.textSecondary },
  value: { ...textStyles.bodyStrong, color: semantic.textPrimary },
  fieldLabel: { ...textStyles.bodyStrong, color: semantic.textPrimary },
  hint: { ...textStyles.caption, marginTop: spacing.xs, color: semantic.textSecondary },
  choices: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.xs },
  choice: { flex: 1 },
  choiceActive: { borderColor: semantic.sidebarActive, backgroundColor: semantic.surfaceMuted },
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
  },
  entryText: { flex: 1 },
  entryNote: { ...textStyles.bodyStrong, color: semantic.textPrimary },
  entryMeta: { ...textStyles.caption, color: semantic.textSecondary },
  entryRight: { alignItems: "flex-end", gap: spacing.xs },
  entryAmount: { ...textStyles.bodyStrong },
  entryAmountMasuk: { color: colors.status.paid },
  entryAmountKeluar: { color: colors.status.void },
  entryAction: { minHeight: touchTarget.min, paddingHorizontal: spacing.md },
  confirmOverlay: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: "rgba(0,0,0,0.4)",
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
  },
  confirmCard: {
    width: "100%",
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: semantic.surface,
  },
  konfirmasiBody: { ...textStyles.body, color: semantic.textPrimary },
});
```

Note: the void-confirmation was previously a second `<Sheet>` stacked on top of `KasSheet`'s own `<Sheet>` — that pattern is being flattened here into a plain absolutely-positioned confirm card (same shape as the `styles.overlay` pattern already used in `AppShell.tsx` for `EditOrderScreen`/`PengaturanScreen`/`DebugScreen`) rather than nesting two RN `Modal`s, since `Sheet` is built on `Modal` — check `mobile/components/Sheet.tsx` to confirm this assumption before writing the confirm card, and if `Sheet` does NOT use RN `Modal` internally (e.g. it's already a plain `View`-based bottom sheet), keep the confirm dialog as a second `<Sheet>` exactly as `KasSheet.tsx` had it instead of introducing the `confirmOverlay` styles above — verify this in Step 1 before writing Step 2's code.

- [ ] **Step 3: Delete `mobile/components/KasSheet.tsx`**

```bash
git rm mobile/components/KasSheet.tsx
```

- [ ] **Step 4: Typecheck and verify on device**

```powershell
cd mobile
npm run typecheck
```

Native rebuild, then manually verify: menu → Kas Masuk Keluar → full page opens with correct totals for the running shift → record an entry → totals update, list shows it, inputs clear → void an entry → confirm dialog appears and works → back → later, Tutup Kasir report still reflects the same kas entries as before (this is the critical cross-check: `shift_id` keying and non-cash-doesn't-affect-cash-totals must be unchanged).

- [ ] **Step 5: Commit**

```bash
git add mobile/app/kas.tsx mobile/screens/AppShell.tsx
git commit -m "mobile: Kas Masuk/Keluar becomes a full-page route"
```

---

### Task 6: Pengaturan becomes a route; remove dead Modal-stacking guards; update MIGRATION.md

**Files:**
- Create: `mobile/app/pengaturan.tsx`
- Modify: `mobile/screens/AppShell.tsx`
- Modify: `mobile/screens/PengaturanScreen.tsx`
- Modify: `MIGRATION.md`

**Interfaces:**
- Consumes: everything `PengaturanScreen.tsx` currently takes as props (`isOwner`, `modeUjiMenyala`, `saluran`, `bundel`, `pembaruan`, `memeriksaPembaruan`, callbacks) — these move to being computed inline in `app/pengaturan.tsx` or read from `AppShell`-owned state via a small context, same pattern as Task 3.

- [ ] **Step 1: Move `pengaturanOpen`-adjacent state into a route**

`PengaturanScreen`'s props today are a mix of derived values (`saluran`, `bundel` — pure computations from `expo-updates`, no `AppShell` state needed) and `AppShell`-owned state (`modeUji`, `pembaruan`, `memeriksaPembaruan`, `periksaPembaruan`). The `Katalog`/`Mode Uji`/`Matikan Mode Uji`/`Printer` buttons each set an `AppShell`-owned boolean (`debug`, `modeUjiOpen`, `printerOpen`) — those overlays are explicitly out of scope for this migration (design doc only lists the four sheets + Pengaturan as routes), so `app/pengaturan.tsx` needs a way to trigger them in `AppShell` without becoming its child.

Simplest correct approach, consistent with Task 3's pattern: keep `debug`/`modeUjiOpen`/`printerOpen`/`modeUji`/`pembaruan`/`memeriksaPembaruan` state and `periksaPembaruan()` in `AppShell.tsx` unchanged, and expose them to `app/pengaturan.tsx` via a small `PengaturanContext` — but note `app/pengaturan.tsx` is reached by `router.push`, meaning `AppShell` (as `app/index.tsx`) may not be the *immediate* parent in the navigation tree, yet it stays mounted (routes don't unmount siblings by default in a stack unless popped) so a context provider wrapping `<Slot />` in `app/_layout.tsx` works the same way `CartProvider` did.

Add `PengaturanContext` next to `CartProvider`'s wiring: in `AppShell.tsx`, wrap the same region `CartProvider` wraps (or a level higher, wrapping the whole `Shell()` return) with a new provider from `mobile/lib/pengaturan-context.tsx`:

```tsx
// mobile/lib/pengaturan-context.tsx
import { createContext, useContext, type ReactNode } from "react";

interface PengaturanValue {
  isOwner: boolean;
  modeUjiMenyala: boolean;
  saluran: string;
  bundel: string;
  pembaruan: string | null;
  memeriksaPembaruan: boolean;
  onKatalog: () => void;
  onModeUji: () => void;
  onMatikanModeUji: () => void;
  onPeriksaPembaruan: () => void;
  onPrinter: () => void;
}

const PengaturanContext = createContext<PengaturanValue | null>(null);

export function PengaturanProvider({
  value,
  children,
}: {
  value: PengaturanValue;
  children: ReactNode;
}) {
  return <PengaturanContext.Provider value={value}>{children}</PengaturanContext.Provider>;
}

export function usePengaturan(): PengaturanValue {
  const ctx = useContext(PengaturanContext);
  if (!ctx) throw new Error("usePengaturan must be used within PengaturanProvider");
  return ctx;
}
```

In `AppShell.tsx`'s `Shell()`, wrap the returned `<SafeAreaView>` tree with `<PengaturanProvider value={{ isOwner, modeUjiMenyala: modeUji !== null, saluran: ..., bundel: describeBundle(), pembaruan, memeriksaPembaruan, onKatalog: () => setDebug(true), onModeUji: () => setModeUjiOpen(true), onMatikanModeUji: () => { setModeUji(null); toast.success("Mode uji dimatikan."); }, onPeriksaPembaruan: () => void periksaPembaruan(), onPrinter: () => setPrinterOpen(true) }}>` — these are the exact same closures currently inline in the `<PengaturanScreen ... />` JSX (current lines 539-556), just relocated; drop the `setPengaturanOpen(false)` calls since there's no sibling overlay to close anymore (`router.push`/`router.back()` handles that).

Replace the gear button's `onPress` (current lines 394-397):

```tsx
onPress={() => {
  setMenuOpen(false);
  router.push("/pengaturan");
}}
```

Delete `pengaturanOpen` state and the `<PengaturanScreen>` overlay block (current lines 521-560).

- [ ] **Step 2: Write `mobile/app/pengaturan.tsx`**

```tsx
import { useRouter } from "expo-router";

import PengaturanScreen from "../screens/PengaturanScreen";
import { usePengaturan } from "../lib/pengaturan-context";

export default function PengaturanRoute() {
  const router = useRouter();
  const props = usePengaturan();
  return <PengaturanScreen {...props} onClose={() => router.back()} />;
}
```

`PengaturanScreen.tsx` itself needs no changes beyond removing whatever internal comment referenced the Modal-stacking reasoning (see Step 3) — it already renders as a plain full-screen `View`, which is exactly what a route needs; only its caller changes.

- [ ] **Step 3: Remove the now-dead Modal-stacking guard comments/logic**

Two places document a workaround that no longer applies once these screens are routes instead of `Modal`s:

- `mobile/screens/PengaturanScreen.tsx` lines 32-33 (per the earlier survey): remove the comment explaining why it's a full overlay screen and not a `Sheet`/`Modal` due to "two RN Modals can't stack" — read the current file first to find the exact comment text and delete only that rationale, keeping any other doc comment content around it that's still accurate (e.g. if the same comment block also explains something about being opened from the menu, keep that part, since it's still true).
- `mobile/screens/EditOrderScreen.tsx`: already handled in Task 3 Step 1 (the `selectEntry` close/reopen dance was deleted there, not just its comment).

Read `mobile/screens/PengaturanScreen.tsx` in full before editing to confirm exact line numbers (it may have shifted from the earlier survey's estimate) and edit precisely.

- [ ] **Step 4: Typecheck and verify on device**

```powershell
cd mobile
npm run typecheck
```

Native rebuild, then manually verify: menu → gear icon → Pengaturan opens as a full page → Katalog/Mode Uji/Printer buttons still work (they still open `AppShell`-owned overlays, unchanged) → back returns to the cashier/orders tab exactly where it was.

- [ ] **Step 5: Update `MIGRATION.md`**

Read the existing step-numbered structure of `MIGRATION.md` (it's referenced throughout `AGENTS.md` as having numbered "step" sections, e.g. "step 3/5") to match its format, then append a new entry documenting: what changed (four sheets + Pengaturan → full-page expo-router routes), why (more room, single-task focus per the design doc), what was verified (list each of the five manual device checks from Tasks 2-6), the navigation decision (expo-router installed, isolated to these five screens, Cashier/Orders tab switcher untouched — supersedes the earlier "two screens don't justify file-based routing" note, cite its old location), and what remains unverified (tablet/landscape layout for the now-always-full-page cart — flag explicitly, per the design doc's known risk).

- [ ] **Step 6: Commit**

```bash
git add mobile/app/pengaturan.tsx mobile/lib/pengaturan-context.tsx mobile/screens/AppShell.tsx mobile/screens/PengaturanScreen.tsx MIGRATION.md
git commit -m "mobile: Pengaturan becomes a full-page route, remove dead Modal-stacking workarounds, update MIGRATION.md"
```

---

### Task 7: Full regression pass

**Files:** none (verification only)

- [ ] **Step 1: Full typecheck and static checks**

```powershell
cd mobile
npm run typecheck
npm run periksa:varian
npm run preview:struk
```

All three must pass with no regressions (none of these touch the four migrated screens' underlying logic, so this is confirming nothing broke by accident).

- [ ] **Step 2: Full native rebuild**

```powershell
$env:JAVA_HOME="C:\Program Files\Android\Android Studio\jbr"
cd mobile/android
./gradlew.bat assembleRelease
adb install -r app/build/outputs/apk/release/app-release.apk
```

- [ ] **Step 3: End-to-end manual walkthrough on device**

Per the design doc's testing section, run the full chain in one sitting: add to cart → open full-page cart → checkout → edit order → add item on full page → save → pay via full-page pelunasan → confirm print fires → record kas masuk/keluar on full page → confirm it lands in Tutup Kasir report correctly. Use the `adb screencap` recipe from the root `AGENTS.md` to capture screenshots at each stage if anything looks wrong, since `adb shell input` cannot drive this device (MIIU blocks it).

- [ ] **Step 4: Verify the installed bundle, not just the build**

Per `mobile/AGENTS.md`'s "verify what is actually on the phone" warning, pull the installed APK and grep for a string unique to the new pages (e.g. `"Kas Masuk / Keluar"` should now only appear once, from `app/kas.tsx`, not twice from a leftover `KasSheet.tsx`):

```bash
adb pull $(adb shell pm path com.rusenkopitiam.pos | tr -d 'package:\r')
unzip -o -q base.apk 'assets/*' && grep -c "Kas Masuk / Keluar" assets/index.android.bundle
```

Expected: exactly 1 (was already ASCII, no UTF-16LE concern here).

- [ ] **Step 5: No commit** — this task is verification-only. If any step fails, return to the relevant earlier task, fix, and re-commit there rather than adding a fixup commit here.
