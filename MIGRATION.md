# MIGRATION.md — Rusen Kopitiam POS: Web to React Native (Expo)

Guides the migration of the existing web application into a React Native app on Expo,
targeting tablet (primary, cashier station) and phone (secondary, owner reports). Read
alongside `AGENTS.md`, `PRODUCT.md`, and `DESIGN.md` — this file covers only what changes
for the mobile migration, not the product scope itself.

**Status: steps 1-3 verified on device. Step 5's phone layout has now run on a device and is
partly verified — the layout and the merged variant cards were seen and corrected there; the
step 4 push queue and the offline run have not been re-exercised since.** Progress and
corrections are
recorded per step below. Where reality contradicted the original plan, the correction is
stated rather than the plan quietly rewritten.

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

## Step 3 — Local database layer ✅

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

**Verified on device.** All eleven self-test checks pass — order creation and totals,
idempotency, table sequencing, item merging, stale-version rejection, partial and total
void, payment with change, double-payment idempotency, and short-payment rejection — and
they pass again **in airplane mode**, which is the one result that mattered. The local layer
never touches the network.

Two performance defects surfaced only on the device and were fixed: `pullCatalog` wrote one
statement per row (316 JS-to-native round trips inside one exclusive transaction, which
reads as a frozen app on a phone) and `listRecentOrders` was N+1. Both were invisible in a
typecheck and in the SQLite-engine tests — a reminder that this layer's failure mode is
latency, not exceptions.

The login and self-test screens also had to learn to adapt to short viewports. The app is
locked to landscape because the target is a cashier tablet, which stays correct — but on a
phone in landscape the stacked layouts pushed controls off-screen entirely. Both screens now
split into two columns below 520dp of height, keyed on viewport height rather than device
detection.

## Step 4 — Push queue ✅ (deliberately shrunk from "sync engine")

The original plan here was a background sync engine: a `netinfo` listener watching for
reconnection, last-write-wins conflict resolution, and pull sync for multi-device cases.
That was cut, on Heika's reasoning: with a phone hotspot as the fallback, the realistic
offline window at a single outlet is seconds to minutes, and two devices writing the same
order inside that window effectively does not happen.

What replaced it is smaller and easier to reason about. Orders stay `pending` locally, a
badge in the Order tab shows how many are unsent, and a button pushes them. There is no
background listener and no new dependency. The app does attempt one silent push at two
moments that are certain to occur anyway — right after a payment, and once on app open with
a session — because a queue that only ever moves when someone remembers to tap it can sit
untouched until closing time. A failed silent attempt says nothing; the badge stays lit.

**The correction that shaped the design.** The risk worth defending against was never two
devices colliding. It is the same order being pushed twice because the request reached the
server and the reply was lost — most likely precisely when the signal is bad, which is the
condition this whole feature exists for. Order ids are generated on the device, so
`push_order` is idempotent on `orders.id`: an id it has already seen returns success without
writing. That is what makes handing a retry button to a cashier safe, and everything else
here depends on it.

`supabase/migrations/0005_push_order.sql` adds one `security definer` function and no new
table grants. The alternative — granting `insert` on `orders`, `order_items` and `payments`
to `authenticated` — would let anyone who unpacks the APK write arbitrary paid orders. The
function recomputes `total` from the items it was handed and re-checks cash coverage: the
device is trusted for identity, never for money. The outlet is taken from the author's
`employees` row, never from the payload.

One deliberate loosening: the author of an order may differ from the sender. Unsent orders
survive a shift change (that is why `SQLiteProvider` sits outside `AuthProvider`), so an
order written by Pagi is legitimately pushed while Sore is logged in. What is enforced is
that the author is a real employee at the sender's own outlet.

**Verified against the hosted database**, not just typechecked: a cross-shift push accepted;
a repeat push returning `inserted: false` with row counts in `orders`, `order_items` and
`payments` unchanged; total and change intact; outlet filled in by the server; a payload
with a falsified total rejected with `TOTAL_MISMATCH`; underpaid cash rejected with
`INSUFFICIENT_AMOUNT`; a call without a session rejected; and a direct `INSERT` into
`orders` with a valid session still refused with 403 — the tables stay sealed.

Still absent, and recorded as a decision rather than an oversight: automatic sync on
reconnect, pull sync, and conflict resolution. If a second device ever runs the till at the
same time, this is the first thing that has to be revisited.

## Step 5 — Cashier core flow ✅

Table/order code input, product grid, cart, and the cart → pending payment → paid
transitions from `PRODUCT.md`. All writes land locally first, through the step 3 layer.

**The phone became the primary target, not the tablet.** Heika will open with a phone held
vertically, so `app.json` moved from `orientation: "landscape"` to `"default"`. That lock is
also what made the PIN screen unusable on a phone earlier — the app was refusing to render
vertically at all, which no amount of layout work could have fixed.

Portrait is not the tablet layout shrunk. At roughly 400dp, three side-by-side columns leave
each about 130dp and the product codes stop being readable. So the phone layout stacks:
table code and search on top, categories as a horizontal chip strip, a two-column product
grid filling the rest, and the cart as a bottom bar that opens into a full-height sheet. The
cart is a sheet rather than a permanent panel because a permanent one would leave the grid
two rows tall. Landscape still gets the three columns from `DESIGN.md`.

**Hot and cold variants are merged into a single card.** Panas and dingin remain two
separate products in the database — their own codes and prices, and reports still need to
tell them apart — but in the grid they collapse into one card, with temperature asked after
the card is tapped. The logic is copied from the web's `lib/product-variants.ts`, not
rewritten: the temperature marker is not uniform (the Kopi category uses a trailing "S" for
cold and no suffix for hot), and an implementation that assumed only "Panas"/"Dingin" exist
failed to merge eight Kopi cards without raising a single error. The two files now have to
change together, the same way `db/orders.ts` does with the Postgres RPCs.

The consequence is that **the product code disappears from the card** — one merged card
carries two codes. This departs from `DESIGN.md`, which enlarged the code because the
cashier reads it first. Taken knowingly: the search field still sweeps codes, and searching
by code always resolves to a single product, so it goes straight into the cart without the
temperature sheet.

Both layouts share every component in `mobile/components/`, so neither is the "real" one
with the other bolted on. The one width threshold lives in `theme/layout.ts` and is read
through `lib/use-layout-mode.ts` — keyed on width, not device detection, because what
decides whether three columns fit is available width, not brand.

Screens: `CashierScreen` (port of `components/CashierScreen.tsx`, same save flow — check the
table code, let the cashier decide same-customer or different, then write), `OrdersScreen`
(the queue as cards, not the web's six-column table, which has no portrait equivalent),
`EditOrderScreen` (append items and void items, re-reading the order after every write since
both operations bump `version`), and `AppShell` (two tabs).

**expo-router was not installed**, contrary to the earlier plan in this file. Two screens do
not justify file-based routing; a tab state does. Revisit at step 6 if the screen count
grows. `react-native-safe-area-context` was added — bundled in Expo Go, so `start:go` is
unaffected.

**The step 3 self-test was not deleted.** It moved to `screens/DebugScreen.tsx`, reachable
from the header button. It is the only regression suite this project has, and step 4 touches
the same tables. The test actions are now shown only to the owner; cashiers and managers see
the same screen with the catalog pull alone, since that one is part of normal work. This is
a display gate, not a security boundary — it holds only because every action there writes to
local SQLite and nothing else. Anything that touches outlet data has to be gated in RLS.

**Three layout defects appeared only on the device**, each invisible to a typecheck and each
a Yoga flexbox semantic rather than a styling mistake. The login keypad wrapped to two
columns because `minWidth: 88` did not fit the 279dp of usable card width on a 375dp screen.
The login card collapsed onto itself and its children overlapped because `flex: 1` implies
`flexBasis: 0`, so a column child reports zero height to an auto-height parent. The category
chips rendered 214dp tall because a horizontal `ScrollView` stretches its content on the
cross axis by default. The pattern is worth naming: on this layer, `flex: 1` and default
cross-axis alignment are the two things that read as harmless and are not.

No "Cetak Struk" button anywhere — the printer is step 7, and a button that silently does
nothing is worse than an absent one.

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

- ~~Supabase is local, not hosted~~ **Resolved.** The hosted project is live: all four
  migrations pushed, seed applied (1 outlet, 3 employees, 23 categories, 293 products),
  `SESSION_JWT_SECRET` set as a Function secret, `pin-login` deployed. `mobile/.env` points
  at it over HTTPS, which also closes the cleartext-HTTP item.
- ~~JWT signing on a hosted project~~ **Resolved, and this was the real risk.** The project
  uses legacy HS256 keys, confirmed not by inspecting settings but by signing a token with
  the project secret and watching PostgREST accept it. `pin-login` needed no change. Should
  the project ever be switched to asymmetric signing keys, login breaks and has to move to
  shadow `auth.users` rows — so that switch is not a routine setting to flip.
- **The web app still points at local Docker.** Only the mobile client was repointed.
  Deliberate: repointing the web app is a separate decision about which database is
  authoritative for day-to-day use, and the outlet is currently running on the web build.
- ~~On-device verification outstanding~~ **Resolved.** Login, the catalog pull, and the full
  step 3 self-test have all run on a phone, the last of them offline.
- **Tested on a phone, not on the outlet tablet.** The phone is now the primary target and
  the tablet the secondary, so this matters less than it did — but the three-column layout
  still exists in code and has only ever been seen on a rotated phone, never at tablet size.
- ~~The steps 4-5 UI has not run on a device~~ **Partly resolved.** The portrait cashier
  layout, the login screen, the category strip, and the merged variant cards have all been
  seen on a phone, and three layout defects were found and fixed there that no typecheck
  could have caught. Still unverified on device: the step 4 unsent badge and manual push,
  the repeat-push no-op, the offline run, and the three-column landscape layout.
- **The LAN path from phone to laptop does not work on this network.** Metro binds
  correctly and the firewall allows it; the phone simply cannot reach `192.168.100.4:8081`,
  almost certainly router client isolation. Device testing runs over
  `adb reverse tcp:8081 tcp:8081` on USB instead, which bypasses the network entirely.
  Worth knowing before anyone spends another hour on firewall rules.
- **`payments` has no `ON DELETE CASCADE` in Postgres but does in the local SQLite schema.**
  Harmless today — nothing deletes orders in production — but the two schemas differ, and
  the divergence surfaced while cleaning up a test order by hand.
- **Seed PINs are live on a public database.** `Pagi 123456`, `Sore 654321`, `Owner 000000`.
  The rate limit blunts the risk, but `000000` on the owner account should not survive to
  opening day.
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
