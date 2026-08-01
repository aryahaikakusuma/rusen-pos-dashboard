import { useCallback, useEffect, useState } from "react";
import {
  useLocalSearchParams,
  useNavigation,
  useRouter,
} from "expo-router";
import { ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSQLiteContext } from "expo-sqlite";

import Button from "../components/Button";
import { useToast } from "../components/Toast";
import { taxRateBps } from "../db/catalog";
import { translateOrderError } from "../db/errors";
import { getOrder, payOrder } from "../db/orders";
import { pushPending } from "../db/push";
import type { OrderItemRow, OrderRow } from "../db/types";
import { useAuth } from "../lib/auth-context";
import { printOrder, translatePrinterError } from "../lib/printer";
import { useGateShift } from "../lib/shift-context";
import { hitungPbjt, labelPbjt } from "../lib/tax";
import {
  formatRupiah,
  tableLabel,
  type PaymentMethod,
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

/**
 * Pelunasan order. Dulu lembar berlabuh di atas (PaymentSheet), karena papan
 * ketik angka naik dari bawah dan menutupi kolom nominal beserta kotak
 * kembalian. Sebagai halaman, keduanya punya ruang sendiri dan tidak perlu
 * berebut dengan papan ketik.
 *
 * Ordernya dibaca sendiri dari SQLite, bukan diterima sebagai prop: halaman ini
 * rute, dan barisnya di layar Order bisa sudah basi saat kasir sampai ke sini.
 */
export default function PayScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const db = useSQLiteContext();
  const toast = useToast();
  const { session } = useAuth();
  const gateShift = useGateShift();
  const { orderId } = useLocalSearchParams<{ orderId: string }>();

  const [order, setOrder] = useState<
    (OrderRow & { items: OrderItemRow[] }) | null
  >(null);
  const [rateBps, setRateBps] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [payError, setPayError] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [taxStatus, setTaxStatus] = useState<TaxStatus>("taxable");
  const [exemptReason, setExemptReason] = useState("");
  const [amountInput, setAmountInput] = useState("");

  useEffect(() => {
    void getOrder(db, orderId).then(setOrder);
    void taxRateBps(db).then(setRateBps);
  }, [db, orderId]);

  // Menahan Kembali selagi payOrder berjalan. Bukan soal tampilan: kalau kasir
  // keluar tepat di tengah satu-satunya await, ia tidak akan pernah melihat
  // hasilnya — order bisa saja sudah lunas, dan yang tampak di layar Order
  // adalah baris yang belum sempat disegarkan.
  useEffect(() => {
    const unsubscribe = navigation.addListener("beforeRemove", (e: any) => {
      if (!submitting) return;
      e.preventDefault();
    });
    return unsubscribe;
  }, [navigation, submitting]);

  // `order.total` pada order pending masih angka PRA-pajak — pajaknya baru
  // diputuskan di halaman ini. Membandingkan nominal diterima terhadap angka
  // itu akan menampilkan kembalian 10% terlalu besar, dan kasir sudah
  // menyerahkan uangnya sebelum siapa pun sempat memeriksa. Semua perbandingan
  // di bawah memakai `tagihan`.
  const subtotal = order?.subtotal ?? 0;
  // Basisnya taxable_subtotal, bukan subtotal: rokok bukan objek PBJT. Angka di
  // layar ini harus sama persis dengan yang dihitung payOrder, kalau tidak
  // kasir menagih satu angka lalu mencatat angka lain.
  const tax =
    taxStatus === "exempt" || !order || rateBps === null
      ? 0
      : hitungPbjt(order.taxable_subtotal, rateBps);
  const tagihan = subtotal + tax;

  const hasAmount = amountInput !== "";
  const amountReceived = hasAmount ? Number(amountInput) : 0;
  const change = amountReceived - tagihan;

  // Pemeriksaan di sini hanya untuk umpan balik cepat. payOrder() tetap
  // memvalidasi ulang dan melempar INSUFFICIENT_AMOUNT — kebenaran uang
  // ditentukan di lapisan database, bukan di layar.
  const cashReady =
    method === "cash" ? hasAmount && amountReceived >= tagihan : true;
  const reasonReady = taxStatus === "taxable" || exemptReason.trim() !== "";
  const ready = cashReady && reasonReady;

  const tone = !hasAmount ? "neutral" : change >= 0 ? "ok" : "short";

  const handlePay = useCallback(async () => {
    if (!gateShift("melunasi order")) return;
    if (!order || !session) return;
    setSubmitting(true);
    setPayError("");
    try {
      await payOrder(db, {
        orderId: order.id,
        method,
        amountReceived: method === "cash" ? amountReceived : null,
        employeeId: session.employeeId,
        taxStatus,
        taxExemptReason: taxStatus === "exempt" ? exemptReason : null,
      });
      toast.success(
        `Order ${tableLabel(order.table_code, order.table_seq)} lunas`
      );
      const paidId = order.id;
      router.back();

      // Pemicu cetak otomatis. Sengaja tidak di-await bersama pembayaran:
      // menyambung Bluetooth bisa memakan beberapa detik, dan halaman ini
      // tidak boleh menggantung selama itu. Kegagalannya juga tidak
      // menggagalkan apa pun — uangnya sudah diterima dan tercatat, dan
      // printer kehabisan kertas bukan alasan menghalangi kasir.
      void (async () => {
        try {
          // Dibaca ulang dari SQLite, bukan dari salinan di tangan: setelah
          // payOrder, salinan di memori masih berstatus pending dan struknya
          // akan tercetak "BELUM LUNAS".
          const fresh = await getOrder(db, paidId);
          if (!fresh) return;
          await printOrder(db, fresh, fresh.items);
        } catch (caught) {
          toast.error(translatePrinterError(caught));
        }
      })();
      // Percobaan kirim di momen yang pasti terjadi. Kalau ada sinyal, order
      // sampai tanpa kasir perlu memikirkannya; kalau tidak, badge tetap hidup.
      void pushPending(db).catch(() => {});
    } catch (caught) {
      const message = translateOrderError(caught);
      setPayError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }, [
    db,
    order,
    session,
    method,
    amountReceived,
    taxStatus,
    exemptReason,
    gateShift,
    toast,
    router,
  ]);

  if (!order || rateBps === null) {
    return (
      <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
        <Text style={styles.empty}>Memuat order…</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.title}>Pelunasan Order</Text>
          <Text style={styles.subtitle}>
            Meja/Order: {tableLabel(order.table_code, order.table_seq)}
          </Text>
        </View>
        <Button
          label="Kembali"
          disabled={submitting}
          onPress={() => router.back()}
        />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View>
          <Text style={styles.fieldLabel}>Status Pajak</Text>
          <View style={styles.methodRow}>
            {(
              [
                ["taxable", "Kena Pajak"],
                ["exempt", "Bebas Pajak"],
              ] as const
            ).map(([option, label]) => (
              <Button
                key={option}
                label={label}
                style={[
                  styles.methodButton,
                  taxStatus === option && styles.taxActive,
                ]}
                onPress={() => {
                  setTaxStatus(option);
                  // Keterangan dibuang saat kembali ke kena pajak. Keterangan
                  // yang menempel pada transaksi yang akhirnya dipungut pajak
                  // adalah jejak audit yang berbohong — dan constraint di
                  // Postgres menolaknya juga.
                  if (option === "taxable") setExemptReason("");
                }}
              />
            ))}
          </View>
        </View>

        {taxStatus === "exempt" ? (
          <View>
            <Text style={styles.fieldLabel}>Keterangan Bebas Pajak</Text>
            <TextInput
              value={exemptReason}
              onChangeText={setExemptReason}
              placeholder="Nama instansi atau alasannya"
              placeholderTextColor={semantic.textSecondary}
              style={styles.input}
              editable={!submitting}
            />
            <Text style={styles.hint}>
              Wajib diisi. Tercatat atas nama Anda sebagai yang menyetujui.
            </Text>
          </View>
        ) : null}

        <View style={styles.totalBox}>
          {taxStatus === "taxable" ? (
            <View style={styles.breakdown}>
              <View style={styles.breakdownRow}>
                <Text style={styles.breakdownLabel}>Subtotal</Text>
                <Text style={styles.breakdownValue}>
                  {formatRupiah(subtotal)}
                </Text>
              </View>
              <View style={styles.breakdownRow}>
                <Text style={styles.breakdownLabel}>{labelPbjt(rateBps)}</Text>
                <Text style={styles.breakdownValue}>{formatRupiah(tax)}</Text>
              </View>
            </View>
          ) : null}
          <Text style={styles.boxLabel}>Total Tagihan</Text>
          <Text style={styles.total}>{formatRupiah(tagihan)}</Text>
        </View>

        <View>
          <Text style={styles.fieldLabel}>Metode Pembayaran</Text>
          <View style={styles.methodRow}>
            {(["cash", "non_cash"] as const).map((option) => (
              <Button
                key={option}
                label={option === "cash" ? "Cash" : "Non Cash"}
                style={[
                  styles.methodButton,
                  method === option && styles.methodActive,
                ]}
                onPress={() => {
                  setMethod(option);
                  if (option === "non_cash") setAmountInput("");
                }}
              />
            ))}
          </View>
        </View>

        {method === "cash" ? (
          <View style={styles.cashBlock}>
            <Text style={styles.fieldLabel}>Nominal Diterima</Text>
            <TextInput
              value={amountInput}
              onChangeText={(text) =>
                setAmountInput(text.replace(/[^0-9]/g, ""))
              }
              keyboardType="number-pad"
              placeholder="0"
              placeholderTextColor={semantic.textSecondary}
              style={styles.input}
              editable={!submitting}
            />

            {/* Uang kurang punya kotaknya sendiri, bukan kembalian bernilai
                nol: kasir perlu tahu berapa lagi yang harus diminta, dan
                "Rp 0" tidak menjawab itu. Labelnya ikut berganti supaya
                angka bertanda minus tidak terbaca sebagai kembalian. */}
            <View style={[styles.changeBox, styles[`${tone}Box`]]}>
              <Text style={styles.boxLabel}>
                {tone === "short" ? "Kurang" : "Kembalian"}
              </Text>
              <Text style={[styles.change, styles[`${tone}Text`]]}>
                {!hasAmount
                  ? "-"
                  : change < 0
                    ? `− ${formatRupiah(-change)}`
                    : formatRupiah(change)}
              </Text>
            </View>
          </View>
        ) : null}

        {payError ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText} accessibilityRole="alert">
              {payError}
            </Text>
          </View>
        ) : null}
      </ScrollView>

      <View style={styles.footer}>
        <Button
          label="Konfirmasi Lunas"
          loadingLabel="Memproses…"
          variant="primary"
          loading={submitting}
          disabled={!ready}
          onPress={() => void handlePay()}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: semantic.surfaceMuted,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
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
  subtitle: {
    ...textStyles.caption,
    color: semantic.textSecondary,
  },
  empty: {
    ...textStyles.body,
    padding: spacing.lg,
    textAlign: "center",
    color: semantic.textSecondary,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
  },
  footer: {
    padding: spacing.md,
    borderTopWidth: 1,
    borderTopColor: semantic.border,
    backgroundColor: semantic.surface,
  },
  totalBox: {
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: semantic.border,
    backgroundColor: semantic.surfaceMuted,
  },
  boxLabel: {
    ...textStyles.caption,
    color: semantic.textSecondary,
  },
  total: {
    ...textStyles.grandTotal,
    color: semantic.textPrimary,
  },
  fieldLabel: {
    ...textStyles.bodyStrong,
    marginBottom: spacing.sm,
    color: semantic.textPrimary,
  },
  methodRow: {
    flexDirection: "row",
    gap: spacing.md,
  },
  methodButton: {
    flex: 1,
  },
  methodActive: {
    borderColor: colors.primary[600],
    backgroundColor: colors.primary[50],
  },
  // Netral gelap, bukan biru. DESIGN.md menyimpan biru untuk aksi utama, dan di
  // halaman ini aksi utamanya "Konfirmasi Lunas". Status pajak adalah pilihan,
  // bukan tombol yang dituju kasir — kalau ikut biru, mata tidak bisa
  // membedakan "ini tombol" dari "ini status" dalam sekali lihat.
  taxActive: {
    borderColor: semantic.sidebarActive,
    backgroundColor: semantic.surfaceMuted,
  },
  breakdown: {
    gap: spacing.xs,
    marginBottom: spacing.sm,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: semantic.border,
  },
  breakdownRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  breakdownLabel: {
    ...textStyles.body,
    color: semantic.textSecondary,
  },
  breakdownValue: {
    ...textStyles.bodyStrong,
    color: semantic.textPrimary,
  },
  hint: {
    ...textStyles.caption,
    marginTop: spacing.xs,
    color: semantic.textSecondary,
  },
  cashBlock: {
    gap: spacing.md,
  },
  input: {
    ...textStyles.actionButton,
    minHeight: touchTarget.comfortable,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: semantic.border,
    color: semantic.textPrimary,
    backgroundColor: semantic.surface,
  },
  changeBox: {
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 2,
  },
  change: {
    ...textStyles.screenTitle,
  },
  neutralBox: {
    borderColor: semantic.border,
    backgroundColor: semantic.surfaceMuted,
  },
  neutralText: {
    color: semantic.textSecondary,
  },
  okBox: {
    borderColor: colors.status.paid,
    backgroundColor: colors.status.paidLight,
  },
  okText: {
    color: colors.status.paid,
  },
  shortBox: {
    borderColor: colors.status.void,
    backgroundColor: colors.status.voidLight,
  },
  shortText: {
    color: colors.status.void,
  },
  errorBox: {
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.status.void,
    backgroundColor: colors.status.voidLight,
  },
  errorText: {
    ...textStyles.caption,
    textAlign: "center",
    color: colors.status.void,
  },
});
