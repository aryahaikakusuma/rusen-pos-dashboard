/** Disalin dari lib/types.ts aplikasi web supaya kedua klien bicara istilah yang sama. */

export const PIN_LENGTH = 6;

export type EmployeeRole = "cashier" | "manager" | "owner";

/** Status order di database. Perhatikan: TIDAK ada "cart" di sini. */
export type OrderStatus = "pending" | "paid" | "void";

export type PaymentMethod = "cash" | "non_cash";

export interface Employee {
  id: string;
  name: string;
  role: EmployeeRole;
}

/**
 * Bentuknya mengikuti `Session` di lib/session-token.ts milik web, ditambah
 * token dan waktu kedaluwarsanya — di web keduanya tersembunyi di dalam cookie
 * httpOnly, di sini aplikasi harus memegangnya sendiri.
 */
export interface Session {
  employeeId: string;
  name: string;
  role: EmployeeRole;
  token: string;
  /** Detik epoch, sama dengan klaim `exp` pada token. */
  expiresAt: number;
}
