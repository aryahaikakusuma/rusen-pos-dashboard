import { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useSQLiteContext } from "expo-sqlite";

import Button from "../components/Button";
import MenuButton from "../components/MenuButton";
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
  touchTarget,
} from "../theme";

type OrderWithItems = OrderRow & { items: OrderItemRow[] };

/**
 * "Daftar" adalah pekerjaan yang belum selesai, "Histori" yang sudah lewat.
 * Pembagiannya menurut status, bukan menurut waktu: order pending yang dibuat
 * pagi tetap pekerjaan hari ini sampai dibayar.
 */
type OrderView = "daftar" | "histori";

interface OrdersScreenProps {
  /** Berubah nilainya tiap kali layar kasir menyimpan order. */
  refreshToken: number;
  onEdit: (orderId: string) => void;
  /** Membuka lembar menu milik AppShell — nama kasir, Katalog/Uji, Keluar. */
  onOpenMenu: () => void;
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
  onOpenMenu,
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
  const [view, setView] = useState<OrderView>("daftar");

  const daftar = useMemo(
    () => orders.filter((order) => order.status === "pending"),
    [orders]
  );
  const histori = useMemo(
    () => orders.filter((order) => order.status !== "pending"),
    [orders]
  );
  const visible = view === "daftar" ? daftar : histori;

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
        <MenuButton onPress={onOpenMenu} />
        <SyncBadge
          unsent={unsent}
          busy={pushing}
          onPress={() => void push(false)}
        />
      </View>

      <View style={styles.segments}>
        <Segment
          label="Daftar"
          count={daftar.length}
          active={view === "daftar"}
          onPress={() => setView("daftar")}
        />
        <Segment
          label="Histori"
          count={histori.length}
          active={view === "histori"}
          onPress={() => setView("histori")}
        />
      </View>

      <FlatList
        data={visible}
        keyExtractor={(order) => order.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <Text style={styles.empty}>
            {view === "daftar"
              ? "Tidak ada order yang menunggu pelunasan."
              : "Belum ada order yang selesai."}
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

/**
 * Jumlahnya ikut ditampilkan karena "berapa meja yang masih menunggu" adalah
 * pertanyaan yang dijawab sekilas, tanpa perlu membuka tabnya dan menghitung.
 */
function Segment({
  label,
  count,
  active,
  onPress,
}: {
  label: string;
  count: number;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={`${label}, ${count} order`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.segment,
        active && styles.segmentActive,
        pressed && !active && styles.segmentPressed,
      ]}>
      <Text style={[styles.segmentLabel, active && styles.segmentLabelActive]}>
        {label} ({count})
      </Text>
    </Pressable>
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
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  segments: {
    flexDirection: "row",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
  },
  segment: {
    flex: 1,
    minHeight: touchTarget.min,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: semantic.border,
    backgroundColor: semantic.surface,
  },
  // Neutral gelap, bukan biru: biru disimpan untuk satu tombol aksi utama
  // (DESIGN.md), dan segmen terpilih bukan tombol yang harus ditekan.
  segmentActive: {
    backgroundColor: semantic.sidebarActive,
    borderColor: semantic.sidebarActive,
  },
  segmentPressed: {
    backgroundColor: semantic.surfaceMuted,
  },
  segmentLabel: {
    ...textStyles.bodyStrong,
    color: semantic.textSecondary,
  },
  segmentLabelActive: {
    color: semantic.sidebarActiveText,
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
