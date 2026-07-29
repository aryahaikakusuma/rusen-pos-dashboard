import { type Category } from "@/lib/types";

interface CategorySidebarProps {
  categories: Category[];
  selectedId: string;
  onSelect: (id: string) => void;
}

export default function CategorySidebar({
  categories,
  selectedId,
  onSelect,
}: CategorySidebarProps) {
  return (
    // 23 kategori dengan nama panjang seperti "Kentang / Tela Singkong Goreng":
    // sidebar dilebarkan dan nama dibiarkan membungkus dua baris, karena truncate
    // membuat beberapa kategori terbaca sama persis oleh kasir.
    <aside className="w-44 shrink-0 bg-white border-r border-slate-200 flex flex-col overflow-y-auto">
      <div className="p-3 space-y-2">
        {categories.map((category) => (
          <button
            key={category.id}
            onClick={() => onSelect(category.id)}
            className={`w-full text-left px-3 py-2 text-sm font-semibold leading-snug rounded-lg transition-all ${
              selectedId === category.id
                ? "bg-neutral-700 text-white"
                : "bg-slate-100 text-slate-900 hover:bg-slate-200"
            }`}
          >
            {category.name}
          </button>
        ))}
      </div>
    </aside>
  );
}
