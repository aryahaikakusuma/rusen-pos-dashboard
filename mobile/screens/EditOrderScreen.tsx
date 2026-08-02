import { useCallback, useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";

import Button from "../components/Button";
import Sheet from "../components/Sheet";
import ShiftBanner from "../components/ShiftBanner";
import StatusBadge from "../components/StatusBadge";
import { useToast } from "../components/Toast";
import { translateOrderError } from "../db/errors";
import {
  changeTableCode,
  getOrder,
  voidAllOrderItems,
  voidOrderItem,
} from "../db/orders";
import type { OrderItemRow, OrderRow } from "../db/types";
import { useAuth } from "../lib/auth-context";
import { useGateShift, useShift } from "../lib/shift-context";
import { formatRupiah, tableLabel } from "../lib/types";
import {
  colors,
  radius,
  semantic,
  spacing,
  textStyles,
  touchTarget,
} from "../theme";

interface EditOrderScreenProps {
  orderId: string;
  onClose: () => void;
}

/**
 * Menambah dan membatalkan item pada order yang sudah tersimpan.
 *
 * Order dibaca ulang setelah setiap tulisan, bukan disunting di memori.
 * appendToOrder dan voidOrderItem sama-sama memakai `expectedVersion`, dan
 * keduanya menaikkan version — memakai salinan lama pada aksi berikutnya
 * langsung berujung STALE_ORDER. Membaca ulang lebih murah daripada mengarang
 * aturan sendiri tentang kapan version naik.
 */
export default function EditOrderScreen({
  orderId,
  onClose,
}: EditOrderScreenProps) {
  const db = useSQLiteContext();
  const toast = useToast();
  const { session } = useAuth();
  const { aktif: shiftAktif } = useShift();
  const gateShift = useGateShift();
  const router = useRouter();

  const [order, setOrder] = useState<(OrderRow & { items: OrderItemRow[] }) | null>(
    null
  );
  const [busy, setBusy] = useState(false);
  const [voiding, setVoiding] = useState<OrderItemRow | null>(null);
  const [voidQty, setVoidQty] = useState("");
  const [voidReason, setVoidReason] = useState("");
  const [changingTable, setChangingTable] = useState(false);
  const [newTableCode, setNewTableCode] = useState("");
  const [clearing, setClearing] = useState(false);
  const [clearReason, setClearReason] = useState("");

  const reload = useCallback(async () => {
    setOrder(await getOrder(db, orderId));
  }, [db, orderId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // Halaman Tambah item menulis ke order yang sama lewat rute sebelah, dan
  // layar ini tetap terpasang di bawahnya — jadi tanpa ini, kembali dari sana
  // menunjukkan daftar item dan total yang basi.
  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload])
  );

  const run = useCallback(
    async (label: string, action: () => Promise<unknown>) => {
      setBusy(true);
      try {
        await action();
        toast.success(label);
      } catch (caught) {
        toast.error(translateOrderError(caught));
      } finally {
        await reload();
        setBusy(false);
      }
    },
    [toast, reload]
  );

  const handleVoid = () => {
    if (!gateShift("membatalkan item")) return;
    if (!order || !voiding || !session) return;
    const quantity = Number(voidQty);
    const item = voiding;
    setVoiding(null);
    void run("Item dibatalkan", () =>
      voidOrderItem(db, {
        orderId,
        itemId: item.id,
        quantity,
        employeeId: session.employeeId,
        reason: voidReason,
        expectedVersion: order.version,
      })
    );
  };

  const handleClearAll = () => {
    if (!gateShift("membatalkan item")) return;
    if (!order || !session) return;
    setClearing(false);
    void run("Semua item dibatalkan", () =>
      voidAllOrderItems(db, {
        orderId,
        employeeId: session.employeeId,
        reason: clearReason,
        expectedVersion: order.version,
      })
    );
  };

  const openChangeTable = () => {
    setNewTableCode(order?.table_code ?? "");
    setChangingTable(true);
  };

  const handleChangeTable = async () => {
    if (!gateShift("memindah meja")) return;
    if (!order) return;
    setBusy(true);
    try {
      await changeTableCode(db, {
        orderId,
        tableCode: newTableCode,
        expectedVersion: order.version,
      });
      const refreshed = await getOrder(db, orderId);
      setOrder(refreshed);
      setChangingTable(false);
      if (refreshed) {
        toast.success(
          `Order ${tableLabel(order.table_code, order.table_seq)} dipindah ke ${tableLabel(refreshed.table_code, refreshed.table_seq)}`
        );
      }
    } catch (caught) {
      toast.error(translateOrderError(caught));
    } finally {
      setBusy(false);
    }
  };

  if (!order) {
    return (
      <View style={styles.screen}>
        <Text style={styles.empty}>Order tidak ditemukan.</Text>
        <Button label="Kembali" onPress={onClose} />
      </View>
    );
  }

  // Sif ikut jadi syarat, bukan hanya status order: menambah atau membatalkan
  // item mengubah angka yang dijendela laporan Tutup Kasir.
  const editable = order.status === "pending" && shiftAktif;

  return (
    <View style={styles.screen}>
      {!shiftAktif ? <ShiftBanner /> : null}
      <View style={styles.header}>
        <View style={styles.headerStatus}>
          <StatusBadge status={order.status} />
        </View>
        <View style={styles.headerRow}>
          <View style={styles.headerText}>
            <Text style={styles.title}>
              {tableLabel(order.table_code, order.table_seq)}
            </Text>
          </View>
          <View style={styles.headerActions}>
            {/* Ikon saja, karena tiga tombol berlabel penuh tidak muat di baris
                ini. Yang merah hanya glifnya; variannya tetap "secondary"
                supaya latar tombol tetap polos. Tong sampah merah menandai
                aksinya merusak, tanpa memberi tombol ini bobot visual "danger"
                penuh — di header, kotak merah pekat menonjol persis seperti
                tombol yang memang dituju kasir, padahal ini justru yang paling
                tidak boleh tertekan tanpa sengaja. Peringatannya ada di
                konfirmasi. */}
            {editable && order.items.length > 0 ? (
              <Button
                label="🗑️"
                accessibilityLabel="Bersihkan semua item"
                disabled={busy}
                onPress={() => {
                  setClearReason("");
                  setClearing(true);
                }}
                style={styles.iconButton}
                labelStyle={styles.iconLabel}
              />
            ) : null}
            {editable ? (
              <Button
                label="Ganti Meja"
                disabled={busy}
                onPress={openChangeTable}
                style={styles.headerButton}
              />
            ) : null}
            <Button label="Kembali" onPress={onClose} style={styles.headerButton} />
          </View>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.list}>
        {order.items.map((item) => (
          <View key={item.id} style={styles.item}>
            <View style={styles.itemHeader}>
              <Text style={styles.itemName}>
                {item.product_code} · {item.product_name}
              </Text>
              <Text style={styles.itemSubtotal}>
                {formatRupiah(item.subtotal)}
              </Text>
            </View>
            <Text style={styles.itemMeta}>
              {item.quantity} × {formatRupiah(item.unit_price)}
              {item.notes ? ` · ${item.notes}` : ""}
            </Text>
            {editable ? (
              <Button
                label="Batalkan item"
                variant="danger"
                disabled={busy}
                style={styles.itemAction}
                onPress={() => {
                  setVoiding(item);
                  setVoidQty(String(item.quantity));
                  setVoidReason("");
                }}
              />
            ) : null}
          </View>
        ))}

        {order.items.length === 0 ? (
          <Text style={styles.empty}>Order ini sudah tidak punya item.</Text>
        ) : null}
      </ScrollView>

      <View style={styles.footer}>
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.total}>{formatRupiah(order.total)}</Text>
        </View>
        {editable ? (
          <Button
            label="Tambah item"
            variant="primary"
            disabled={busy}
            onPress={() =>
              router.push({
                pathname: "/edit-order/add",
                params: { orderId },
              })
            }
          />
        ) : (
          <Text style={styles.locked}>
            {!shiftAktif && order.status === "pending"
              ? "Mulai sif dulu sebelum mengubah order."
              : "Order yang sudah lunas atau dibatalkan tidak bisa diubah."}
          </Text>
        )}
      </View>

      {changingTable ? (
        <Sheet
          title="Ganti Meja"
          subtitle={tableLabel(order.table_code, order.table_seq)}
          anchor="top"
          onClose={() => setChangingTable(false)}
          footer={
            <Button
              label="Simpan"
              loading={busy}
              onPress={() => void handleChangeTable()}
            />
          }>
          <View style={styles.tableForm}>
            <View style={styles.tableKindRow}>
              <Button
                label="Meja"
                onPress={() => {
                  if (newTableCode === "Takeaway") setNewTableCode("");
                }}
                style={[
                  styles.kindButton,
                  newTableCode !== "Takeaway" && styles.kindButtonSelected,
                ]}
              />
              <Button
                label="Takeaway"
                onPress={() => setNewTableCode("Takeaway")}
                style={[
                  styles.kindButton,
                  newTableCode === "Takeaway" && styles.kindButtonSelected,
                ]}
              />
            </View>
            <TextInput
              value={newTableCode}
              onChangeText={(text) => setNewTableCode(text.toUpperCase())}
              autoCapitalize="characters"
              autoFocus
              editable={!busy && newTableCode !== "Takeaway"}
              placeholder="Kode meja"
              placeholderTextColor={semantic.textSecondary}
              style={[styles.input, newTableCode === "Takeaway" && styles.disabledInput]}
            />
          </View>
        </Sheet>
      ) : null}

      {/* Menyebut angka, bukan bertanya "yakin?" — pertanyaan tanpa angka cuma
          menghasilkan satu ketukan refleks. Sama seperti ClearHistoryDialog. */}
      {clearing ? (
        <Sheet
          title="Bersihkan semua item"
          subtitle={tableLabel(order.table_code, order.table_seq)}
          onClose={() => setClearing(false)}
          footer={
            <>
              <Button
                label={`Batalkan ${order.items.length} item`}
                variant="danger"
                disabled={busy}
                onPress={handleClearAll}
              />
              <Button
                label="Jangan jadi"
                disabled={busy}
                onPress={() => setClearing(false)}
              />
            </>
          }>
          <View style={styles.voidForm}>
            <Text style={styles.body}>
              Seluruh {order.items.length} item senilai{" "}
              {formatRupiah(order.total)} dibatalkan sekaligus, dan order ini
              ikut batal. Tidak ada yang tersisa untuk dilunasi.
            </Text>
            <Text style={styles.fieldLabel}>Alasan (opsional)</Text>
            <TextInput
              value={clearReason}
              onChangeText={setClearReason}
              placeholder="Contoh: pelanggan batal pesan"
              placeholderTextColor={semantic.textSecondary}
              style={styles.input}
            />
            <Text style={styles.hint}>
              Tiap item tetap tercatat satu per satu di laporan void, persis
              seperti dibatalkan sendiri-sendiri. Order tidak bisa dibuka lagi
              setelah ini — buat order baru kalau pelanggan berubah pikiran.
            </Text>
          </View>
        </Sheet>
      ) : null}

      {voiding ? (
        <Sheet
          title="Batalkan item"
          subtitle={`${voiding.product_name} · ${voiding.quantity} tersimpan`}
          onClose={() => setVoiding(null)}
          footer={
            <Button
              label="Batalkan item ini"
              variant="danger"
              onPress={handleVoid}
            />
          }>
          <View style={styles.voidForm}>
            <Text style={styles.fieldLabel}>Jumlah yang dibatalkan</Text>
            <TextInput
              value={voidQty}
              onChangeText={(text) => setVoidQty(text.replace(/[^0-9]/g, ""))}
              keyboardType="number-pad"
              style={styles.input}
            />
            <Text style={styles.fieldLabel}>Alasan (opsional)</Text>
            <TextInput
              value={voidReason}
              onChangeText={setVoidReason}
              placeholder="Contoh: salah pesan"
              placeholderTextColor={semantic.textSecondary}
              style={styles.input}
            />
            <Text style={styles.hint}>
              Pembatalan selalu meninggalkan jejak — inilah satu-satunya sumber
              laporan void, jadi item tidak pernah hilang begitu saja.
            </Text>
          </View>
        </Sheet>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: semantic.surfaceMuted,
  },
  header: {
    gap: spacing.xs,
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: semantic.border,
    backgroundColor: semantic.surface,
  },
  headerText: {
    flex: 1,
    gap: spacing.xs,
  },
  title: {
    ...textStyles.screenTitle,
    color: semantic.textPrimary,
  },
  back: {
    paddingHorizontal: spacing.lg,
  },
  headerStatus: {
    minHeight: 22,
    alignItems: "flex-end",
    justifyContent: "center",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  headerActions: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  headerButton: {
    paddingHorizontal: spacing.md,
  },
  iconButton: {
    paddingHorizontal: spacing.md,
  },
  iconLabel: {
    fontSize: 22,
    lineHeight: 26,
    color: colors.status.void,
  },
  list: {
    padding: spacing.md,
    gap: spacing.sm,
  },
  item: {
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: semantic.border,
    backgroundColor: semantic.surface,
  },
  itemHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  itemName: {
    ...textStyles.bodyStrong,
    flex: 1,
    color: semantic.textPrimary,
  },
  itemSubtotal: {
    ...textStyles.price,
    color: semantic.textPrimary,
  },
  itemMeta: {
    ...textStyles.caption,
    color: semantic.textSecondary,
  },
  itemAction: {
    marginTop: spacing.sm,
  },
  empty: {
    ...textStyles.body,
    padding: spacing.lg,
    textAlign: "center",
    color: semantic.textSecondary,
  },
  footer: {
    gap: spacing.sm,
    padding: spacing.md,
    borderTopWidth: 1,
    borderTopColor: semantic.border,
    backgroundColor: semantic.surface,
  },
  totalRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  totalLabel: {
    ...textStyles.caption,
    color: semantic.textSecondary,
  },
  total: {
    ...textStyles.grandTotal,
    color: semantic.textPrimary,
  },
  locked: {
    ...textStyles.caption,
    color: semantic.textSecondary,
  },
  searchWrap: {
    padding: spacing.md,
  },
  gridWrap: {
    height: 320,
  },
  input: {
    ...textStyles.bodyStrong,
    minHeight: touchTarget.comfortable,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: semantic.border,
    color: semantic.textPrimary,
  },
  disabledInput: {
    opacity: 0.5,
  },
  tableForm: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  tableKindRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  kindButton: {
    flex: 1,
    minHeight: touchTarget.min,
  },
  kindButtonSelected: {
    borderColor: colors.primary[600],
    backgroundColor: colors.primary[50],
  },
  voidForm: {
    padding: spacing.lg,
    gap: spacing.sm,
  },
  fieldLabel: {
    ...textStyles.bodyStrong,
    color: semantic.textPrimary,
  },
  body: {
    ...textStyles.body,
    color: semantic.textPrimary,
  },
  hint: {
    ...textStyles.caption,
    marginTop: spacing.sm,
    color: colors.status.pending,
  },
});
