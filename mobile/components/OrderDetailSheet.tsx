import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSQLiteContext } from "expo-sqlite";

import { listRefunds } from "../db/orders";
import type {
  OrderItemRow,
  OrderRow,
  RefundItemRow,
  RefundRow,
} from "../db/types";
import { labelPbjt } from "../lib/tax";
import { formatRupiah, tableLabel } from "../lib/types";
import { colors, semantic, spacing, textStyles } from "../theme";
import Sheet from "./Sheet";
import StatusBadge, { type RefundState } from "./StatusBadge";

interface OrderDetailSheetProps {
  order: OrderRow & { items: OrderItemRow[] };
  onClose: () => void;
}

const jam = (iso: string) =>
  new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));

/**
 * Rincian order yang sudah selesai. Hanya baca — order lunas dan void tidak
 * bisa diubah lagi, jadi lembar ini tidak punya satu pun tombol yang menulis.
 *
 * Susunannya mengikuti struk (lib/receipt.ts): nama, banyak x harga, subtotal
 * di kanan, lalu total. Kasir sudah hafal bentuk itu dari kertas, dan layar
 * yang menyusunnya berbeda memaksa membaca dua kali untuk mencocokkan.
 *
 * Yang sengaja TIDAK ada: nama kasir. Perangkat tidak menyimpan tabel employees
 * — pin_hash tidak boleh turun ke sini — jadi datanya memang tidak ada.
 */
export default function OrderDetailSheet({
  order,
  onClose,
}: OrderDetailSheetProps) {
  const db = useSQLiteContext();
  const selesai = order.paid_at ?? order.voided_at ?? order.created_at;

  // Refund dimuat di sini, bukan diterima sebagai prop: lembar ini dibuka
  // langsung dari baris daftar yang sudah ada di memori, dan menambah satu
  // pemuatan async di jalur itu berarti ketukan kasir tidak lagi langsung
  // membuka apa pun.
  const [refunds, setRefunds] = useState<
    Array<RefundRow & { items: RefundItemRow[] }>
  >([]);

  useEffect(() => {
    let batal = false;
    void listRefunds(db, order.id).then((rows) => {
      if (!batal) setRefunds(rows);
    });
    return () => {
      batal = true;
    };
  }, [db, order.id]);

  const refundTotal = refunds.reduce((sum, refund) => sum + refund.amount, 0);

  // Diturunkan dengan aturan yang sama persis dengan kartu di layar Order.
  // Kalau berbeda, kartu bertuliskan "Refund Penuh" akan membuka lembar
  // bertuliskan "Lunas" — dua layar yang tidak sepakat tentang satu order.
  const refundState: RefundState | undefined =
    refundTotal === 0
      ? undefined
      : refundTotal >= order.total
        ? "full"
        : "partial";

  return (
    <Sheet
      title={tableLabel(order.table_code, order.table_seq)}
      subtitle={jam(selesai)}
      onClose={onClose}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.badges}>
          <StatusBadge status={order.status} refund={refundState} />
          {order.sync_status !== "synced" ? (
            <Text style={styles.unsent}>Belum terkirim</Text>
          ) : null}
        </View>

        {order.items.map((item) => (
          <View key={item.id} style={styles.item}>
            <Text style={styles.itemName}>{item.product_name}</Text>
            {item.notes ? (
              <Text style={styles.itemNote}>{item.notes}</Text>
            ) : null}
            <View style={styles.itemLine}>
              <Text style={styles.itemMeta}>
                {item.quantity} x {formatRupiah(item.unit_price)}
              </Text>
              <Text style={styles.itemSubtotal}>
                {formatRupiah(item.subtotal)}
              </Text>
            </View>
          </View>
        ))}

        {/* Order void yang seluruh itemnya dibatalkan tidak menyisakan satu
            baris pun. Tanpa kalimat ini lembarnya tampak gagal memuat. */}
        {order.items.length === 0 ? (
          <Text style={styles.kosong}>
            Tidak ada item tersisa — semuanya dibatalkan.
          </Text>
        ) : null}

        <View style={styles.divider} />

        {/* Mengikuti struk: rincian pajak hanya muncul kalau memang dipungut.
            Bedanya dengan kertas, lembar ini juga menampilkan keterangan
            pembebasan di bawah — kertas sengaja tidak, layar justru harus,
            karena di sinilah pertanyaan "kenapa ini tidak kena pajak"
            dijawab. */}
        {order.tax_status === "taxable" && order.tax_amount > 0 ? (
          <>
            <View style={styles.row}>
              <Text style={styles.metaLabel}>Subtotal</Text>
              <Text style={styles.metaValue}>{formatRupiah(order.subtotal)}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.metaLabel}>{labelPbjt(order.tax_rate_bps)}</Text>
              <Text style={styles.metaValue}>{formatRupiah(order.tax_amount)}</Text>
            </View>
          </>
        ) : null}

        <View style={styles.row}>
          <Text style={styles.totalLabel}>TOTAL</Text>
          <Text style={styles.totalValue}>{formatRupiah(order.total)}</Text>
        </View>

        {order.tax_status === "exempt" && order.tax_exempt_reason ? (
          <View style={styles.row}>
            <Text style={styles.metaLabel}>Bebas pajak</Text>
            <Text style={styles.metaValue}>{order.tax_exempt_reason}</Text>
          </View>
        ) : null}

        {order.status === "paid" ? (
          <>
            <View style={styles.row}>
              <Text style={styles.metaLabel}>Metode</Text>
              <Text style={styles.metaValue}>
                {order.payment_method === "cash" ? "Cash" : "Non Cash"}
              </Text>
            </View>
            {order.payment_method === "cash" ? (
              <>
                <View style={styles.row}>
                  <Text style={styles.metaLabel}>Tunai</Text>
                  <Text style={styles.metaValue}>
                    {formatRupiah(order.amount_received ?? 0)}
                  </Text>
                </View>
                <View style={styles.row}>
                  <Text style={styles.metaLabel}>Kembali</Text>
                  <Text style={styles.metaValue}>
                    {formatRupiah(order.change_amount ?? 0)}
                  </Text>
                </View>
              </>
            ) : null}
          </>
        ) : null}

        {order.void_reason ? (
          <Text style={styles.alasan}>Alasan batal: {order.void_reason}</Text>
        ) : null}

        {/* Refund. Angka order di atas sengaja TIDAK dikurangi — itu yang
            benar-benar ditagihkan dan yang tercetak di struk pelanggan. Yang
            ditampilkan di sini adalah uang yang keluar sesudahnya, beserta
            berapa yang akhirnya benar-benar tinggal di toko. */}
        {refunds.length > 0 ? (
          <View style={styles.refundBlock}>
            <Text style={styles.refundTitle}>Refund</Text>
            {refunds.map((refund) => (
              <View key={refund.id} style={styles.refund}>
                <View style={styles.row}>
                  <Text style={styles.metaLabel}>{jam(refund.created_at)}</Text>
                  <Text style={styles.metaValue}>
                    − {formatRupiah(refund.amount)}
                  </Text>
                </View>
                <Text style={styles.refundItems}>
                  {refund.items
                    .map((item) => `${item.quantity}x ${item.product_name}`)
                    .join(", ")}
                </Text>
                {refund.tax_amount > 0 ? (
                  <Text style={styles.refundItems}>
                    Termasuk {labelPbjt(order.tax_rate_bps)}{" "}
                    {formatRupiah(refund.tax_amount)}
                  </Text>
                ) : null}
                {refund.reason ? (
                  <Text style={styles.refundItems}>Alasan: {refund.reason}</Text>
                ) : null}
              </View>
            ))}
            <View style={styles.row}>
              <Text style={styles.metaLabel}>Diterima bersih</Text>
              <Text style={styles.metaValue}>
                {formatRupiah(order.total - refundTotal)}
              </Text>
            </View>
          </View>
        ) : null}
      </ScrollView>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.lg,
    gap: spacing.sm,
  },
  badges: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  unsent: {
    ...textStyles.caption,
    color: colors.status.pending,
  },
  refundBlock: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: semantic.border,
    gap: spacing.xs,
  },
  refundTitle: {
    ...textStyles.bodyStrong,
    color: semantic.textPrimary,
  },
  refund: {
    paddingVertical: spacing.xs,
  },
  refundItems: {
    ...textStyles.caption,
    color: semantic.textSecondary,
  },
  item: {
    paddingVertical: spacing.xs,
  },
  itemName: {
    ...textStyles.bodyStrong,
    color: semantic.textPrimary,
  },
  itemNote: {
    ...textStyles.caption,
    color: semantic.textSecondary,
  },
  itemLine: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  itemMeta: {
    ...textStyles.caption,
    color: semantic.textSecondary,
  },
  itemSubtotal: {
    ...textStyles.body,
    color: semantic.textPrimary,
  },
  kosong: {
    ...textStyles.body,
    color: semantic.textSecondary,
  },
  divider: {
    height: 1,
    marginVertical: spacing.sm,
    backgroundColor: semantic.border,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  totalLabel: {
    ...textStyles.sectionTitle,
    color: semantic.textPrimary,
  },
  totalValue: {
    ...textStyles.sectionTitle,
    color: semantic.textPrimary,
  },
  metaLabel: {
    ...textStyles.body,
    color: semantic.textSecondary,
  },
  metaValue: {
    ...textStyles.body,
    color: semantic.textPrimary,
  },
  alasan: {
    ...textStyles.body,
    marginTop: spacing.sm,
    color: colors.status.void,
  },
});
