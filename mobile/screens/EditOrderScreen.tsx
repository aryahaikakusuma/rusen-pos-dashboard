import { useCallback, useEffect, useRef, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";

import Button from "../components/Button";
import Sheet from "../components/Sheet";
import ShiftBanner from "../components/ShiftBanner";
import StatusBadge from "../components/StatusBadge";
import { useToast } from "../components/Toast";
import TrashIcon from "../components/TrashIcon";
import XIcon from "../components/XIcon";
import { translateOrderError } from "../db/errors";
import {
  changeTableCode,
  clearOrderItems,
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
  fontSize,
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
  const [emptying, setEmptying] = useState(false);
  const [emptyReason, setEmptyReason] = useState("");

  /**
   * Kunci yang sebenarnya. `busy` cuma state — ia baru terbaca pada render
   * berikutnya, jadi dua ketukan cepat pada tombol yang sama bisa keduanya lolos
   * dengan `order.version` yang sama; yang kedua kena STALE_ORDER padahal kasir
   * tidak salah apa-apa. Alasan yang sama dengan busyRef di halaman Tambah item.
   */
  const busyRef = useRef(false);

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
      if (busyRef.current) return;
      busyRef.current = true;
      setBusy(true);
      try {
        await action();
        toast.success(label);
        return true;
      } catch (caught) {
        toast.error(translateOrderError(caught));
        return false;
      } finally {
        await reload();
        busyRef.current = false;
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
    void (async () => {
      const ok = await run("Meja dibatalkan", () =>
        voidAllOrderItems(db, {
          orderId,
          employeeId: session.employeeId,
          reason: clearReason,
          expectedVersion: order.version,
        })
      );
      // Order-nya sudah void: tidak ada lagi yang bisa dikerjakan di layar ini,
      // dan membiarkannya terbuka berarti kasir menatap meja yang sudah tidak
      // ada sampai ia sendiri menekan Kembali. Hanya kalau berhasil — kalau
      // gagal, pesan kesalahannya harus terbaca di tempat kejadiannya.
      if (ok) onClose();
    })();
  };

  /**
   * Mengosongkan isi meja. Bukan `run`: kalau berhasil, order yang dipegang
   * layar ini sudah bukan order yang sama lagi, jadi yang menyusul bukan
   * reload() melainkan pindah rute ke order penggantinya. reload() hanya untuk
   * jalur gagal, supaya layar tidak tertinggal memegang version basi.
   */
  const handleEmptyItems = () => {
    if (!gateShift("mengosongkan isi meja")) return;
    if (!order || !session || busyRef.current) return;
    const current = order;
    const reason = emptyReason;
    setEmptying(false);
    busyRef.current = true;
    setBusy(true);
    void (async () => {
      try {
        const { orderId: nextOrderId } = await clearOrderItems(db, {
          orderId,
          employeeId: session.employeeId,
          reason,
          expectedVersion: current.version,
        });
        toast.success(
          `Isi ${tableLabel(current.table_code, current.table_seq)} dikosongkan`
        );
        router.replace({
          pathname: "/edit-order/[id]",
          params: { id: nextOrderId },
        });
      } catch (caught) {
        toast.error(translateOrderError(caught));
        await reload();
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    })();
  };

  const openChangeTable = () => {
    setNewTableCode(order?.table_code ?? "");
    setChangingTable(true);
  };

  const handleChangeTable = async () => {
    if (!gateShift("memindah meja")) return;
    if (!order || busyRef.current) return;
    busyRef.current = true;
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
      busyRef.current = false;
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
        <View style={styles.headerRow}>
          {/* Nomor meja besar, statusnya kecil tepat di bawahnya: yang dicari
              kasir saat menoleh ke layar adalah "meja mana ini", dan status
              hanya perlu terbaca setelah ia menemukannya. */}
          <View style={styles.headerText}>
            <Text style={styles.title} numberOfLines={1}>
              {tableLabel(order.table_code, order.table_seq)}
            </Text>
            <StatusBadge status={order.status} />
          </View>
          <View style={styles.headerActions}>
            {/* Ikon saja, karena tiga tombol berlabel penuh tidak muat di baris
                ini. Yang merah hanya ikonnya; variannya tetap "secondary"
                supaya latar tombol tetap polos. Tong sampah merah menandai
                aksinya merusak, tanpa memberi tombol ini bobot visual "danger"
                penuh — di header, kotak merah pekat menonjol persis seperti
                tombol yang memang dituju kasir, padahal ini justru yang paling
                tidak boleh tertekan tanpa sengaja. Peringatannya ada di
                konfirmasi.

                Ini tombol BATALKAN MEJA: order ikut batal dan mejanya lepas.
                Yang cuma membuang isinya adalah "Hapus Semua Item" di kaki
                layar. Keduanya membatalkan item lewat jalur yang sama; yang
                berbeda hanya nasib mejanya sesudah itu. Tetap tampil pada meja
                tanpa item — meja kosong lahir dari "Hapus Semua Item", dan
                tanpa tombol ini ia jadi baris yang tidak bisa ditutup. */}
            {editable ? (
              <Button
                label="Batalkan meja"
                icon={<TrashIcon size={22} />}
                accessibilityLabel="Batalkan meja dan seluruh ordernya"
                disabled={busy}
                onPress={() => {
                  setClearReason("");
                  setClearing(true);
                }}
                style={styles.iconButton}
              />
            ) : null}
            {editable ? (
              <Button
                label="Ganti Meja"
                disabled={busy}
                onPress={openChangeTable}
                labelStyle={styles.headerButtonLabel}
                style={styles.headerButton}
              />
            ) : null}
            <Button
              label="Kembali"
              onPress={onClose}
              labelStyle={styles.headerButtonLabel}
              style={styles.headerButton}
            />
          </View>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.list}>
        {order.items.map((item) => (
          <View key={item.id} style={styles.item}>
            {/* Silang merah di kiri tiap baris, bukan tombol selebar kartu di
                bawahnya: satu baris item kini setinggi isinya sendiri, jadi
                order berisi enam item masih muat tanpa digulir. Sasaran
                sentuhnya tetap touchTarget.min meski gambarnya kecil. */}
            {editable ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Batalkan ${item.product_name}`}
                disabled={busy}
                onPress={() => {
                  setVoiding(item);
                  setVoidQty(String(item.quantity));
                  setVoidReason("");
                }}
                style={({ pressed }) => [
                  styles.itemVoid,
                  pressed && styles.itemVoidPressed,
                  busy && styles.itemVoidDisabled,
                ]}>
                <XIcon size={16} />
              </Pressable>
            ) : null}
            <View style={styles.itemText}>
              <Text style={styles.itemName}>
                {item.product_code} · {item.product_name}
              </Text>
              <Text style={styles.itemMeta}>
                {item.quantity} × {formatRupiah(item.unit_price)}
                {item.notes ? ` · ${item.notes}` : ""}
              </Text>
            </View>
            <Text style={styles.itemSubtotal}>{formatRupiah(item.subtotal)}</Text>
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
          <>
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
            {/* Teks, bukan tombol: satu tombol utama per layar (DESIGN.md), dan
                yang berhak atas bobot itu adalah Tambah item. Aksi ini merusak
                dan jarang, jadi ia diberi bentuk yang paling sulit tertekan
                tanpa sengaja — tapi area ketuknya tetap setinggi touchTarget.min
                supaya masih bisa dikenai jari, bukan ujung kuku. */}
            {order.items.length > 0 ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Hapus semua item, meja tetap dipegang"
                disabled={busy}
                onPress={() => {
                  setEmptyReason("");
                  setEmptying(true);
                }}
                style={({ pressed }) => [
                  styles.emptyLink,
                  pressed && styles.emptyLinkPressed,
                  busy && styles.emptyLinkDisabled,
                ]}>
                <Text style={styles.emptyLinkLabel}>Hapus Semua Item</Text>
              </Pressable>
            ) : null}
          </>
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
          title="Batalkan meja"
          subtitle={tableLabel(order.table_code, order.table_seq)}
          onClose={() => setClearing(false)}
          footer={
            <>
              <Button
                label={
                  order.items.length > 0
                    ? `Batalkan meja dan ${order.items.length} item`
                    : "Batalkan meja"
                }
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
              {order.items.length > 0
                ? `Seluruh ${order.items.length} item senilai ${formatRupiah(
                    order.total
                  )} dibatalkan sekaligus, dan order ini ikut batal. Tidak ada yang tersisa untuk dilunasi.`
                : "Meja ini sudah tidak punya item. Order-nya ditutup dan kode mejanya dilepas."}
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
              setelah ini, dan kode mejanya lepas — kalau yang dimaui cuma
              mengganti isinya, pakai "Hapus Semua Item" di kaki layar.
            </Text>
          </View>
        </Sheet>
      ) : null}

      {/* Konfirmasi kedua, sengaja terpisah dari Batalkan meja: keduanya
          membuang seluruh item, dan satu-satunya beda yang penting bagi kasir
          adalah apa yang terjadi pada mejanya. Menggabungkannya jadi satu
          lembar dengan dua tombol akan membuat beda itu diputuskan pada ketukan
          terakhir, bukan pada ketukan pertama. */}
      {emptying ? (
        <Sheet
          title="Hapus semua item"
          subtitle={tableLabel(order.table_code, order.table_seq)}
          onClose={() => setEmptying(false)}
          footer={
            <>
              <Button
                label={`Hapus ${order.items.length} item`}
                variant="danger"
                disabled={busy}
                onPress={handleEmptyItems}
              />
              <Button
                label="Jangan jadi"
                disabled={busy}
                onPress={() => setEmptying(false)}
              />
            </>
          }>
          <View style={styles.voidForm}>
            <Text style={styles.body}>
              Seluruh {order.items.length} item senilai{" "}
              {formatRupiah(order.total)} dibatalkan, tapi{" "}
              {tableLabel(order.table_code, order.table_seq)} tetap dipegang dan
              layar ini tetap terbuka — siap diisi ulang tanpa mengetik kode
              mejanya lagi.
            </Text>
            <Text style={styles.fieldLabel}>Alasan (opsional)</Text>
            <TextInput
              value={emptyReason}
              onChangeText={setEmptyReason}
              placeholder="Contoh: pesanan salah dicatat"
              placeholderTextColor={semantic.textSecondary}
              style={styles.input}
            />
            <Text style={styles.hint}>
              Tiap item tetap tercatat satu per satu di laporan void. Di balik
              layar, order lama ditutup dan order kosong baru dibuka di kode meja
              yang sama — nomor strukmya berganti, mejanya tidak.
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
    // Tanpa ini kolom kirinya tidak pernah menyusut di bawah lebar teksnya
    // sendiri: `flex: 1` hanya membagi SISA ruang, dan tiga tombol berukuran
    // penuh tidak menyisakan apa-apa. Nomor mejanya terpotong jadi "T…" dan
    // badge statusnya jatuh satu huruf per baris.
    minWidth: 0,
    alignItems: "flex-start",
    gap: spacing.xs,
  },
  title: {
    ...textStyles.screenTitle,
    color: semantic.textPrimary,
  },
  back: {
    paddingHorizontal: spacing.lg,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    // Tombolnya sudah sekecil yang masih layak disentuh; yang boleh mengalah
    // kalau ruangnya kurang adalah teks di kiri, bukan sasaran sentuh di sini.
    flexShrink: 0,
  },
  // Tiga tombol di satu baris header, jadi ukurannya diturunkan dari default
  // Button (minHeight 64, padding lg, teks 18) ke ambang bawah yang masih boleh
  // disentuh: touchTarget.min. Ini satu-satunya tempat di aplikasi yang
  // memampatkan Button — di layar lain tombolnya berdiri sendiri dan tidak
  // perlu berbagi baris dengan apa pun.
  headerButton: {
    minHeight: touchTarget.min,
    paddingHorizontal: spacing.sm,
  },
  headerButtonLabel: {
    fontSize: fontSize.sm,
  },
  iconButton: {
    width: touchTarget.min,
    minHeight: touchTarget.min,
    paddingHorizontal: 0,
  },
  list: {
    padding: spacing.md,
    gap: spacing.sm,
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: semantic.border,
    backgroundColor: semantic.surface,
  },
  itemVoid: {
    width: touchTarget.min,
    height: touchTarget.min,
    marginLeft: -spacing.sm,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.status.void,
  },
  itemVoidPressed: {
    backgroundColor: colors.status.voidLight,
  },
  itemVoidDisabled: {
    opacity: 0.45,
  },
  itemText: {
    flex: 1,
    gap: 2,
  },
  itemName: {
    ...textStyles.bodyStrong,
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
  empty: {
    ...textStyles.body,
    padding: spacing.lg,
    textAlign: "center",
    color: semantic.textSecondary,
  },
  footer: {
    gap: spacing.sm,
    padding: spacing.md,
    // Lebih longgar di bawah daripada di sisi lain: aksi terakhir di kaki layar
    // adalah teks, dan teks yang menempel di tepi bawah adalah teks yang
    // bersinggungan dengan batang navigasi sistem. Inset amannya sudah diurus
    // SafeAreaView di app/edit-order/[id].tsx; jarak ini yang membuat sentuhan
    // di sana tidak berebut dengan gestur "kembali".
    paddingBottom: spacing.xl,
    borderTopWidth: 1,
    borderTopColor: semantic.border,
    backgroundColor: semantic.surface,
  },
  emptyLink: {
    minHeight: touchTarget.min,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
  },
  emptyLinkPressed: {
    backgroundColor: colors.status.voidLight,
  },
  emptyLinkDisabled: {
    opacity: 0.45,
  },
  emptyLinkLabel: {
    ...textStyles.caption,
    textDecorationLine: "underline",
    color: colors.status.void,
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
