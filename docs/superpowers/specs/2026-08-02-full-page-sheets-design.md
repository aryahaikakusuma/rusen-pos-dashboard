# Full-page migration: Keranjang, Tambah Item, Pelunasan, Kas Masuk/Keluar

Date: 2026-08-02

## Problem

Four cashier-facing UIs are currently bottom-sheets/modals overlaying the previous screen:

1. Keranjang (cart) — bottom bar that expands to a sheet in `CashierScreen.tsx` (portrait); an
   inline `wideCart` side panel on wide screens.
2. "Tambah item" — add-item sheet inside `EditOrderScreen.tsx`, used to append items to a
   pending order being edited.
3. Pelunasan (payment) — `PaymentSheet.tsx`, opened from `OrdersScreen.tsx`.
4. Kas Masuk/Keluar — `KasSheet.tsx`, opened from `AppShell.tsx`'s main menu.

These need more screen space and single-task focus. Overlay sheets leave the previous screen
visible/interactive underneath and constrain layout to whatever fits above the sheet's origin.

## Decisions made (see conversation for rationale)

- **Navigation**: install `expo-router`. Superseded the earlier "two screens don't justify
  file-based routing" call in `MIGRATION.md` (step 3/5) — screen count has grown enough (cart,
  add-item, pay, kas, plus the already-added Pengaturan) that the state-based show/hide pattern
  in `AppShell.tsx` was judged no longer worth extending further.
- **Scope of the router migration**: isolated. Only the four sheets above plus `PengaturanScreen`
  become routes. The Cashier/Orders tab switcher in `AppShell.tsx` (state-based, both tabs kept
  mounted via `display:none` so cart/catalog state survives tab switches) is **not** touched.
  Reduces regression surface — the tab switcher is stable, tested code.
- **Cart on wide screens**: always becomes a full-page route, on phone and tablet alike. The
  existing `wideCart` inline side-panel special case (`CashierScreen.tsx`, width ≥ 700px) is
  removed rather than kept as a parallel code path.
- **Transitions**: default expo-router native-stack behavior (slide-in, platform-native
  back/swipe). No custom modal-style presentation.

## Architecture

expo-router requires native dependencies (`react-native-screens`, `expo-linking`,
`expo-constants`) not currently in `mobile/package.json` — this is a **native rebuild**, not an
OTA-only change. The existing `gradlew assembleRelease` + `adb install -r` flow
(`mobile/AGENTS.md`) is required before any of this reaches a device; `eas update` alone cannot
ship it. This should happen early in implementation so route wiring can be checked on-device
throughout, not saved for the end.

Entry point moves from `index.ts` to file-based routes under `mobile/app/`:

```
app/
  _layout.tsx           # Stack root; houses the auth gate currently in index.ts
  index.tsx             # renders existing AppShell — tab switcher internals unchanged
  cart.tsx              # was CashierScreen's cart Sheet (+ wideCart panel, now removed)
  edit-order/add.tsx    # was EditOrderScreen's "Tambah item" Sheet
  pay.tsx               # was PaymentSheet, opened from OrdersScreen
  kas.tsx               # was KasSheet, opened from AppShell's menu
  pengaturan.tsx         # was PengaturanScreen overlay
```

AppShell's tab state (`tab: "cashier" | "orders"`) and the `display:none` dual-mount pattern
are preserved verbatim — expo-router wraps `AppShell` as `index.tsx`, it does not replace its
internals.

## Per-page behavior preserved

- **Cart**: cart state already lives above `CashierScreen` and survives tab switches today;
  moving the cart's *rendering* into a route doesn't move where that state lives. Opened via
  `router.push('/cart')` from the existing bottom bar.
- **Tambah item**: `busyRef` guard (a ref, not state, to block a second tap racing
  `expectedVersion`) is unchanged. Search-not-cleared-until-exit and
  does-not-auto-close-after-add behaviors are unchanged. Opened via
  `router.push('/edit-order/add?orderId=...')`.
- **Pelunasan**: all payment logic (change calculation, cash-sufficiency validation, Kena
  Pajak/Bebas Pajak with mandatory reason+approver, auto-print-on-paid) is unchanged — only the
  container changes from sheet to route. A `beforeRemove` guard blocks back-navigation while a
  submit is in-flight, so a cashier can't leave the order in an ambiguous state (already pending,
  submit response not yet received). Opened via `router.push('/pay?orderId=...')` from
  `OrdersScreen`.
- **Kas Masuk/Keluar**: `shift_id` keying, `voided_at` soft-delete, and non-cash entries not
  affecting report totals are unchanged. Still opened from AppShell's main menu button (not
  moved under Pengaturan). Opened via `router.push('/kas')`.

## Simplification, not just relocation

Two RN `Modal`s cannot stack (documented in `EditOrderScreen.tsx` lines 132–147 and
`PengaturanScreen.tsx` lines 32–33). The workaround in `EditOrderScreen` — closing the "Tambah
item" sheet before opening `VariantSheet`, then reopening it after — exists only because of that
constraint. Once "Tambah item" is a route instead of a `Modal`, `VariantSheet` (which stays a
modal) no longer competes with anything, and the close/reopen workaround becomes dead code. This
migration removes it rather than leaving it in place.

## Testing

- `npm run typecheck`, `npm run periksa:varian`, `npm run preview:struk` (no device needed).
- Manual, on-device (native rebuild required first): add to cart → open full-page cart →
  checkout; edit order → add item on full page → save; pay via full-page pelunasan → confirm
  print still fires; record kas masuk/keluar on full page → confirm it lands in Tutup Kasir
  report correctly.

## Known unverified risk

Tablet/landscape layout for the now-always-full-page cart has not been seen on a wide device.
Flag as unverified in `MIGRATION.md` until tested on an actual wide screen.
