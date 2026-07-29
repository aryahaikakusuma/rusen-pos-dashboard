"use client";

import { createPortal } from "react-dom";

import { formatRupiah, tableLabel, type Order } from "@/lib/types";

/**
 * Struk kasir, hanya muncul saat mencetak (aturan @media print di globals.css).
 * Di-portal ke <body> supaya menjadi anak langsung: aturan cetak menyembunyikan
 * seluruh anak <body> lain dengan `display: none`, yang sekaligus mencegah
 * halaman kosong dari layout aplikasi ikut tercetak.
 * Lebar 72mm menyesuaikan printer thermal 80mm yang lazim dipakai warung.
 */
export default function Receipt({ order }: { order: Order }) {
  const waktu = new Date(order.paidAt ?? order.createdAt).toLocaleString("id-ID", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Asia/Jakarta",
  });

  const receipt = (
    <div id="receipt-print" className="hidden font-mono text-[11px] leading-tight">
      <div className="text-center">
        <p className="text-sm font-bold">RUSEN KOPITIAM</p>
        <p>Outlet Utama</p>
      </div>

      <hr className="my-2 border-dashed border-black" />

      <div className="flex justify-between">
        <span>Meja</span>
        <span>{tableLabel(order.tableCode, order.tableSeq)}</span>
      </div>
      <div className="flex justify-between">
        <span>Waktu</span>
        <span>{waktu}</span>
      </div>
      <div className="flex justify-between">
        <span>Kasir</span>
        <span>{order.paidByName ?? order.createdByName}</span>
      </div>

      <hr className="my-2 border-dashed border-black" />

      {order.items.map((item) => (
        <div key={item.id} className="mb-1">
          <p>{item.productName}</p>
          <div className="flex justify-between">
            <span>
              {item.quantity} x {formatRupiah(item.unitPrice)}
            </span>
            <span>{formatRupiah(item.subtotal)}</span>
          </div>
          {item.notes && <p className="italic">Catatan: {item.notes}</p>}
        </div>
      ))}

      <hr className="my-2 border-dashed border-black" />

      <div className="flex justify-between text-sm font-bold">
        <span>TOTAL</span>
        <span>{formatRupiah(order.total)}</span>
      </div>

      {order.status === "paid" ? (
        <>
          <div className="mt-1 flex justify-between">
            <span>Metode</span>
            <span>{order.paymentMethod === "cash" ? "Cash" : "Non Cash"}</span>
          </div>
          {order.paymentMethod === "cash" && (
            <>
              <div className="flex justify-between">
                <span>Tunai</span>
                <span>{formatRupiah(order.amountReceived ?? 0)}</span>
              </div>
              <div className="flex justify-between">
                <span>Kembali</span>
                <span>{formatRupiah(order.changeAmount ?? 0)}</span>
              </div>
            </>
          )}
        </>
      ) : (
        // Order belum lunas: cetakan ini tagihan sementara, bukan bukti bayar.
        <p className="mt-2 text-center font-bold">** BELUM LUNAS **</p>
      )}

      <hr className="my-2 border-dashed border-black" />
      <p className="text-center">Terima kasih atas kunjungan Anda</p>
    </div>
  );

  return createPortal(receipt, document.body);
}
