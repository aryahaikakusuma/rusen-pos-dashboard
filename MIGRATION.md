# MIGRATION.md — Rusen Kopitiam POS: Web to React Native (Expo)

Guides the migration of the existing web application into a React Native app on Expo,
targeting tablet (primary, cashier station) and phone (secondary, owner reports). Read
alongside `AGENTS.md`, `PRODUCT.md`, and `DESIGN.md` — this file covers only what changes
for the mobile migration, not the product scope itself.

**Status: steps 1-2 done, step 3 next.** Progress and corrections are recorded per step
below. Where reality contradicted the original plan, the correction is stated rather than
the plan quietly rewritten.

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
- Local database: WatermelonDB or op-sqlite — **not yet chosen**, decided in step 3.
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

## Step 3 — Local database layer (next)

- Choose WatermelonDB or op-sqlite, then mirror the relevant Supabase tables locally:
  orders, order_items, payments, refunds, refund_items, attendance_logs.
- Every local record gets `sync_status` (`pending`, `synced`, `error`).
- Build this before porting the cashier UI — the UI reads and writes local storage only,
  never Supabase directly.

## Step 4 — Sync engine

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

- **Supabase is local, not hosted.** `SUPABASE_URL` is `127.0.0.1:54321`; the phone reaches
  it only over the LAN. A hosted project is required before the outlet tablet is real.
- **JWT signing on a hosted project.** `pin-login` signs HS256 against the legacy JWT
  secret. A project switched to asymmetric signing keys would reject those tokens, and login
  would have to move to shadow `auth.users` rows. Verify before the first cloud deploy.
- **Cleartext HTTP.** Fine in development; production needs HTTPS, which a hosted Supabase
  project provides automatically.
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
