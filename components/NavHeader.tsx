"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { logout } from "@/app/login/actions";
import type { EmployeeRole } from "@/lib/types";

interface NavHeaderProps {
  employeeName: string;
  role: EmployeeRole;
}

const NAV_ITEMS = [
  { href: "/cashier", label: "Kasir" },
  { href: "/orders", label: "Daftar Order" },
  { href: "/history", label: "Histori Transaksi" },
  { href: "/dashboard", label: "Dashboard", managerOnly: true },
];

export default function NavHeader({ employeeName, role }: NavHeaderProps) {
  const pathname = usePathname();
  const isManager = role === "manager" || role === "owner";

  return (
    <header className="flex items-center justify-between gap-6 border-b border-primary-700 bg-primary-600 px-6 py-3">
      <div className="flex items-center gap-8">
        <div>
          <h1 className="text-2xl leading-tight font-bold text-white">
            Rusen Kopitiam
          </h1>
          <p className="text-sm text-white/70">{employeeName}</p>
        </div>

        <nav className="flex gap-1">
          {NAV_ITEMS.filter((item) => !item.managerOnly || isManager).map((item) => {
            const active =
              pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex min-h-[2.75rem] items-center rounded-lg px-4 text-sm font-semibold transition-colors ${
                  active
                    ? "bg-white text-primary-600"
                    : "text-white hover:bg-white/10"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>

      <form action={logout}>
        <button
          type="submit"
          className="flex min-h-[2.75rem] cursor-pointer items-center justify-center rounded-lg bg-white px-4 text-sm font-medium text-primary-600 transition-colors hover:bg-slate-100"
        >
          Logout
        </button>
      </form>
    </header>
  );
}
