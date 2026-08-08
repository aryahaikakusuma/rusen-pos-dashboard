# Rusen POS — mobile (Expo)

The React Native build of the POS, and the one the outlet actually runs on. Steps 1–5 and
step 7 of `MIGRATION.md` are done and have been exercised on a compiled APK on a real phone:
PIN login, catalog pull, the product grid with merged variant cards, cart, save, payment with
change, editing a pending order, the push queue, offline operation, and a receipt printed on
the RPP02N over Bluetooth. Step 6 (reports and attendance) is not started.

Read `MIGRATION.md` at the repo root before changing anything non-trivial — it records why
these decisions were made and which plausible alternatives failed. `AGENTS.md` here adds the
Expo-specific build rules.

## Stack

- Expo SDK 57 / React Native 0.86 / React 19.2, TypeScript strict. Managed workflow with a
  **custom dev client** — `modules/escpos-bluetooth` is a local native module, so Expo Go
  cannot run the printer path.
- Poppins (`@expo-google-fonts/poppins`), imported per weight. The package root re-exports
  all eighteen weights and Metro bundles every asset it can see referenced — 3.0MB for four
  weights, until the subpath imports in `theme/fonts.ts` cut it to 620KB.
- `expo-secure-store` holds the session token — not AsyncStorage, this is auth data.
- `expo-sqlite` for the local database, `expo-crypto` for device-side UUIDs.
- `expo-updates`, with `fallbackToCacheTimeout: 0` so a bad signal never delays startup.
  `checkOnLaunch` is left at its default (`ALWAYS`) — not set in `app.json`.
- StyleSheet plus typed tokens in `theme/`, not NativeWind — see "Styling decision" below.

## Layout

Two layouts, chosen by viewport width (`lib/use-layout-mode.ts`), never by device type: a
rotated phone deserves the wide layout, an upright tablet does not. The threshold lives in
`theme/layout.ts` so it is not a magic number scattered across screens.

**The phone is the primary target.** Heika opens with a phone held vertically, so `app.json`
uses `orientation: "default"`, not the landscape lock the web app assumes. Portrait is not the
tablet layout shrunk: table code and search on top, categories as a horizontal chip strip, a
two-column grid, and the cart as a bottom bar that opens into a full-height sheet. Landscape
still gets the three columns from `DESIGN.md` — but see the caveat in `MIGRATION.md`: that
branch has never run at real tablet size.

## Screens

- `AppShell.tsx` — two tabs (Kasir, Order) rendered branchlessly and kept mounted, because
  unmounting the cashier tab threw away the cart. Everything that is chosen once rather than
  used constantly — cashier name, catalog pull, printer, logout, the Uji screen for owners —
  lives in the hamburger sheet. It also runs one silent `pushPending` on open.
- `LoginScreen.tsx` — 6-digit PIN against the `pin-login` edge function.
- `CashierScreen.tsx` — table code, search, category strip, product grid, variant sheet, cart.
- `OrdersScreen.tsx` — recent orders with status and sync badges, payment sheet, receipt
  reprint, read-only detail sheet, and history clearing.
- `EditOrderScreen.tsx` — append and void items on a pending order. Covers it rather than
  replacing it, and re-reads the order after every write.
- `DebugScreen.tsx` — owner-only self-tests, described below.

## Local database (`db/`)

`db/orders.ts` is a deliberate line-by-line port of the Postgres RPCs in
`supabase/migrations/0001_init.sql:206-469`, not a reimplementation. The same order is
validated on the device and on the server, and the two must agree — so the rules and the error
codes are identical on both sides. Read that SQL before changing anything here.

- `migrations.ts` — schema plus a `PRAGMA user_version` runner. Column names match Postgres so
  push payloads stay near-literal. Bump `DATABASE_VERSION` and add a new `if` block for any
  schema change; installed devices must upgrade, not wipe.
- `orders.ts` — `checkTableCode`, `createOrder`, `appendToOrder`, `voidOrderItem`, `payOrder`,
  plus history clearing (`HISTORY_KEEP_HOURS`, `countClearableHistory`, `clearHistory`).
  Prices always read from the local `products` table, never from the caller.
- `catalog.ts` — one-way pull of `categories`, `products`, **and the PBJT rate** from Supabase.
- `push.ts` — the send queue. Deliberately **not** a sync engine: no background watcher, no
  pull, no conflict resolution. `push_order` is idempotent on `orders.id` and that id is
  generated on the device, which is why handing "Kirim ulang" to a cashier is safe. Failures
  land in `orders.sync_error` — show it.
- `settings.ts` — device-scoped settings (currently the chosen printer) in the existing
  `app_state` key/value table, so no schema bump. Tied to the machine, not the session: the
  printer belongs to the till and must survive a shift change.
- `errors.ts` — the same short codes the RPCs raise, and their Indonesian translations.

## PBJT (`lib/tax.ts`, payment sheet)

The cashier picks **Kena Pajak** (default) or **Bebas Pajak** when confirming payment; exempt
requires a written reason and records the approving employee. Tax is exclusive — added on top of
the menu price — so `orders.total` means **the amount charged** and `orders.subtotal` means the
sum of the items. While an order is pending the two are equal, because the tax status has not
been chosen yet; that is why the provisional bill prints a pre-tax total and the final receipt is
higher.

`lib/tax.ts` is a **twin of the web's `lib/tax.ts`** and its rounding must also match the
`tax_arithmetic` CHECK in Postgres. The phone computes tax offline and the server re-validates on
push, so a disagreement means paid orders rejected with `TAX_MISMATCH`. Change all three together.

**A device that has not pulled the catalog since this release cannot take payment.** The rate
lives in `outlets.tax_rate_bps` and is cached into `app_state` by `pullCatalog`, in the same
transaction as the products. With no rate, the payment sheet refuses to open and says to pull the
catalog — a guessed tax figure is a wrong one that nobody notices. The `V2` migration clears
`catalog_pulled_at` so the existing prompt does the nagging.

Taxable receipts print Subtotal / PBJT / TOTAL. Exempt receipts print nothing about tax at all —
the reason is kept in the system, not on the customer's paper.

**History clearing deletes locally only, and only what is `synced`.** No employee account
holds a DELETE grant on the server, deliberately. A paid order that has not been pushed exists
on that phone and nowhere else; the confirmation dialog states both counts as numbers rather
than asking "are you sure?", because a question without numbers only buys a reflex tap.

## Variants (`lib/product-variants.ts`)

A copy of the web app's `lib/product-variants.ts`, not a separate implementation — Metro
cannot import from outside `mobile/`, so the file is duplicated on purpose. **Change both
together.**

There is no variant table. Hot/cold, the six sauces, and Indomie toppings are ordinary product
rows; the merge happens only on screen, and the `productId` that lands in the cart is always a
real one. Three axes now:

- **suhu** — Kopi uses a trailing "S" for cold and no suffix for hot; the rest use
  "Panas"/"Dingin". No preselection: hot and cold are equally legitimate.
- **saus** — Ori / Mayonnaise / Bangkok / Mentega / Lada Hitam / Teriyaki. A closed word list,
  not a pattern, so "Nasi Paket Telur Kecap Pedas" can never be read as a sauce. Ori is the
  suffix-less name and is preselected.
- **topping** — Indomie, checkboxes over the four priced presets, plus the sauce/kuah split.

A card carrying two axes is refused rather than merged. That is why `VariantSheet` has two
interaction models: tap-to-add where there is no default, select-then-confirm where there is.

## Auth

`supabase/functions/pin-login` — a Deno edge function holding `service_role` server-side.
Ports the web logic verbatim: 6-digit check, 5-failures-per-IP-per-minute rate limit via
`login_attempts`, bcrypt compare against active employees, one generic error for every
failure. Returns a JWT signed with the project's JWT secret, so PostgREST verifies it and
`auth.uid()` works in policies. `pin_hash` never leaves.

`0003_client_access.sql` grants `authenticated` a **column-level** select on employees that
excludes `pin_hash` — RLS cannot hide a column, so the grant must — plus a policy limiting
each employee to their own row. Everything else stays sealed; `push_order`
(`0005`, `0008`) is a `security definer` function rather than table grants.

On the client: `lib/supabase.ts` uses the **anon** key with supabase-js's `accessToken`
callback pulling the token from `lib/session.ts`; `lib/auth-context.tsx` owns login/logout and
session restore. `SESSION_JWT_SECRET` must match the project's JWT secret exactly.

The hosted project signs HS256 against the legacy JWT secret, confirmed by signing a token and
watching PostgREST accept it. Switching it to asymmetric signing keys would break login and
force a move to shadow `auth.users` rows — not a routine setting to flip.

**A cashier cannot log in offline.** `pin-login` needs the network while sessions last 12
hours. Everything past the login screen works offline and has been verified to. This is the
largest operational risk in the app and it is waiting on a decision, not on work — see
`MIGRATION.md § Open items`.

## Printing (`lib/receipt.ts`, `lib/printer.ts`, `modules/escpos-bluetooth`)

58mm paper, **32 columns**, every position computed by hand. The web `components/Receipt.tsx`
is built for 80mm and cannot be ported — only its content was reused. Everything goes through
`ascii()`, because `Intl.NumberFormat` inserts U+00A0 between "Rp" and the digits and the
printer eats the following digit with no error anywhere.

The split matters: `receipt.ts` is pure computation (order in, bytes out) and knows nothing
about Bluetooth; `modules/escpos-bluetooth` (≈200 lines of Kotlin, Expo Modules API, a real
TurboModule) knows Bluetooth and nothing about orders; `lib/printer.ts` is the seam.
`buildReceiptPackets` decides where the Bluetooth layer may pause — a raster command must be
one whole packet, or the printer aborts it, falls back to text mode, and prints the rest of
the image as Chinese characters. The Kotlin side must stay ignorant of ESC/POS.

No connection is held between receipts: a socket left open dies silently when the printer is
switched off and then swallows receipts. "Tersimpan" rather than "terkoneksi" in Android's
Bluetooth settings is normal for SPP, not a symptom.

Triggers: automatic on reaching paid — announces failure but never blocks, the money is
already taken — and a "Cetak Struk" button on paid cards for reprints, which *must* report
failure since it is pressed precisely because the receipt is missing. Voided orders get no
reprint button.

The logo is a packed 1-bit bitmap in `lib/receipt-logo.ts`, generated at build time
(`scripts/buat-logo-struk.mjs` at the repo root; `kecilkan-logo-struk.mjs` shrinks the
existing bitmap, which is the only surviving copy of the source image). It is emitted as
24-dot bands, each its own complete `GS v 0` command — one 18KB command overran the printer's
buffer and it discarded the rest of the receipt silently.

Shop identity, outlet, and the two WiFi passwords live in `lib/shop.ts`, read by both the app
and the preview script so paper and terminal cannot diverge.

## Checking your work without a device

```bash
npm run typecheck        # the only automated gate; there is no test runner, by decision
npm run periksa:varian   # variant grouping over ../supabase/seed.sql
npm run preview:struk    # three receipts as text, proves the 32-column fit
npm run doctor
```

`periksa:varian` asserts properties, not snapshots: every product represented exactly once, no
duplicate variant in a card, hot always first, Ori first and default, topping prices summing,
price range matching the options, single cards using the whole name. The counts (309 products
→ 247 cards, 38 temperature pairs, 2 sauce cards, 2 topping cards) print as info for a human
to eyeball — **the 38 pairs are the regression signal** for any change to variant parsing.

`preview:struk` renders paid-cash-with-change, paid-non-cash, and an unpaid provisional bill,
because all three branch at the foot and only one usually gets looked at. It uses the worst
real case — the longest product name, a note that wraps, a six-figure amount — and exits
non-zero on any line over 32 columns.

`screens/DebugScreen.tsx` runs the same assertions on the device against the live catalog,
plus a self-test over the full local order lifecycle and every rejection path. Its `strip`
regex is a deliberate re-implementation, not an import: importing the real regex would make
the check circular and always pass. Re-run the self-test in airplane mode — the local layer
must not touch the network at all.

## Running

```bash
npm start             # dev-client mode (the default; needed for anything native)
npm run android       # Metro in Expo Go mode, opens on the USB-connected device
npm run start:go      # Metro in Expo Go mode, then press `a`
npm run start:tunnel  # same, via ngrok, when phone and PC aren't on the same network
```

Expo Go is still fine for JS-only iteration, but it ships its own prebuilt native code and
never runs `prebuild`. **Anything touching `app.json` plugin config, native modules,
permissions, or first-run behaviour is unverified until an APK is built and installed** —
four defects surfaced the first time this project was compiled, and none could have been
caught by a typecheck. "It works in Expo Go" is not evidence.

There is deliberately no `web` script: the template installs no `react-native-web`, so a web
bundle fails on the first React Native component. The browser build of this product is the
Next.js app at the repo root.

The LAN path from phone to laptop does not work on this network (router client isolation,
almost certainly). Use `adb reverse tcp:8081 tcp:8081` over USB, which bypasses it entirely.

### Expo Go must be installed over USB, not from the Play Store

SDK 57 shipped 2026-06-30 and the matching Expo Go was still awaiting store approval, so the
Play Store client (SDK 56 or older) refuses this project with a misleading "download the
latest version" message. Install the correct client over adb instead:

1. On the phone: enable Developer options (tap Build number 7×) → **USB debugging**, and on
   Xiaomi/HyperOS also **Install via USB**, or the install fails with
   `INSTALL_FAILED_USER_RESTRICTED`. Connect in **File transfer** mode — charging-only hides
   the device from adb — and accept the RSA fingerprint prompt.
2. `adb` ships with Android Studio but isn't on `PATH`. Per PowerShell session:

   ```powershell
   $env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
   $env:PATH = "$env:PATH;$env:ANDROID_HOME\platform-tools"
   adb devices   # phone must show as "device", not "unauthorized"
   ```

3. `npm run android` — Expo CLI installs the SDK 57 Expo Go APK and opens the project.

This whole detour disappears once Expo Go for SDK 57 clears store review.

## Builds

Local APK, which is what the printer work was iterated on:

```powershell
$env:JAVA_HOME="C:\Program Files\Android\Android Studio\jbr"   # JDK 21; the one on PATH is Java 8
npx expo prebuild --platform android
cd android; ./gradlew.bat assembleRelease
adb install -r app/build/outputs/apk/release/app-release.apk
```

`JAVA_HOME` does not persist between shells. `ANDROID_HOME` is covered by
`android/local.properties`, gitignored along with all of `android/`.

**A locally built APK has no `EXPO_UPDATES_CHANNEL` meta-data and therefore cannot receive OTA
updates** — the channel is written by EAS build profiles only. Fine for iteration, not for
what ships to the outlet. And any new native module means a new APK, never an update.

`adb install -r` succeeding does not prove the running JS is new: a reinstall keeps app data,
so a cached OTA bundle can outrank the bundle you just built. Verify with the APK-grep recipe
in the root `AGENTS.md`.

EAS builds all target Android APK — the device is sideloaded and store submission is an
explicit non-goal.

| Profile | Command | Output |
| --- | --- | --- |
| development | `npm run build:dev` | dev client APK, internal distribution |
| preview | `npm run build:preview` | release APK for tablet testing |
| production | `npm run build:prod` | release APK, auto-incremented version |

Linked to `@heikarya/rusen-pos` (project ID in `app.json` under `extra.eas.projectId`).
Requires the global CLI: `npm install --global eas-cli`, then `eas login`. `eas.json` pins
Node 22.20.0 in a `base` profile — the default was Node 18, which broke every build — and
carries the Supabase URL and anon key in `env`, because EAS builds from a git archive and
`mobile/.env` is gitignored. Those two are public by design; **anything that is not goes
through `eas env:create`, never `eas.json`.**

`MIGRATION.md § Configuration` is the full table of where every setting lives.

## Design tokens

`theme/` is the single source of truth, ported from the web app's `app/globals.css` `@theme`
block and `DESIGN.md`:

- `colors.ts` — primary blue, order status colors, login surface, neutrals, plus semantic
  aliases (`sidebarActive` is dark neutral, not blue, by design).
- `typography.ts` / `fonts.ts` — Poppins families, size scale, named text styles.
- `layout.ts` — spacing, radii, touch targets (min 48dp, primary action 64dp), the wide-layout
  breakpoint, and the three-column dimensions.

Hex values are duplicated from the web app rather than shared, so a color change must be
applied in both places.

## Styling decision, deferred

NativeWind's stable release targets Tailwind v3; the web app is on Tailwind v4, and v4 support
exists only in the NativeWind 5 preview. The theme module is plain typed constants, so it
works with StyleSheet today and with NativeWind later if that resolves. Nothing here needs to
change either way.
