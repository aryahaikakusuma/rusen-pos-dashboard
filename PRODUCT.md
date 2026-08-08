# PRODUCT.md — Rusen Kopitiam POS

## Summary

A point-of-sale (POS) application for a single outlet at Rusen Kopitiam (a family-run coffee shop/warung). Core modules: cashier (orders and payments), sales reports, product reports, and employee attendance. Raw material inventory tracking is intentionally out of scope for now and will be built separately later.

**Two clients, one product.** The Next.js app at the repo root and the Expo app in `mobile/` implement the same domain against the same schema. The mobile build is where the outlet is heading — it is the only one that can drive the thermal printer and the only one that keeps working with no signal. The cashier flow exists in both. Reports and attendance exist in neither yet — the aggregate RPCs are in `0002_reports.sql` and `attendance_logs` is in the schema, but no screen anywhere reads either. `MIGRATION.md` tracks what is built where; this file describes the product, not its progress.

## Order Flow (core cashier flow)

This differs from standard POS which charges first then prints a receipt. The flow at Rusen Kopitiam:

1. Cashier enters a table/order code freely (alphanumeric, e.g. A3, B7, or plain numbers like 12). No dropdown — the cashier types manually because format can vary between shifts.
2. Cashier adds items to cart from the product grid (grouped by category in the sidebar).
3. Cashier saves the order — status changes to awaiting payment confirmation. The order is recorded in the system but not yet paid.
4. Customer pays at the table/counter according to the outlet's arrangement.
5. Cashier chooses the tax status — **Kena Pajak** (default) or **Bebas Pajak** — and confirms payment received. Status changes to paid.
6. Receipt is printed after the order is paid, not before.

### PBJT (regional tax on food and drink)

PBJT is **exclusive**: it is added on top of the menu price, so a taxable customer pays subtotal + tax. Some customers — a subscribing government office is the case that prompted this — are exempt by regulation and pay the subtotal alone.

- The rate lives in `outlets.tax_rate_bps`, in basis points. Changing it is one `UPDATE`, no deploy. Currently 10%.
- Tax is computed once on the order subtotal, never per line, and always by the server or by the device's copy of the identical formula — never sent by the screen.
- **Bebas Pajak requires a written reason** (the institution's name, typically) and records the employee who approved it. Any cashier may choose it; the control is the audit trail, not a permission gate. It cannot be selected with the reason left blank — the database refuses the row, not just the form.
- The tax rate in force is snapshotted onto each order, including exempt ones, so a later change to the regional rate cannot rewrite past reports.
- Taxable receipts print Subtotal / PBJT / TOTAL. **Exempt receipts print nothing about tax at all** — the exemption is recorded in the system, not announced on the customer's paper.

### Refund

A paid order is immutable, so a correction is a refund, never an edit. The cashier opens a paid
order in Histori and presses **Refund**, picks the items and quantities, and confirms.

- Any cashier may do it; the employee is recorded. A reason is optional — unlike the tax-exemption
  note, which is mandatory.
- PBJT is returned in proportion, at the rate the order was charged at. An exempt order returns no
  tax.
- Refunds may be partial and may be repeated until the order is fully returned.
- **The order's own figures never change.** What was charged stays what was charged, matching the
  receipt the customer holds. Reports subtract refunds to show net revenue and net tax.
- No refund receipt is printed; the record lives in the system.
- The history list distinguishes three states on the card itself — **Lunas**, **Refund Sebagian**,
  **Refund Penuh** — and shows the charged amount struck through beside the net amount. The order's
  status underneath stays `paid`; the three states are derived from the refund rows.

**Decided:** a pending order can still be edited. Items may be added or voided until it is paid; after that it is immutable, and a correction is a refund rather than an edit. `orders.version` carries this — every local write bumps it, and it is also what lets the server tell a replayed push from a real update.

Editing lives in `EditOrderScreen` on mobile — the web app no longer has a cashier flow, so it
never edits a pending order. Mobile re-reads the order after every write, because the operation
moves the version underneath it.

## Roles

- Cashier: access to cashier screen and clock in/out. Cannot view full sales reports.
- Owner/manager: full access including sales reports, product reports, and employee attendance summaries.

## Modules and Features

### Cashier
- Product grid per category, with short code + name + price per item.
- Free-text table/order code input.
- Shopping cart with quantity, optional notes per item (e.g., "egg half-cooked").
- Save order (status: awaiting payment).
- Confirm payment (status: paid).
- Print receipt (only after paid).
- Void order before payment.
- Refund after order completion, including partial refunds per item. Built on mobile only so far.

### Product Management
- CRUD for products and categories.
- Price per product, active/inactive status.
- No raw material stock tracking (future scope).

### Employee Attendance
- Clock in/out using a unique 6-digit PIN per employee.
- Daily attendance summary per employee (clock-in time, clock-out time, status).

### Reports
- Daily and weekly sales (revenue, transaction count). Revenue means **before tax**; PBJT collected and total charged are reported separately.
- Taxable versus tax-exempt revenue, PBJT collected, and PBJT forgone — per period and per day, and a line-by-line list of exempt transactions with their reason and approver. The aggregate SQL exists (`get_pbjt_summary`, `get_pbjt_harian`, `get_pbjt_exempt_report`); no screen reads it yet.
- Top-selling products.
- Employee attendance summary.

## Data Schema (ERD)

Core entities and their relationships:

- outlets — one outlet for this version, but outlet_id remains in related tables to ease multi-outlet expansion later.
- employees — has pin_hash (not plaintext PIN), role, active status.
- attendance_logs — clock_in, clock_out, status, linked to employee.
- categories and products — products linked to category and outlet.
- outlets — includes `tax_rate_bps`, the single source of the PBJT rate.
- orders — status (pending/paid/void), linked to outlet and employee (who created the order), includes table/order code column. Money is split three ways: `subtotal` (sum of items), `tax_amount`, and `total` (**what the customer is charged** — subtotal + tax). Tax columns: `tax_status`, `tax_rate_bps` (snapshot), `tax_exempt_reason`, `tax_approved_by`.
- order_items — items per order, quantity, unit price, subtotal.
- payments — payment method and amount, linked to order.
- refunds and refund_items — refund linked to order, refund_items allows partial refund per item.

Every order, payment, and refund must record which employee performed it — do not rely on session alone, save employee_id on the record.

## Out of Scope (for now)

- Raw material inventory and recipe costing.
- Active multi-outlet support (schema prepared but not yet fully used).
- Multi-method split payments in a single order (can be added later; payments schema already supports it).
