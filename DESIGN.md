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

## Cashier Layout (main screen)

Three columns:

1. Left sidebar (fixed, non-scrolling) — list of product categories. Active category marked with a dark neutral color, not blue.
2. Center column — table/order code input at the top (free-text input, not a dropdown), then product grid below. Each product card displays short code (larger font, so the cashier reads it first), product name, and price.
3. Right panel — running order cart: item name, quantity, optional notes, subtotal per item, grand total below, then action area (Save Order / Confirm Payment / Print Receipt, depending on status).

## Order Status and Action Button Changes

The action area in the right panel changes based on status:

- Cart status (not yet saved): "Save Order" button.
- Awaiting payment status (after saved): "Confirm Payment" button replaces the save button. Display status label "Awaiting Payment Confirmation" in warning color.
- Paid status (after confirmed): "Print Receipt" and "New Order" buttons appear. Status label changes to "Paid" in success color.

Do not display more than one primary action button at once to prevent the cashier from mis-clicking during a rush.

## Product Grid Component

Product card: code (bold, larger than name), product name, price. 3-column grid on standard tablet screens, responsive to different screen widths. Sensitive categories (e.g., cigarettes) may have an additional visual indicator (thin border) as a reminder to verify age — this detail will be discussed further before implementation.

## Target Device

Android tablet (touch screen, landscape orientation per Majoo reference). Interactive elements (product cards, action buttons) must be large enough for finger touch, not high-precision mouse clicks.

## Printed Receipt

Final receipt is printed only after the order is paid. Receipt format follows ESC/POS thermal printer requirements — this layout is defined separately when the print module is implemented, not governed by this web design system.
