import { useCallback, useEffect, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { useSQLiteContext } from "expo-sqlite";

import Button from "../components/Button";
import PaymentSheet from "../components/PaymentSheet";
import StatusBadge from "../components/StatusBadge";
import SyncBadge from "../components/SyncBadge";
import { useToast } from "../components/Toast";
import { translateOrderError } from "../db/errors";
import { listRecentOrders, payOrder } from "../db/orders";
import { countUnsent, pushPending } from "../db/push";
import type { OrderItemRow, OrderRow } from "../db/types";
import { useAuth } from "../lib/auth-context";
import {
  formatRupiah,
  tableLabel,
  type PaymentMethod,
} from "../lib/types";
import {
  colors,
  radius,
  semantic,
  spacing,
  textStyles,
} from "../theme";

type OrderWithItems = OrderRow & { items: OrderItemRow[] };

interface OrdersScreenProps {
  /** Berubah nilainya tiap kali layar kasir menyimpan order. */
  refreshToken: number;
  onEdit: (orderId: string) => void;
}

/**
 * Antrean order dari SQLite lokal.
 *
 * Bentuknya kartu, bukan tabel enam kolom seperti aplikasi web. Tabel itu tidak
 * punya padanan di layar tegak — dipaksakan, kolomnya jadi terlalu sempit untuk
 * dibaca sekilas, padahal justru itu gunanya.
 */
export default function OrdersScreen({
  refreshToken,
  onEdit,
}: OrdersScreenProps) {
  const db = useSQLiteContext();
  const toast = useToast();
  const { session } = useAuth();

  const [orders, setOrders] = useState<OrderWithItems[]>([]);
  const [unsent, setUnsent] = useState(0);
  const [pushing, setPushing] = useState(false);
  const [paying, setPaying] = useState<OrderWithItems | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [payError, setPayError] = useState("");

  const refresh = useCallback(async () => {
    const [rows, pending] = await Promise.all([
      listRecentOrders(db, 30),
      countUnsent(db),
    ]);
    setOrders(rows);
    setUnsent(pending);
  }, [db]);

  useEffect(() => {
    void refresh();
  }, [refresh, refreshToken]);

  /**
   * Dipakai untuk tombol "Kirim ulang" maupun percobaan diam-diam setelah
   * pembayaran. `silent` menentukan apakah hasilnya diberitahukan: percobaan
   * otomatis yang gagal tidak boleh memunculkan pesan error, karena offline
   * memang keadaan yang wajar di sini dan bukan sesuatu yang salah.
   */
  const push = useCallback(
    async (silent: boolean) => {
      setPushing(true);
      try {
        const result = await pushPending(db);
        if (!silent) {
          if (result.sent > 0) {
            toast.success(`${result.sent} order terkirim`);
          } else if (result.failed > 0) {
            toast.error("Belum bisa mengirim. Periksa koneksi, lalu coba lagi.");
          }
        }
      } finally {
        setPushing(false);
        await refresh();
      }
    },
    [db, refresh, toast]
  );

  const handlePay = async (
    method: PaymentMethod,
    amountReceived: number | null
  ) => {
    if (!paying || !session) return;
    setSubmitting(true);
    setPayError("");
    try {
      await payOrder(db, {
        orderId: paying.id,
        method,
        amountReceived,
        employeeId: session.employeeId,
      });
      toast.success(
        `Order ${tableLabel(paying.table_code, paying.table_seq)} lunas`
      );
      setPaying(null);
      await refresh();
      // Percobaan kirim di momen yang pasti terjadi. Kalau ada sinyal, order
      // sampai tanpa kasir perlu memikirkannya; kalau tidak, badge tetap hidup.
      void push(true);
    } catch (caught) {
      const message = translateOrderError(caught);
      setPayError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.screen}>
      <View style={styles.bar}>
        <SyncBadge
          unsent={unsent}
          busy={pushing}
          onPress={() => void push(false)}
        />
      </View>

      <FlatList
        data={orders}
        keyExtractor={(order) => order.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <Text style={styles.empty}>
            Belum ada order. Buka tab Kasir untuk membuat yang pertama.
          </Text>
        }
        renderItem={({ item: order }) => {
          const itemCount = order.items.reduce(
            (sum, item) => sum + item.quantity,
            0
          );

          return (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>
                  {tableLabel(order.table_code, order.table_seq)}
                </Text>
                <Text style={styles.cardTotal}>
                  {formatRupiah(order.total)}
                </Text>
              </View>

              <Text style={styles.cardMeta}>
                {itemCount} item · {shortTime(order.created_at)}
              </Text>

              <View style={styles.cardBadges}>
                <StatusBadge status={order.status} />
                {order.sync_status !== "synced" ? (
                  <Text style={styles.unsent}>Belum terkirim</Text>
                ) : null}
              </View>

              {order.status === "pending" ? (
                <View style={styles.cardActions}>
                  {/* Hanya Pelunasan yang berwarna aksi utama (DESIGN.md) —
                      satu tombol utama per kartu supaya tidak salah tekan. */}
                  <Button
                    label="Ubah"
                    onPress={() => onEdit(order.id)}
                    style={styles.cardAction}
                  />
                  <Button
                    label="Pelunasan"
                    variant="primary"
                    onPress={() => {
                      setPayError("");
                      setPaying(order);
                    }}
                    style={styles.cardAction}
                  />
                </View>
              ) : null}
            </View>
          );
        }}
      />

      {paying ? (
        <PaymentSheet
          order={paying}
          submitting={submitting}
          error={payError}
          onClose={() => setPaying(null)}
          onSubmit={(method, amount) => void handlePay(method, amount)}
        />
      ) : null}
    </View>
  );
}

const shortTime = (iso: string) =>
  new Intl.DateTimeFormat("id-ID", { timeStyle: "short" }).format(
    new Date(iso)
  );

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: semantic.surfaceMuted,
  },
  bar: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
  },
  list: {
    padding: spacing.md,
    gap: spacing.md,
  },
  empty: {
    ...textStyles.body,
    marginTop: spacing["3xl"],
    textAlign: "center",
    color: semantic.textSecondary,
  },
  card: {
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: semantic.border,
    backgroundColor: semantic.surface,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  cardTitle: {
    ...textStyles.sectionTitle,
    color: semantic.textPrimary,
  },
  cardTotal: {
    ...textStyles.price,
    color: semantic.textPrimary,
  },
  cardMeta: {
    ...textStyles.caption,
    color: semantic.textSecondary,
  },
  cardBadges: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  unsent: {
    ...textStyles.statusBadge,
    color: colors.status.pending,
  },
  cardActions: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  cardAction: {
    flex: 1,
  },
});
