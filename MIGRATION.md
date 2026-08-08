# MIGRATION.md — Rusen Kopitiam POS: Web to React Native (Expo)

Guides the migration of the existing web application into a React Native app on Expo,
targeting tablet (primary, cashier station) and phone (secondary, owner reports). Read
alongside `AGENTS.md`, `PRODUCT.  md`, and `DESIGN.md` — this file covers only what changes
for the mobile migration, not the product scope itself.

Progress and corrections are recorded per step below. Where reality contradicted the original
plan, the correction is stated rather than the plan quietly rewritten. That convention is the
point of the file: a plan that has been silently edited to match what happened teaches
nothing.

---

## Start here — state of play

**Steps 1 to 5 and step 7 are done and have run on a real device as a compiled APK.** Login,
catalog pull, the product grid with merged variant cards across all three axes, the cart,
saving an order, editing a pending order, payment with change, the push queue, local history
clearing, and the offline run have all been exercised on a Xiaomi phone from a cleared app
state. **The printer works end to end: an order paid on the device printed its own receipt on
the RPP02N, logo included.** Step 6 (reports and attendance) is not started; step 8 (builds)
is partly done — local Gradle builds work, EAS builds are configured but the last attempt has
not been re-run since its cause was fixed.

**The single most useful thing to know before changing anything:** this project spent most of
its life running under Expo Go, which ships its own prebuilt native code and never runs
`prebuild`. Four defects appeared the first time it was actually compiled, and none could
have been caught by a typecheck (step 8 lists them). Anything touching `app.json` plugin
config, native modules, permissions, or first-run behaviour is unverified until an APK is
built and installed. Do not treat "it works in Expo Go" as evidence.

**PBJT (tax status at payment) landed after step 7** and has its own section before step 8. It is
the one change that altered the meaning of an existing column — `orders.total` is now the amount
charged, not the sum of the items — so read that section before touching anything that reads
money. It is applied and tested on local Postgres only: **not pushed to the hosted project, and
never run on a device.**

**Test data separation landed 2 August 2026** and has its own section before step 8. It is applied
to **both** databases and published as an OTA update, but has **not run on a device** and the web
app was deliberately left out — `/history` still shows test orders unmarked. Read that section
before writing any query against `orders`: the default of every report function now excludes test
data, and the flag cannot be updated after insert.

**The web app is now a manager dashboard and nothing else.** `0027` plus the Tahap 2 frontend
landed 7 August 2026; both have their own sections before step 8. `0027` is applied to **hosted**,
which is what the dashboard points at. Read the Tahap 2 section before touching anything under
`app/` — in particular, the login is Supabase Auth and no longer a PIN, every API route is
guarded by `jaga()` rather than by its own check, and `dasar_pbjt` must not be displayed on
exempt orders. `npm run periksa:laporan` is the gate.

**Where to pick up, in the order that makes sense:**

1. **Step 6, reports.** Untouched, and the next real feature. Two decisions are already made
   (see step 6): numbers come from Supabase with an offline "last synced" state, and access is
   restricted to owner and manager **in RLS**, not just in the UI.
2. **Offline login.** The largest operational risk in the app, unresolved, and a decision
   rather than a bug. See Open items.
3. **Step 7 leftovers.** The print path itself is finished — automatic print on payment, the
   real WiFi passwords, and the logo have all been seen on paper. What is left is small and
   listed under "What remains": whether an unpaid provisional bill should carry the WiFi
   passwords and thank-you line at all.

**Two things that are easy to get wrong and cost a full build cycle each:** a locally built
APK cannot receive OTA updates (no channel meta-data — step 8), and adding any native module
means a new APK, never an update.

**Testing reality.** There is no test runner, by the owner's deliberate decision. The only
automated gate is `npm run typecheck`. Behavioural confidence comes from the on-device
self-test in `mobile/screens/DebugScreen.tsx` (eleven checks over the local SQLite layer,
owner-only, reachable via the hamburger menu) and from ad-hoc scripts written and discarded
per change. Where a script was worth keeping, it is in `mobile/scripts/`.

## Why this migration

The web build works and reflects the intended product. The move to native is driven by
hardware access: ESC/POS thermal printer (USB/Bluetooth) needs native modules that a
browser/PWA cannot reliably reach. Everything else (UI, business logic, database) carries
over with minimal rework.

## Tech stack for the mobile build

- Expo SDK 57 / React Native 0.86 / React 19.2, TypeScript strict — managed workflow with a
  custom development client. Expo Go is still usable for JS-only iteration, but it cannot run
  the printer module, so it is no longer the default.
- **StyleSheet + typed design tokens, not NativeWind.** NativeWind's stable release targets
  Tailwind v3 while the web app is on Tailwind v4; v4 support exists only in NativeWind 5
  preview. Revisit when it stabilises — `mobile/theme/` works with either.
- Font: Poppins via `@expo-google-fonts/poppins` and `useFonts`.
- Local database: **expo-sqlite** (chosen in step 3 — reasoning recorded there).
- Supabase JS client with the **anon** key, under real RLS policies.
- Printer: **RPP02N**, 58mm, over Bluetooth Classic (SPP), driven by a local Expo module,
  `mobile/modules/escpos-bluetooth` — roughly 200 lines of Kotlin. **No third-party printer
  library is used, and that was a decision, not an oversight.** Earlier drafts of this file
  named the printer as a Blueprint ECO 58D and named `react-native-esc-pos-printer` as a
  candidate; both were wrong. Step 7 records the survey and the reasoning.

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

**There are now three variant axes.** Toppings came third; the record of that is a few
paragraphs below, after the sauce one it builds on.

Sauce variants for the fried-batter rice packets
(Ori / Mayonnaise / Bangkok / Mentega / Lada Hitam / Teriyaki) were added later, and the
temperature grouping could not simply be extended to carry them. The blocker was subtler than
"sauce is not temperature": the old rule read a name with *no* suffix as the hot candidate, and
the sauce axis needs a name with no suffix to mean Ori. One signal, two meanings. So group
*kind* is now resolved first, from whichever siblings carry an unambiguous marker, and only
then does a suffix-less product get its meaning. Sauce detection is a closed word list rather
than a pattern, so "Nasi Paket Telur Kecap Pedas" can never be read as a sauce called "Pedas".

Two consequences worth knowing. A card carrying both axes is refused rather than merged — it
would need two questions in one sheet, and an extra card beats a card that hides half its menu.
And Ori is preselected while temperature deliberately is not: hot and cold are equally
legitimate, so highlighting one puts a thumb on the scale of what sells. That difference is why
`VariantSheet` has two interaction models — tap-to-add where there is no default (the busiest
path, unchanged at one tap), select-then-confirm where there is (otherwise "default" means
nothing, since the cashier still has to press Ori themselves).

`npm run periksa:varian` (in `mobile/`) runs the grouping over the seed catalog with no device:
309 products → 247 cards, 38 temperature pairs, 2 sauce cards, 2 topping cards. The pair count
is the regression signal — it was 38 before the sauces and before the toppings. The card count
moved from 255 to 249 when eight Indomie rows collapsed into two cards, then to 247 when `0010`
added six more rows and folded the two lowercase strays in with them.

### Indomie toppings — the axis that needed no migration at all

The four topping presets already existed as priced products, and had since the original
spreadsheet import. `K134`–`K137` and `K130`–`K133`: Polos, Sayur, Sayur + Telur, and
Sayur + Telur + Sosis, at exactly the +2.000 / +7.000 / +10.000 steps Heika specified, in both
Goreng and Kuah. The `TOPPING` category confirms the arithmetic independently — Sayur 2.000,
Telur 5.000, Sosis 3.000, sold separately, summing to the same three steps. So there is no
`0010`, no new column, and no new row: the data was right and only the screen was wrong,
showing eight cards where the menu has two dishes.

Three properties of the axis are worth writing down because none is obvious from the names:

The four presets were a **ladder**, not three free checkboxes: no Telur without Sayur, no Sosis
without both, because no such row existed and therefore no such price did. That constraint is
gone — see the next section — but the shape of the fix is worth keeping, because it is the same
trick twice. Ticking state was never conditional logic; it was an index. First the index into
the preset list, now a three-bit mask. Both times the requested behaviour fell out of the
representation with no special cases in it.

This is the only axis whose base option is **written out**. Temperature reads a missing suffix
as hot, sauce reads it as Ori; topping reads it as nothing at all, because "Polos" is spelled.
A suffix-less Indomie is therefore not a preset, has no price, and stands alone as an ordinary
card — which is the correct treatment, not a gap.

**Jenis kuah (Ayam Spesial / Soto) is deliberately not a product.** It costs the same either
way, so making it one would mean eight rows for Indomie Kuah instead of four, doubling again
with every future topping — and worse, it would split the sales report along an axis worth zero
rupiah, so "how many bowls with sausage" would no longer read in a single line. It rides in
`order_items.notes` instead, a column that already exists, already reaches the receipt, and is
already part of the append-merge key. It is required rather than defaulted: both are equally
ordinary, and preselecting one quietly sells that one every time the cashier is in a hurry.

The cost of that choice landed in the cart, not the database. A cart line was identified by
`productId` alone, which was true until two lines could differ only by `notes` — after which
pressing "−" on the Soto row also decremented the Ayam Spesial row, and React saw two children
with the same key. `draftLineKey` (duplicated in `lib/types.ts` and `mobile/lib/types.ts`) now
keys them, on both the web and the phone. The local `appendToOrder` already keyed on `notes`,
so nothing below the UI needed changing.

Two rows in `INDOMIE` remain outside all of this and were left alone: `138 indomie goreng+telur`
(15.000) and `139 indomie kuah+telur` (13.000), lowercase and unmatched by any preset. They are
combinations the new rule says cannot exist, at prices that fit no ladder. They render as their
own cards exactly as they did before, so nothing regressed — but they are almost certainly dead
rows from the old POS, and deleting them is Heika's call, not something to do quietly.

### The dead rows were the evidence — `0010_topping_indomie_bebas.sql`

Heika printed a receipt, then said the checkboxes should tick freely. That contradicts the
paragraph above, and the honest reading is that the ladder was never the shop's rule — it was
the shape of whichever four rows happened to survive into the spreadsheet.

The two rows recommended for deletion settled it. 15.000 is 10.000 + 5.000; 13.000 is
8.000 + 5.000. Both are exactly base plus the `TOPPING` category's price for Telur alone. They
are not leftovers at all: they are the free combination the shop was already selling, typed by
hand in the old POS because the old POS had no way to express it either. **Pricing is additive,
and it always was** — Sayur 2.000, Telur 5.000, Sosis 3.000 reproduces every Indomie row in the
catalog, including the four that looked like a ladder. Nearly deleting them would have destroyed
the only evidence that the ladder was an artifact.

So `0010` adds the three combinations per dish that never existed (Sosis, Sayur + Sosis,
Telur + Sosis) and renames the two lowercase rows to match the naming the grouping parses.
Renaming is safe against history because `order_items` snapshots `product_code` and
`product_name` at transaction time. Still no schema change; the eighth axis of this system is
still "one product row per thing you can buy."

Codes are `K134A`–`K134C` and `K130A`–`K130C`, following `0009`'s suffix convention. The first
attempt used `K196`–`K201` and collided with `ADDON` on `K200`/`K201`, which `periksa:varian`
caught as 309 products but 307 distinct — a reminder that the code space is not a tidy sequence
with a high-water mark, and that grepping `K1[0-9]{2}` proves nothing about `K2xx`.

**The regex change exposed a latent key bug.** Once `Telur` and `Sosis` became recognised
suffixes on their own, `Nasi Goreng Sosis` and `Bubur Polos` began marking their whole name
group as a topping group. Their siblings carry no variant value, so they were never merged —
but they still took the *group* key, so seven distinct Nasi Goreng cards shared one React key.
That was already true for Bubur before this change; nothing had noticed. A card is now allowed
the group key only if it actually anchors a group.

Related, and the reason the checker earns its keep: `\s+` at the front of `TOPPING_SUFFIX` is
load-bearing. Without it the `TOPPING` category's own products — literally named `Sayur`,
`Telur`, `Sosis` — collapse into a single nameless card, because their base names are all the
empty string.

The checker now asserts what the shape actually requires: all eight combinations present, and
every price equal to base plus the sum of its ticked toppings. Both failures are silent
otherwise — a missing combination only greys out a checkbox, and one mistyped price looks
entirely ordinary until the report disagrees with the till.

**A tooling defect worth remembering.** Two of these files were patched with `node -e` scripts
using template literals, and `\b` inside a template literal is a *backspace character*, not a
regex word boundary. `mobile/scripts/periksa-varian.ts` ended up containing literal control
characters, so `/\bkuah\b/i` silently became a regex that could never match, and the check went
red while every value in it was correct. `grep` and `sed` render backspace as nothing, so the
line looked right in every terminal reading of it. It cost about twenty minutes. The lesson is
narrow and practical: patch source files with the editor, not with `node -e` string surgery, and
if a check fails while its inputs are provably correct, dump the bytes before re-reading the
logic.

**`0009_varian_saus.sql` has been applied to both databases** — the local Docker one the web app
uses, and the hosted one the phone uses. Applied in that order and on purpose: the two must not
diverge, because a device missing the new menu looks completely normal and reports nothing. The
local database kept its data (293 → 303 products, existing orders untouched); the seed was not
re-run. Ori is the pre-existing row in both cases, so `K148`/`NP2` were not modified at all.

Only the *Tepung* rows got sauces. `K147 Nasi Paket Ayam Goreng` (Rp 30.000) and
`NP003 Nasi Paket Cumi Goreng Tepung` (Rp 25.000, same family, same price) were deliberately
left alone because Heika did not name them — an open question rather than a decision.

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

**The landscape three-column layout ran on a device for the first time, and one width
threshold turned out to be answering two questions.** A phone rotated sideways gives
834×375dp. The width is genuinely enough for three columns, so `breakpoints.wide` was right;
what it could not know is that the height had collapsed to 375dp while every piece of app
chrome was still sized for a portrait screen. The header and tab bar alone took a third of
it. The cart column then overflowed its own bounds — its children had no `flexShrink`, and
because React Native defaults `overflow` to `visible`, the buttons that were pushed out were
drawn on top of the tab bar rather than clipped. Two fixes, of different kinds: the cart body
is now wrapped in a `flex: 1` view with `overflow: "hidden"` on the column as a backstop, and
a second threshold, `breakpoints.short` (520dp) with a `useShortViewport()` hook, tightens
the chrome without touching the column count. How many columns and how loose the frame are
two decisions, and one number cannot carry both.

**The top bar was replaced by a menu button.** Employee name, role, Katalog/Uji and Keluar
are read once at the start of a shift and then never touched, yet the row holding them cost
~44dp all day — on a 375dp screen that is the difference between one row of product cards and
two. They now live in a `Sheet` opened by a three-line button sitting to the left of the
product search, with a second copy of the button in the Orders tab, which would otherwise
have no route to Keluar. The icon is three `View`s rather than an icon library: the project
has none, and a single button does not justify adding one. This applies in both orientations
on purpose — a control that moves between portrait and landscape is worse for someone who has
memorised where it lives than a slightly taller portrait screen is.

No "Cetak Struk" button anywhere — the printer is step 7, and a button that silently does
nothing is worse than an absent one. *(Superseded by step 7 — the button exists now, on paid
cards only.)*

### The orders list grew two things the web app never needed

**A read-only detail sheet (`components/OrderDetailSheet.tsx`).** Paid and voided orders
cannot change, so the sheet has no control that writes — not a disabled one, none at all. Its
layout follows the receipt rather than the cart: name, qty × price, subtotal right-aligned,
then total. The cashier already knows that shape from paper, and a screen that disagrees with
the paper it just printed is a second thing to learn.

**History clearing (`db/orders.ts`, `components/ClearHistoryDialog.tsx`).** Finished orders
pile up on a device that never forgets, and the list is how a cashier finds the order they
need to reprint. `HISTORY_KEEP_HOURS` is 12 — a full working day with slack — counted from
when the order *finished*, not when it was created, so a table opened at 9am and paid at 9pm
is zero minutes old as history.

Two constraints, both about money rather than tidiness. It deletes on the phone only: no
employee account holds a DELETE grant on the server, deliberately. And it refuses anything
that is not `sync_status = 'synced'` — a paid order that has not been pushed exists on that
device and nowhere else, so deleting it destroys a record of money with no copy anywhere and
no way to notice it is gone. The dialog therefore states both numbers, how many will go and
how many are held back, instead of asking "are you sure?": a question with no numbers in it
only ever buys a reflex tap, and the held-back count is the one signal that unsent money
exists on this phone.

### Filtering before grouping tears variant families apart

Found on a device, after everything else in this section was already working. The Indomie
category on the cashier screen looked perfect — one "Indomie Goreng" card, one "Indomie Kuah",
eight topping combinations each. But the **Edit Order** screen opened with two cards named
"Indomie Goreng Telur" and "Indomie Kuah Telur", each a plain card with no topping sheet at all.

The cause was one line: `EditOrderScreen` had no category picker, so with an empty search box it
showed `products.slice(0, 30)` — a slice of the **raw product list**, taken before
`groupProductVariants` ran. `listProducts` orders by `code`, and product codes are not a tidy
sequence (see `AGENTS.md`): the two "telur saja" rows renamed by `0010` still carry the bare
numeric codes `138` and `139`, which sort to the very top of a string ordering, while their seven
siblings `K130`–`K137` sort far below and never made the cut. Each group was left holding a single
option, and step 3 of `groupProductVariants` then did exactly what it is supposed to do for a
genuinely single-variant product like "Kopi Cendol S" — restore the full product name and drop the
variant sheet. Two orphans, at the top of the screen, with no error anywhere.

The same shape, milder, was in both apps' search: filtering products by name meant typing "telur"
matched seven of the eight Indomie combinations, so the card still appeared but the Sosis-only
checkbox had no product row behind it and sat dead.

**The rule now is that anything which narrows the menu runs on cards, never on products.**
`filterProductEntries` (twinned, like the rest of `product-variants.ts`) matches a card when its
base name or any of its variants' names or codes match, so searching a variant code like `K137`
still finds the card — whole, with all eight options. `ProductGrid` owns both the keyword filter
and the card limit, and both run after grouping. Category filtering stays where it was and is
safe: the group key already includes `category_id`, so a family can never straddle two categories.

`npm run periksa:varian` now asserts all three failure shapes: that no card is named after a
topping variant, that searching "telur" returns the Indomie cards intact, and that searching a
variant code finds the whole card. Each of those assertions fails against the old code.

### The "Tambah item" sheet closed itself after every single item (2026-08-02)

Reported from the counter, not found in code review: adding items to a saved order meant the
sheet shut after *each* one. An order of four drinks was open sheet → type → tap → sheet gone →
reopen → retype the same search → tap, four times. `handleAdd` called `setAdding(false)` and
`setSearch("")` before doing anything else. Nothing was broken; it was just built for the
one-item case and orders are almost never one item.

The sheet now stays open until the cashier presses (x). Three things had to come with that:

**A ref guard, not the `busy` state.** `appendToOrder` takes `expectedVersion`, and the new
version is only known after `reload()`. With the sheet open the cashier can tap twice inside one
render, and both taps would carry the same version — the second rejected with `STALE_ORDER` for
no mistake the cashier made. `busy` cannot prevent that: it is state, readable one render too
late. `busyRef` is set synchronously inside the handler and cleared in the promise's `finally`.

**The variant path still closes the sheet, then reopens it.** RN `Modal` will not show two at
once (undefined z-order and back-button behaviour on Android — the original reason for the close,
still true). So `selectEntry` closes it before `VariantSheet` and both `onPick` and `onCancel`
set it back open. From the counter it never appears to close on its own.

**The sheet's subtitle carries the item count and order total.** It now covers the item list for
minutes at a time instead of seconds, and without those two numbers the cashier adds several
items blind to what has already gone in. The toast alone is not enough — it is gone in a second
and says nothing about the running total.

`search` is deliberately *not* cleared after an add, so three of the same drink is three taps on
one card. It clears on close.

## Refund — money back on a paid order ✅ (mobile + server; web not yet)

Built because the shop was about to open with **no way at all to correct a paid transaction**.
`void_order_item` refuses anything that is not `pending`, so the moment the cashier pressed
Pelunasan, any mistake was locked in forever. The `refunds` and `refund_items` tables had existed
since `0001_init.sql`, empty, never written by anything.

Decisions (Heika): tax **is** refunded proportionally · **partial per item** · **any cashier**,
employee recorded, reason optional · **no refund receipt**. Scope is mobile and server; the web
app is untouched until Heika confirms, since the outlet is moving to the phone and the web app
points at a different database.

**The paid order row is never modified.** The tempting move — reduce `subtotal`/`tax_amount`/
`total` — is wrong: `total` is what was charged and what the receipt in the customer's hand says,
and `payments.amount` is validated against it by `push_order`. So a refund is new rows, and net
revenue is a subtraction done in reports. Status stays `paid` too; adding a `refunded` value to
the `order_status` enum would touch every status reader in two apps for the sake of one label,
so "Diretur" is derived in the UI from the presence of refund rows.

**The rounding rule that will not be obvious later.** Refunded tax uses the order's snapshotted
rate, not the outlet's current one. And when a refund exhausts the order's subtotal, the tax
returned is the *remainder* of `orders.tax_amount`, not the formula result. Without that, a refund
split in two can leave one or two rupiah of tax that can never be returned and can never be
explained. Three engines implement it: `hitung_pajak_refund` (0016), `refundTax`
(`mobile/db/orders.ts`), and the preview in `RefundSheet`.

**Two traps found while building, both silent:**

*A refund must bump `orders.version`.* `push_order`'s update branch is predicated on
`version < v_version`, and when that UPDATE matches nothing the function **returns immediately** —
the mechanism that makes "Kirim ulang" safe. A refund that changed no order column would therefore
be judged a stale replay, its rows never inserted, and the call would answer *success*. Money out
would exist only on the phone with nothing anywhere saying so. `createRefund` bumps the version
even though no money column on that row changes, and `DebugScreen` asserts it.

*The foreign-key trap `0014` predicted.* Its own comment marked `refund_items.order_item_id →
order_items` (no cascade) as a step-6 problem: the update branch deletes and rewrites all
`order_items`, which a refunded order would refuse. `0017` answers it by **skipping the item
rewrite when the stored order is already `paid`** — not as a patch for refunds, but because paid
orders never change their items anyway. The rewrite exists solely for `pending` edits. The stored
status is read *before* the UPDATE overwrites it.

`0017` is `0014` with exactly three changes, and the file is a full copy on purpose so `diff`
can prove that. `create or replace`, never drop — dropping takes `grant execute … to
authenticated` with it and kills sync on every phone.

**What `push_order` validates on refunds, and what it does not.** It enforces internal arithmetic
(amount = subtotal + tax, subtotal = sum of items), the cashier's identity and outlet, and the
cumulative cap: total refunded can never exceed what was paid. It does *not* recompute each
refund's tax from scratch — the correct check would have to replay the whole refund history in its
original order, which a send queue that may repeat cannot guarantee. Same reasoning as why the
snapshot rate is not forced (see `0014`). The cumulative cap is the guard that actually protects
money.

`0018` makes reports subtract refunds. Skipping it would overstate revenue *and* tax collected
with nothing to indicate it — for regional tax filing that means remitting on cancelled sales.
Gross and net are reported side by side rather than only the difference. Refunds are grouped by
**when the refund happened**, not when the order was paid, because that is when cash leaves the
drawer; a refund of last month's order therefore lands in this month. `get_pbjt_harian` uses a
`full outer join` so a day with refunds but no sales still gets a row.

One regression caught during testing: rewriting `get_pbjt_summary` around a `cross join` made it
return **zero rows** instead of one row of zeros for an empty period — it would have broken on the
first day the shop was closed, not on the day it was tested. It uses scalar subqueries now.

Local SQLite goes to V3: two new tables, nothing rebuilt. The arithmetic CHECK **is** carried here,
unlike V2 — the tables are new, so there is no existing row to damage and no paid-but-unsent order
at risk, which were the two reasons V2 refused. `on delete cascade` to `orders` is what keeps
`clearHistory` correct with no change at all.

**The history list had to learn to show it.** Because the status stays `paid`, a fully refunded
order looked identical to a fully paid one — same green "Lunas", same Rp 33.000 — and the only
hint was the *absence* of the Refund button, which is a signal made of nothing and reads as
nothing. `StatusBadge` now takes an optional `refund` state derived from the refund rows:
Lunas (green) / Refund Sebagian (amber) / Refund Penuh (red), reusing the colour meanings the
cashier already knows from Belum Lunas and Dibatalkan. It is ignored unless the status is `paid`,
so the prop can never make the badge claim something impossible. The card shows both amounts —
charged struck through and dimmed, net in bold — because both are true and answer different
questions: one matches the customer's receipt, the other matches the drawer.

`refundTotalsByOrder` is a single query feeding all three consumers (badge, net amount, whether
the Refund button exists). One map on purpose: three separate derivations of "how much came back"
is exactly how the badge and the button end up disagreeing about the same order. The comparison
is `>=`, not `===`, so a stray rupiah can never label a fully returned order as partial.

Still open: the web app, and the fact that no report function is callable by any employee account
(all `security invoker`, no `grant execute`) — a separate piece of work.

## Step 6 — Reports and attendance (not started, two decisions made)

Sales and product reports may read Supabase directly when online, but must show a "last
synced" state offline rather than breaking.

**Decided by Heika, before any code:**

- **Numbers come from Supabase, with an offline "last synced" state.** The alternative —
  computing reports from local SQLite — needs no backend change and works fully offline, but it
  only ever sees orders authored on *that* phone. A reinstall or a second device would make the
  report quietly short of money, with nothing anywhere reporting an error. That is the same
  failure shape as the `push_order` defect in the historical record, and it was rejected for
  the same reason.
- **Owner and manager only, enforced in RLS.** `PRODUCT.md` already says cashiers cannot view
  full sales reports. Hiding the tab by role, as `DebugScreen` does, is not enough here: that
  gate holds only because every action behind it writes to local SQLite and nothing else.
  Revenue is outlet data, so the boundary has to be in the policy.

Consequences to plan for: this needs a migration granting read access to `orders`,
`order_items` and `payments` — or, more likely, a `security definer` RPC that returns
aggregates rather than rows, in keeping with step 4's decision to keep the tables sealed.
`refunds` / `refund_items`, left out of step 3 as report-side, belong here. Attendance also
belongs here but needs clock in/out built first — `attendance_logs` exists in the schema and
no code anywhere touches it.

## Tutup Kasir — printed shift close-out ✅ (local only, not Step 6)

Distinct from Step 6 above and easy to confuse with it: Step 6 is the owner/manager sales
*report* tab, decided to read from Supabase because a single phone's SQLite would quietly
under-report money earned on other devices. Tutup Kasir is a **per-cashier till reconciliation**
— what this one phone took in during one shift — and by definition only cares about orders this
phone processed. Reading it from the server would add a network dependency to a print that must
work with no signal, for a number the server round-trip cannot make more correct.

**Shift is tied to login, not a separate open/close button.** Heika's requirement: cashier logs
in, must enter Modal Awal before serving (a new `<ModalAwalGate>` blocks the whole app until
this happens), works the shift, prints Tutup Kasir at the end. The cashier stays logged in
afterward — the app does not force logout — so the *same* gate reappears for the next shift,
keyed off `currentShift(db)` returning `null` again. This makes "Waktu Buka" mean exactly one
thing always (the moment Modal Awal was entered), instead of needing a special case for "second
shift on one login" where it would otherwise have meant "when the previous shift closed."

**`shifts` is a new local-only table (`db/migrations.ts` V4), not pushed to Postgres.** The
money underneath it (`orders`, `refunds`) already syncs; only the shift *boundary* is
device-local. Pushing it would mean a new migration, RLS, and a `push_order`-shaped write path
for a number nothing server-side reads yet — tracked as a follow-up in `TO_DO.md`, not
built speculatively.

**Print, then close — never the other order.** `printTutupKasir` in `AppShell.tsx` calls
`printShiftReport` before `closeShift`. If printing fails, the shift stays open and the cashier
can retry with the same totals; closing first and printing second would risk a closed shift
with no paper to show for it.

**Totals come from `orders`, not `payments`.** `payments` has no TypeScript row type and no
reader anywhere in the app; `orders.payment_method`/`total`/`tax_amount` already carry
everything needed and is one query instead of a join. Cash and non-cash only — the printed
receipt Heika reconciled against (`Tunai` / `Transfer` / `Qris`, with Transfer and Qris shown at
an identical amount) confirms Qris is not tracked as a separate channel anywhere in this POS
either; splitting payment channels further is deliberately out of scope, see `TO_DO.md`.

**`Saldo Akhir = Modal Awal + Penerimaan − Refund` is the printed total, not physical cash in
the drawer** — non-cash payments never touch the till. If a physical cash-count reconciliation
is ever wanted, that is a separate line (`Modal Awal + Tunai − refund tunai`), not a
reinterpretation of this one.

**Voids are not in this report.** Only refund reduces the printed total — a voided item never
became money, so it was never in `Total Penerimaan` to begin with. `0015_laporan_pbjt.sql`'s
`get_sales_summary` reports void as separate informational context; this local report chose to
leave it out entirely rather than print a number that looks like a deduction but isn't one.

Verified with `npm run preview:struk`: normal shift, a shift with a refund, an all-zero shift
(proves the report stays sensible with no transactions), and a shift with a cashier name long
enough to force `pair()`'s label-truncation path to fail outright — the name is longer than 32
columns *by itself*, so no amount of shrinking the "Kasir" label helps. Caught a real bug this
way: `pair()` only ever protects the money value by truncating the label; for a name-shaped
value there is no label short enough. Fixed with `pairAtauBaris` in `lib/receipt.ts`, which falls
back to `wrap()`-ing the value onto its own line(s) when the single-line form would overflow.

### Selisih kas — physical cash count reconciliation ✅ (V5)

Added after the report above shipped: the cashier now types the physically-counted cash amount
before the shift can close, and the receipt prints whether it matches what the numbers say
should be in the drawer.

**Blind count is the one non-negotiable design choice here.** `TutupKasirSheet.tsx` does not
show "Kas Seharusnya" (cash the numbers say should be there) until the cashier has typed a
count. If the expected number were visible first, the cashier would simply retype it and the
variance would read zero on every shift — including ones that are actually short. That makes
the control theater, and worse than no control at all, because a report that always says
"COCOK" gets trusted. The state that makes this work is a `string`, not a `number`: `""` means
"not yet counted" and must be distinguishable from `"0"` (drawer counted and genuinely empty).
`ModalAwalGate.tsx`'s `Number(text) || 0` pattern collapses that distinction and was
deliberately **not** reused here.

**The variance never blocks closing or printing, at any value.** Blocking would push cashiers
toward typing whatever number lets them go home, which defeats blind counting the same way a
visible expected number does — the incentive is identical either way.

**`refund_tunai` is a new, separate number from `shifts.refund`.** `refund` (V4) is *all*
refunds regardless of payment method, and stays correct for the printed "Refund" line and
"Saldo Akhir" — untouched. Only cash-drawer reconciliation needs "refunds that actually left the
drawer," so `shiftTotals` (`db/shift.ts`) runs a second refund query filtered to
`orders.payment_method = 'cash'`. **Known gap, written as a code comment, not silently
accepted:** `refunds` has no payment-channel column of its own, so this infers the channel from
the *original order's* payment method. A refund against a non-cash order that was, in practice,
paid out of the till in cash will not be counted here, and will surface as a KURANG variance
indistinguishable from an actual miscount. The real fix is a channel column on `refunds` itself
— tracked in `TO_DO.md`, not built speculatively for a case that has not yet occurred.

**Variance direction is printed via the row label — `KAS COCOK` / `SELISIH LEBIH` /
`SELISIH KURANG` — never via a minus sign on the amount.** A `-` is easy to miss on 58mm thermal
paper, and a KURANG that gets misread as LEBIH is the kind of error nobody ever notices,
because the receipt still looks entirely normal. `preview-receipt.ts` asserts the label
matches the sign of every fixture's actual variance for exactly this reason.

New columns land as V5 in `db/migrations.ts` (`refund_tunai`, `kas_fisik`, `selisih` — all
nullable, since shifts closed before this change have no value to backfill and `null` says so
honestly instead of a `0` that would claim a count happened). **V4 was not edited** — Heika's
phone had already run it before this change was written, so touching V4 would produce
"duplicate column" on that device's next migration while a fresh install silently diverged from
it.

### Kas Masuk / Kas Keluar — non-sales money inside a shift ✅ (V6)

The gap this closes: the cashier buys stock (gas, ice, water) with money from the till, and
until now that money left with no trace anywhere. Its only appearance was as a **SELISIH
KURANG** on Tutup Kasir — shaped exactly like a miscount or a theft. A reconciliation report
that cannot tell "bought gas, 200.000" from "200.000 missing" is a report that stops being
believed, and the failure is silent: the paper looks completely normal either way.

**Entries are keyed to `shift_id`, not to a time window.** `shiftTotals` buckets orders by
`[opened_at, now)` because orders exist independently of shifts. A cash movement is *born* from
a shift, so it carries the id — which removes the time-zone question entirely and makes it
impossible for an entry to land in a neighbouring shift. The inconsistency between the two
bucketing strategies inside one function is deliberate and is noted in that function's comment,
because it reads like an oversight.

**`voided_at`, not `delete`.** A mistyped amount on a number pad is a certainty, so cancelling
has to exist. But a row deleted outright means "record 200.000, delete it, pocket the cash"
leaves nothing behind. A cancelled entry disappears from the totals and from the paper; the row
stays in SQLite. Same reasoning as no employee account holding a DELETE grant on the server.

**Non-cash entries move no total on the receipt, on purpose.** Heika asked for both channels,
and the money that never passed through the drawer cannot change `Kas Seharusnya`; `Saldo
Akhir` stays purely sales (`Modal Awal + Penerimaan − Refund`) so that slips printed before and
after this change remain comparable. So a non-cash entry prints as a record with its own total
line and nothing else — that is a decision, and it is written as a code comment in
`renderShiftText` so it is not "fixed" later.

**`kasSeharusnya()` was extracted while adding these two terms, not before.** The formula lived
in three places — `lib/receipt.ts`, `components/TutupKasirSheet.tsx`, `screens/AppShell.tsx`.
Adding two terms to three copies is the surest way to make the screen and the paper disagree
with no way to tell which one is right. It is now one exported function in `lib/receipt.ts`
(which is React-Native-free, so `preview:struk` can call it too) and all three call it.

**The four total labels dropped their "Kas " prefix, and the block headings became
unconditional in exchange.** `Kas Keluar Non Tunai` is 20 columns; against a 7-digit amount
`pair()` sacrifices the label and prints `Kas Keluar Non Tuna`. That is `pair()` working as
designed — money is never cut — but a supplier paid ~2.400.000 by transfer in one shift is
plausible enough that the truncation would be seen. `Masuk Tunai` / `Masuk Non Tunai` /
`Keluar Tunai` / `Keluar Non Tunai` cap at 16 columns and stay whole up to `Rp 999.999.999`.
The shortened labels no longer say "kas" themselves, so `KAS MASUK` / `KAS KELUAR` now print
even when their lists are empty and carry that meaning — same reasoning as the `Refund` line
that always prints at zero.

**`clearHistory` cannot eat these rows.** `HISTORY_KEEP_HOURS` (`db/orders.ts`) deletes synced
finished orders, and `refunds` follow via cascade. `cash_movements` hangs off `shifts`, so it
survives. Recorded here because it looks like an inconsistency worth "correcting."

V6 in `db/migrations.ts` adds the `cash_movements` table plus four nullable snapshot columns on
`shifts` (`kas_masuk_tunai`, `kas_masuk_non_tunai`, `kas_keluar_tunai`, `kas_keluar_non_tunai`)
— nullable for the same reason as V5's: shifts closed before this change never had the value,
and `null` says so honestly where `0` would claim it was recorded and came to nothing. V1–V5
untouched.

## Shift gate — from blocking modal to read-only mode ✅ (mobile only; not yet on a device)

`ModalAwalGate` used to replace the entire app whenever `currentShift(db)` returned `null`: a
cashier who had just logged in could see nothing — not the catalog, not yesterday's orders —
until they typed an opening float. That is heavier than the problem deserves. **Reading does not
move money.**

What actually needs a shift is every *write*. Tutup Kasir's report is windowed by
`shift.openedAt` (`db/shift.ts`), so anything written before a shift is opened is counted by no
report anywhere, and nothing says so. So the gate moved from the door to the writes:

- Login goes straight into the app. Catalog, order list, receipt reprints, `pushPending` — all
  free. `pullCatalog` is deliberately free too: it copies prices down from the server and touches
  no money. Blocking `pushPending` would be actively wrong — it holds back money already recorded
  on the phone.
- Every write goes through `useGateShift()` (`lib/shift-context.tsx`), which returns `false` and
  toasts the reason. Buttons are *also* disabled, but the handler guard is the net that matters:
  several writes are reachable from a sheet or dialog whose button is not the one disabled
  (`TableConflictDialog` calls `createNewOrder` directly; `VariantSheet` calls `addProduct`).
- `ShiftBanner` states the situation persistently on both screens. Yellow, not red: no shift at
  the start of the day is normal, not a fault, and red is already spoken for by MODE UJI. Two red
  banners with different meanings blunt each other.

**`currentShift(db) === null` stays the single source of truth**, now held once in
`ShiftProvider` instead of in `AppShell` state — three screens need it, and two copies of a
"shift is open" flag would eventually disagree. `aktif` counts `undefined` (still loading from
SQLite) as *not* active: read-only is the safe default, and the cost is a fraction of a second of
dim buttons rather than an order written outside a shift.

**Tutup Kasir itself is untouched.** `kasSeharusnya`, the blind count, `refund_tunai`, and above
all the print-then-`closeShift` order are exactly as they were — only the entry point changed.
The menu's shift button now swaps label ("Mulai Shift" ↔ "Tutup Kasir") off the same state, and
because a button that changes role under the thumb can be tapped by mistake, closing goes through
`TutupKasirConfirm` first. It names the cashier and the opening time, in the `ClearHistoryDialog`
style: state numbers, do not ask "are you sure?".

Kas Masuk/Keluar is openable without a shift but read-only. Entries belong to a shift
(`cash_movements.shift_id`), so there is nowhere to write and nothing to show — the zeroes are
honest, and showing the previous shift's numbers would not be.

The four settings buttons — Katalog/Uji, Mode Uji, Periksa Pembaruan, Printer — moved out of the
menu to `PengaturanScreen`, behind a gear to the left of the shift button. Same reasoning that
turned the old header bar into a sheet: what the menu is actually opened for is cash and the
shift, and four buttons stacked above them means hunting every time. Mode Uji's own rules are
unchanged; only its location is.

Verified without a device: `npm run typecheck`, `periksa:varian` (38 temperature pairs), and
`preview:struk` all pass — the last two are the evidence that neither variant grouping nor the
receipt was touched.

**Not verified yet: anything involving paper or a phone.** The whole read-only → Modal Awal →
active → confirm → close cycle still needs a device run, and the Tutup Kasir printout must be
compared line-by-line against one from before this change. The print-failure path matters too:
the shift must stay open when printing fails.

What this does *not* do is make the gate structural. A new write added tomorrow is unguarded
unless somebody remembers `useGateShift()`; nothing but convention enforces it.

## Step 7 — Printer integration ✅ (paper comes out of the printer)

**A receipt has been printed on the real printer from the real app.** `EscposBluetooth:
Tersambung ke RPP02N lewat SPP aman` in logcat, and paper in hand.

**The printer is an RPP02N, not a Blueprint ECO 58D.** Earlier versions of this file named
the ECO 58D as settled fact. The device that is actually bonded to the phone advertises as
`RPP02N` at `66:32:54:BB:FA:85`, device class `0x040680` (imaging). Still 58mm, still 32
columns, so `receipt.ts` was unaffected — but the model name in this file was simply wrong,
and it is the kind of wrong that sends someone hunting for the wrong datasheet.

**Bluetooth Classic SPP confirmed, not assumed.** `adb shell dumpsys bluetooth_manager` shows
the bonded device carrying UUID `00001101` — Serial Port Profile. That settles the transport
question the earlier draft left open, and confirms BLE libraries (`react-native-ble-plx`, the
only one Expo supports) can never see this printer.

### The library survey, and why none of them were used

The ecosystem is as thin as this file predicted, and thinner in one specific way:

- **`react-native-esc-pos-printer`** (4.5.0, Oct 2025) — ruled out on inspection. It wraps the
  Epson ePOS SDK and drives Epson TM printers only, over BLE/LAN/USB. Not generic ESC/POS, not
  Classic SPP. An earlier draft of this file named it as a candidate; it never was one.
- **`react-native-bluetooth-classic`** (1.73.0-rc.17, Nov 2025) — the only real Classic SPP
  option, and still a release candidate. Its "New Arch Support" issue (#334) has been open
  since July 2024 with no implementation. The Expo config plugin its own docs point at,
  `with-rn-bluetooth-classic`, was last published in **May 2022** — before SDK 46.
- Everything else on npm is 2019–2024 and unmaintained.

**A local Expo module was written instead: `mobile/modules/escpos-bluetooth`.** Roughly 200
lines of Kotlin. The reasoning is that the job is far smaller than a Bluetooth library: the
printer is bonded through Android Settings, so scanning, pairing, bond management and
connection-state events — the entire reason those libraries are large — are work this app
never needs. What remains is list bonded devices, open an RFCOMM socket, write bytes, close.

Written with the Expo Modules API, so it is a real TurboModule and does not sit on the legacy
bridge interop layer at all. That layer still exists in RN 0.86 (0.85 removed
`CatalystInstanceImpl` but kept interop; 0.86 shipped with no breaking changes) — but it is
being dismantled release by release, and the money path should not depend on its schedule.
A local module is also picked up by `prebuild` and EAS automatically, with no config plugin.

### The defect that cost two build cycles, and what it teaches

The first two on-device attempts failed with "printer tidak menjawab". The cause was not the
printer, the library choice, or the transport. It was this line, written as a safety measure:

```kotlin
if (adapter.isDiscovering) adapter.cancelDiscovery()
```

`isDiscovering` itself requires `BLUETOOTH_SCAN` — the permission this module deliberately
does not request, because it never scans. So the guard threw `SecurityException` before a
single connection attempt ran. **The protection was the only thing that failed**, and it
failed in a way that pointed at the printer.

Two things made it worse and both are fixed. The Kotlin swallowed the cause into a
`CodedException` without logging it, so logcat held nothing; it now logs. And the JS fallback
message for an unrecognised error was "Printer tidak menjawab. Pastikan menyala dan cukup
dekat." — a specific guess presented as fact, about a failure that had nothing to do with
range. Unknown errors now say only that printing failed.

**A wrong hypothesis, and then the right code for the wrong reason.** On the strength of those
failures a four-step connect cascade was added — secure SPP, insecure SPP, then reflection
straight onto RFCOMM channel 1 bypassing SDP — on the theory that cheap thermal printers answer
SDP badly. Once the `isDiscovering` line was removed, the RPP02N connected on the **first**
method. The theory looked wrong, and this file said so: the fallbacks were recorded as
unproven insurance.

Half an hour later they earned their place. On one print, secure SPP failed with
`read failed, socket might closed or timeout, read ret: -1` and **insecure SPP carried it**;
on the next print, seconds later, secure SPP worked again. Same printer, same room. So the
failure is intermittent rather than a property of the model — it depends on the state of the
radio and the SDP cache at that moment, which is exactly why one method is never enough. The
diagnosis was wrong and the remedy was right anyway; both halves are worth remembering,
because the fallback would have been deleted as dead code on the strength of the first result.

The cost was visible: a failed first attempt added about 4.5 seconds before the receipt
appeared. **The order has since been reversed — insecure SPP is tried first.** The measurement
that decided it:

```
08:19:46.525  Gagal lewat SPP aman: read failed, socket might closed
08:19:51.098  Tersambung ke RPP02N lewat SPP tanpa enkripsi
08:19:51.702  Tersambung ke RPP02N lewat SPP aman
```

4.57 seconds of a blocked secure attempt, and the printer had not received a byte in that time.
Then 0.6 seconds later the secure method worked. So the failure tracks whether the link is warm,
not the model: these printers have a minimal Bluetooth stack with weak link keys, so asking for
an encrypted RFCOMM channel triggers a re-authentication that often goes unanswered when the
radio has just woken. The first print after an idle period pays.

What those 4.5 seconds bought was encryption of a receipt, over one metre, to a printer about to
print it on paper and hand it to the customer. Nothing was being kept secret. Insecure first is
not "less correct" here — the expensive option was protecting nothing.

**Measured after the change: the receipt printed in about a second**, and logcat holds a single
line, `Tersambung ke RPP02N lewat SPP tanpa enkripsi`, with no failed attempt above it. The
warm-link theory held.

### Every amount on the receipt was wrong, and nothing reported it

Prices printed with their leading digits eaten — `Rp 17.000` came out short. The values in the
database were correct, the product grid showed them correctly, and `npm run preview:struk`
rendered them correctly. Only the paper was wrong.

The cause is one character. `formatRupiah` uses `Intl.NumberFormat("id-ID", …)`, and ICU puts a
**U+00A0 no-break space** between "Rp" and the digits, not a plain space:

```
"Rp 17.000" -> 0052 0070 00a0 0031 0037 002e 0030 0030 0030
                         ^^^^
```

On screen the two spaces are indistinguishable, which is why every check upstream passed.
`buildReceiptBytes` maps each character to one byte, so the printer received `0xA0` — and this
class of printer runs a code page where any byte ≥ 0x80 opens a **two-byte** character, so it
consumed the digit after it.

Worth noting what this was hiding behind: the comment in `buildReceiptBytes` asserted "Teks
struk ini seluruhnya ASCII, jadi tidak ada yang hilang." That was an assumption written as a
fact, nothing enforced it, and `formatRupiah` had been violating it the whole time. A receipt
with wrong money and no error anywhere.

Fixed by making it true instead of claimed. `renderReceiptText` now ends with an `ascii()` pass:
U+00A0 becomes a real space, anything else outside printable ASCII becomes `?` (two for
astral characters, so column alignment does not shift). Applied to the whole text rather than
just the amounts, because cashier-typed notes are a wide-open source of non-ASCII. And
`preview:struk` now fails if a `?` appears in the output — no legitimate `?` exists in a
receipt, so its presence always means something was dropped. That is the check that would have
caught this on day one.

### Two receipts for one payment

The unexplained third line above was a second print starting 0.6 seconds after the first
finished — too fast for a human gap between taps, exactly right for a second request queued
while the first was running. Confirmed with Heika: one press of "Cetak Struk", after the
automatic print appeared to do nothing for five seconds.

One cause, not two. The automatic print left no trace on screen, so a slow print was
indistinguishable from a dead one, and the reasonable thing to do next is press the button. The
reprint button did disable itself while busy — but the automatic print never entered that busy
state, so nothing held it back.

Three changes, all shipped:

- **Both paths now go through one `runPrint`** in `OrdersScreen`, guarded by a `useRef` rather
  than state. React state updates asynchronously, so two nearby calls can both read "not busy"
  before either writes it — which is precisely the 0.6-second window the log shows. A ref
  changes immediately.
- **A "Mencetak struk…" strip** appears while a receipt is being sent. Deliberately not a toast:
  success toasts auto-dismiss after three seconds, which is shorter than the print it would be
  reporting on.
- **Reprint buttons on other orders are disabled** while any print runs. The printer serves one
  connection; a button that can be pressed but whose request is silently dropped is worse than
  one that is visibly off.

### What was built

- **`modules/escpos-bluetooth`** — `getStatus()`, `listBondedDevices()`, `printBytes()`.
  Connections are not held between receipts: an RFCOMM socket left open dies silently when the
  printer is switched off or carried away, leaving something that looks alive and swallows
  receipts. Reopening costs a second or two and removes that whole class of failure.
- **Permissions live in the module's own `AndroidManifest.xml`, not `app.json`** — deliberate,
  and a departure from the Configuration table's usual rule. The permission exists *because of*
  this module; delete the module and it goes with it, rather than leaving an orphan line in
  `app.json` nobody dares remove. Manifest merger folds it into the APK, confirmed in the
  merged manifest.
- **Only `BLUETOOTH_CONNECT`, not `BLUETOOTH_SCAN`.** The plan in this file called for both.
  Scanning is Android Settings' job, so requesting scan rights would be asking for a permission
  that is never exercised. Requested at runtime as well as declared — miss that and the app
  sees an empty device list with no error, which is exactly the symptom that has no useful
  trace.
- **`components/PrinterSheet.tsx`** — the picker, in the hamburger menu. Devices that advertise
  SPP sort to the top but nothing is hidden: a printer filtered out of its own list gives the
  cashier no way to guess why. Includes a test print with a deliberately awkward sample.
- **`db/settings.ts`** — the chosen printer, stored in the existing `app_state` key/value
  table, so no schema version bump and no migration for installed devices. Tied to the machine,
  not the session: it survives a shift change, because the printer belongs to the till.
- **`lib/printer.ts`** — the seam between `receipt.ts` (knows receipts, not Bluetooth) and the
  native module (knows Bluetooth, not orders).
- **Triggers wired**, as decided: automatic on reaching paid, plus "Cetak Struk" on paid cards
  for reprints. The two differ on purpose. The automatic print announces failure but never
  blocks — the money is already taken and recorded, and a printer out of paper is no reason to
  interfere with a cashier mid-rush. The button *must* report failure, since it is pressed
  precisely because the receipt is missing. Voided orders get no reprint button: paper for a
  transaction that did not happen can be mistaken for proof of payment.
- The receipt is **re-read from SQLite after payment** rather than reconstructed in memory. The
  in-memory row is still `pending` at that moment and would print "BELUM LUNAS"; rebuilding the
  paid values by hand would copy the payment rules to a second place that can drift.

The split is deliberate and is the main thing to understand before continuing. Receipt
formatting is pure computation — order in, bytes out — so it was written and checked with no
printer, no device, and no library decision, which is the part of this step with the most
uncertainty in it. `renderReceiptText()` returns plain text and `buildReceiptBytes()` wraps
the same content in control codes, so the two cannot drift apart, and a misaligned column is
visible to a human instead of hidden between escape sequences.

`npm run preview:struk` (in `mobile/`) prints three receipts to the terminal — paid cash with
change, paid non-cash, and an unpaid provisional bill — because all three branch at the foot
of the receipt and only one usually gets looked at. The sample deliberately uses the worst
real case: the longest of the 293 product names, a note that has to wrap, and a six-figure
amount. The script flags any line over 32 columns and exits non-zero, so a layout mistake
cannot pass by simply not being read.

**Receipt content, decided by Heika:** date, time, items, quantity, unit price, subtotal,
total, thank-you line, then the WiFi password. The content now has a real home,
`mobile/lib/shop.ts`, read by both the app and the preview script — previously the values
existed only as sample data inside the preview script, which meant the terminal preview and
the paper could differ without anyone noticing. Two loose ends remain: the WiFi password is
still the placeholder `rusen2026`, and the unpaid provisional bill prints both the thank-you
line and the WiFi password, which may or may not be wanted on a bill for a customer who has
not left yet.

**Print triggers, decided by Heika:** automatically when an order reaches paid, plus a
"Cetak Struk" button in the orders list for reprints. Printer-offline handling is explicitly
out of scope for now — Heika's call, treated as an operational matter.

**The full path has now run: an order was paid on the device and the receipt printed by
itself.** `DRAIN_MILLIS` (400ms) and `CHUNK_SIZE` (256 bytes) held — no truncation.

**WiFi passwords are set**, and there are two of them — one for the 4G network and one for the
5G. The values live in `mobile/lib/shop.ts` and are deliberately not repeated here.
`ReceiptShop.wifiPassword` became `ReceiptShop.wifi`, a list of
`{ network, password }` — a single slot forced a choice between them, and a customer on the
other network would think the password was simply wrong. The network name prints beside each
password for the same reason.

### What remains

1. ~~**A logo on the receipt**~~ **Done — it prints.** The record below is kept because the
   failure mode it describes is not specific to logos, and because regenerating the bitmap
   means walking back through all of it.

   `node scripts/buat-logo-struk.mjs <file> [width]` converts an image to a packed 1-bit bitmap
   and writes `mobile/lib/receipt-logo.ts`; `buildReceiptBytes` emits it as an ESC/POS raster
   (`GS v 0`) above the shop name. While that file exports `null`, receipts print exactly as
   before, so this is inert until a logo exists.

   Conversion happens at build time because React Native has no PNG decoder and adding an image
   library to the till for one image that never changes is a permanent cost for one-off work.
   `sharp` does the conversion and is already present at the repo root via Next.js, so nothing
   new was installed anywhere.

   Thermal printers have no greyscale — every dot is black or white — so the source must be
   solid black on white. Gradients, shadows, pale colours and hairlines vanish or blot. The
   script prints an ASCII preview and the black-coverage percentage, and warns outside 3–60%;
   run against `splash-icon.png` it correctly reported 0% and "hampir tidak ada yang tercetak".

   **Paper settled it, and the answer was not the one being watched for.** The RPP02N does
   implement `GS v 0` — it printed the top of the logo correctly. What it does not implement is
   any usable flow control on a raster that large. At 384×384 the image is 18.432 bytes sent as
   one command; the printer's buffer filled, and it discarded the rest *without reporting
   anything*. Discarded bytes made its length count wrong, so it stopped reading image data
   partway and resumed interpreting the remainder as text. What came out was half a logo,
   then random characters, then nothing: the products, the total and the change had all been
   swallowed as image data for a picture that never finished. No error on the phone, none in
   logcat — from Android's side every byte was written successfully.

   Two changes, and both are needed. `logoJadiByte` now splits the image into 24-dot horizontal
   bands, each its own complete `GS v 0` command, so the printer prints and drains one band
   before the next arrives; the paper result is identical because `GS v 0` advances the paper by
   exactly the image height. And the Kotlin write loop now pauses 20 ms between 256-byte chunks,
   because the underlying assumption — that RFCOMM back-pressure would block `write()` — is
   simply false on this class of hardware. A text-only receipt pays about 60 ms for that.

   The logo is also 192×192 now rather than 384×384, at Heika's request: 4.608 bytes instead of
   18.432, and about 24mm of paper instead of 48.

   One thing to know before regenerating it: **the source image is not in the repo.** It was
   never committed, and `mobile/lib/receipt-logo.ts` is the only surviving copy of the Rusen
   logo. `scripts/kecilkan-logo-struk.mjs` exists for exactly that reason — it shrinks the
   already-1-bit bitmap instead of starting from a file that no longer exists. If the original
   turns up, use `buat-logo-struk.mjs` instead; downscaling from the source is always sharper
   than downscaling something already crushed to black and white. Better still, commit it.

   That script also cost twenty minutes to a sharp behaviour worth knowing: feed it a raw
   single-channel buffer and `resize()` returns **three** channels, silently promoted to sRGB.
   Reading the result back at one byte per pixel shears every row against the previous one, and
   the logo comes out as a diagonal band — which reads as "the image was destroyed by
   downscaling", not as "the buffer was read wrong". Always index raw output using the returned
   `info.width` *and* `info.channels`.

**Printer paper size: 58mm.** That settles a discrepancy worth writing down, because it
silently invalidates the obvious shortcut. `components/Receipt.tsx`
in the web app is built for 80mm stock ("Lebar 72mm menyesuaikan printer thermal 80mm"), so
its layout cannot be ported: 58mm fits about 32 characters per line at font A against roughly
48 for 80mm. Every column position, divider, and right-aligned total has to be re-authored.
What ports from the web receipt is the *content* — which fields, in what order, with what
wording — never the layout.

**Nothing else about the web print path survives either.** It prints through `window.print()`
and `@media print` CSS, letting the browser and the OS driver do the work. Android has none
of those: the app has to emit raw ESC/POS bytes itself.

**This step cannot be developed in Expo Go**, and that held. Bluetooth Classic (SPP) needs a
native module, and Expo Go ships a fixed set that does not include one. Every iteration in this
step cost a full local Gradle build and an adb install — roughly seven minutes the first time,
under a minute for Kotlin-only changes afterwards.

**"Tersimpan" is not "terkoneksi", and that is normal.** Heika noticed that the previous SaaS
POS printed fine while Android's Bluetooth settings showed the printer only as saved, never
connected. That is how SPP works: Android reports "connected" for profiles it manages itself
(A2DP, HFP), and a serial printer is not one of them. The app opens the socket at the moment it
prints and closes it after. A printer that never shows as connected is not a symptom.

## PBJT — tax status at payment ✅ (schema, both apps, reports; not yet on a device)

Some customers — a subscribing government office — are exempt from PBJT by regulation. The
cashier now chooses **Kena Pajak** (default) or **Bebas Pajak** when confirming payment; exempt
requires a written reason and records who approved it.

**Decided by Heika before any code:** rate 10%, **exclusive** (added on top of menu prices), any
cashier may exempt with their employee_id recorded, the rate lives in the database rather than in
code, reports are SQL only, exempt receipts say nothing about tax, and pre-existing orders are
deleted rather than backfilled.

The exclusive choice has a consequence worth stating plainly because it is a pricing decision and
not a technical one: **every ordinary customer now pays 10% more than before this release.**

### Redefining `orders.total` was the load-bearing decision

`total` used to be exactly the sum of item subtotals, enforced in three functions and one CHECK.
Exclusive tax breaks that identity, so there had to be two numbers. The choice was which name
carries which meaning, and the obvious-looking option is the wrong one.

Adding `grand_total` beside an unchanged `total` was rejected. Twelve places read `orders.total`
as "the money" — `check_table_code`, `get_sales_summary`, `get_sales_trend`, `payments.amount`,
`push_order`'s cash guard, `lib/queries.ts`, `Receipt.tsx`, `PaymentModal.tsx`, `PaymentSheet.tsx`,
`OrdersScreen.tsx`, `OrderDetailSheet.tsx`, `TableConflictDialog.tsx`. Under `grand_total`, every
one of them that was missed would report money short by the tax rate, and **nothing would error**.
Redefining `total` as the charged amount inverts that: a read site nobody touched is already
correct. The failure mode moved from silent-and-wrong to correct-by-default.

An earlier draft justified the same choice by "it avoids a SQLite table rebuild". That reason did
not survive — see below. The read-site argument is the real one.

### What the plan got wrong about SQLite

The plan called for rebuilding the local `orders` table so the arithmetic CHECK could exist on the
device too, on the grounds that local history was being wiped anyway. **That was not done, and the
plan was wrong on both halves.**

The wipe was never required. Heika's "delete the old orders" decision was about server-side
reporting — not mixing untaxed and taxed rows in a tax report. The phone's order list is a reprint
cache that `clearHistory` already trims after 12 hours, and rebuilding the table would destroy
paid orders that have not been pushed. Those exist on that one device and nowhere else;
`clearHistory` refuses to touch them for exactly that reason, and a migration has no better claim.

The failure direction is also backwards from what it looks like. With a local CHECK, a rounding
disagreement makes `payOrder` **throw** — the cashier has taken the money and nothing is recorded.
Without it, the order is recorded and the push is rejected with a readable `sync_error` that can be
fixed later. The record matters more than the arithmetic.

So `V2` is six `ADD COLUMN`s plus `update orders set subtotal = total` — honest, because those
orders genuinely had no tax, and identical to what `push_order` writes for a payload with no tax
fields. Enforcement lives where it costs nothing: the CHECK in Postgres holds against any writer,
and `push_order` turns a violation into a sentence a cashier can read.

### The rate is a row, not a constant

`outlets.tax_rate_bps`, in basis points so a fractional rate like 7.5% never touches floating
point. Changing it is one `UPDATE` — no APK, no deploy. `pay_order` reads it itself and takes no
rate parameter, which is the `AGENTS.md` "price always comes from the server" rule applied to tax.

The phone pulls it with the catalog into `app_state`, in the same transaction as the products —
a rate from one pull beside prices from another would tax yesterday's prices at today's rate. If
it was never pulled, payment is refused with a message that names the remedy, and the refusal
happens **before the payment sheet opens**: a cashier who has typed the amount and read the change
has already handed money over, which is the worst possible moment to say no.

That created an upgrade trap. Every installed device has a catalog but no rate, and pulling is
manual. `V2` therefore deletes `app_state.catalog_pulled_at`, so the "catalog never pulled" prompt
the app already has does the nagging. One line, no new UI.

### `push_order` checks arithmetic and identity, never the rate

The device sends its own snapshot rate and the server validates only self-consistency. Forcing it
to equal the outlet's current rate would strand any order created offline before a rate change —
permanently, since the only way out would be deleting a money record.

More fundamentally the guard would be theatre: `push_order` already accepts `unit_price` verbatim
and never consults `products`. Price authority has never existed on that path and structurally
cannot, because offline orders are priced from a possibly-stale local catalog by design. Locking
the tax rate while the prices stay open is locking one window in a house with an open door.

What was added is in the category that path *does* police: `tax_approved_by` must resolve to a real
employee at the sender's outlet, exactly as `created_by` does. Without it the approver is whatever
UUID the APK cares to send, and the whole point of requiring a reason evaporates. A long-standing
gap was closed at the same time — `payments.amount` was never checked at all, and under tax the
drift would have been 10%-shaped.

**Error names must not be substrings of one another.** `translateRpcError` matches with
`message.includes(code)` in `Object.entries` order, so `SUBTOTAL_MISMATCH` would always be caught
by the `TOTAL_MISMATCH` entry and the cashier would read the wrong sentence, silently and forever.
Hence `ITEM_SUM_MISMATCH`.

### Reports, and a number that would have moved overnight

`get_sales_summary` and `get_sales_trend` summed `total`. Under the new meaning the owner's revenue
figure jumps by the tax rate with nothing explaining it — the likeliest "the report disagrees with
the till" moment in the whole change. Since nothing consumes those functions yet, this was the
cheapest hour it will ever cost: `omzet` is now `sum(subtotal)`, with `pajak` and `tertagih` split
out. `get_top_products` and `get_category_contribution` already read `oi.subtotal` and were untouched.

New: `get_pbjt_summary`, `get_pbjt_harian`, and `get_pbjt_exempt_report`. The last was not asked
for and was written anyway — requiring a reason and an approver is worthless with no way to read
them back.

`pajak_tidak_ditagih` is exact only because the rate is snapshotted on exempt rows too. That is
also why there is no rate-history table: the per-order snapshot **is** the history. If someone
later "tidies up" by leaving `tax_rate_bps` at zero when exempt, that column quietly becomes zero
and nothing says so.

### Two things paper and arithmetic settled

**The receipt has to add up.** Heika first asked for exclusive tax *and* nothing about tax on the
receipt. Together those print item lines summing to one number and a TOTAL 10% higher, with
nothing explaining the gap — a customer who adds it up concludes they were overcharged. Raised,
and Heika resolved it: taxable receipts print Subtotal / PBJT / TOTAL; exempt receipts print
nothing at all, so an institutional customer doesn't carry away paper announcing their status.

**The preview fixture never added up.** Printing a Subtotal line immediately exposed that
`preview-receipt.ts` claimed a total of 91.000 for items worth 81.000 — wrong since it was
written, invisible because the old receipt printed only TOTAL and there was no second number to
disagree with. Fixed, and the script now asserts that every sample's items sum to its subtotal and
that subtotal + tax equals total.

### Deleting the old orders turned out to be a no-op

Counted before deleting, not assumed: local Postgres held zero orders, and a data dump of the
hosted project contained no `orders`, `order_items` or `payments` rows at all. The three test
orders recorded further down as outstanding were already gone — `0007` removed them.

`0011_hapus_order_sebelum_pbjt.sql` was written anyway, and its header says plainly that it
probably deletes nothing. It exists because `0012` cannot add `tax_arithmetic` while a single
pre-tax row survives, and without it the migration order merely *happens* to work on two databases
that merely *happen* to be empty.

### State

Applied and verified on local Postgres, twice each for idempotency, with behaviour tested rather
than inspected: taxable and exempt payment, the rate snapshot, `payments.amount`, cash measured
against the post-tax total, all three CHECK rejections, all six `push_order` guards, and an
old-APK payload with no tax fields still being accepted. Both apps typecheck; `preview:struk` and
`periksa:varian` pass, the latter still at 38 temperature pairs.

**Not yet done: the hosted push, and anything on a device.** Nobody has paid a taxed order on the
phone, and no receipt with a PBJT line has come out of the printer.

### Rokok is outside PBJT — the tax base is no longer the subtotal (2026-08-01)

PBJT is a tax on food and beverage. Cigarettes sold retail are not its object, and until this
change the app charged 10% on them anyway, because tax was computed on the whole order subtotal.

Migrations `0019`–`0021`. What changed, in one sentence: **the tax base moved from `subtotal` to
`taxable_subtotal`.** Everything else about PBJT is untouched — still computed once per order,
never per line then summed; still snapshotted; still guarded by `tax_arithmetic`. On an order
with no cigarettes the two numbers are identical, which is why every existing row stayed valid
without being rewritten.

Three decisions worth the words:

**The marker is data, not code.** `categories.taxable`, not `code = 'ROKOK'` matched inside a
function. Follows the `tax_rate_bps` precedent: a second exempt category later is one UPDATE, not
a migration and two app builds. Code that matches a category *name* also breaks silently the day
someone renames the category, and renaming a category looks harmless.

**`order_items.taxable` is a snapshot**, like `product_name` and `unit_price` beside it. Without
it, moving a product to another category rewrites what tax was due on *past* orders. The stored
`orders.tax_amount` would not change — but a refund computed later would use a different base
than the receipt already in the customer's hand. The difference is money and nothing errors.

**`orders.taxable_subtotal` is stored, not derived by join.** A CHECK constraint cannot query
another table, and the entire point of `tax_arithmetic` is that the database *physically* cannot
hold a row whose rounding diverges from the server. Derive the base and that guarantee degrades
to a convention. The phone computes tax offline; a convention is not enough.

The refund helper `hitung_pajak_refund` gained a parameter and therefore had to be **dropped, not
replaced** — the pay_order trap from `0013`, and worse here, because the stale 7-argument overload
would have kept refunding tax on cigarettes with nothing to show for it.

Its "order exhausted → return the remainder" branch is still measured against `subtotal`, not
`taxable_subtotal`, and that is deliberate. The question it asks is "has the whole order come
back", and an order is only exhausted when the cigarettes come back too. Measured against the
taxable base it would declare the order exhausted as soon as the food was returned, then hand
back the entire remaining tax while the customer still holds the cigarettes. That is not a
rounding error, it is the wrong amount of money.

Verified on local Postgres, not assumed. Kopi 11.000 + Dji Sam Soe 24.000 → subtotal 35.000, base
11.000, PBJT 1.100, total 36.100. Refund the cigarettes alone → tax returned 0. Refund the rest →
36.100 of 36.100 returned, nothing stranded. `preview:struk` gained a mixed bill whose assertion
fails if the base ever reverts: it requires `Rp 1.100` present and `Rp 4.900` absent.

**A cigarettes-only order is `taxable` with tax 0, never `exempt`.** Exemption is a human decision
that demands a reason and records an approver; this is merely goods outside the tax. Collapsing
them would put fake approvals in the audit trail.

**The thing most likely to bite: an un-updated APK keeps charging PBJT on cigarettes and says
nothing.** `push_order` accepts payloads with no `taxable_subtotal` and treats the base as the
full subtotal — old behaviour, internally consistent, no error. That leniency is not optional:
rejecting them would strand offline orders in the send queue forever, and a stuck order is a money
record that exists on exactly one phone. The fix is operational, not technical — every cashier
phone must be on the new build before cigarettes are sold again. Note the ordering trap this
creates with the OTA rule below: **the hosted migration must land first**, or a new APK sends a
column the server does not have.

`V7` in `mobile/db/migrations.ts` deletes `catalog_pulled_at` to force a catalog re-pull. Without
it `categories.taxable` is 1 for every row, including Rokok, because the value comes from the
server — the app would come up looking entirely normal and keep taxing cigarettes. Same trick,
same reason, as `V2`.

## Test data — orders that never count ✅ (mobile + server; web not yet)

Built because there was already a way to make test orders and it was made of string. Orders from
`DebugScreen` carried a `UJI-` prefix on `table_code`, and four queries in `mobile/db/shift.ts`
filtered on `table_code not like 'UJI-%'`. That convention enforced nothing: one mistyped letter
turned a test order into revenue, and **the server had never heard of it at all** — every test
order that synced was counted in full by every report, silently.

Decisions (Heika): `is_test_data boolean` plus `test_mode_reason text`, **reason mandatory** ·
the `UJI-` prefix retired entirely, not run alongside · a confirmation dialog, never a toggle ·
mode auto-off after one order · reports exclude test data by default, with an owner-gated
override. No second employee column — `created_by` already answers *who*; what nobody can
reconstruct later is *why*, and "cek fitur topping baru" versus "demo ke calon karyawan" are very
different answers.

**Audit first, code second.** Heika required the list of every reader of `orders` before any
migration was written, and that audit is the reason this works. Filtering `orders` alone would
have missed three places: the `refunds` and `order_item_voids` subqueries inside
`get_sales_summary` (neither joined `orders`), and `get_top_voided_products`, which never touched
`orders` at all. All three now join it. Ten report functions gained
`p_include_test boolean default false`.

**`create or replace` would have silently done nothing.** Adding a parameter creates an
*overload*, not a replacement — the old two-argument version stays callable, and every existing
caller keeps hitting it, unfiltered, forever. `0022` drops all ten by exact signature first. The
check that proves it: one row per name in `pg_proc`, which is what the local run showed.

**The flag is set once and can never be updated.** `push_order` writes it on INSERT only; the
update branch ignores it, alongside `outlet_id`, `created_by`, and `created_at`. If the update
branch could write it, anything able to sync as an employee could turn a real paid order into a
test order by bumping `version`, and the money would vanish from every report with no error, no
missing row, nothing odd to see. The cost is real and accepted: **a mis-flagged order cannot be
corrected from the phone** — it needs a manual `update` on the server. That trade is deliberate;
the repair is rare, the hole would be open daily.

**Merging into an existing order is blocked while test mode is on.** This nearly shipped. The
table-conflict dialog offers "same customer", which calls `appendToOrder` — items land on an
order whose flag was fixed when it was born. Test items would join a real order that counts in
full. No layer below the screen can see the intent, so the guard lives in `CashierScreen`.

**The reason is enforced in `createOrder`, not at sync.** Rejecting it at push would strand the
order as a permanent `sync_error`: the flag cannot be changed, so nothing could ever repair it.
Postgres still enforces it too (`test_data_reason`), and `0023` raises `TEST_REASON_REQUIRED`
ahead of the constraint so the cashier reads a sentence instead of raw constraint text.

**Not a watermark.** A watermark must be faint enough to keep prices readable, and faint is
exactly what stops being seen after two days. Instead: a 4dp red border around the cashier screen
plus an opaque banner naming the consequence and echoing the reason just typed. A coloured
background was rejected because it shifts the contrast of every semantic colour on the screen —
amber "unpaid", green "paid" — and those must not read differently.

**The receipt says it twice, head and foot.** 58mm receipts get torn and read from the bottom
where TOTAL is; a marker only at the head leaves with the discarded half, and what remains reads
as a genuine proof of payment. The wording names the consequence — "BUKAN BUKTI PEMBAYARAN" —
because "UJI COBA" alone can be mistaken for a menu item. `preview:struk` asserts both: exactly
two markers on a test receipt, and none on an ordinary one.

Not gated by role, following the tax-exemption precedent: every cashier may switch it on, and the
record is the trail — cashier name plus mandatory reason — not a permission gate. A cashier
demoing the app cannot wait for the owner to arrive.

Applied to **both databases** and published as an OTA update, migrations first. `V8` needs no
catalog re-pull — unlike `V2` and `V7` it touches nothing that comes from the server.

**The web app is untouched**, so `/history` shows test orders with no marker at all. See
`TO_DO.md`.

One verification note worth keeping. Grepping the published bundle for `MODE UJI` returns **0**,
and that is not a failed publish — the banner string contains an em dash, so Hermes stores the
whole literal as UTF-16LE and no UTF-8 bytes of it exist anywhere in the bundle. Searched as
UTF-16LE it is there. `UJI-` still returns 2, and must: both are SQL strings inside the `V8`
backfill. Zero there would mean the backfill went missing.

## Full-page screens — four drawers become routes ✅ (mobile only; not yet on a device)

The cart, "Tambah item", Pelunasan, and Kas Masuk/Keluar were sheets or modals drawn over the
screen that opened them. All four are now full pages. The reason is space and focus: each one
was a form or a list crammed into whatever height was left above the sheet's origin, with the
previous screen still visible behind it. The cart sheet gave its item list about three rows;
the "Tambah item" grid was boxed to 320dp; the payment sheet had to anchor to the *top* of the
screen because the number pad rising from the bottom covered the amount field and the change
box — the two things a cashier must see while typing.

**expo-router is now installed**, reversing the step 3/5 note in this file ("Two screens do not
justify file-based routing; a tab state does. Revisit at step 6 if the screen count grows.").
The screen count grew: five pages were added to the two that existed. It is scoped
deliberately — the Cashier/Order tab switcher in `AppShell.tsx` is untouched and still a
`useState` with both tabs mounted behind `display:none`, because that pattern is what keeps a
half-filled cart alive when the cashier glances at the order list, and it is tested.

`--legacy-peer-deps` was required. expo-router pulls `vaul` and Radix for web support, which
demand `react-dom@19.2.8` while SDK 57 pins `react@19.2.3`. This app has no web target, so
nothing that actually gets bundled is affected.

**This adds native modules (`react-native-screens`), so it needs a native rebuild — `eas update`
alone cannot ship it.**

### What the routes forced, that a sheet did not

Two things only became visible during the work, and both are the same shape: **a route is a
sibling of `app/index.tsx`, not a child of it.** A React context mounted inside `AppShell`
cannot be read from a route, because the route is not underneath it.

- Cart state therefore had to move to `CartProvider` in `app/_layout.tsx`, wrapping `Slot` —
  not inside `AppShell` as first planned, which would have thrown at runtime the first time
  the cashier opened the cart. `ToastProvider` and `ShiftProvider` moved with it for the same
  reason. The catalog and the test-mode flag moved too: both are read while saving an order
  (price lookup, and whether the order counts as revenue), and two copies loaded separately can
  drift.
- The `onSaved` callback that used to be handed down to `CashierScreen` became `savedTick`, a
  counter the provider raises and `AppShell` watches. The data flows one way now; nothing
  registers a callback upward.
- **`EditOrderScreen` had to become a route as well** (`app/edit-order/[id].tsx`), which was not
  in the plan. "Tambah item" must be a sibling route of the screen it edits, and a route cannot
  be a sibling of an overlay rendered inside `AppShell`. It reloads its order through
  `useFocusEffect`, since it stays mounted underneath while the add page is open.

### Dead code removed, not left behind

`EditOrderScreen` used to close the "Tambah item" sheet before opening `VariantSheet`, then
reopen it afterwards, purely because two RN `Modal`s cannot stack on Android. The add page is
not a `Modal` any more, so nothing competes for z-order and the dance is gone rather than
inert. `VariantSheet` now simply opens over the page.

The kas state-clearing in `printTutupKasir` also went: the kas page loads its entries from
`shift` every time it mounts, so there is no leftover from a closed shift to wipe.

`PengaturanScreen` deliberately did **not** become a route, though the plan listed it. It was
already a full-page overlay rather than a sheet, so there is nothing for the cashier to gain,
and its four buttons open overlays (`Katalog`, `Mode Uji`, `Printer`) that `AppShell` owns and
that are out of scope here. Its "not a Sheet because two Modals cannot stack" comment is still
accurate — the menu it opens from is still a `Sheet` — so only the stale cross-reference to
`EditOrderScreen` was corrected.

### What is unchanged

No business logic moved. Tax is still computed on `taxable_subtotal` with the same rounding,
the bill is still `subtotal + tax` because a pending order's `total` is pre-tax, the `busyRef`
version guard is still a ref and not state, auto-print still fires without `await` after
re-reading the order from SQLite, kas entries are still keyed to `shift_id` and cancelled via
`voided_at`, and non-cash kas entries still leave Kas Seharusnya alone.

Back-navigation is blocked while `payOrder` is in flight (`beforeRemove`), so a cashier cannot
leave mid-payment and never learn the outcome.

### Verified, and not

`npm run typecheck` and `npm run periksa:varian` pass — the variant grouping is untouched, and
the topping-family assertions still hold on the add-item page, which is the one that
historically stranded orphans by slicing the product list.

**Nothing here has been on a device yet.** It needs the native rebuild before it can be, and
every flow in it is a money path: cart → save, add item → version guard, pay → print, kas →
Tutup Kasir totals. **Tablet and landscape are additionally unverified**: the cart's wide-screen
side panel (`wideCart`, the 3-column layout above 700dp) was deleted, because the cart is now a
page on every screen size. On a wide screen that is a deliberate trade — the grid gets the full
width back, but the cart is no longer glanceable while picking products, and nobody has seen it
on a wide screen to say whether that reads as an improvement or a loss.

### Emptying a table without losing it (2026-08-02)

Two destructive actions now live on the edit-order page, and they are deliberately *not* the
same button:

- **The trash icon in the header** cancels the table. Everything is voided and the order closes;
  the table code is released. This is the existing `voidAllOrderItems`.
- **"Hapus Semua Item", small underlined text under the primary `Tambah item` button**, throws
  away the contents and *keeps the table*. The page stays open on the same table code, ready to
  be refilled, and the cashier never retypes it.

Both go through the same void path — `voidEveryItemWithin`, extracted from what was the body of
`voidAllOrderItems`. One void row per item in `order_item_voids`, exactly as if each had been
cancelled by hand. **No new table, no new column, no new RPC.** The bulk void is one
`withExclusiveTransactionAsync`, not a loop over `voidOrderItem`: each call bumps `version`, so
the second turn of a loop is already holding a stale copy and dies with `STALE_ORDER` — and a
loop is not one transaction, so a failure on the third item leaves the order half-emptied with
nobody asking for that. This was already written up at `mobile/db/orders.ts`; the refactor keeps
it true for both buttons.

**Keeping the table required creating a new order, because an order that runs out of items is
always `void`.** That rule is held jointly by `voidOrderItem` here and `void_order_item` in
`0019` — an empty *pending* order was not a state either engine would produce. Changing that
rule was the alternative and was rejected: it means a migration against both databases plus an
audit of every report and list that assumes a pending order has items. So `clearOrderItems`
instead voids the old order and inserts a fresh pending one with the same `table_code` inside
the same transaction, then the screen does `router.replace` to the new id. The receipt number
changes; the table does not.

Three consequences worth knowing before reading the code:

- **The new row is written directly, not through `createOrder`,** which throws `EMPTY_ORDER`.
  `push_order` has no such guard — zero items sums to a subtotal of zero and passes every
  arithmetic check — so an empty order syncs normally.
- **`is_test_data` and `test_mode_reason` are copied to the replacement.** Without that,
  emptying a table mid-test-session silently produces an order that counts as real revenue.
  This is the one place a test flag is carried across orders, and it is legal because it is
  still written *on insert only*.
- **Empty pending orders are now reachable, so two screens had to accept them.** The header
  trash button stays visible on a table with no items (otherwise such a table can never be
  closed) and `voidEveryItemWithin` tolerates zero items; "Pelunasan" in `OrdersScreen` is
  disabled at `itemCount === 0`, because `payOrder` would otherwise reject with `EMPTY_ORDER`
  only *after* the cashier had opened the payment screen and possibly taken money.

### The trash glyph was never actually red

The header button was `label="🗑️"` with `color: colors.status.void` on its label style. On
Android that colour does nothing: the glyph comes from the colour emoji font and ignores
`color` entirely, so the icon that was supposed to mark a destructive action rendered in the
system's own grey-and-white. It is now `components/TrashIcon.tsx`, drawn from plain `View`s,
which inherits the colour it is given on every device.

It is drawn rather than imported because this app has **no icon library at all** —
`@expo/vector-icons`, `lucide-react-native`, and `react-native-svg` are all absent, and adding
one pulls font assets or a native module into the bundle for a single glyph. `Button` gained an
optional `icon` prop; `label` is still required and still the screen-reader fallback.

The remaining glyphs in the app (`✕`, `✓`, `☰`, `⚙`) are text symbols, not emoji, and they do
honour `color` — they were left alone.

### Edit Order redesigned, and `Kembali` landed on the wrong screen (2026-08-02)

The layout was rearranged to the reference sketch: table code large with its status directly
under it, the three header actions (trash / Ganti Meja / Kembali) on one row beside it, and each
item reduced to a single line — a red ✕ on the left, name and quantity in the middle, price on
the right. That ✕ replaces the full-width "Batalkan item" button that used to sit *under* every
item; six items no longer need scrolling. It calls the same `voidOrderItem` as before.

It is `components/XIcon.tsx`, drawn from two rotated `View`s, for the reason `TrashIcon` exists
— no icon library. The character `✕` was rejected here specifically because it scales with the
font, and this is a tap target: the drawn shape is 16dp inside a 48dp box on every device.

**`Kembali` went to the product grid, and the cause was not in this screen.** `app/_layout.tsx`
renders `<Slot />`, not `<Stack />`. Sibling routes therefore *replace* `app/index.tsx` rather
than stacking on top of it, so `AppShell` is genuinely unmounted while Ubah Order is open and
`useState<Tab>("cashier")` runs again on the way back. Several comments in the codebase say the
screen underneath "stays mounted" — that is true of the providers (they live above `Slot`), not
of `AppShell`.

Switching to `<Stack />` would fix it and would make those comments true, but it changes
transitions and mount lifetimes on every route at once, with no device to check it on. Instead
`AppShell` remembers the last tab in a module-level `tabTerakhir` and seeds its state from it.
It is not state in a provider because nothing re-renders when it changes, and it is deliberately
not persisted — a fresh launch should start on Kasir.

Ubah Order has exactly one entry point (`AppShell` → `OrdersScreen.onEdit`), verified by grep, so
"back" and "back to the order list" are the same destination and no per-context routing was
needed. Batalkan meja now closes the screen on success as well: the order is void, and leaving
the page open shows the cashier a table that no longer exists.

## Pelunasan redesigned — typing a cash amount becomes tapping one ✅ (mobile + server; not yet on a device)

Making Pelunasan a full page (above) gave the amount field and the change box room to coexist
with the keyboard. It did not remove the keyboard. The redesign does: **Uang Pas** plus three
fixed notes (20/50/100k) in a 2×2 grid, with a full-width "Nominal Manual" underneath as the way
out when none of the four answer. Total Tagihan moved to the top as the single largest thing on
the page, and the order breakdown moved *down* into a collapsed panel that expands in place
above the confirm button — a modal there would have re-created the exact problem the full-page
move solved.

**Fixed amounts, not amounts computed from the bill.** The alternative (round the total up to
the nearest 5k/10k) is always relevant and never a dead button, which is a real advantage —
menu items run 10–30k and bills land anywhere in 20–80k, so a fixed 20k is useless above 20k.
It was rejected anyway: what the customer hands over is a banknote, and a button that never
moves is one the cashier can hit without reading it. A bill the four buttons cannot serve goes
through Nominal Manual, which is what it is for.

### "Uang Pas" stores a choice, not a number

The bug this avoids is invisible until it costs money. If the tap writes `amount = tagihan`,
and the cashier *then* switches to Bebas Pajak, the stored number is stale by exactly the tax:
the screen says "pas" while the bill has moved, and the change is wrong in the shop's disfavour.
So `CashAmount` is a discriminated union — `{kind:"exact"}` is re-read from the current
`tagihan` on every render. Same reason the change box only appears once an amount exists: a
bordered box containing a dash spends the most valuable space on the screen announcing that
nothing has happened yet.

### QRIS and Debit/Credit Card are visual only, and that is a trap worth labelling

Both send the same `non_cash`. Nothing records which was tapped — not SQLite, not Postgres, not
the receipt. The moment the page closes, the answer is gone. This was chosen over a schema
change deliberately (see `TO_DO.md`, "Kanal bayar berhenti di Tunai/Non Tunai"), but it means
the buttons cannot be a source for any report. The call site says so in a comment, because the
next person to read this screen will otherwise reasonably assume the distinction is stored.

### Bebas Pajak no longer needs a reason — and that reversed a decision in this file

The PBJT section above records the opposite rule: "Exempt orders require a reason and record the
approving employee." The reason is gone. What it cost in practice was the keyboard covering the
confirm button for a field whose content was nearly always the same institution name.

The approver is **not** gone, and dropping it was the tempting version of this change. Without
`tax_approved_by`, "who decided this was not collected" has no answer at all, which is the only
thing that made an exemption auditable. It never needed to be typed — it is the employee who is
already logged in — so keeping it costs zero taps.

Enforcement lived in **four** places, and a UI-only removal would have produced exempt orders
rejected at both `pay_order` (online) and `push_order` (sync) with the cashier unable to act on
either message:

1. `mobile/app/pay.tsx` — the gate on the confirm button
2. `pay_order` — last defined in `0019`
3. `push_order` — last defined in `0023`
4. **`tax_exempt_fields_consistent`**, a CHECK constraint on `orders` from `0012` — the hard one,
   because it binds every writer, not just the functions

`0026` rewrites all three server-side pieces. The constraint's `else` branch is untouched: a
reason or approver left over from a cancelled choice, stuck to an order that *was* taxed, is an
audit trail that lies. Only the `exempt` branch was loosened, and only its reason half —
`tax_approved_by is not null` still holds.

**`tax_exempt_reason` was not dropped.** Exempt orders that already carry a reason keep it and
still satisfy the new constraint. Dropping the column would delete correct records for a
tidiness nobody asked for.

Both functions use `create or replace`, never drop: `push_order` carries
`grant execute ... to authenticated` from `0008`, and dropping it kills sync on every phone.
`pay_order`'s signature is unchanged and `p_tax_exempt_reason` is still a parameter, so callers
still sending six arguments keep working; removing it would change the signature and every one
of them would fail to resolve the function.

`TAX_EXEMPT_REASON_REQUIRED` stays in `db/errors.ts` with a **new message**. After `0026` the
code can only arrive from a server that has not received the migration — the cashier has no
field to fill and retrying will never work — so the text now points at the person who can fix it
instead of telling the cashier to type.

The `DebugScreen` check that asserted the old rule was replaced rather than deleted: the exempt
case now proves the inverse, that paying with no reason succeeds, stores `null` (not an empty
string), and still records the approver.

## Dashboard reports — three functions, one number ✅ (Postgres; frontend in the next section)

`0027_laporan_dashboard.sql`. The calculation layer for three manager report pages, entirely in
Postgres — the screen and the export file call the same function, so there is never a second
path that can drift. Nothing in `mobile/` was touched and no frontend exists yet; that is
Tahap 2.

Ten report functions already existed and were audited first. All of them already exclude
`is_test_data` and already take a date range, so none were modified — the three new functions
sit alongside them under `laporan_*` names. Adding a `date`-typed overload next to the existing
`timestamptz` ones would have been the fastest way to make a caller invoke a function it did not
mean to.

**Parameters are `date` in WIB, not `timestamptz`.** The ten older functions take `timestamptz`,
which pushes the WIB→UTC conversion onto the caller — exactly where the mistake is invisible,
because the server runs in UTC and an 11pm order lands on the next day if anyone forgets to
shift it. Here the range arrives as WIB dates and the conversion happens in SQL, once.
`p_sampai` is inclusive. Verified with an order stored as `2026-07-15 16:40+00`: it reports on
15 July, not 16.

**The cross-check gate runs on `subtotal`, not `total`.** The brief asked for three sums to be
identical: daily revenue, the sum of order totals, and the sum of product revenue. Those three
cannot be equal, and it is not a fixable defect — `orders.total` includes PBJT while
`order_items` carries no tax at all, since tax is computed once on the order (decision 2 in
`0012`). Summing `total` is always higher by exactly the tax. The axis that can be identical is
gross pre-tax revenue, because `sum(order_items.subtotal) = orders.subtotal` is how the write
paths maintain it. `tertagih` (subtotal + tax) is cross-checked separately, between the daily
and detail functions only. Both gates pass on July 2026: **4.498.000** three ways, **4.876.200**
two ways.

**There are two kinds of tax exemption and merging them is a money error.** This was nearly
missed: the audit read `0012` and `0016` and concluded the tax base was `orders.subtotal`, which
`0019` had already changed. It was caught by reading the live `tax_arithmetic` constraint out of
the database rather than trusting the migration files that had been read. The two kinds:

- **Order-level** — `tax_status = 'exempt'`, the whole order, approved by an employee. A human
  decision, and the thing that gets audited.
- **Not an object of the tax** — cigarettes. Per *line*, not per order: `categories.taxable`
  snapshots to `order_items.taxable`, and the tax base becomes `orders.taxable_subtotal`.
  Nobody approves anything; it is a property of the goods.

So the PBJT base is `taxable_subtotal`. Reporting `subtotal` as the base overstates tax payable
by exactly the cigarette sales — a plausible-looking number, no error anywhere, wrong on a
regional tax return. The two are separate columns (`omzet_bebas_order`, `omzet_bukan_objek`) and
the relationship is asserted, not assumed: `omzet_kotor = dasar_pbjt + omzet_bebas_order +
omzet_bukan_objek`, zero violating rows across 31 days.

Note that `AGENTS.md` still states the tax formula as `(subtotal * rate_bps + 5000) / 10000`.
Since `0019` the base is `taxable_subtotal`. The rounding rule is unchanged and both TypeScript
copies agree with Postgres, but the sentence names the wrong column.

**Days with no transactions are generated, not joined.** `laporan_penjualan_harian` builds the
full date series and joins data onto it. If a quiet day drops out of the result, the trend line
jumps from the 3rd to the 5th and lies about the shape of the week. This is what distinguishes
it from `get_pbjt_harian`, which only emits dates that have rows. Because the series is already
complete, a day containing only refunds gets its row without the `full outer join` that `0018`
needed.

**Discount and order type were dropped rather than invented.** Discount does not exist anywhere
in the schema, the RPCs, or the UI; a permanently-zero column only invites the same question
every month. Order type is subtler: the cashier has a Meja/Takeaway switch, but `orderKind` is
UI state only (`mobile/lib/cart-context.tsx`) — what reaches the database is
`table_code = 'Takeaway'`, a string literal. That is a typing convention of exactly the class
`0022` was written to remove, with the same weakness: one different spelling and the row is
silently miscategorised. So the detail report emits `table_code` as-is and claims nothing about
order type. A real `order_kind` column requires `push_order` and `mobile/` to change together;
noted in `TO_DO.md`.

**Product report grain is per variant, decided by Heika.** There is no variant table — each
variant *is* a product row, and the grouping into one card is client-side name parsing in
`mobile/lib/product-variants.ts`. That logic cannot even decide what "no suffix" means without
looking at a product's siblings: absent suffix means "hot" on the temperature axis and "ori" on
the sauce axis. Reproducing it in SQL would duplicate logic that cannot be guaranteed to match
what the cashier sees on screen, and a number that does not match is what destroys confidence in
the whole dashboard. `kategori` is kept as the grouping axis; parent-level totals are a display
concern.

Grouping is by `product_code` snapshot, not `product_name` — names are deliberately preserved
per-transaction so old receipts do not change, and grouping by name would split one product into
two rows the moment somebody fixes a typo mid-month. The displayed name is the most recent
snapshot in the period, via `(array_agg(... order by paid_at desc))[1]` rather than `max()`:
what is wanted is the latest name, not the alphabetically largest.

`kontribusi_persen` sums to *approximately* 100, not exactly — 2-decimal rounding over 121 test
rows summed to 99,93. That is per-row rounding, not a money mismatch; the gate runs on `omzet`,
which is whole rupiah and matches exactly.

**Execute privileges are revoked explicitly.** The ten earlier functions wrote no grants at all,
on the grounds that only `service_role` calls them. That is true in practice but was never
enforced: Postgres grants `EXECUTE` to `PUBLIC` by default on every new function. What actually
held anon out is a different layer — these are not `SECURITY DEFINER`, so the caller's own
privileges apply and anon has `SELECT` on nothing. The default is revoked here anyway. Depending
on two layers when one can be stated outright only leaves a question for the next person, and
`p_include_test` must not be reachable from outside.

Verified on local Postgres first. **Applied to hosted on 7 August 2026** with Heika's permission,
because the dashboard reads hosted; re-verified there against real data.
Test data was generated through `create_order` / `pay_order` / `create_refund` rather than direct
inserts, so every invariant formed itself; 80 paid orders across 2026-06-29 to 2026-08-02,
including deliberately empty days, both month boundaries, 23:40 WIB payments, cigarette lines,
exempt orders, test-flagged orders, and partial refunds. The migration runs twice with no
overloads created and no number changed. `seed.sql` needs no update — it carries data only, and
`0027` adds none.

## Dashboard frontend — Tahap 2 ✅ (web only; `mobile/` untouched)

The manager-facing Next.js app: login, five pages, three XLSX exports. `0027` was pushed to
hosted first, with permission, so the screen reads the same functions the migration was verified
against. Nothing in `mobile/` was touched and no SQL was written — where the database was found
lacking it is reported, not patched in TypeScript.

**The mockup's architecture was the thing to discard, not its looks.** `dashboard/index.html`
aggregated in browser JavaScript from a full dump of raw transactions. Both halves of that are
wrong here: raw sales data must not reach the browser at all, and the numbers must be computed
once, in `0027`, not a second time in a second language where the two can drift without either
being obviously wrong. What was kept is the `Api` object as a named layer — the idea was right,
only its contents changed, from mock generators to route calls (`lib/api-klien.ts`). The outlet
picker and the Kasir page were dropped: Rusen is one outlet, and building a picker for a second
branch that does not exist is a permanent question with no answer.

**PIN was replaced with Supabase Auth, email plus password.** A six-digit PIN is defensible on a
phone somebody has to be holding, inside the shop. On a web address a bot can reach, one million
possibilities is not a secret. `lib/auth.ts` verifies the password against GoTrue with a raw
`fetch`, deliberately not through `supabase-js`: the only Supabase client in this app carries the
service role key and sets `Authorization: Bearer <service_role>` on every request, which makes
GoTrue see two identities on one call and answer confusingly. The app still issues its own signed
cookie afterwards (`lib/session-token.ts`), because a single session mechanism that already works
is worth more than matching Supabase's refresh model for one owner account. The accepted cost is
written into that file: deleting the Auth user does not kill a live session, it expires within 12
hours.

**Session checks live in the routes, not in the frontend, and the second layer was proved
independently.** `proxy.ts` rejects unauthenticated requests, but a proxy is one config edit away
from not covering a path, and hiding a button never hid the URL behind it. So every route is
wrapped in `jaga()` (`lib/api.ts`) — no route writes its own check, which means "forgot to guard
this one" becomes "forgot to use the wrapper", visible at a glance. To prove the wrapper actually
works rather than being shadowed by the proxy, `/api` was temporarily removed from the proxy's
protected list and every route retested: all still answered 401. The list was then restored.
Route handlers answer 401 JSON rather than redirecting to `/login`, because a redirect makes
`fetch` read HTML with status 200 as success and then fail on JSON parsing — an error message
that points nowhere near the actual cause.

**`dasar_pbjt` stays populated on exempt orders, and displaying it verbatim overstates the tax
base.** This was found by the cross-check, not by reading code. The daily report said
`dasar_pbjt` = 23.890.000 for August; summing the detail report's column gave 27.765.000. The
difference, 3.875.000, is 93 exempt orders whose `pbjt` is zero but whose `taxable_subtotal` is
not — the column answers "how much of this order is taxable *goods*", which is a property of the
goods and does not stop being true when a human exempts the order. `0027` is right; a screen that
lets somebody sum that column down the page is not. So the detail table shows "—" for exempt
rows, the XLSX writes `null` there and leaves them out of its TOTAL, and the sheet carries a
footnote saying why. The verification script now pins the difference as an assertion rather than
merely tolerating it, so a future change that "fixes" the gap gets caught.

**Verification is a script, not a session of clicking.** `npm run periksa:laporan <dari> <sampai>`
signs its own session cookie from `SESSION_SECRET` and drives the real routes — not the library
functions underneath them, so the guard, the parameter parsing, and the workbook builder are all
in the path. 25 assertions across the three reports and the three files, in the spirit of the
existing `periksa:varian`. August 2026: 521 paid orders, gross **31.613.000** matching four ways
(daily, detail, product, and all three XLSX files), PBJT 2.389.000, billed 34.002.000. Also run
against a single day and against a period with no transactions at all.

**Two smaller things that were not obvious.** Numeric table cells need `whitespace-nowrap`: in a
nine-column table without it, "Rp 4.386.000" wraps onto two lines and the table *shrinks* to fit
rather than widening, so the last column is clipped and no horizontal scrollbar ever appears to
say so. And the date-range picker offers no time-of-day boxes even though the mockup has them —
`0027` takes `date`, so those values would be silently discarded, which is worse than not
offering them.

**Reported rather than built, both requiring Postgres first:** filtering on Detail Penjualan
(cashier, payment method, receipt search) needs `p_kasir`/`p_metode`/`p_cari` parameters on
`laporan_penjualan_detail`, because filtering the 25 rows that happen to be on screen gives a
different answer on every page while the row counter keeps quoting the unfiltered total. A real
`order_kind` column is the other, and belongs to `mobile/`. `dashboard/index.html` is kept until
Heika has compared the pages against it.

## Step 8 — Device and store builds

`preview` for installable tablet tests, `production` for the final sideloaded build.

**The app has now been compiled into an APK and run on a device — Expo Go is no longer the
only thing it has ever run under.** Built locally with Gradle (JDK 21 from Android Studio's
JBR; the JDK on PATH is Java 8 and cannot build RN 0.86), installed over adb, and exercised
from a cleared app state: login, catalog pull, product grid with variant cards, session
surviving reinstall. `expo-updates` is in the build, with `EXPO_UPDATES_LAUNCH_WAIT_MS=0`
confirmed in the generated manifest.

**Four defects surfaced, and compiling is what surfaced all four.** Expo Go carries its own
prebuilt native code and never runs prebuild, so none of these could have appeared in eight
weeks of testing under it. Worth stating plainly because it predicts where the next ones
live: anything in `app.json` plugin config, anything native, anything about first run.

1. EAS workers defaulted to Node 18.18.0; SDK 57 needs ≥20.19.4, so `npm install` skipped
   `expo` and prebuild died with `Cannot determine the project's Expo SDK version`. Pinned
   via a `base` build profile.
2. `expo-splash-screen` had `backgroundColor` and `imageWidth` but no `image`. The plugin
   still wrote a `splashscreen_logo` reference into `values.xml`, so resource linking failed.
   `assets/splash-icon.png` existed all along and was simply never pointed at.
3. The cashier screen read the catalog once on mount. That was harmless while switching tabs
   unmounted it — but the cart-loss fix keeps both screens mounted permanently, which
   silently removed the re-read. Pulling the catalog wrote all 293 products to SQLite and the
   grid stayed empty until the app was killed. Exactly what a cashier meets on a new phone.
4. The empty-grid hint said "Buka tab Order lalu tekan Tarik katalog". That button has never
   been in the Orders tab — it was in the header, and is now behind the hamburger menu.

Defect 3 is the one worth remembering: a fix in one place (keep screens mounted) quietly
invalidated an assumption in another (unmount means re-read). Nothing failed loudly, and no
typecheck could see it.

### OTA updates never worked until 2026-08-01, and failed silently the whole time

`expo-updates` was in the build from the start, `checkOnLaunch` at `ALWAYS`, `EXPO_UPDATE_URL`
correct in the generated manifest. It still never delivered a single update. Every launch fired
a request and every request failed:

```
E dev.expo.updates: {"message":"Remote update request not successful","code":"UpdateFailedToLoad"}
```

Nothing surfaced in the UI, because the failure path falls back to the bundle embedded in the
APK — which is always present and always works. So the app looked completely healthy, and the
only symptom was a stale build that could not be explained.

**Cause: a locally-built APK has no channel.** The channel is written into the native manifest by
*EAS Build*, from `eas.json`. A Gradle build on this workstation never runs that step, so the
update request carries no `expo-channel-name` header, and `u.expo.dev` cannot resolve a branch.
Two things had to change, and each alone is insufficient:

- `updates.requestHeaders` in `app.json` — the supported way to declare the channel for a build
  that is not produced by EAS Build. It generates the meta-data key
  `expo.modules.updates.UPDATES_CONFIGURATION_REQUEST_HEADERS_KEY`, a JSON string.
- The same meta-data added by hand to `android/app/src/main/AndroidManifest.xml`, because
  `android/` is already prebuilt and gitignored, and re-running prebuild would overwrite the
  release signing config. **That edit is not in version control.** If `android/` is ever
  regenerated, `app.json` restores it — but verify before shipping.

The `production` channel did not exist on EAS either; only `preview` did. `eas channel:create`
makes the channel and its branch together.

**`runtimeVersion` was moved off the `fingerprint` policy to a literal `"1"`.** This was forced,
not preferred. The fingerprint embedded in the Gradle-built APK and the fingerprint computed by
`npx expo-updates fingerprint:generate` over the identical source tree do not match:

```
APK  assets/fingerprint            ce78c9e377f3c4cf964d8d85957af069c53d679a
CLI  fingerprint:generate --android c3730b01847f91400f021ef8fc89abd1b4efeed9
```

The policy is designed around EAS Build; with a local Gradle build the two engines disagree, and
while they disagree every update is answered "no compatible update" — OTA stays dead, just with a
quieter error than before. A literal version removes the whole class of mismatch.

**The cost is real and lands on a human.** `runtimeVersion` now lives in two places that must be
bumped together — `mobile/app.json` and `mobile/android/app/src/main/res/values/strings.xml` —
and nothing enforces it. Bump it for *any* native change: `modules/escpos-bluetooth`, a new Expo
package, anything under `plugins` in `app.json`. Forget, and `eas update` will push JS that calls
a native module the installed APK does not contain, straight to the outlet. The fingerprint policy
used to prevent that automatically; now only memory does.

Verified end to end on the device rather than assumed: first launch logged
`onBackgroundUpdateFinished: Update available` and `NEW_UPDATE_LOADED` with 5 of 5 assets and zero
failures, manifest showing `branchName: production` / `runtimeVersion: 1`; the next launch logged
`CheckCompleteUnavailable`, which is the healthy steady state and the proof the downloaded bundle
is the one actually running.

### Build the APK first, then publish — the embedded bundle competes on age

Within the hour, the same verification stopped holding. Every launch went
`isUpdateAvailable=false` → embedded bundle → `Check` → `CheckCompleteAvailable` → `Download` →
`DownloadComplete isUpdatePending=true` → `NEW_UPDATE_LOADED` → `EndStartup`, and the next launch
repeated it from scratch, offering the same update `019fbc70` as new. I read that as the pending
update being discarded between launches, which was wrong, and I told Heika the OTA verification
above had been bogus all along. It had not been. It was correct when written and stopped being
correct afterwards, for a reason that is not a bug at all.

**The bundle embedded in the APK is one of the candidates the launcher ranks, and it ranks by
`commitTime`.** The embedded update's commitTime is the moment the APK was built. So:

```
OTA update 019fbc70 createdAt   2026-08-01T08:28:09Z
APK rebuilt and installed       2026-08-01T08:33   ← five minutes newer, wins every launch
```

The downloaded update was stored correctly and never launched, because it was *older* than what
shipped inside the app. Nothing logs this. `eas update` reports success, `NEW_UPDATE_LOADED`
appears every time, and the phone quietly keeps running the embedded JS.

Every rebuild that session had followed a publish, so I had invalidated my own updates each time.
Confirmed by inverting the order: publish `019fbc80` *after* the install, launch twice, and the
second launch logs `CheckCompleteUnavailable` — the update is now the one running.

The rule, and it is an ordering rule, not a configuration one:

- **Build and install the APK first, then `eas update`.** Never the reverse.
- After any APK install, republish the current JS, or the outlet is pinned to the embedded bundle
  until the next publish — which may be days.
- `NEW_UPDATE_LOADED` proves a download, not a launch. A visible change on the screen is the only
  self-contained proof an update is *running*. `CheckCompleteUnavailable` was written here as a
  second proof and **it is not one** — see the 2026-08-02 correction below.

The second bullet is the one that will bite. A build is the normal response to a native change, and
it silently reverts every JS-only fix published before it back to build-time state.

Day-to-day, for JS-only changes:

```
cd mobile
npx eas-cli@latest update --branch production --environment production --platform android -m "..."
```

`--environment` is mandatory under `--non-interactive`; the command fails without it. The cashier
sees the change after two app restarts — one downloads, the next launches it. An update never
interrupts a shift in progress.

### The splash screen, and why it cannot go out over the air

Until 2026-08-01 `mobile/assets/splash-icon.png` was the template's concentric-circles-on-a-grid
artwork, added in step 8 only because resource linking fails without *some* image (defect 2 above).
It is now the Rusen roundel. Two things about that swap are worth keeping:

**The splash image is native, not JS.** `expo-splash-screen` compiles it into Android resources as
`splashscreen_logo` at five densities. `eas update` cannot carry it — an OTA that "changes the
splash" will publish successfully, report success, and change nothing on the device. It needs a new
APK, which means `runtimeVersion` goes up (this swap took it 1 → 2).

**Regenerating the drawables did not require prebuild.** The densities were rewritten straight from
the source PNG with `sharp`, matching the sizes already there
(288/432/576/864/1152 for mdpi→xxxhdpi). `npx expo prebuild` would also work and would in fact
re-derive the channel meta-data from `app.json`, but it rewrites all of `android/` — and that tree
is gitignored, so anything hand-tuned in it is gone with no diff to inspect. Prefer the narrow edit.

The source image must have a **transparent** background (alpha 0 in the corners, verified before
building). A white matte reads as a white card floating on the `#0f172a` splash background.

The splash is briefly visible on every cold start, and lingers longest on the first launch after an
install while `expo-updates` finishes its check. That reads as a hang and is not one.

### Asking a phone at the shop which channel it is on (2026-08-01)

Fallout from the OTA defect above. Once the publish path was fixed, the next question could not be
answered from the laptop at all: *does the phone at the counter actually receive these releases?*
A device built with the `preview` profile listens to a different channel. It throws no error and
shows no warning — it simply sits on its embedded bundle forever, looking completely normal.

So the menu sheet in `AppShell.tsx` now carries a **Periksa Pembaruan** button and, above it,
three lines shown without any tap: `Updates.channel`, `Updates.runtimeVersion`, and whether the
running bundle is the APK's embedded one (`isEmbeddedLaunch`/`updateId`) or a downloaded update
with its timestamp. Two decisions in that:

**The version lines are not hidden behind the button.** An answer you have to go looking for is
never read by whoever is on shift. It also went into the *menu*, not the Debug screen — the
question comes up while someone is holding a suspicious phone, and it must be answerable without
knowing which screen buries it.

**`reloadAsync` is deliberately not called** after fetching. A forced reload during a busy hour
closes the cashier screen someone is standing in front of. The message says to close and reopen.

The limitation is inherent and worth stating plainly: this panel ships over the air, so a
wrong-channel phone will never display it. **Its absence from the menu is the diagnostic.** That
phone needs a fresh APK built with the `production` profile; no OTA can reach it.

### The two-places rule was already written down, and it failed anyway (2026-08-02)

The paragraph above — "`runtimeVersion` now lives in two places that must be bumped together …
and nothing enforces it" — describes exactly what then happened. Recording it is worth more than
the fix, because the warning existing did not prevent it.

`app.json` went `2` → `3` in commit `2b92cdf` at 07:05:51. The APK was built at 07:06, one minute
later. `mobile/android/app/src/main/res/values/strings.xml` still said `2`, and nothing said so:

```
BUILD SUCCESSFUL          # Gradle never runs the Expo config plugins
app.json  runtimeVersion  3
strings.xml expo_runtime_version  2
```

**A plain Gradle build does not rewrite `strings.xml`.** Only `expo prebuild` does. So the value
in `android/` is whatever prebuild last left there, and a bump in `app.json` reaches the APK only
if someone carries it across by hand.

**The APK then contains two runtime versions that disagree, and the wrong one is easier to check.**

| Source inside the APK | Read by | Value |
|---|---|---|
| `assets/app.config` | `expo-constants` | 3 |
| `AndroidManifest` → `@string/expo_runtime_version` | `expo-updates` | 2 |

`assets/app.config` is generated from `app.json` at bundle time, so it is always right and always
irrelevant to OTA. `expo-updates` reads the native one. A verification that reads `app.json`, or
greps the APK's `app.config`, returns `3` and proves nothing — that is how the build was declared
runtime 3 while the device asked the server for runtime 2.

**The failure is silent because the wrong answer is a correct answer.** The phone asks "any update
for runtime 2, channel production?", the server holds only runtime 3, and it truthfully replies no:

```
Updates state change: CheckCompleteUnavailable, isUpdateAvailable=false
```

That is byte-identical to the healthy steady state described two sections up. `eas update` also
reports success, because the publish genuinely succeeded. Nothing anywhere is in an error state.

**What caught it was the panel built for this in the section above.** `Saluran: production ·
runtime 2` on the Pengaturan screen, against `"runtimeVersion": "3"` in `app.json`. The panel was
added to answer "which channel is this phone on"; it answered a question it was not designed for,
because it prints the value `expo-updates` actually holds rather than the value the repo intends.
Keep it printing that one.

Verify the compiled resource, not the config — this is the only check that reads what
`expo-updates` will read, and it works on any APK including one pulled off a phone:

```
$SDK/build-tools/<ver>/aapt2.exe dump resources app-release.apk | grep -A1 expo_runtime_version
    resource 0x7f110060 string/expo_runtime_version
      () "3"
```

Then confirm on the device that the server now matches it. `isUpdateAvailable` flipping to `true`
for a manifest whose `runtimeVersion` is the expected one is the proof; the update `id` should be
the one `eas update` printed:

```
CheckCompleteAvailable, isUpdateAvailable=true
latestManifest={"id":"019fc042-…","runtimeVersion":"3"}
```

The narrow edit to `strings.xml` was preferred over `expo prebuild` for the reason given in the
splash-screen section: prebuild rewrites all of gitignored `android/`, including the release
signing config, with no diff to inspect. Consequence, and it is the same one as the channel
meta-data: **that edit is not in version control.** A fresh clone is safe — prebuild derives `3`
from `app.json` — but this workstation's `android/` tree carries the value by hand from here on.

### Correction: `CheckCompleteUnavailable` does not prove an update is running (2026-08-02)

The ordering section above ends with `CheckCompleteUnavailable` on a later launch as proof that the
downloaded bundle is the one executing. That is wrong, and the same day's rebuild is what exposed
it. Publish and build landed in the forbidden order — OTA `019fc042` at 09:16:41, APK built 09:33 —
so the embedded bundle outranked the update by sixteen minutes and had to be the one running. The
next launch nevertheless logged the "healthy" line:

```
StartStartup → Check → CheckCompleteUnavailable → EndStartup
```

**Two different states print that line, and the log cannot separate them:**

- the downloaded update is running and the server holds nothing newer;
- the *embedded* bundle is running because it wins on `commitTime`, and the server still holds
  nothing newer, because the newest update was already downloaded on a previous launch.

`CheckCompleteUnavailable` is a statement about the **server**, not about which candidate the
launcher picked. It is necessary but not sufficient. The prediction that the phone would re-offer
and re-download the same update on every launch was also wrong: it downloads once, stores it, and
then keeps answering "nothing new" while never running it. Quieter than the failure it hides.

What does separate the two is `AppShell.tsx`, because it reads the launcher's own state rather than
the check result — `Updates.isEmbeddedLaunch` and `Updates.updateId`:

```
Bundel: bawaan APK, belum pernah menerima pembaruan   → embedded won
Bundel: 019fc042 · <waktu>                            → the update is running
```

That line and a visible change on screen are the only two honest proofs. This is the second time
the menu panel answered a question it was not built for; both times it worked because it prints
what `expo-updates` actually holds instead of what the repo intends. Reason enough not to
"simplify" it into showing a derived status.

---

## Configuration — where every setting actually lives

Scattered across four files by necessity, which is exactly why it is collected here. Getting
one of these wrong produces a build that installs and then dies with no message.

| Setting | Lives in | Notes |
| --- | --- | --- |
| Supabase URL + anon key, local dev | `mobile/.env` | Gitignored. Read automatically by Expo CLI when bundling. |
| Supabase URL + anon key, EAS builds | `mobile/eas.json` → `build.<profile>.env` | **Must be here.** EAS builds from a git archive, so `.env` is absent on the worker. Public by design; anything not public goes through `eas env:create`, never this file. |
| Node version for EAS workers | `mobile/eas.json` → `build.base.node` | Pinned to 22.20.0. The default was Node 18 and it broke every build. |
| Update channel | `mobile/eas.json` → `build.<profile>.channel` | Written into the APK by EAS only. Local Gradle builds get no channel and therefore no OTA. |
| Update server + launch behaviour | `mobile/app.json` → `updates` | `fallbackToCacheTimeout: 0` so a bad signal never delays startup — non-negotiable for an offline-first till. |
| Native compatibility key | `mobile/app.json` → `runtimeVersion` | `fingerprint`, not `appVersion`. Computed from project contents, so a forgotten version bump cannot ship JS to an APK missing the native module it calls. This matters the moment Bluetooth lands. |
| Splash, icons, plugins | `mobile/app.json` → `plugins`, `android` | Only ever exercised by `prebuild`. Expo Go ignores all of it. |
| Bluetooth permissions | `mobile/modules/escpos-bluetooth/android/src/main/AndroidManifest.xml` | **Not `app.json`** — the exception to the row above. The permission exists because of that module, so it lives with it and disappears if the module does. Manifest merger folds it in at build time. Only `BLUETOOTH_CONNECT`; the app never scans. |
| Selected printer | device SQLite, `app_state` table | Keys `printer_address` / `printer_name`. Per machine, not per session, so it survives a shift change. Not in the repo and not synced — each device chooses its own. |
| Shop name, outlet, WiFi password | `mobile/lib/shop.ts` | Read by both the app and `npm run preview:struk`, so preview and paper cannot diverge. Constants in code, not a settings screen: they change every few years, and a screen is a surface to maintain forever. JS-only, so changing them is an OTA update. |
| Session lifetime | `supabase/functions/pin-login/index.ts` → `SESSION_MAX_AGE` | 12 hours, one shift. |

**Build commands.** `npm run typecheck` is the only automated gate. `npm run preview:struk`
renders receipts without a device. Local APK: `npx expo prebuild --platform android` then
`cd android && ./gradlew assembleRelease`, with `JAVA_HOME` pointed at Android Studio's JBR
(JDK 21) — the JDK on PATH is Java 8 and cannot build RN 0.86. EAS: `npm run build:preview`.

**A caveat about this file.** `.md` is gitignored at Heika's request, so MIGRATION.md,
DESIGN.md, PRODUCT.md and the READMEs exist on Heika's disk but are **not** in either GitHub
repo. An agent working from a fresh clone will not find them. If you are reading this, you
are reading a local copy.

**A note on local builds.** A local Gradle build produces no `EXPO_UPDATES_CHANNEL` meta-data
— the channel is written by EAS build profiles — so a locally built APK cannot receive OTA
updates. Fine for iteration, not for what ships to the outlet.

**A pre-build pass found one blocker and two pieces of waste, none visible from a typecheck.**

The blocker: `eas.json` declared no `EXPO_PUBLIC_SUPABASE_URL` or `EXPO_PUBLIC_SUPABASE_ANON_KEY`.
Locally those come from `mobile/.env`, which is gitignored — and EAS builds from a git
archive, so the file is simply not there on the build server. `lib/env.ts` throws at module
import when either is missing, so the APK would have installed, launched, and died on the
splash screen with no clue why. Confirmed rather than assumed: `npx expo export` inlines the
project ref into the Hermes bundle when `.env` is present, which is exactly the mechanism
that would have produced `undefined` without it. Both values now sit in `env` on all three
build profiles. They belong in the repo because they are public by design — the anon key is
inlined into the APK either way and carries no rights without a token. Anything that is not
public by design must go through `eas env:create` instead, never this file.

The waste: `theme/fonts.ts` imported from the `@expo-google-fonts/poppins` package root,
whose index re-exports all eighteen weights. Metro bundles any asset it can see referenced,
so the APK carried 3.0MB of Poppins to use four weights. Per-weight subpath imports cut the
asset payload to 620KB across 4 files. Separately, `expo-doctor` reported three patch-level
mismatches (`expo`, `expo-dev-client`, `react-native`) — trivial in a JS project, not in one
that compiles native code; `expo install --fix` cleared them and the project now passes
20/20.

**The largest remaining risk is not a defect in the code: a cashier cannot log in offline.**
`pin-login` is an edge function, so authentication needs the network, while sessions last 12
hours (`SESSION_MAX_AGE`). Open the app at the start of a shift with no signal, or have a
session lapse mid-shift, and the whole offline-first design is unreachable behind a login
screen that cannot answer. Everything past that door works offline and has been verified to.
This is worth a decision before opening day, not after: the options are a longer session, a
locally verifiable PIN cached from the last successful login, or accepting it because the
outlet has a hotspot as backup.

---

## Open items

Resolved entries are kept struck through rather than deleted. They record what was actually
wrong, which is usually more useful than the fix.

**Decisions waiting on Heika, not on work:**

- **Offline login.** The largest operational risk in the app. `pin-login` is an edge
  function, so authentication needs the network, while sessions last 12 hours. Open the app
  at the start of a shift with no signal, or let a session lapse mid-shift, and the entire
  offline-first design sits unreachable behind a login screen that cannot answer. Everything
  past that door works offline and has been verified to. Three options: a longer session, a
  PIN hash cached from the last successful login so it can be verified locally, or accept it
  because the outlet has a hotspot. Nobody has chosen.
- ~~Where shop identity and the WiFi password live~~ **Resolved:** `mobile/lib/shop.ts`, and the
  real passwords are in place. One thing to check on paper: the receipt labels the networks "4G"
  and "5G" because that is what Heika called them. If the SSIDs a customer sees in their phone's
  WiFi list read differently, the labels should match those instead — a correct password under
  an unrecognisable network name is no better than none.
- **Whether the unpaid provisional bill should print the WiFi password and thank-you line.**
- **Whether `Nasi Paket Cumi Goreng Tepung` should get the same six sauces.** Same category,
  same Rp 25.000 base as the two that did. It was left out only because it was not named.
- **`expo-updates` is installed but never exercised.** No update has been published, and the
  only APK on the phone was built locally and therefore has no channel. The mechanism is
  untested end to end.

**Known and deliberately unfixed:**

- **Reflection onto RFCOMM channel 1** (methods three and four) has never succeeded on anything.
  Both SPP methods have.
- Nothing outstanding on the printer itself.

- **`ProductCard`'s `memo` is bypassed.** `onPress={() => onSelect(item)}` in
  `ProductGrid.tsx:49` allocates a new function per `renderItem` call, and
  `VirtualizedList`'s `CellRenderer` is not pure. The comment at `ProductCard.tsx:80-84`
  still claims memo prevents grid-wide re-render, which is not true yet.
- **The three-column landscape layout has never run at tablet size** — details below.
- Minor, parked: `disabled={busy}` missing on the variant test button; `VariantSheet` pressed
  state uses `colors.primary`; `variantEntry` is not cleared on category or search change.

**Historical record:**

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
- **The three-column layout has never run at tablet size.** The phone is now the primary
  target and the tablet the secondary, so this matters less than it did — but the layout is
  still in the code and everything known about it comes from one rotated phone at 834×375dp.
  That is a misleading proxy in a specific way: a real tablet is wide *and* tall, so
  `useShortViewport()` returns false there and the layout takes a branch nobody has seen —
  full-size sidebar (200dp) and cart (340dp), the looser chrome, and the stacked cart footer
  instead of the side-by-side one. Every landscape fix made so far was measured against the
  short branch. The specific things to check at tablet size: whether 200 + 340dp of fixed
  columns still leaves a sensible product grid at that width, and whether the cart footer
  and product cards look deliberate rather than merely un-cramped. `preview` in `eas.json`
  builds an installable APK for exactly this.
- ~~The steps 4-5 UI has not run on a device~~ **Partly resolved.** The portrait cashier
  layout, the login screen, the category strip, and the merged variant cards have all been
  seen on a phone, and three layout defects were found and fixed there that no typecheck
  could have caught. The step 4 queue has now run too: an order created offline showed the
  unsent badge, stayed at one order after being paid offline rather than becoming two, and
  the badge cleared on the manual push. The three-column landscape layout has now run too,
  on a rotated phone, and it was broken in two ways a typecheck could not see — see step 5.
  Still unverified in landscape: the full cart → pending → paid flow, and the Orders and
  Edit Order screens.
- ~~Three test orders sit on the hosted database and will show up in sales reports~~
  **Resolved, and they were already gone.** Table codes `A3`, `Z9` and `ZZ` no longer exist:
  a data dump of the hosted project during the PBJT work contained no `orders`, `order_items`
  or `payments` rows at all, so `0007_hapus_order_uji.sql` had taken them. Counted, not
  assumed. `0011_hapus_order_sebelum_pbjt.sql` now guarantees the state rather than leaving it
  to luck.
- **The LAN path from phone to laptop does not work on this network.** Metro binds
  correctly and the firewall allows it; the phone simply cannot reach `192.168.100.4:8081`,
  almost certainly router client isolation. Device testing runs over
  `adb reverse tcp:8081 tcp:8081` on USB instead, which bypasses the network entirely.
  Worth knowing before anyone spends another hour on firewall rules.
- ~~An order pushed before it was finalized freezes on the server in that state, and the
  payment never arrives~~ **Fixed** in `0008_push_order_update.sql`, applied to the hosted
  database. `push_order` now has an update branch, and the discriminator between a replay
  and a real update is `version`, which every local write already bumps. The version test is
  written as a condition on the UPDATE itself (`where id = ... and version < incoming`)
  rather than as a separate check beforehand: two concurrent pushes — the retry button
  pressed while the automatic push is running — would interleave between a check and a
  write, but as an UPDATE predicate the row lock decides. The money re-check moved above the
  branch so the update path is guarded exactly as tightly as the insert path.
  `order_items` is deleted and rewritten rather than topped up, because voiding on the
  device removes rows or reduces quantities; inserting only what is missing would leave
  voided items alive on the server with a total that no longer matches its own items.
  `mobile/db/push.ts` needed no change — it marks synced when no error is raised, which was
  only wrong because the server had no way to accept the update.
  Verified against a local Postgres seeded from all eight migrations, not by inspection: 17
  checks covering the exact failure story (push unpaid, pay, push again → payment arrives),
  the replay guard still refusing identical pushes, a resent payment not becoming a second
  money row, appended items, a voided item disappearing server-side, a stale lower-version
  push not rolling the server back, and both money guards still firing on the update path.
  The script is not in the repo, in keeping with the no-test-runner decision; it drives
  `push_order` over `pg` with `request.jwt.claims` set to a seeded employee.
  The original defect, kept because the reasoning still matters:
- **An order pushed before it was finalized freezes on the server in that state, and the
  payment never arrives.** This is a money defect and it fails silently. `push_order` refuses
  to overwrite an id it already holds — correct as a duplicate guard, and verified on the
  hosted database: three identical pushes returned `inserted:true`, then `false`, then
  `false`. But paying, appending an item, and voiding all reset `sync_status` back to
  `'pending'` (`mobile/db/orders.ts:219,302,308,360`), so the order re-enters the queue,
  gets answered `inserted:false`, and `pushPending` marks it synced because no error was
  raised (`mobile/db/push.ts`). The server keeps the old status and the old total forever.
  Nothing about this path is exotic: `AppShell` runs `pushPending` on every app open with a
  live session, so unpaid orders are routinely pushed first and paid half an hour later.
  Sales reports would simply be short of money, with no error anywhere. It escaped notice
  until now because the orders tested so far happened to be created and paid entirely
  offline, then pushed once when already final — the lucky path, not the common one.
  The fix worth making: give `push_order` an update branch keyed on `version`. If the id
  exists and the incoming `version` is higher, update the order and insert the items,
  voids, and payment that are not there yet; otherwise keep returning `inserted:false`. The
  money re-check already in the function applies unchanged, and `version` is already bumped
  on every local write. The cheaper, narrower alternative is to queue only finalized
  orders, which costs the offline backup for orders that stay open a long time.
- **`payments` has no `ON DELETE CASCADE` in Postgres but does in the local SQLite schema.**
  This was written down as harmless on the grounds that nothing deletes orders in
  production. That turned out to be wrong the first time it mattered:
  `0007_hapus_order_uji.sql` had to delete `refunds` and `payments` explicitly, in that
  order, before `orders` would go — the foreign key refuses otherwise. The same trap waits
  for any future cleanup, and the two schemas still differ.
- **Seed PINs are live on a public database.** The two cashier accounts still carry the
  plaintext PINs listed in the header comment of `seed.sql`. The owner PIN is
  no longer `000000` — Heika chose a replacement and `seed.sql` carries its bcrypt hash, so
  the plaintext is not in the repo. The two cashier PINs are still sequential digits, which
  the rate limit blunts but does not fix; they should change before opening day too.
- ~~The root `README.md` is still create-next-app boilerplate.~~ **Resolved.** It now names
  both apps, points at these documents, and states the two-database rule that catches people
  out. `mobile/README.md` was rewritten at the same time — it had frozen at "steps 1-3 built,
  no cashier UI, sync engine, or printer code yet", which was wrong in every clause.

## Testing approach

- Non-hardware work: Expo Go on a personal phone for fast iteration.
- Step 7 onward: a compiled APK on real hardware only — emulators have no real USB or
  Bluetooth. In practice this was a local Gradle release build plus `adb install -r`, which is
  under a minute once the first build is warm. `adb logcat -s EscposBluetooth:*` is the whole
  debugging story for the printer; without the logging added there, a failure carries no
  information at all.
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
