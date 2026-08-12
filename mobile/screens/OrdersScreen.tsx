import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";

import Button from "../components/Button";
import BillSheet from "../components/BillSheet";
import ClearHistoryDialog from "../components/ClearHistoryDialog";
import MenuButton from "../components/MenuButton";
import OrderDetailSheet from "../components/OrderDetailSheet";
import RefundSheet from "../components/RefundSheet";
import ShiftBanner from "../components/ShiftBanner";
import StatusBadge, { type RefundState } from "../components/StatusBadge";
import SyncBadge from "../components/SyncBadge";
import { useToast } from "../components/Toast";
import { taxRateBps } from "../db/catalog";
import { OrderError, translateOrderError } from "../db/errors";
import {
  clearHistory,
  countClearableHistory,
  createRefund,
  getOrder,
  listRecentOrders,
  listRefunds,
  refundedQuantities,
  refundTotalsByOrder,
  type HistorySweep,
} from "../db/orders";
import { countUnsent, pushPending, pushPendingShifts } from "../db/push";
import type { OrderItemRow, OrderRow, RefundItemInput } from "../db/types";
import { useAuth } from "../lib/auth-context";
import { printBill, printOrder, translatePrinterError } from "../lib/printer";
import { useGateShift, useShift } from "../lib/shift-context";
import {
  formatRupiah,
  tableLabel,
  type TaxStatus,
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
  const { aktif: shiftAktif } = useShift();
  const gateShift = useGateShift();
  const router = useRouter();

  const [orders, setOrders] = useState<OrderWithItems[]>([]);
  const [unsent, setUnsent] = useState(0);
  const [pushing, setPushing] = useState(false);
  /**
   * Tarif PBJT dari app_state — null kalau katalog belum pernah ditarik sejak
   * rilis ini. Ditahan di layar, bukan dibaca di dalam lembar pembayaran, supaya
   * gerbangnya jatuh SEBELUM lembar terbuka: kasir yang sudah mengetik nominal
   * dan melihat kembalian sudah terlanjur menyerahkan uang, dan menolaknya di
   * detik itu adalah tempat terburuk untuk menolak.
   */
  const [rateBps, setRateBps] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  /** Order yang strukmya sedang dikirim — menyambung Bluetooth perlu sedetik
   *  dua detik, dan tombol yang diam selama itu akan ditekan berulang. */
  const [printingId, setPrintingId] = useState<string | null>(null);
  /** Penjaga sesungguhnya. Lihat runPrint — state React terlalu lambat di sini. */
  const printingRef = useRef(false);
  /** Hitungan yang sedang ditawarkan dialog pembersihan. null = dialog tutup. */
  const [sweep, setSweep] = useState<HistorySweep | null>(null);
  const [clearing, setClearing] = useState(false);
  /** Order yang rinciannya sedang dibuka. Hanya untuk yang sudah selesai —
   *  order pending dibuka lewat layar ubah, bukan lembar baca-saja. */
  const [detail, setDetail] = useState<OrderWithItems | null>(null);
  const [billing, setBilling] = useState<OrderWithItems | null>(null);
  const [view, setView] = useState<OrderView>("daftar");

  /**
   * Order yang sedang direfund, beserta apa yang SUDAH pernah dikembalikan
   * untuknya. Ketiganya dimuat bersama-sama sebelum lembar dibuka: lembar yang
   * terbuka lebih dulu lalu angkanya menyusul akan sempat menampilkan sisa yang
   * terlalu besar, dan itu tepat angka yang dipakai kasir memutuskan.
   */
  const [refunding, setRefunding] = useState<{
    order: OrderWithItems;
    sudahDirefund: Record<string, number>;
    sudahSubtotal: number;
    sudahPajak: number;
  } | null>(null);
  const [refundError, setRefundError] = useState("");
  /**
   * Berapa yang sudah dikembalikan per order. Satu peta untuk tiga hal — label
   * badge, angka bersih di kartu, dan ada-tidaknya tombol Refund — supaya
   * ketiganya tidak bisa berbeda pendapat tentang order yang sama.
   */
  const [refundTotals, setRefundTotals] = useState<Record<string, number>>({});

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
    const [rows, pending, rate, refunded] = await Promise.all([
      listRecentOrders(db, 30),
      countUnsent(db),
      taxRateBps(db),
      refundTotalsByOrder(db),
    ]);
    setOrders(rows);
    setUnsent(pending);
    setRateBps(rate);
    setRefundTotals(refunded);
  }, [db]);

  useEffect(() => {
    void refresh();
  }, [refresh, refreshToken]);

  // Pelunasan terjadi di rute sebelah (app/pay.tsx) dan menulis ke SQLite
  // langsung, jadi kembali dari sana harus membaca ulang — kalau tidak, order
  // yang baru saja lunas tetap tampil "belum lunas" sampai ada hal lain yang
  // kebetulan menyegarkannya.
  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh])
  );

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
        await pushPendingShifts(db).catch(() => {});
        if (!silent) {
          if (result.sent > 0) {
            toast.success(`${result.sent} order terkirim`);
          } else if (result.failed > 0) {
            // Sebabnya ikut disebut. Kalimat lama selalu menyalahkan koneksi,
            // sehingga kasir menekan Kirim ulang berkali-kali untuk kegagalan
            // yang tidak ada hubungannya dengan sinyal.
            toast.error(
              result.lastError
                ? `Belum bisa mengirim: ${result.lastError}`
                : "Belum bisa mengirim. Periksa koneksi, lalu coba lagi."
            );
          }
        }
      } finally {
        setPushing(false);
        await refresh();
      }
    },
    [db, refresh, toast]
  );

  /**
   * Hitung dulu, baru tanya. Dialognya menyebut angka sebenarnya, dan angka itu
   * dibaca saat tombol ditekan — bukan disimpan dari penyegaran terakhir, yang
   * bisa saja sudah berumur beberapa menit dan membuat kasir menyetujui jumlah
   * yang bukan jumlah yang akhirnya terhapus.
   */
  const openClear = useCallback(async () => {
    setSweep(await countClearableHistory(db));
  }, [db]);

  const runClear = useCallback(async () => {
    if (!gateShift("membersihkan histori")) return;
    setClearing(true);
    try {
      const hasil = await clearHistory(db);
      setSweep(null);
      toast.success(
        hasil.hapus > 0
          ? `${hasil.hapus} order dibersihkan`
          : "Tidak ada yang dibersihkan"
      );
    } catch {
      toast.error("Gagal membersihkan histori.");
    } finally {
      setClearing(false);
      await refresh();
    }
  }, [db, refresh, toast, gateShift]);

  /**
   * Cetak sebuah order. Satu-satunya jalan menuju printer dari layar ini —
   * cetak otomatis dan tombol "Cetak Struk" sama-sama lewat sini.
   *
   * Dulu keduanya jalur terpisah, dan itu yang menghasilkan dua lembar struk
   * untuk satu pembayaran: cetak otomatis berjalan tanpa jejak di layar,
   * kasir menyangka tidak terjadi apa-apa, lalu menekan tombol. Tombolnya
   * memang menonaktifkan diri saat sibuk, tapi cetak otomatis tidak pernah
   * melewati keadaan sibuk itu, jadi tidak ada yang menahannya.
   *
   * `printingRef` yang menjaga, bukan `printingId`. State React diperbarui
   * secara asinkron, jadi dua panggilan yang berdekatan bisa sama-sama membaca
   * "belum sibuk" sebelum salah satunya sempat menuliskannya — persis jarak
   * 0,6 detik yang terlihat di log. Ref berubah seketika.
   *
   * Bedanya hanya pada suara. Cetak otomatis tidak mengumumkan keberhasilan
   * (strukmya sendiri sudah jadi bukti) dan kegagalannya tidak menggagalkan
   * apa pun — uangnya sudah diterima dan tercatat, dan printer kehabisan
   * kertas bukan alasan menghalangi kasir. Tombol harus melapor keduanya:
   * ia ditekan justru karena struknya belum ada di tangan.
   */
  const runPrint = useCallback(
    async (orderId: string, announceSuccess: boolean) => {
      if (printingRef.current) return;
      printingRef.current = true;
      setPrintingId(orderId);
      try {
        // Dibaca ulang dari SQLite, bukan dari baris yang ada di tangan:
        // setelah payOrder, salinan di memori masih berstatus pending dan
        // struknya akan tercetak "BELUM LUNAS". Menyusun ulang nilainya
        // sendiri di sini berarti menyalin aturan pembayaran ke tempat kedua
        // yang bisa menyimpang.
        const fresh = await getOrder(db, orderId);
        if (!fresh) return;
        await printOrder(db, fresh, fresh.items);
        if (announceSuccess) toast.success("Struk terkirim ke printer.");
      } catch (caught) {
        toast.error(translatePrinterError(caught));
      } finally {
        printingRef.current = false;
        setPrintingId(null);
      }
    },
    [db, toast]
  );

  /** Bill berbagi penjaga printer dengan struk lunas. */
  const runBill = useCallback(
    async (
      orderId: string,
      selectedItemIds: string[],
      taxStatus: TaxStatus
    ) => {
      if (printingRef.current) return;
      printingRef.current = true;
      setPrintingId(orderId);
      try {
        await printBill(db, orderId, selectedItemIds, taxStatus);
        setBilling(null);
        toast.success("Bill terkirim ke printer.");
      } catch (caught) {
        toast.error(translatePrinterError(caught));
      } finally {
        printingRef.current = false;
        setPrintingId(null);
      }
    },
    [db, toast]
  );

  /** Memuat order beserta riwayat refundnya, lalu membuka lembarnya. */
  const openRefund = useCallback(
    async (orderId: string) => {
      const order = await getOrder(db, orderId);
      if (!order) return;
      const [sudahDirefund, riwayat] = await Promise.all([
        refundedQuantities(db, orderId),
        listRefunds(db, orderId),
      ]);
      setRefundError("");
      setRefunding({
        order,
        sudahDirefund,
        sudahSubtotal: riwayat.reduce((sum, r) => sum + r.subtotal, 0),
        sudahPajak: riwayat.reduce((sum, r) => sum + r.tax_amount, 0),
      });
    },
    [db]
  );

  const handleRefund = async (
    items: RefundItemInput[],
    reason: string | null
  ) => {
    if (!gateShift("mencatat refund")) return;
    if (!refunding || !session) return;
    setSubmitting(true);
    setRefundError("");
    try {
      await createRefund(db, {
        orderId: refunding.order.id,
        employeeId: session.employeeId,
        reason,
        items,
      });
      toast.success(
        `Refund order ${tableLabel(
          refunding.order.table_code,
          refunding.order.table_seq
        )} tercatat`
      );
      setRefunding(null);
      await refresh();
      // Refund adalah uang keluar, dan sampai terkirim ia hanya ada di ponsel
      // ini. Percobaan kirim langsung, sama seperti setelah pelunasan.
      void push(true);
    } catch (caught) {
      const message = translateOrderError(caught);
      setRefundError(message);
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

      {!shiftAktif ? <ShiftBanner /> : null}

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

      {/* Jeda menyambung printer bisa mencapai beberapa detik, dan selama itu
          dulu tidak ada apa pun di layar. Diam selama lima detik terbaca
          sebagai gagal, dan yang wajar dilakukan kasir berikutnya adalah
          menekan tombol lagi — itulah asal struk kedua. Toast tidak dipakai:
          notifikasi sukses hilang sendiri setelah tiga detik, lebih cepat
          daripada cetakannya sendiri selesai. */}
      {printingId ? (
        <View style={styles.printing}>
          <ActivityIndicator color={colors.primary[600]} />
          <Text style={styles.printingLabel}>Mencetak struk…</Text>
        </View>
      ) : null}

      {/* Hanya di tab Histori. Di tab Daftar ia tidak punya arti — tidak ada
          satu pun order pending yang memenuhi syarat — dan tombol yang selalu
          ada tapi tidak pernah berlaku adalah tombol yang akan ditekan. */}
      {view === "histori" && histori.length > 0 && shiftAktif ? (
        <View style={styles.tools}>
          <Pressable
            accessibilityRole="button"
            onPress={() => void openClear()}
            style={({ pressed }) => [styles.clear, pressed && styles.clearOn]}>
            <Text style={styles.clearLabel}>Bersihkan histori</Text>
          </Pressable>
        </View>
      ) : null}

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

          // Keadaan refund diturunkan di SATU tempat, lalu dipakai badge,
          // angka, dan tombol. `>=`, bukan `===`: batas kumulatif di
          // createRefund dan push_order sudah menjamin refund tidak pernah
          // melebihi total, tapi perbandingan yang lebih longgar berarti selisih
          // satu rupiah dari mana pun tidak akan pernah menampilkan "Refund
          // Sebagian" untuk order yang uangnya sudah habis kembali. Salah di
          // arah itu jauh lebih murah.
          const refunded = refundTotals[order.id] ?? 0;
          const refundState: RefundState | undefined =
            refunded === 0 ? undefined : refunded >= order.total ? "full" : "partial";

          return (
            /* Seluruh kartu jadi sasaran tekan, bukan tombol "Detail" sendiri:
               ia sudah punya dua tombol di tab Daftar, dan tombol ketiga
               membuat sasaran tekan menyempit persis di layar yang dipakai
               sambil berdiri (DESIGN.md).

               Tekanan pada tombol di dalamnya tidak diteruskan ke sini —
               Pressable dalam menang atas Pressable luar. Jadi "Ubah" tetap
               "Ubah" walau seluruh kartu juga menuju ke sana. */
            <Pressable
              accessibilityRole="button"
              onPress={() =>
                order.status === "pending" ? onEdit(order.id) : setDetail(order)
              }
              style={({ pressed }) => [styles.card, pressed && styles.cardOn]}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>
                  {tableLabel(order.table_code, order.table_seq)}
                </Text>
                {/* Dua angka saat ada refund, dan keduanya benar: yang dicoret
                    adalah yang tercetak di struk yang dipegang pelanggan, yang
                    tebal adalah yang tinggal di laci. Menghapus salah satunya
                    membuat satu dari dua pertanyaan itu tidak bisa dijawab dari
                    layar. Tanpa refund, kartunya persis seperti sebelumnya. */}
                {refundState ? (
                  <View style={styles.cardAmounts}>
                    <Text style={styles.cardTotalStruck}>
                      {formatRupiah(order.total)}
                    </Text>
                    <Text style={styles.cardTotal}>
                      {formatRupiah(order.total - refunded)}
                    </Text>
                  </View>
                ) : (
                  <Text style={styles.cardTotal}>
                    {formatRupiah(order.total)}
                  </Text>
                )}
              </View>

              <Text style={styles.cardMeta}>
                {itemCount} item · {shortTime(order.created_at)}
              </Text>

              <View style={styles.cardBadges}>
                <StatusBadge status={order.status} refund={refundState} />
                {/* Penanda uji ikut di daftar, tidak hanya di layar kasir.
                    Modenya mati sendiri sesudah satu order, jadi bingkai merah
                    di layar kasir sudah hilang saat order ini dibaca — dan
                    tanpa penanda di sini tidak ada satu pun cara membedakannya
                    dari order sungguhan, padahal uangnya tidak pernah masuk
                    laporan mana pun. */}
                {order.is_test_data === 1 ? (
                  <Text style={styles.ujiBadge}>UJI · di luar laporan</Text>
                ) : null}
                {order.sync_status !== "synced" ? (
                  <Text style={styles.unsent}>Belum terkirim</Text>
                ) : null}
              </View>

              {/* Sebab kegagalannya ditampilkan, bukan hanya kegagalannya.
                  Sebelumnya `sync_error` disimpan tapi tidak pernah dibaca
                  siapa pun: kasir cuma melihat "Kirim ulang" muncul lagi dan
                  lagi tanpa cara mengetahui apakah yang salah itu sinyalnya,
                  sesinya, atau servernya — tiga hal dengan tiga tindakan yang
                  berbeda, dan menekan Kirim ulang hanya membantu untuk yang
                  pertama. */}
              {order.sync_error ? (
                <Text style={styles.syncError} numberOfLines={3}>
                  {order.sync_error}
                </Text>
              ) : null}

              {order.status === "pending" ? (
                <View style={styles.pendingActions}>
                  {/* Hanya Pelunasan yang berwarna aksi utama (DESIGN.md) —
                      satu tombol utama per kartu supaya tidak salah tekan. */}
                  <View style={styles.cardActions}>
                    <Button
                      label="Ubah"
                      onPress={() => onEdit(order.id)}
                      style={styles.cardAction}
                    />
                    <Button
                      label="Cetak Bill"
                      disabled={printingId !== null}
                      onPress={() => setBilling(order)}
                      style={styles.cardAction}
                    />
                  </View>
                  {/* Order pending tanpa item bukan lagi kemustahilan: "Hapus
                      Semua Item" di layar Ubah membuang isinya dan menyerahkan
                      meja yang sama dalam keadaan kosong. payOrder menolaknya
                      dengan EMPTY_ORDER, tapi menolak SESUDAH kasir membuka
                      layar pelunasan dan mungkin sudah menerima uang. Lebih
                      baik tombolnya belum ada. */}
                  <Button
                    label="Pelunasan"
                    variant="primary"
                    disabled={!shiftAktif || itemCount === 0}
                    onPress={() => {
                      if (!gateShift("melunasi order")) return;
                      // Gerbang tarif. payOrder tetap melempar sebagai lapis
                      // kedua, tapi menolak di sini berarti kasir belum
                      // menyentuh uang sama sekali saat diberi tahu.
                      if (rateBps === null) {
                        toast.error(
                          translateOrderError(new OrderError("TAX_RATE_UNKNOWN"))
                        );
                        return;
                      }
                      router.push({
                        pathname: "/pay",
                        params: { orderId: order.id },
                      });
                    }}
                  />
                </View>
              ) : order.status === "paid" ? (
                // Cetak ulang. Order yang batal tidak dapat tombol ini: struk
                // untuk transaksi yang tidak terjadi tidak ada gunanya, dan
                // kertasnya bisa disalahartikan sebagai bukti bayar.
                <View style={styles.cardActions}>
                  {/* Refund di kiri Cetak Struk, dan sengaja BUKAN varian
                      utama: DESIGN.md menetapkan satu aksi utama per kartu,
                      dan uang keluar bukan aksi yang pantas paling menonjol.
                      Hilang sama sekali begitu seluruh nilainya sudah kembali —
                      tombol yang selalu ditolak lebih membingungkan daripada
                      tombol yang tidak ada. */}
                  {refundState !== "full" ? (
                    <Button
                      label="Refund"
                      disabled={printingId !== null || !shiftAktif}
                      onPress={() => {
                        if (!gateShift("mencatat refund")) return;
                        void openRefund(order.id);
                      }}
                      style={styles.cardAction}
                    />
                  ) : null}
                  <Button
                    label="Cetak Struk"
                    loading={printingId === order.id}
                    loadingLabel="Mencetak…"
                    // Selagi satu struk dikirim, tombol order LAIN pun mati.
                    // Printer hanya melayani satu sambungan, dan tombol yang
                    // bisa ditekan tapi permintaannya diabaikan diam-diam
                    // lebih membingungkan daripada tombol yang jelas mati.
                    disabled={printingId !== null && printingId !== order.id}
                    onPress={() => void runPrint(order.id, true)}
                    style={styles.cardAction}
                  />
                </View>
              ) : null}
            </Pressable>
          );
        }}
      />

      {detail ? (
        <OrderDetailSheet order={detail} onClose={() => setDetail(null)} />
      ) : null}

      {billing ? (
        <BillSheet
          order={billing}
          taxRateBps={rateBps}
          printing={printingId === billing.id}
          onClose={() => setBilling(null)}
          onPrint={(selectedItemIds, taxStatus) =>
            void runBill(billing.id, selectedItemIds, taxStatus)
          }
        />
      ) : null}

      {refunding ? (
        <RefundSheet
          order={refunding.order}
          sudahDirefund={refunding.sudahDirefund}
          sudahSubtotal={refunding.sudahSubtotal}
          sudahPajak={refunding.sudahPajak}
          submitting={submitting}
          error={refundError}
          onClose={() => setRefunding(null)}
          onSubmit={(items, reason) => void handleRefund(items, reason)}
        />
      ) : null}

      {sweep ? (
        <ClearHistoryDialog
          sweep={sweep}
          busy={clearing}
          onConfirm={() => void runClear()}
          onCancel={() => setSweep(null)}
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
  // Rata kanan dan tanpa bingkai: ini bukan pekerjaan yang dituju kasir saat
  // membuka tab Histori, jadi ia tidak boleh bersaing dengan kartu order.
  tools: {
    flexDirection: "row",
    justifyContent: "flex-end",
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  clear: {
    minHeight: touchTarget.min,
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
  },
  clearOn: {
    backgroundColor: colors.status.voidLight,
  },
  clearLabel: {
    ...textStyles.bodyStrong,
    color: colors.status.void,
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
  printing: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginHorizontal: spacing.md,
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.primary[50],
  },
  printingLabel: {
    ...textStyles.bodyStrong,
    color: colors.primary[600],
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
  cardOn: {
    backgroundColor: semantic.surfaceMuted,
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
  cardAmounts: {
    alignItems: "flex-end",
  },
  // Dicoret DAN diredupkan, bukan salah satunya. Coretan saja masih terbaca
  // setebal angka bersih di bawahnya, dan dua angka sama tebal di satu kartu
  // membuat mata harus memilih tiap kali.
  cardTotalStruck: {
    ...textStyles.caption,
    color: semantic.textSecondary,
    textDecorationLine: "line-through",
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
  ujiBadge: {
    ...textStyles.statusBadge,
    color: colors.status.void,
  },
  syncError: {
    ...textStyles.caption,
    marginTop: spacing.xs,
    color: colors.status.void,
  },
  cardActions: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  pendingActions: {
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  cardAction: {
    flex: 1,
  },
});
