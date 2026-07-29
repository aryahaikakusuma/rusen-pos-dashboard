import CashierScreen from "@/components/CashierScreen";
import NavHeader from "@/components/NavHeader";
import { getCategories, getProducts } from "@/lib/queries";
import { requireSession } from "@/lib/session";

export default async function CashierPage() {
  const session = await requireSession();
  const [categories, products] = await Promise.all([
    getCategories(),
    getProducts(),
  ]);

  return (
    <div className="flex h-screen flex-col bg-slate-50">
      <NavHeader employeeName={session.name} role={session.role} />
      <CashierScreen categories={categories} products={products} />
    </div>
  );
}
