# Rusen POS — mobile (Expo)

React Native port of the web POS. Steps 1-3 of MIGRATION.md are built: project scaffold,
PIN login, and the local SQLite layer. No cashier UI, sync engine, or printer code yet.

## Stack

- Expo SDK 57 / React Native 0.86 / React 19.2, TypeScript strict.
- Poppins (`@expo-google-fonts/poppins`) loaded at runtime via `useFonts`.
- `expo-secure-store` holds the session token — not AsyncStorage, this is auth data.
- `expo-sqlite` for the local database, `expo-crypto` for device-side UUIDs. Both ship
  inside Expo Go, so the local DB work needs no custom build.
- `expo-dev-client` installed ahead of step 7 (printer native modules can't run in Expo Go).

## Local database (`db/`)

`db/orders.ts` is a deliberate line-by-line port of the Postgres RPCs in
`supabase/migrations/0001_init.sql:206-469`, not a reimplementation. After step 4 the same
order can be validated on the device and on the server, and the two must agree — so the
rules and the error codes are identical on both sides. Read that SQL before changing
anything here.

- `migrations.ts` — schema plus a `PRAGMA user_version` runner. Column names match Postgres
  so step 4's sync payloads stay near-literal. Bump `DATABASE_VERSION` and add a new `if`
  block for any schema change; installed tablets must upgrade, not wipe.
- `orders.ts` — `checkTableCode`, `createOrder`, `appendToOrder`, `voidOrderItem`,
  `payOrder`. Prices always read from the local `products` table, never from the caller.
- `catalog.ts` — one-way pull of `categories` and `products` from Supabase. This is **not**
  the sync engine; local orders still go nowhere and stay `sync_status = 'pending'`.
- `errors.ts` — the same short codes the RPCs raise, and their Indonesian translations.

To verify it, log in, tap **Tarik katalog** once while online, then **Jalankan uji lokal** —
the self-test exercises the full order lifecycle and every rejection path. Re-run it in
airplane mode: the local layer must not touch the network at all.

## Auth — and why the backend had to change

MIGRATION.md assumed an existing Supabase Edge Function validated PINs and that no backend
change was needed. Neither held:

- There was no Edge Function. PIN validation lived in a Next.js Server Action
  (`app/login/actions.ts`), which has no equivalent in React Native.
- `0001_init.sql` sealed every table — RLS on with zero policies, grants to `service_role`
  only. A mobile client had no way in, and shipping `service_role` in an APK is not an
  option: it is extractable and bypasses RLS entirely.
- Web sessions are httpOnly cookies, which React Native cannot hold.

So this step added, by explicit decision:

- **`supabase/functions/pin-login`** — Deno Edge Function holding `service_role`
  server-side. Ports the web logic verbatim: 6-digit check, 5-failures-per-IP-per-minute
  rate limit via `login_attempts`, bcrypt compare against active employees, one generic
  error for every failure. Returns a JWT signed with the project's JWT secret, so
  PostgREST verifies it and `auth.uid()` works in policies. `pin_hash` never leaves.
- **`supabase/migrations/0003_client_access.sql`** — grants `authenticated` a
  **column-level** select on employees that excludes `pin_hash` (RLS cannot hide a column,
  so the grant must), plus a policy limiting each employee to their own row. Everything
  else stays sealed until step 5 needs it.

The web app is unaffected — it still uses `service_role`, which bypasses all of this.

On the client: `lib/supabase.ts` uses the **anon** key with supabase-js's `accessToken`
callback pulling the token from `lib/session.ts`; `lib/auth-context.tsx` owns login/logout
and session restore. `SESSION_JWT_SECRET` must match the project's JWT secret exactly or
PostgREST rejects every token — locally it comes from `supabase status`.

Deployment caveat: this signs HS256 against the legacy JWT secret. A hosted project
switched to asymmetric signing keys would reject these tokens, and login would need to move
to shadow `auth.users` rows instead. Verify before the first cloud deploy.

## Running

```bash
npm run android       # Metro in Expo Go mode, opens on the USB-connected device
npm run start:go      # Metro in Expo Go mode, then press `a`
npm run start:tunnel  # same, via ngrok, when phone and PC aren't on the same network
npm start             # defaults to dev-client mode (expo-dev-client is installed)
npm run typecheck
npm run doctor
```

There is deliberately no `web` script. The blank-typescript template installs no
`react-native-web` or `react-dom`, so a web bundle fails on the first React
Native component (`Unable to resolve "react-native-web/dist/exports/Pressable"`).
The browser build of this product is the Next.js app at the repo root.

`expo-dev-client` is already a dependency, so plain `expo start` targets a custom
dev build rather than Expo Go. Use `start:go` until the printer work (step 7)
makes a real dev build necessary.

### Expo Go must be installed over USB, not from the Play Store

SDK 57 shipped 2026-06-30 and the matching Expo Go is still awaiting store
approval, so the Play Store client (SDK 56 or older) refuses this project with a
misleading "download the latest version" message. Install the correct client
over adb instead:

1. On the phone: enable Developer options (tap Build number 7x) → **USB
   debugging**. Connect by cable in **File transfer** mode — charging-only mode
   hides the device from adb — and accept the RSA fingerprint prompt.
2. `adb` ships with Android Studio but isn't on `PATH`. Per PowerShell session:

   ```powershell
   $env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
   $env:PATH = "$env:PATH;$env:ANDROID_HOME\platform-tools"
   adb devices   # phone must show as "device", not "unauthorized"
   ```

3. `npm run android` — Expo CLI installs the SDK 57 Expo Go APK and opens the
   project.

This whole detour disappears once Expo Go for SDK 57 clears store review.

## EAS builds

`eas.json` defines three profiles. All three target Android APK — the tablet is
sideloaded, and store submission is an explicit non-goal for this phase.

| Profile | Command | Output |
| --- | --- | --- |
| development | `npm run build:dev` | dev client APK, internal distribution |
| preview | `npm run build:preview` | release APK for tablet testing |
| production | `npm run build:prod` | release APK, auto-incremented version |

Linked to `@heikarya/rusen-pos` (project ID in `app.json` under
`extra.eas.projectId`). Requires the global CLI: `npm install --global eas-cli`,
then `eas login`.

## Design tokens

`theme/` is the single source of truth, ported from the web app's
`app/globals.css` `@theme` block and `DESIGN.md`:

- `colors.ts` — primary blue, order status colors, login surface, neutrals, plus
  semantic aliases (`sidebarActive` is dark neutral, not blue, by design).
- `typography.ts` — Poppins families, size scale, named text styles.
- `layout.ts` — spacing, radii, touch targets (min 48dp, primary action 64dp),
  cashier three-column dimensions.

Hex values are duplicated from the web app rather than shared, so any color
change must be applied in both places.

## Styling decision, deferred

NativeWind currently targets Tailwind v3; the web app is on Tailwind v4. The
theme module is plain typed constants, so it works with StyleSheet today and
with NativeWind later if that compatibility resolves. Nothing here needs to
change either way.
