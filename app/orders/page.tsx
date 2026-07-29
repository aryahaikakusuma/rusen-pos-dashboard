import NavHeader from "@/components/NavHeader";
import OrdersTable from "@/components/OrdersTable";
import { getCategories, getOrderQueue, getProducts } from "@/lib/queries";
import { requireSession } from "@/lib/session";

export default async function OrdersPage() {
  const session = await requireSession();
  const [orders, categories, products] = await Promise.all([
    getOrderQueue(),
    getCategories(),
    getProducts(),
  ]);

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <NavHeader employeeName={session.name} role={session.role} />

      <div className="flex-1 overflow-y-auto p-6">
        <h2 className="mb-4 text-xl font-bold text-slate-900">Daftar Order</h2>
        <OrdersTable orders={orders} categories={categories} products={products} />
      </div>
    </div>
  );
}
