import { useCallback, useEffect, useRef, useState } from "react";
import {
  useLocalSearchParams,
  useNavigation,
  useRouter,
} from "expo-router";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSQLiteContext } from "expo-sqlite";

import Button from "../components/Button";
import ChevronIcon from "../components/ChevronIcon";
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
import { useShortViewport } from "../lib/use-layout-mode";
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
 * Nominal tunai, disimpan sebagai PILIHAN kasir, bukan sebagai angka jadi.
 *
 * Bedanya penting untuk "Uang Pas". Kalau tap itu menyimpan angka, lalu kasir
 * mengubah status pajak sesudahnya, angkanya jadi basi: yang tampil "pas"
 * padahal tagihannya sudah bergeser sebesar pajaknya, dan kembaliannya salah
 * ke arah yang merugikan toko. Sebagai pilihan, "pas" dibaca ulang dari tagihan
 * yang berlaku saat itu juga setiap kali dirender.
 */
type CashAmount =
  | { kind: "exact" }
  | { kind: "fixed"; value: number }
  | { kind: "manual"; text: string };

/**
 * Tiga pecahan tetap, mengisi grid 2x2 bersama "Uang Pas".
 *
 * Sengaja tetap, bukan dihitung dari tagihan: yang disodorkan pelanggan adalah
 * lembaran uang, dan letak tombolnya yang tidak pernah berpindah itu sendiri
 * yang membuat kasir bisa menekannya tanpa membaca. Tagihan yang tidak
 * terlayani satu pun dari ketiganya ditangani "Nominal Manual" di atasnya.
 */
const NOMINAL_CEPAT = [20000, 50000, 100000] as const;

/**
 * Pelunasan order. Dulu lembar berlabuh di atas (PaymentSheet), karena papan
 * ketik angka naik dari bawah dan menutupi kolom nominal beserta kotak
 * kembalian. Sebagai halaman, keduanya punya ruang sendiri dan tidak perlu
 * berebut dengan papan ketik.
 *
 * Tata letaknya kemudian dirombak sekali lagi dengan alasan yang sama, satu
 * tingkat lebih dalam: menjadikannya halaman memberi ruang, tapi mengetik
 * nominal tetap memanggil papan ketik untuk transaksi yang sebetulnya tidak
 * butuh diketik sama sekali. Nominal cepat menghapus papan ketiknya, bukan
 * cuma memberinya tempat. Detail order pun jadi panel yang membuka di tempat,
 * bukan modal — modal menutupi tombol konfirmasi, dan itu persoalan yang sama
 * yang sudah diselesaikan sekali.
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
  const short = useShortViewport();
  const { orderId } = useLocalSearchParams<{ orderId: string }>();

  const [order, setOrder] = useState<
    (OrderRow & { items: OrderItemRow[] }) | null
  >(null);
  const [rateBps, setRateBps] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [payError, setPayError] = useState("");
  const [channel, setChannel] = useState<"cash" | "transfer">("cash");
  const [transferKind, setTransferKind] = useState<"qris" | "card" | null>(
    null
  );
  const [taxStatus, setTaxStatus] = useState<TaxStatus>("taxable");
  const [cash, setCash] = useState<CashAmount | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);

  const scrollRef = useRef<ScrollView>(null);

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

  const method: PaymentMethod = channel === "cash" ? "cash" : "non_cash";

  // Dibaca dari pilihan, bukan dari angka tersimpan — lihat catatan CashAmount.
  const amountReceived =
    cash === null
      ? 0
      : cash.kind === "exact"
        ? tagihan
        : cash.kind === "fixed"
          ? cash.value
          : Number(cash.text || "0");
  const hasAmount =
    cash !== null && (cash.kind !== "manual" || cash.text !== "");
  const change = amountReceived - tagihan;

  // Pemeriksaan di sini hanya untuk umpan balik cepat. payOrder() tetap
  // memvalidasi ulang dan melempar INSUFFICIENT_AMOUNT — kebenaran uang
  // ditentukan di lapisan database, bukan di layar.
  const ready =
    channel === "cash" ? hasAmount && amountReceived >= tagihan : true;

  const tone = !hasAmount ? "neutral" : change >= 0 ? "ok" : "short";

  const pilihTunai = useCallback((next: CashAmount) => {
    setCash(next);
    if (next.kind !== "manual") setManualOpen(false);
  }, []);

  const bukaManual = useCallback(() => {
    setManualOpen(true);
    setCash({ kind: "manual", text: "" });
    // Papan ketik naik menutupi bagian bawah daftar; kolomnya digulirkan ke
    // pandangan supaya kasir tidak mengetik ke kotak yang tidak terlihat.
    // Ditunda satu putaran karena kolomnya baru ada setelah render ini.
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
  }, []);

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

      <ScrollView
        ref={scrollRef}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          styles.content,
          short && styles.contentShort,
        ]}>
        {/* Paling menonjol di halaman, dan sengaja tanpa rincian di sebelahnya:
            rinciannya hidup di panel detail di bawah. Yang dibaca kasir sambil
            menerima uang cuma satu angka ini. */}
        <View style={styles.totalBlock}>
          <Text style={styles.boxLabel}>Total Tagihan</Text>
          <Text style={[styles.total, short && styles.totalShort]}>
            {formatRupiah(tagihan)}
          </Text>
        </View>

        {/* Kotak kembalian baru ada begitu nominalnya ditentukan. Kotak berbatas
            tebal berisi tanda hubung hanya menyita ruang paling berharga di
            layar ini untuk memberitahu bahwa belum ada yang terjadi.

            Uang kurang punya kotaknya sendiri, bukan kembalian bernilai nol:
            kasir perlu tahu berapa lagi yang harus diminta, dan "Rp 0" tidak
            menjawab itu. Labelnya ikut berganti supaya angka bertanda minus
            tidak terbaca sebagai kembalian. */}
        {channel === "cash" && hasAmount ? (
          <View style={[styles.changeBox, styles[`${tone}Box`]]}>
            <Text style={styles.boxLabel}>
              {tone === "short" ? "Kurang" : "Kembalian"}
            </Text>
            <Text style={[styles.change, styles[`${tone}Text`]]}>
              {change < 0
                ? `− ${formatRupiah(-change)}`
                : formatRupiah(change)}
            </Text>
          </View>
        ) : null}

        <View style={styles.methodRow}>
          {(
            [
              ["taxable", "Pajak"],
              ["exempt", "Bebas Pajak"],
            ] as const
          ).map(([option, label]) => (
            <Button
              key={option}
              label={label}
              disabled={submitting}
              style={[
                styles.methodButton,
                taxStatus === option && styles.taxActive,
              ]}
              onPress={() => setTaxStatus(option)}
            />
          ))}
        </View>

        {/* Kanal bayar sebagai tab, bukan tombol sebesar yang lain: ia
            menentukan APA yang muncul di bawahnya, dan sesuatu yang mengubah
            isi layar tidak boleh terlihat sama beratnya dengan sesuatu yang
            memasukkan angka. */}
        <View style={styles.tabRow}>
          {(
            [
              ["cash", "Cash"],
              ["transfer", "Transfer"],
            ] as const
          ).map(([option, label]) => (
            <Pressable
              key={option}
              accessibilityRole="tab"
              accessibilityState={{ selected: channel === option }}
              disabled={submitting}
              onPress={() => {
                setChannel(option);
                // Nominal tunai dibuang saat pindah ke transfer. Kalau tidak,
                // kembali ke Cash memunculkan kotak kembalian berisi angka dari
                // keputusan yang sudah ditinggalkan.
                if (option === "transfer") {
                  setCash(null);
                  setManualOpen(false);
                } else {
                  setTransferKind(null);
                }
              }}
              style={styles.tab}>
              <Text
                style={[
                  styles.tabLabel,
                  channel === option && styles.tabLabelActive,
                ]}>
                {label}
              </Text>
              <View
                style={[
                  styles.tabUnderline,
                  channel === option && styles.tabUnderlineActive,
                ]}
              />
            </Pressable>
          ))}
        </View>

        {channel === "cash" ? (
          <View style={styles.cashBlock}>
            {/* Selebar penuh di atas grid, bukan kotak kelima seukuran yang
                lain: ia bukan nominal tetap, ia jalan masuk untuk angka apa pun.
                Bentuk yang berbeda menyampaikan itu tanpa satu kata pun. */}
            {manualOpen ? (
              <TextInput
                value={cash?.kind === "manual" ? cash.text : ""}
                onChangeText={(text) =>
                  setCash({ kind: "manual", text: text.replace(/[^0-9]/g, "") })
                }
                keyboardType="number-pad"
                placeholder="Ketik nominal diterima"
                placeholderTextColor={semantic.textSecondary}
                style={styles.input}
                editable={!submitting}
                autoFocus
              />
            ) : (
              <Button
                label="Nominal Manual"
                disabled={submitting}
                labelStyle={styles.manualLabel}
                onPress={bukaManual}
              />
            )}

            <View style={styles.grid}>
              <Button
                label="Uang Pas"
                disabled={submitting}
                style={[
                  styles.gridCell,
                  cash?.kind === "exact" && styles.cashActive,
                ]}
                onPress={() => pilihTunai({ kind: "exact" })}
              />
              {NOMINAL_CEPAT.map((value) => (
                <Button
                  key={value}
                  label={formatRupiah(value)}
                  disabled={submitting}
                  style={[
                    styles.gridCell,
                    cash?.kind === "fixed" &&
                      cash.value === value &&
                      styles.cashActive,
                  ]}
                  onPress={() => pilihTunai({ kind: "fixed", value })}
                />
              ))}
            </View>
          </View>
        ) : (
          <View style={styles.methodRow}>
            {(
              [
                ["qris", "QRIS"],
                ["card", "Debit/Credit Card"],
              ] as const
            ).map(([option, label]) => (
              <Button
                key={option}
                label={label}
                disabled={submitting}
                style={[
                  styles.methodButton,
                  transferKind === option && styles.cashActive,
                ]}
                // CATATAN: pilihan ini TIDAK disimpan ke mana pun — tidak ke
                // SQLite, tidak ke Postgres, tidak ke struk. Keduanya mengirim
                // `non_cash` yang sama persis. Membedakan kanal sungguhan
                // menuntut kolom baru di orders/payments dan migrasi di kedua
                // basis data (TO_DO.md, "Kanal bayar berhenti di Tunai/Non
                // Tunai"), dan itu sengaja belum dikerjakan. Jangan memakai
                // tombol ini sebagai sumber data laporan: begitu halaman ini
                // ditutup, jawabannya hilang.
                onPress={() => setTransferKind(option)}
              />
            ))}
          </View>
        )}

        {payError ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText} accessibilityRole="alert">
              {payError}
            </Text>
          </View>
        ) : null}
      </ScrollView>

      {/* Panel, bukan modal. Modal menutupi tombol konfirmasi — persoalan yang
          sama yang sudah diselesaikan dengan menjadikan pelunasan halaman
          penuh, dan tidak ada gunanya memasukkannya kembali lewat pintu lain.

          Gunanya verifikasi tepat sebelum konfirmasi, terutama untuk order yang
          pernah di-void atau diedit. Karena itu ia duduk sedekat mungkin dengan
          tombolnya, bukan di atas halaman. */}
      {detailOpen ? (
        <View style={styles.detailPanel}>
          <ScrollView contentContainerStyle={styles.detailContent}>
            {order.items.map((item) => (
              <View key={item.id} style={styles.detailRow}>
                <Text style={styles.detailName} numberOfLines={2}>
                  {item.quantity}× {item.product_name}
                </Text>
                <Text style={styles.detailValue}>
                  {formatRupiah(item.subtotal)}
                </Text>
              </View>
            ))}

            <View style={styles.detailDivider} />

            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Subtotal</Text>
              <Text style={styles.detailValue}>{formatRupiah(subtotal)}</Text>
            </View>
            {taxStatus === "taxable" ? (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>{labelPbjt(rateBps)}</Text>
                <Text style={styles.detailValue}>{formatRupiah(tax)}</Text>
              </View>
            ) : null}
            <View style={styles.detailRow}>
              <Text style={styles.detailLabelStrong}>Total</Text>
              <Text style={styles.detailLabelStrong}>
                {formatRupiah(tagihan)}
              </Text>
            </View>
          </ScrollView>
        </View>
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          detailOpen ? "Tutup detail order" : "Lihat detail order"
        }
        accessibilityState={{ expanded: detailOpen }}
        onPress={() => setDetailOpen((open) => !open)}
        style={styles.chevronRow}>
        <View style={styles.chevronBadge}>
          <ChevronIcon
            size={16}
            color={colors.neutral[0]}
            direction={detailOpen ? "down" : "up"}
          />
        </View>
      </Pressable>

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
  // Ponsel yang diputar mendatar menyisakan ~375dp ke bawah, dan halaman ini
  // punya batang kepala serta kaki bertombol besar. Yang dirapatkan jaraknya,
  // bukan isinya — tidak ada satu pun elemen yang hilang di viewport pendek.
  contentShort: {
    padding: spacing.md,
    gap: spacing.md,
  },
  footer: {
    padding: spacing.md,
    borderTopWidth: 1,
    borderTopColor: semantic.border,
    backgroundColor: semantic.surface,
  },
  totalBlock: {
    alignItems: "center",
  },
  boxLabel: {
    ...textStyles.caption,
    color: semantic.textSecondary,
  },
  total: {
    ...textStyles.grandTotal,
    color: semantic.textPrimary,
  },
  totalShort: {
    ...textStyles.screenTitle,
  },
  methodRow: {
    flexDirection: "row",
    gap: spacing.md,
  },
  methodButton: {
    flex: 1,
  },
  // Netral gelap, bukan biru. DESIGN.md menyimpan biru untuk aksi utama, dan di
  // halaman ini aksi utamanya "Konfirmasi Lunas". Status pajak adalah pilihan,
  // bukan tombol yang dituju kasir — kalau ikut biru, mata tidak bisa
  // membedakan "ini tombol" dari "ini status" dalam sekali lihat.
  taxActive: {
    borderColor: semantic.sidebarActive,
    backgroundColor: semantic.surfaceMuted,
  },
  // Sama alasannya dengan taxActive, dan sengaja dibedakan namanya: yang satu
  // menandai status, yang satu menandai nominal terpilih. Keduanya kebetulan
  // terlihat sama sekarang; menyatukannya akan membuat perubahan pada salah
  // satunya diam-diam ikut mengubah yang lain.
  cashActive: {
    borderColor: semantic.sidebarActive,
    backgroundColor: semantic.surfaceMuted,
  },
  tabRow: {
    flexDirection: "row",
    gap: spacing.xl,
  },
  tab: {
    alignItems: "center",
    gap: spacing.xs,
    paddingVertical: spacing.xs,
    // Tabnya kecil secara visual, tapi sasaran sentuhnya tidak boleh ikut
    // kecil — DESIGN.md menuntut jari, bukan kursor.
    minHeight: touchTarget.min,
    minWidth: touchTarget.comfortable,
    justifyContent: "center",
  },
  tabLabel: {
    ...textStyles.bodyStrong,
    color: semantic.textSecondary,
  },
  tabLabelActive: {
    color: semantic.textPrimary,
  },
  tabUnderline: {
    height: 2,
    alignSelf: "stretch",
    borderRadius: radius.sm,
    backgroundColor: "transparent",
  },
  tabUnderlineActive: {
    backgroundColor: colors.primary[600],
  },
  cashBlock: {
    gap: spacing.md,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
  },
  // Dua kolom lewat basis 45% + flexGrow, bukan lebar tetap: jarak antar sel
  // ikut spacing token dan gridnya tetap dua kolom di lebar ponsel mana pun.
  gridCell: {
    flexGrow: 1,
    flexBasis: "45%",
  },
  manualLabel: {
    color: semantic.textSecondary,
  },
  input: {
    ...textStyles.actionButton,
    minHeight: touchTarget.comfortable,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: semantic.sidebarActive,
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
  // Tidak pernah terpakai selama kotaknya cuma muncul saat nominal sudah ada,
  // tapi `tone` masih bisa bernilai "neutral" dan gaya yang hilang membuat
  // React Native diam saja sambil merender kotak tanpa batas sama sekali.
  neutralBox: {
    borderColor: semantic.border,
    backgroundColor: semantic.surfaceMuted,
  },
  neutralText: {
    color: semantic.textSecondary,
  },
  detailPanel: {
    // Dibatasi supaya panel yang panjang tidak mendorong tombol konfirmasi ke
    // luar layar — order dengan dua puluh item tetap menyisakan tombolnya.
    maxHeight: 260,
    borderTopWidth: 1,
    borderTopColor: semantic.border,
    backgroundColor: semantic.surface,
  },
  detailContent: {
    padding: spacing.md,
    gap: spacing.xs,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  detailName: {
    ...textStyles.caption,
    flex: 1,
    color: semantic.textPrimary,
  },
  detailLabel: {
    ...textStyles.body,
    color: semantic.textSecondary,
  },
  detailLabelStrong: {
    ...textStyles.bodyStrong,
    color: semantic.textPrimary,
  },
  detailValue: {
    ...textStyles.caption,
    color: semantic.textSecondary,
  },
  detailDivider: {
    height: 1,
    marginVertical: spacing.sm,
    backgroundColor: semantic.border,
  },
  chevronRow: {
    alignItems: "center",
    paddingVertical: spacing.sm,
  },
  chevronBadge: {
    width: touchTarget.min,
    height: touchTarget.min,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primary[600],
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
