# MIGRATION.md — Rusen Kopitiam POS: Web to React Native (Expo)

Guides the migration of the existing web application into a React Native app on Expo,
targeting tablet (primary, cashier station) and phone (secondary, owner reports). Read
alongside `AGENTS.md`, `PRODUCT.md`, and `DESIGN.md` — this file covers only what changes
for the mobile migration, not the product scope itself.

**Status: steps 1-3 built, step 3 not yet verified on device, step 4 next.** Progress and
corrections are recorded per step below. Where reality contradicted the original plan, the
correction is stated rather than the plan quietly rewritten.

## Why this migration

The web build works and reflects the intended product. The move to native is driven by
hardware access: ESC/POS thermal printer (USB/Bluetooth) needs native modules that a
browser/PWA cannot reliably reach. Everything else (UI, business logic, database) carries
over with minimal rework.

## Tech stack for the mobile build

- Expo SDK 57 / React Native 0.86 / React 19.2, TypeScript strict — managed workflow, with
  a custom development client (not Expo Go) once printer modules arrive.
- **StyleSheet + typed design tokens, not NativeWind.** NativeWind's stable release targets
  Tailwind v3 while the web app is on Tailwind v4; v4 support exists only in NativeWind 5
  preview. Revisit when it stabilises — `mobile/theme/` works with either.
- Font: Poppins via `@expo-google-fonts/poppins` and `useFonts`.
- Local database: **expo-sqlite** (chosen in step 3 — reasoning recorded there).
- Supabase JS client with the **anon** key, under real RLS policies.
- Printer: react-native-esc-pos-printer or react-native-thermal-receipt-printer for the
  Blueprint ECO 58D (USB + Bluetooth Classic + RJ11 for cash drawer).

---

## Step 1 — Project setup ✅

Expo app at `mobile/`, same repo as the web app so the Supabase schema and domain
vocabulary stay side by side.

- `eas.json` with `development`, `preview`, `production` profiles, linked to
  `@heikarya/rusen-pos`. **All three build APKs, not app-bundle** — the outlet tablet is
  sideloaded and store submission is out of scope, so an .aab would be unusable.
- `mobile/theme/` ports the tokens from `app/globals.css` and the rules in `DESIGN.md`:
  order status colors, login palette, Poppins scale, touch targets (48dp minimum, 64dp for
  the primary action). Hex values are duplicated rather than shared — a color change must be
  applied in both places.
- `app.json`: landscape orientation, `com.rusenkopitiam.pos`, Poppins loaded at runtime.
- No `web` script. The template installs no `react-native-web`, so a web bundle always
  fails; the browser build of this product is the Next.js app at the repo root.

**Verified on device:** Poppins renders, status colors correct, pressed states work, hot
reload live.

### Running it in Expo Go — the store version does not work

SDK 57 shipped 2026-06-30 and the matching Expo Go was still awaiting store approval, so
the Play Store client (SDK 56 or older) rejects this project with a misleading "download
the latest version" message. Install the right client over adb instead — see
`mobile/README.md` for the full procedure. On Xiaomi/HyperOS the adb install additionally
fails with `INSTALL_FAILED_USER_RESTRICTED` unless Developer options → **Install via USB**
is enabled; the fallback is pushing the APK to the device and installing it by hand.

This whole detour disappears once Expo Go for SDK 57 clears review.

## Step 2 — Auth ✅ (login only)

**The original plan for this step was wrong on two counts, and both mattered.**

It assumed an existing Supabase Edge Function validated PINs. No such function existed —
validation lived in a Next.js Server Action (`app/login/actions.ts`), which has no
equivalent in React Native.

It also declared RLS changes a non-goal. That was impossible to honour: `0001_init.sql`
enables RLS on every table with **zero policies** and grants only to `service_role`, so a
mobile client had no way in at all. Shipping `service_role` inside an APK is not an option
— it is extractable and bypasses RLS entirely. **The RLS change was therefore deliberate,
not incidental**, and is the one place this migration edits the backend.

What was built:

- **`supabase/functions/pin-login/`** — Deno Edge Function holding `service_role`
  server-side. Ports the Server Action's security decisions verbatim: 6-digit check,
  5-failures-per-IP-per-minute rate limit via `login_attempts`, bcrypt against active
  employees, one generic error for every failure so a response never reveals a near-miss.
  Returns a JWT signed with the project's JWT secret so PostgREST verifies it and
  `auth.uid()` works in policies. `pin_hash` never leaves the function.
- **`supabase/migrations/0003_client_access.sql`** — opens one small hole: a
  **column-level** grant on `employees` that excludes `pin_hash` (RLS cannot hide a column,
  so the grant must, or any employee could pull a colleague's hash and crack it offline),
  plus a policy limiting each employee to their own row. Every other table stays sealed
  until step 5 needs it.
- **`mobile/lib/`** — `supabase.ts` (anon key + supabase-js `accessToken` callback),
  `session.ts` (token in `expo-secure-store`, never AsyncStorage; expired sessions treated
  as logged out), `auth-context.tsx` (login/logout/restore).
- **`mobile/screens/LoginScreen.tsx`** — PIN pad ported from `app/login/page.tsx`. Physical
  keyboard handling dropped; keys sized for fingers.

The web app is untouched — it still uses `service_role`, which bypasses all of this.

**Verified:** correct PIN for cashier and manager; wrong PIN, 4 digits, letters and empty
body all return the identical generic error; rate limit fires on the sixth attempt and
blocks even a correct PIN during the window; and four RLS checks — own row readable,
`select=*` denied on the `pin_hash` grant, `orders` denied, no-token denied.

**No navigation library yet.** Two states need only a conditional render; expo-router
belongs in step 5 when there are real screens to route between.

**Deferred: clock in/out.** `attendance_logs` exists in the schema but no code anywhere
touches it — it is new product work, not a port, and needs its own decisions (is clock-in
automatic on login, or a separate action? can a cashier clock out with unpaid orders open?).
Explicitly not a priority right now.

## Step 3 — Local database layer ✅ built, ⏳ unverified on device

**Library: expo-sqlite**, not WatermelonDB or op-sqlite. Both alternatives are third-party
native modules, so adopting either would have forced a custom dev build immediately and
ended the Expo Go workflow mid-migration. expo-sqlite ships inside Expo Go, is first-party
so SDK upgrades stay clean, and exposes raw SQL — which matters more than it sounds, see
below. Its performance disadvantage against op-sqlite's JSI bridge is real and irrelevant
at one cafe's transaction volume.

WatermelonDB was rejected on a second count: its selling point is a built-in sync protocol
that expects purpose-built push/pull endpoints, and this backend's write path is a set of
Postgres RPCs. That mismatch would have cost more than writing step 4 by hand.

**The actual difficulty of this step was not SQLite.** All the till's business rules live
inside Postgres functions — `create_order`, `append_to_order`, `void_order_item`,
`pay_order`, `check_table_code` in `0001_init.sql:206-469`. Working offline means those
rules have to run on the device too, so `mobile/db/orders.ts` is a line-by-line port, not a
reimplementation. After step 4 the same order can be validated in both places, and the two
must agree; drift here would surface as sync rejecting orders that looked fine to the
cashier. The error codes (`STALE_ORDER`, `INSUFFICIENT_AMOUNT`, …) are identical on both
sides for the same reason.

What was built:

- **`mobile/db/migrations.ts`** — SQLite schema mirroring the Postgres columns *by name*, so
  step 4's sync payloads are near-literal. Money stays `INTEGER` rupiah; `subtotal`/`amount`
  stay generated columns; the `paid_fields_consistent` and `cash_covers_total` CHECKs are
  ported and were tested to reject the same rows Postgres rejects. Migrations run off
  `PRAGMA user_version` so an installed tablet upgrades instead of wiping.
- **`mobile/db/orders.ts`** — the five RPC ports, each in an exclusive transaction. Prices
  always come from the local `products` table, never from the caller — the same rule as the
  server, for the same reason.
- **`mobile/db/catalog.ts`** + **`supabase/migrations/0004_catalog_access.sql`** — read-only
  catalog pull. `0004` opens `categories` and `products` to `authenticated`, scoped to the
  employee's own outlet. No write grants: product prices must not be editable from an APK.
- **`mobile/screens/HomeScreen.tsx`** — temporary. Replaced by the real cashier screen in
  step 5.

**One deliberate divergence from Postgres,** marked in the code: `create_order` does a
`join products`, so an unknown `productId` is silently dropped from the order. On the server
that is nearly impossible — the catalog is always current. On a device the local catalog can
be stale, and an item vanishing without a sound means a customer is served but not charged.
The local port throws `PRODUCT_NOT_FOUND` instead.

Added for offline: `sync_status` (`pending`/`synced`/`error`) plus `sync_error` and
`synced_at` on every locally authored table. Order ids are generated on the device — the
schema anticipated this from the start (`orders.id` is commented "klien boleh kirim",
and `client_created_at` already exists).

`refunds` / `refund_items` were left out: no code in the web app touches them, and they are
report-side rather than till-side. They belong with step 6.

**Not yet verified.** The schema's constraints and generated columns were tested against a
real SQLite engine, and typecheck is clean, but the self-test screen has not been run on the
phone — including the airplane-mode pass that is the entire point of the step.

## Step 4 — Sync engine (next)

- Watches for reconnection (`@react-native-community/netinfo`) and pushes `pending` records.
- Conflict resolution: last-write-wins on timestamp.
- Pull sync on reconnect for multi-device cases (owner's phone while the tablet is active).
- Standalone module, independent of UI.

## Step 5 — Cashier core flow

Table/order code input, product grid with category sidebar, cart with quantity/notes/
subtotal, and the cart → pending payment → paid transitions from `PRODUCT.md`. All writes
land locally first. This is also where expo-router and the RLS policies for products,
orders and payments arrive.

## Step 6 — Reports and attendance

Sales and product reports may read Supabase directly when online, but must show a "last
synced" state offline rather than breaking.

## Step 7 — Printer integration

Only after step 5 is stable. Build a `development` EAS client as soon as this begins. Print
fires only once an order reaches "paid". Test against the physical Blueprint ECO 58D over
both USB and Bluetooth Classic, and confirm which transport the outlet will use.

## Step 8 — Device and store builds

`preview` for installable tablet tests, `production` for the final sideloaded build.

---

## Open items

- **Supabase is still local, not hosted** — and this is now the blocking item. `SUPABASE_URL`
  is a LAN address pointing at Docker on the development PC, so the catalog pull only works
  while that PC is running. Heika decided to stand the hosted project up now rather than at
  step 4. Needs: the project created, `supabase/migrations/` pushed and seeded,
  `SESSION_JWT_SECRET` set as a Function secret, and both clients repointed.
- **JWT signing on a hosted project.** `pin-login` signs HS256 against the legacy JWT
  secret. A project switched to asymmetric signing keys would reject those tokens, and login
  would have to move to shadow `auth.users` rows. Check Project Settings → API before
  migrating — this is the one thing that could force a rewrite rather than a config change.
- **Cleartext HTTP.** Fine in development; production needs HTTPS, which a hosted Supabase
  project provides automatically. Resolved by the move above.
- **On-device verification is outstanding for both step 2 and step 3.** Login has never been
  exercised on the phone, and neither has the step 3 self-test. Both should be run against
  the hosted URL so the work isn't repeated.
- The root `README.md` is still create-next-app boilerplate.

## Testing approach

- Non-hardware work: Expo Go on a personal phone for fast iteration.
- Step 7 onward: development build on the physical target tablet only — emulators have no
  real USB or Bluetooth.
- Offline sync must be tested by killing the network mid-transaction at several points
  (after save, after payment confirmation, before print) and checking integrity after
  reconnect.
- Final testing on the actual outlet tablet, not just a high-spec personal device.

## Explicit non-goals

- No inventory / raw material tracking (unchanged from `PRODUCT.md`).
- No Play Store / App Store submission in this phase — builds are sideloaded.
- No schema changes beyond what a mobile client provably requires. The RLS change in step 2
  met that bar and was taken deliberately; anything further gets raised the same way rather
  than slipped in.
