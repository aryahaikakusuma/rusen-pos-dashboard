<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

<!-- END:nextjs-agent-rules -->

# Rusen Kopitiam POS — what an agent needs to know before touching this

Read `MIGRATION.md` before changing anything non-trivial. It is not a changelog; it records
_why_ decisions were made and which plausible-looking alternatives were tried and failed. Most
of the traps below cost real time to find, and every one of them was invisible until paper,
a device, or a database disagreed with the code.

`TO_DO.md` lists what is _not_ built yet and what breaks if it stays that way — check it
before assuming a gap is an oversight. `DESIGN.md` governs the UI (one primary button per screen, touch targets, colour roles).
`PRODUCT.md` is the domain. `mobile/AGENTS.md` adds the Expo-specific rule.

## The two apps are duplicated on purpose

The Next.js app is at the repo root; the Expo app is in `mobile/`. **The cashier flow now lives
only in `mobile/`** — it is the only one that can drive the thermal printer and the only one
that keeps working with no signal. The root Next.js app no longer has a cashier UI at all; it is
a manager-facing dashboard: `/dashboard` (sales KPIs), three report pages under
`/dashboard/laporan/`, `/dashboard/produk` (catalog CRUD), and `/history` (read-only paid
orders). It points at the **hosted** database, not the local stack.

Four rules govern everything under `app/` and they are not stylistic:

- **Numbers are computed in Postgres, never in TypeScript.** The three report pages map
  one-to-one onto the three functions in `0027_laporan_dashboard.sql`, and the XLSX export calls
  the *same* function that filled the screen. Do not write a SQL query inside a route handler,
  and do not re-derive a total in JavaScript — a second calculation path is a second answer.
  If the function's output does not fit what you need, the fix belongs in a migration.
- **Session checks happen inside every route, before data is touched.** `proxy.ts` is the first
  layer, but the one that counts is `jaga()` in `lib/api.ts`, which every route handler is
  wrapped in. No route writes its own check, so a missing guard shows up as a missing wrapper.
  Hiding a button never hid the URL behind it.
- **The service role key must not reach the browser.** No `NEXT_PUBLIC_` prefix, and any module
  that touches it imports `server-only`. Shared types live in `lib/kontrak.ts` precisely so
  client components never have to import a module that sits near the key.
- **Login is Supabase Auth (email + password), not a PIN.** The PIN is a phone affordance; on a
  public URL, six digits is not a secret. See `MIGRATION.md § Dashboard frontend`.

`npm run periksa:laporan <dari> <sampai>` is the gate: it drives the real routes with a signed
session and asserts the three reports and the three XLSX files agree.

Because the web app dropped its own product-picker and payment UI, `lib/product-variants.ts` and
`lib/tax.ts` now exist **only** in `mobile/lib/` — there is no root counterpart to keep in sync
with them anymore. `lib/types.ts` is still duplicated (`lib/types.ts` ↔ `mobile/lib/types.ts`),
because both clients still read the same `orders`/`order_items` shape; **change both together**
if you touch it. Bodies are identical apart from the row type (`Product`/`categoryId` on web,
`ProductRow`/`category_id` on mobile) and import lines.

`tax.ts` (mobile-only now) is the pair most dangerous to get wrong, because the drift is money.
Its rounding must also match Postgres — the `tax_arithmetic` CHECK in `0012_pbjt_skema.sql`
computes the same expression, and the phone computes tax offline before the server ever sees it.
Two engines now, one formula: `(taxable_subtotal * rate_bps + 5000) / 10000`, integer division.
Note the base: since `0019` it is `taxable_subtotal`, not `subtotal` — cigarettes are not an
object of the tax, so a line-level `taxable` flag keeps them out of the base. If they
disagree, paid orders are rejected at sync with `TAX_MISMATCH` and the cashier has no way to
understand why.

## There is no variant table

This surprises everyone, including the shop owner. Hot/cold, the six sauces, and Indomie
toppings are **ordinary product rows** — "Kopi Susu Panas" and "Kopi Susu S" are two products.
Grouping them onto one card is client-side name parsing in `product-variants.ts`; the database
knows nothing about it.

The single rule is: **one product row per thing that can be bought**, and price always comes
from the server (`create_order` reads `p.price`). The client never sends a price. The same rule
now covers tax: `pay_order` reads `outlets.tax_rate_bps` itself and takes no rate parameter. So any feature
that lets the cashier assemble a combination must map that combination to a product row that
exists, or it cannot be priced at all.

Consequence for pricing questions: "add a variant option" is a data change, never a schema
change. If you find yourself designing a variant/modifier table, stop and check
`MIGRATION.md § Indomie toppings` first — the trade-off is written up there, including why
toppings-as-separate-order-lines is a trap (`order_items` has no parent pointer, so with two
bowls in one order you cannot say which bowl a topping belongs to).

**Never narrow the menu before grouping it.** Any search or limit must run on the grouped
cards — `filterProductEntries`, then slice — never on the product list feeding
`groupProductVariants`. Cutting the product list first strands members of a variant family, and
a group left with one option is deliberately rendered as an ordinary card under its full product
name with no variant sheet. That is correct for "Kopi Cendol S" and catastrophic for
"Indomie Goreng Telur". Product codes make it worse: `138` and `139` sort above their siblings
`K130`–`K137`, so a plain `slice(0, 30)` picks exactly the orphans. Category filters are safe —
the group key contains `category_id`. This shipped and reached a device; see
`MIGRATION.md § Filtering before grouping`.

## `orders.total` is the amount charged, not the sum of the items

This changed when PBJT was added (`supabase/migrations/0012_pbjt_skema.sql`) and it is the one
thing most likely to be assumed wrong. Since then:

- `orders.subtotal` — the sum of `order_items.subtotal`. What used to be `total`.
- `orders.total` — **subtotal + tax. What the customer pays.** `payments.amount` matches it.

The `grand_total` alternative was rejected deliberately: twelve places read `total` as "the
money", and under that design every one that was missed would under-report by the tax rate with
no error anywhere. Keeping `total` as the charged amount makes untouched read sites correct by
default. The reasoning is written up in the migration header.

**While an order is `pending`, `total` equals `subtotal`** — the tax status is not chosen until
payment. So the provisional "BELUM LUNAS" receipt prints a pre-tax total and the final receipt is
higher. That is correct, and it looks like a bug if you don't know.

Two invariants hold on every row at every instant, enforced by a CHECK constraint rather than by
convention: `total = subtotal + tax_amount`, and `tax_amount` equals the rate applied to the
subtotal (or zero when exempt). Any writer that sets `total` must set `subtotal` too — that is
why `create_order`, `append_to_order` and `void_order_item` were touched by a tax feature.

Tax is computed **once on the order subtotal, never per line.** Per-line-then-sum gives a
different number.

**Refund is not void, and a paid order is never edited.** Void (`order_item_voids`, status
`void`) cancels before money moves and only works on `pending` orders. Refund (`refunds`,
`refund_items`, `create_refund` in `0016`) returns money that was already taken, and it adds
rows — it never reduces `orders.subtotal`, `tax_amount`, or `total`. Those are what was charged
and what the customer's printed receipt says. Net revenue is `orders.total - sum(refunds.amount)`;
reports do that subtraction, the order row does not. Refunded tax uses the order's **snapshot**
rate, and the refund that exhausts the order returns the _remainder_ of `tax_amount` rather than
the formula result — otherwise splitting a refund can strand a rupiah that can never be returned.
Because `push_order` returns early when `version` does not advance, a refund **must** bump
`orders.version` or it syncs silently as a no-op.

**Test orders are a column, not a naming convention.** `orders.is_test_data` (with a mandatory
`test_mode_reason`) marks an order that must never count as revenue. It replaced a `UJI-` prefix
on `table_code`; do not reintroduce that, and do not add a second definition alongside the column.
Every report function takes `p_include_test boolean default false` and excludes test data unless
asked — that default is what keeps a newly written query correct by accident rather than by
vigilance. The flag is written **only on insert**: `push_order`'s update branch ignores it, the
same as `outlet_id` and `created_by`, because a writable flag would let anything that can sync
erase a real paid order from every report by bumping `version`. Consequence: a mis-flagged order
is fixed by hand on the server, never from the phone. Anything that adds items to an _existing_
order therefore cannot carry test mode — the cashier screen blocks the merge for that reason.

Exempt orders require a reason and record the approving employee. Every cashier may choose it;
the audit trail is the record, not a permission gate. `push_order` verifies the approver is a
real employee at the sender's outlet — identity is the one thing that path does enforce.

## Migrations

Numbered files in `supabase/migrations/`, applied in order, each run once. `supabase/seed.sql`
must always match the end state of all migrations — new installs read the seed, existing
databases read the migrations, and they must agree.

**There are two databases.** The web app points at local Postgres (Supabase CLI stack); the
phone points at the hosted project. A migration must reach both, or a menu appears on one
device and not the other with both looking entirely normal.

```
# local
Get-Content supabase/migrations/00XX_*.sql -Raw | docker exec -i supabase_db_POS_Rusen psql -U postgres -d postgres -v ON_ERROR_STOP=1
# hosted (CLI is linked; check first, it tells you what is missing)
npx supabase migration list
npx supabase db push
```

Write migrations idempotent (`on conflict do nothing`, guarded `update`) and verify by running
twice — the second run must change nothing.

Renaming a product is safe against history: `order_items` snapshots `product_code` and
`product_name` at transaction time, so old receipts and reports keep their original wording.

**Product codes are not a tidy sequence.** They came from a spreadsheet export and are scattered
across `K1xx`, `K2xx`, `R0xx`, and ad-hoc strings. Grepping `K1[0-9]{2}` proves nothing about
`K2xx`; a real collision shipped this way and was caught only by a duplicate count. Prefer
suffixing an existing base code (`K134` → `K134A`) as `0009` and `0010` do.

## Check your work without a device

- `cd mobile && npm run periksa:varian` — runs the grouping over `seed.sql`, no device needed.
  Prints counts and asserts invariants. The temperature-pair count (38) is the regression
  signal for any change to variant parsing. It also asserts that narrowing the menu keeps
  families whole — no card named after a topping variant, and a search that returns the Indomie
  cards with all eight options.
- `cd mobile && npm run preview:struk` — renders the receipt as text and proves every line fits
  in 32 columns.
- `mobile/screens/DebugScreen.tsx` runs the same assertions on the device against the real
  catalog. Its `strip` regex is **deliberately a re-implementation**, not an import — importing
  the real regex would make the check circular and always pass.

Both checkers assert things that fail _silently_ in production: a missing topping combination
only greys out a checkbox, and one mistyped price looks completely ordinary until the report
disagrees with the till.

## Traps that have already cost time

**Never patch source with `node -e` string surgery.** `\b` inside a template literal is a
backspace character, not a word boundary; a NUL once landed where a space was meant. `grep` and
`sed` render both as nothing, so the file looks correct in every terminal reading of it. Use the
editor. If a check fails while its inputs are provably correct, dump the bytes before
re-reading the logic.

**The receipt is 58mm / 32 columns.** Only `mobile/` prints receipts now — the web app has no
receipt UI (it was `components/Receipt.tsx`, built for 80mm, deleted along with the rest of the
web cashier flow). Every column position is computed by hand in `mobile/lib/receipt.ts`.

**Everything on the receipt goes through `ascii()`.** `Intl.NumberFormat` inserts U+00A0 between
"Rp" and the digits; on paper that byte makes the printer eat the following digit. Prices
printed wrong with no error anywhere.

**Printer bytes are packets, and the boundaries mean something.** `buildReceiptPackets` decides
where the Bluetooth layer is allowed to pause. A raster command must be one whole packet: this
printer aborts an incomplete command when the stream stalls, falls back to text mode, and prints
the remaining image bytes as characters (Chinese, in its default code page). Splitting on a
fixed byte count broke exactly this way. The Kotlin module knows nothing about ESC/POS and must
stay that way.

**The printer has no persistent connection.** A fresh RFCOMM socket is opened per print, on
purpose — a socket left open dies silently when the printer is switched off and then swallows
receipts. So there is no "connection" to monitor or reconnect; failures are the adapter being
off, or the printer's radio needing one failed attempt before it wakes. `connectAnyWay` runs its
whole sequence twice for that reason.

**Environment variables do not survive between shells.** Android builds need `JAVA_HOME`
pointing at JDK 17+ (`C:\Program Files\Android\Android Studio\jbr`, which is 21); the system
default here is JRE 8 and Gradle refuses it. `ANDROID_HOME` is handled by
`mobile/android/local.properties`, which is gitignored along with all of `mobile/android`.

**Verify what is actually on the phone, not what you built.** `adb install -r` succeeding does
not prove the running JS is new. Pull the installed APK and grep its bundle for a string you
added and one you removed:

```
adb pull $(adb shell pm path com.rusenkopitiam.pos | tr -d 'package:\r')
unzip -o -q base.apk 'assets/*' && grep -c "<a string you deleted>" assets/index.android.bundle
```

Input injection (`adb shell input tap`) is blocked by MIUI on this device, so the UI cannot be
driven from the host. `adb shell screencap` works and is the only way to see the screen.

### Capture the connected phone screen

`adb` is installed at `C:\Users\user\AppData\Local\Android\Sdk\platform-tools\adb.exe` on
this workstation, but is not on `PATH`. Always use that explicit path unless `adb devices -l`
first proves a different installation is available. Capturing a screenshot is read-only with
respect to the app and is the supported way to inspect the UI; do not try to drive it with
`adb shell input`.

```powershell
$adb = 'C:\Users\user\AppData\Local\Android\Sdk\platform-tools\adb.exe'
& $adb devices -l

$screen = Join-Path $env:TEMP 'pos-rusen-screen.png'
$start = [System.Diagnostics.ProcessStartInfo]::new()
$start.FileName = $adb
$start.Arguments = 'exec-out screencap -p'
$start.UseShellExecute = $false
$start.RedirectStandardOutput = $true
$start.RedirectStandardError = $true
$process = [System.Diagnostics.Process]::new()
$process.StartInfo = $start
[void] $process.Start()
$file = [System.IO.File]::Open($screen, 'Create', 'Write')
$process.StandardOutput.BaseStream.CopyTo($file)
$file.Dispose()
$errorOutput = $process.StandardError.ReadToEnd()
$process.WaitForExit()
if ($process.ExitCode -ne 0) { throw "adb screencap failed: $errorOutput" }
$screen
```

Use the returned PNG path with the local image viewer. Do not pipe native `adb` output through
PowerShell redirection: it can corrupt PNG bytes. Keep screenshots in `%TEMP%`, not in the
repository, and delete them after the inspection if no longer needed.

## Security constraints that are not negotiable

- `service_role` must never ship inside an APK. It is extractable and bypasses RLS.
- Anything not public by design goes through `eas env:create`, never `eas.json`.
- No employee account holds a DELETE grant. This is deliberate.
- `pin_hash` is excluded by column-level grant, because RLS cannot hide a column.

## Working with Heika

Indonesian. Say what is true plainly, including when a previous diagnosis was wrong — two of the
fixes recorded in `MIGRATION.md` came from admitting the first explanation did not survive
contact with paper. State assumptions rather than presenting guesses as findings. Read-only
investigation needs no permission; anything that changes external state (a migration against
production, an install, a push) is confirmed first.

## Command for Push OTA (Over The Air)

cd mobile
npx eas-cli@latest env:list --environment production # everytime there is new variable
npx eas-cli@latest update --branch production --environment production --platform android -m
"messages"
