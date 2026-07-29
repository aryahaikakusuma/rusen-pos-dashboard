# PRODUCT.md — Rusen Kopitiam POS

## Summary

A point-of-sale (POS) application for a single outlet at Rusen Kopitiam (a family-run coffee shop/warung). Core modules: cashier (orders and payments), sales reports, product reports, and employee attendance. Raw material inventory tracking is intentionally out of scope for now and will be built separately later.

## Order Flow (core cashier flow)

This differs from standard POS which charges first then prints a receipt. The flow at Rusen Kopitiam:

1. Cashier enters a table/order code freely (alphanumeric, e.g. A3, B7, or plain numbers like 12). No dropdown — the cashier types manually because format can vary between shifts.
2. Cashier adds items to cart from the product grid (grouped by category in the sidebar).
3. Cashier saves the order — status changes to awaiting payment confirmation. The order is recorded in the system but not yet paid.
4. Customer pays at the table/counter according to the outlet's arrangement.
5. Cashier confirms payment received — status changes to paid.
6. Receipt is printed after the order is paid, not before.

Open question to be decided before further implementation: can a pending order still be edited (add/remove items), or is it locked once saved and revisions must create a new order? This determines whether the orders table needs a lock/versioning column.

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
- Refund after order completion, including partial refunds per item.

### Product Management
- CRUD for products and categories.
- Price per product, active/inactive status.
- No raw material stock tracking (future scope).

### Employee Attendance
- Clock in/out using a unique 6-digit PIN per employee.
- Daily attendance summary per employee (clock-in time, clock-out time, status).

### Reports
- Daily and weekly sales (revenue, transaction count).
- Top-selling products.
- Employee attendance summary.

## Data Schema (ERD)

Core entities and their relationships:

- outlets — one outlet for this version, but outlet_id remains in related tables to ease multi-outlet expansion later.
- employees — has pin_hash (not plaintext PIN), role, active status.
- attendance_logs — clock_in, clock_out, status, linked to employee.
- categories and products — products linked to category and outlet.
- orders — status (pending/paid/void), linked to outlet and employee (who created the order), includes table/order code column.
- order_items — items per order, quantity, unit price, subtotal.
- payments — payment method and amount, linked to order.
- refunds and refund_items — refund linked to order, refund_items allows partial refund per item.

Every order, payment, and refund must record which employee performed it — do not rely on session alone, save employee_id on the record.

## Out of Scope (for now)

- Raw material inventory and recipe costing.
- Active multi-outlet support (schema prepared but not yet fully used).
- Multi-method split payments in a single order (can be added later; payments schema already supports it).
