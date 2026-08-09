# Rusen Kopitiam POS — rusen-pos-dashboard

Point-of-sale for a single-outlet family coffee shop. Two applications in one repo:

| | Where | What it is |
| --- | --- | --- |
| **Web** | repo root | Next.js 16 + Tailwind v4, server-only Supabase access via Server Actions. Manager-facing dashboard/report shell — no cashier UI. |
| **Mobile** | `mobile/` | Expo SDK 57 / React Native. Offline-first on SQLite, Bluetooth thermal printing. Runs the till. |

Some logic is still duplicated on purpose rather than shared as a package — Metro cannot import
from outside `mobile/`. `lib/types.ts` exists in both and **must be changed together**; if it
drifts, the two clients disagree about the shape of the same order data and nothing catches it.
`lib/product-variants.ts` and `lib/tax.ts` used to be duplicated too, but now live only in
`mobile/lib/` — the web app dropped its own product-picker and payment UI, so there is no root
counterpart left to keep in sync.

## Documentation

Read these before changing anything non-trivial. `AGENTS.md` is the shortest path in.

- **`AGENTS.md`** — the traps that have already cost time, and the rules that are not
  negotiable. Start here.
- **`MIGRATION.md`** — the record of the web → mobile migration. Not a changelog: it records
  why decisions were made and which plausible-looking alternatives were tried and failed.
- **`PRODUCT.md`** — domain and scope.
- **`DESIGN.md`** — the UI rules both apps obey.
- **`mobile/README.md`** and **`mobile/AGENTS.md`** — the Expo app.

## Running the web app

Needs Docker for the local Supabase stack.

```bash
npx supabase start
npm install
npm run dev          # http://localhost:3000
```

The web app points at **local Postgres**; the phone points at the **hosted project**. A
migration must reach both, or a menu appears on one device and not the other with both looking
entirely normal. See `AGENTS.md § Migrations`.

## Running the mobile app

```bash
cd mobile
npm install
npm start
```

See `mobile/README.md` — the printer path needs a compiled APK, not Expo Go.

## Checks

There is no test runner, by decision. The gates that exist:

```bash
npm run lint                    # web
cd mobile && npm run typecheck
cd mobile && npm run periksa:varian   # variant grouping over supabase/seed.sql
cd mobile && npm run preview:struk    # receipt layout, 32 columns
```
