import { getPaidOrders } from "@/lib/queries";
import { formatRupiah, tableLabel } from "@/lib/types";

const formatDateTime = (iso: string | null) =>
  iso
    ? new Intl.DateTimeFormat("id-ID", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(iso))
    : "-";

// Sesi dijaga `app/history/layout.tsx`; halaman ini murni menampilkan.
export default async function HistoryPage() {
  const orders = await getPaidOrders();

  return (
    <>
      <p className="text-ink-3 mb-4 text-sm">
        100 transaksi lunas terakhir, lengkap dengan rincian itemnya. Untuk
        rekap per periode, gunakan Laporan Penjualan.
      </p>

      <div>
        {orders.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white py-16 text-center text-slate-500">
            Belum ada transaksi lunas.
          </div>
        ) : (
          <div className="space-y-3">
            {/* <details> memberi perilaku buka-tutup tanpa JavaScript sama sekali,
                sehingga halaman ini tetap murni Server Component. */}
            {orders.map((order) => (
              <details
                key={order.id}
                className="rincian overflow-hidden rounded-xl border border-line bg-white"
              >
                <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-slate-50">
                  <div className="min-w-0 flex-1 basis-[50%]">
                    <p className="break-words font-semibold text-ink">
                      Meja/Order: {tableLabel(order.tableCode, order.tableSeq)}
                    </p>
                    <p className="text-sm text-slate-500">
                      {formatDateTime(order.paidAt)} · Kasir: {order.createdByName}
                    </p>
                  </div>
                  <div className="max-w-full text-right tabular-nums">
                    <p className="font-bold text-slate-900">
                      {formatRupiah(order.total)}
                    </p>
                    <p className="text-xs text-slate-500 uppercase">
                      {order.paymentMethod === "cash" ? "Cash" : "Non Cash"}
                    </p>
                  </div>
                </summary>

                <div className="space-y-3 border-t border-slate-200 bg-slate-50 p-5">
                  <div className="space-y-1.5">
                    {order.items.map((item) => (
                      <div key={item.id} className="flex flex-wrap justify-between gap-2 text-sm">
                        <span className="min-w-0 flex-1 break-words text-slate-700">
                          {item.quantity}x {item.productName}
                        </span>
                        <span className="font-semibold text-slate-900">
                          {formatRupiah(item.subtotal)}
                        </span>
                      </div>
                    ))}
                  </div>

                  <dl className="space-y-1.5 border-t border-slate-200 pt-3 text-sm">
                    <Row label="Total Tagihan" value={formatRupiah(order.total)} />
                    <Row
                      label="Metode Pembayaran"
                      value={order.paymentMethod === "cash" ? "Cash" : "Non Cash"}
                    />
                    {order.paymentMethod === "cash" && (
                      <>
                        <Row
                          label="Nominal Diterima"
                          value={formatRupiah(order.amountReceived ?? 0)}
                        />
                        <Row
                          label="Kembalian"
                          value={formatRupiah(order.changeAmount ?? 0)}
                        />
                      </>
                    )}
                    <Row
                      label="Waktu Pelunasan"
                      value={formatDateTime(order.paidAt)}
                    />
                    {order.paidByName && (
                      <Row label="Dilunasi Oleh" value={order.paidByName} />
                    )}
                  </dl>
                </div>
              </details>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-semibold text-slate-900">{value}</dd>
    </div>
  );
}
