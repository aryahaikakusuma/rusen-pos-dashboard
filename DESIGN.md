# DESIGN.md — Rusen Kopitiam POS

## Reference

Layout is based on the Majoo application (a common tablet-based POS reference for cashiers in Indonesia), adapted with color choices and payment status flow specific to Rusen Kopitiam.

## Typography

Primary font: Poppins, used throughout the UI (cashier, reports, attendance). No secondary font for receipts — printed receipts use the thermal printer's built-in monospace font, outside the control of web styling.

## Colors

- Primary accent color: blue (not green like Majoo). Used only for primary actions — Pay/Confirm Payment buttons, important status badges.
- Selected category/menu status in the sidebar uses a dark neutral color (not blue), so primary action buttons do not "compete" visually with the selected status.
- Order status uses semantic colors: awaiting payment = warning (yellow/amber), paid = success (dark green/teal), void = neutral/muted red.
- Clean background, white/light neutral, without excessive gradients or shadows. Flat surfaces.

### Dashboard manajer (web) — same primary blue as the cashier app

Until 2026-08-14 the manager dashboard (`/dashboard/*` in the root Next.js app) intentionally used
a separate teal/mint palette instead of the primary blue above. The reasoning at the time: blue was
reserved for the cashier's one primary action button so nothing competed with it during a rush, and
the dashboard has no such button to protect — it's read-heavy screens full of numbers that need
telling apart. That reasoning was sound, but Heika decided the two surfaces should look like one
product rather than two, so the dashboard now points at the same `--color-primary-*` tokens as the
cashier app (`app/globals.css`, `--color-brand` and friends resolve to `--color-primary-600` etc.,
not a separate hex).

**One deliberate exception:** the chart color palette (`WARNA` in `components/dashboard/Grafik.tsx`)
still uses the old teal hex values for `brand`/`brandGaris`/`brandLembut`, unchanged. Those aren't UI
chrome — they're series colors in multi-line/bar charts that also use `WARNA.biru` (the same blue as
the new brand color) as a *different* series in the same chart (e.g. "Penjualan" vs. "Tertagih" in
Laporan Harian). Repointing them to blue would make two distinct data series visually
indistinguishable. If the chart palette is ever revisited, it needs its own set of mutually distinct
colors — simply following the UI chrome's blue will silently break series differentiation.

## Cashier Layout (main screen)

Three columns:

1. Left sidebar (fixed, non-scrolling) — list of product categories. Active category marked with a dark neutral color, not blue.
2. Center column — table/order code input at the top (free-text input, not a dropdown), then product grid below. Each product card displays the product name, the price, and a search field that sweeps codes as well as names.
3. Right panel — running order cart: item name, quantity, optional notes, subtotal per item, grand total below, then action area (Save Order / Confirm Payment / Print Receipt, depending on status).

## Order Status and Action Button Changes

The action area in the right panel changes based on status:

- Cart status (not yet saved): "Save Order" button.
- Awaiting payment status (after saved): "Confirm Payment" button replaces the save button. Display status label "Awaiting Payment Confirmation" in warning color.
- Paid status (after confirmed): "Print Receipt" and "New Order" buttons appear. Status label changes to "Paid" in success color.

Do not display more than one primary action button at once to prevent the cashier from mis-clicking during a rush.

## Product Grid Component

Product card: product name (the largest element), price, and the code only where it earns its space — see "Deviations taken knowingly" below; the original rule put the code first. 3-column grid on standard tablet screens, two columns on a phone, responsive to different screen widths. Sensitive categories (e.g., cigarettes) may have an additional visual indicator (thin border) as a reminder to verify age — this detail will be discussed further before implementation.

## Target Device

Android, touch screen. Interactive elements (product cards, action buttons) must be large enough for finger touch, not high-precision mouse clicks: 48dp minimum, 64dp for the primary action.

**The phone is now the primary device, not the tablet.** The three-column landscape layout above still holds wherever it fits, but it is no longer the only layout, and the mobile app chooses between them by **viewport width, not device type** — a rotated phone earns the wide layout, an upright tablet does not. The threshold lives in one place (`mobile/theme/layout.ts`, read through `lib/use-layout-mode.ts`).

Portrait is not the three-column layout shrunk. At roughly 400dp each column would be about 130dp and the product names stop being readable, so the phone layout stacks instead: table code and search on top, categories as a horizontal chip strip, a two-column product grid filling the rest, and the cart as a bottom bar that opens into a full-height sheet. The cart is a sheet rather than a permanent panel because a permanent one leaves the grid two rows tall.

A second threshold governs how loose the chrome is, separately from how many columns there are. A phone held sideways is wide enough for three columns and simultaneously only 375dp tall, and one number cannot answer both questions.

Controls do not move between orientations. Someone who has memorised where a button lives is worse served by it relocating than by a slightly taller portrait screen.

### Deviations taken knowingly

- **The product code is no longer larger than the name**, on either client. The code is now search-only; the name is what the cashier reads on the card. Searching by code always resolves to a single product, so it bypasses the variant sheet entirely.
- **Hot/cold, sauce, and topping variants share one card** rather than one card each — the merge is client-side name parsing, and the card opens a sheet to pick. See `AGENTS.md`.

## Printed Receipt

Final receipt is printed only after the order is paid, and only `mobile/` prints it now — the web
app is a dashboard/report shell with no receipt UI. The layout is not governed by this design
system — it is ESC/POS on 58mm paper, 32 columns, every position computed by hand in
`mobile/lib/receipt.ts`.
