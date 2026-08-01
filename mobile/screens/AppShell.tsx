import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import * as Updates from "expo-updates";

import Button from "../components/Button";
import ModalAwalSheet from "../components/ModalAwalSheet";
import ModeUjiSheet from "../components/ModeUjiSheet";
import PrinterSheet from "../components/PrinterSheet";
import Sheet from "../components/Sheet";
import { useToast } from "../components/Toast";
import TutupKasirConfirm from "../components/TutupKasirConfirm";
import TutupKasirSheet from "../components/TutupKasirSheet";
import { shiftCashMovements, type CashMovement } from "../db/cash";
import { pushPending } from "../db/push";
import { useCart } from "../lib/cart-context";
import { closeShift, shiftTotals, type ShiftTotals } from "../db/shift";
import { useAuth } from "../lib/auth-context";
import { printShiftReport, translatePrinterError } from "../lib/printer";
import { kasSeharusnya, type ShiftReport } from "../lib/receipt";
import { useGateShift, useShift } from "../lib/shift-context";
import { useShortViewport } from "../lib/use-layout-mode";
import {
  colors,
  radius,
  semantic,
  spacing,
  textStyles,
  touchTarget,
} from "../theme";
import CashierScreen from "./CashierScreen";
import DebugScreen from "./DebugScreen";
import OrdersScreen from "./OrdersScreen";
import PengaturanScreen from "./PengaturanScreen";

type Tab = "cashier" | "orders";

/**
 * Pemilih tab Kasir/Order. ToastProvider, ShiftProvider, dan CartProvider tidak
 * lagi dipasang di sini melainkan di app/_layout.tsx — halaman keranjang,
 * pelunasan, dan kas adalah rute sebelah layar ini, bukan anaknya, dan provider
 * yang tinggal di sini tidak akan terbaca dari sana.
 */
export default function AppShell() {
  const db = useSQLiteContext();
  const { session, logout } = useAuth();
  const toast = useToast();
  const { shift, aktif, membuka, mulai, tandaiTutup } = useShift();
  const gateShift = useGateShift();
  const router = useRouter();
  // Mode uji, katalog, dan penanda "order baru tersimpan" dimiliki CartProvider
  // (lib/cart-context.tsx) — halaman keranjang membacanya juga, dan dua salinan
  // akan menyimpang.
  const { testMode: modeUji, setTestMode: setModeUji, savedTick } = useCart();
  const [tab, setTab] = useState<Tab>("cashier");
  const [debug, setDebug] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [pengaturanOpen, setPengaturanOpen] = useState(false);
  const [printerOpen, setPrinterOpen] = useState(false);
  const [modeUjiOpen, setModeUjiOpen] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);
  const [pembaruan, setPembaruan] = useState<string | null>(null);
  const [memeriksaPembaruan, setMemeriksaPembaruan] = useState(false);

  // Sif kasir dimiliki ShiftProvider (lib/shift-context.tsx) — layar lain juga
  // membacanya untuk mematikan aksi tulisnya, dan dua salinan state akan
  // menyimpang. Yang tinggal di sini hanya lembar-lembarnya.
  const [modalAwalOpen, setModalAwalOpen] = useState(false);
  const [tutupKasirConfirm, setTutupKasirConfirm] = useState(false);
  const [tutupKasirOpen, setTutupKasirOpen] = useState(false);
  const [tutupKasirTotals, setTutupKasirTotals] = useState<ShiftTotals | null>(null);
  // Rincian kas untuk kertas, diambil pada MOMEN YANG SAMA dengan
  // tutupKasirTotals di atas, bukan dibaca ulang saat mencetak. Rincian dan
  // total yang berasal dari dua momen berbeda bisa mencetak baris yang tidak
  // terhitung di totalnya, dan tidak ada yang akan menyadarinya.
  const [tutupKasirGerakan, setTutupKasirGerakan] = useState<CashMovement[]>([]);
  const [printingShift, setPrintingShift] = useState(false);


  // Lapisan penutup diposisikan absolut, dan posisi absolut di Yoga diukur
  // dari tepi induk — bukan dari dalam sisa aman yang sudah disisakan
  // SafeAreaView. Jadi jaraknya harus dipasang sendiri di sini.
  const insets = useSafeAreaInsets();
  const short = useShortViewport();

  const isOwner = session?.role === "owner";

  const bumpOrders = useCallback(() => {
    setRefreshToken((n) => n + 1);
  }, []);

  // Sebuah order baru saja tersimpan dari halaman keranjang: segarkan daftar
  // order dan tunjukkan hasilnya. Dulu ini callback `onSaved` yang diturunkan
  // ke CashierScreen; sejak keranjang jadi rute sebelah, arah datanya dibalik —
  // provider menaikkan penanda, layar ini yang menyimak.
  useEffect(() => {
    if (savedTick === 0) return;
    bumpOrders();
    setTab("orders");
  }, [savedTick, bumpOrders]);

  const handleOpenShift = async (modalAwal: number) => {
    await mulai(modalAwal);
    setModalAwalOpen(false);
    toast.success("Sif dimulai. Semua fitur aktif.");
  };

  const openTutupKasir = async () => {
    if (!shift) return;
    setTutupKasirConfirm(false);
    const [totals, gerakan] = await Promise.all([
      shiftTotals(db, shift),
      shiftCashMovements(db, shift.id),
    ]);
    setTutupKasirTotals(totals);
    setTutupKasirGerakan(gerakan);
    setTutupKasirOpen(true);
  };

  /**
   * Memaksa pengecekan pembaruan saat itu juga, tanpa menunggu siklus
   * tutup-buka. Tempatnya di menu, bukan di layar Katalog: pertanyaan yang
   * dijawabnya — "ponsel ini menerima rilis atau tidak" — muncul saat seseorang
   * memegang HP yang mencurigakan, dan ia harus terjawab tanpa perlu tahu
   * layar mana yang menyembunyikannya.
   */
  const periksaPembaruan = async () => {
    setMemeriksaPembaruan(true);
    setPembaruan("Memeriksa server pembaruan…");
    try {
      const hasil = await Updates.checkForUpdateAsync();
      if (!hasil.isAvailable) {
        setPembaruan("Sudah versi terbaru untuk saluran ini.");
        return;
      }
      setPembaruan("Ada versi baru, mengunduh…");
      await Updates.fetchUpdateAsync();
      // Sengaja TIDAK memanggil reloadAsync. Kalau ini ditekan di tengah jam
      // ramai, memuat ulang paksa menutup layar kasir yang sedang dipakai.
      setPembaruan("Versi baru sudah diunduh. Tutup aplikasi lalu buka lagi.");
    } catch (error) {
      // Gagal memeriksa itu normal tanpa sinyal, dan bukan kerusakan: aplikasi
      // tetap jalan dengan bundel yang ada. Jadi dikatakan apa adanya.
      setPembaruan(`Tidak bisa memeriksa: ${(error as Error).message}`);
    } finally {
      setMemeriksaPembaruan(false);
    }
  };

  const printTutupKasir = async (kasFisik: number) => {
    if (!shift || !tutupKasirTotals) return;
    setPrintingShift(true);
    try {
      // Rincian dan total berasal dari satu potret yang diambil di
      // openTutupKasir — itu juga angka yang sudah dilihat dan disetujui kasir
      // di lembar sebelum ia menekan cetak. Membaca ulang di sini akan membuat
      // kertas berbeda dari yang ia setujui.
      const gerakanKas = tutupKasirGerakan;
      const kasHarus = kasSeharusnya({
        modalAwal: shift.modalAwal,
        tunai: tutupKasirTotals.tunai,
        refundTunai: tutupKasirTotals.refundTunai,
        kasMasukTunai: tutupKasirTotals.kasMasukTunai,
        kasKeluarTunai: tutupKasirTotals.kasKeluarTunai,
      });
      const selisih = kasFisik - kasHarus;

      const report: ShiftReport = {
        cashierName: shift.employeeName,
        openedAt: shift.openedAt,
        closedAt: new Date().toISOString(),
        modalAwal: shift.modalAwal,
        tunai: tutupKasirTotals.tunai,
        nonTunai: tutupKasirTotals.nonTunai,
        refund: tutupKasirTotals.refund,
        refundTunai: tutupKasirTotals.refundTunai,
        kasFisik,
        pajak: tutupKasirTotals.pajak,
        transaksiSelesai: tutupKasirTotals.transaksiSelesai,
        transaksiPending: tutupKasirTotals.transaksiPending,
        kasMasuk: gerakanKas
          .filter((gerakan) => gerakan.direction === "in")
          .map(({ note, method, amount }) => ({ note, method, amount })),
        kasKeluar: gerakanKas
          .filter((gerakan) => gerakan.direction === "out")
          .map(({ note, method, amount }) => ({ note, method, amount })),
        kasMasukTunai: tutupKasirTotals.kasMasukTunai,
        kasMasukNonTunai: tutupKasirTotals.kasMasukNonTunai,
        kasKeluarTunai: tutupKasirTotals.kasKeluarTunai,
        kasKeluarNonTunai: tutupKasirTotals.kasKeluarNonTunai,
      };
      // Cetak dulu, tutup sif SESUDAHNYA — kalau pencetakan gagal, sif tetap
      // terbuka dan kasir bisa mengulang tanpa kehilangan totalnya.
      await printShiftReport(db, report);
      await closeShift(db, shift.id, tutupKasirTotals, kasFisik, selisih);
      setTutupKasirOpen(false);
      setTutupKasirTotals(null);
      setTutupKasirGerakan([]);
      // Kas sif berikutnya mulai dari nol dengan sendirinya: halaman Kas
      // memuat entri dan totalnya dari `shift` tiap kali dibuka, jadi tidak ada
      // sisa milik sif yang baru saja ditutup untuk dibersihkan di sini.
      //
      // Kembali ke mode read-only sampai sif berikutnya dimulai.
      tandaiTutup();
      toast.success("Laporan Tutup Kasir tercetak.");
    } catch (caught) {
      toast.error(translatePrinterError(caught));
    } finally {
      setPrintingShift(false);
    }
  };

  // Satu percobaan kirim saat aplikasi dibuka dengan sesi aktif. Bukan pemantau
  // koneksi — hanya memanfaatkan momen yang sudah pasti terjadi. Gagal berarti
  // diam: badge di tab Order yang memberi tahu masih ada yang tertunda.
  useEffect(() => {
    if (!session) return;
    pushPending(db)
      .then(bumpOrders)
      .catch(() => {});
  }, [db, session, bumpOrders]);

  // Tidak ada lagi gerbang penuh layar sebelum Modal Awal diisi. Melihat
  // katalog dan riwayat order tidak memindahkan uang, jadi ia tidak butuh sif;
  // yang ditahan hanya aksi tulis, lewat useGateShift di tiap layar, dan
  // ShiftBanner yang menjelaskan kenapa.

  return (
    <SafeAreaView style={styles.root} edges={["top", "bottom"]}>
      {/* Kedua layar tetap terpasang, yang tidak aktif hanya disembunyikan.
          Dirender bercabang, pindah tab me-unmount layar kasir dan keranjang
          yang sedang diisi ikut terbuang — kasir kehilangan pesanan yang
          belum disimpan hanya karena menengok daftar order. Efek sampingnya
          menguntungkan: katalog 293 produk tidak ditarik ulang tiap kali
          kembali, dan posisi gulir grid tetap. */}
      <View style={[styles.content, tab !== "cashier" && styles.hidden]}>
        <CashierScreen
          refreshToken={refreshToken}
          onOpenMenu={() => setMenuOpen(true)}
        />
      </View>
      <View style={[styles.content, tab !== "orders" && styles.hidden]}>
        <OrdersScreen
          refreshToken={refreshToken}
          onEdit={(id) => router.push({ pathname: "/edit-order/[id]", params: { id } })}
          onOpenMenu={() => setMenuOpen(true)}
        />
      </View>

      <View style={styles.tabs}>
        <TabButton
          label="Kasir"
          short={short}
          active={tab === "cashier"}
          onPress={() => setTab("cashier")}
        />
        <TabButton
          label="Order"
          short={short}
          active={tab === "orders"}
          onPress={() => {
            bumpOrders();
            setTab("orders");
          }}
        />
      </View>

      {/* Batang kepala tetap dibongkar jadi lembar menu. Isinya — nama kasir,
          Katalog/Uji, Keluar — dibaca sekali di awal sif lalu tidak disentuh
          lagi, sementara barisnya memakan ~44dp sepanjang hari. Yang dipakai
          terus-menerus adalah grid produk. */}
      {menuOpen ? (
        <Sheet
          title={session?.name ?? "Menu"}
          subtitle={session?.role}
          onClose={() => setMenuOpen(false)}>
          <View style={styles.menu}>
            {/* Tidak dibatasi isOwner: yang membeli gas dan es batu dengan
                uang laci adalah kasir yang sedang jaga, dan mencatatnya
                harus semudah membelinya. */}
            <Button
              label="Kas Masuk Keluar"
              onPress={() => {
                setMenuOpen(false);
                router.push("/kas");
              }}
            />

            {/* Gear di KIRI tombol sif, dengan jarak yang cukup: keduanya
                berdampingan, tapi satu membuka layar yang jarang disentuh dan
                satu lagi menutup kasir. Ketukan yang meleset di antara mereka
                mahal, jadi jaraknya spacing.lg, bukan spacing.sm seperti
                tombol menu lain. */}
            <View style={styles.shiftRow}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Pengaturan"
                onPress={() => {
                  setMenuOpen(false);
                  setPengaturanOpen(true);
                }}
                style={({ pressed }) => [
                  styles.gear,
                  pressed && styles.gearPressed,
                ]}>
                <Text style={styles.gearGlyph}>⚙</Text>
              </Pressable>

              {/* Satu tombol yang berganti peran, bukan dua tombol yang salah
                  satunya selalu tidak berlaku. Keadaan sif hanya punya dua
                  wajah, dan tombol mati yang menetap di menu justru akan
                  ditekan. */}
              {aktif ? (
                <Button
                  label="Tutup Kasir"
                  style={styles.shiftButton}
                  onPress={() => {
                    setMenuOpen(false);
                    setTutupKasirConfirm(true);
                  }}
                />
              ) : (
                <Button
                  label="Mulai Shift"
                  variant="primary"
                  style={styles.shiftButton}
                  onPress={() => {
                    setMenuOpen(false);
                    setModalAwalOpen(true);
                  }}
                />
              )}
            </View>

            <Button
              label="Keluar"
              variant="danger"
              onPress={() => {
                setMenuOpen(false);
                logout();
              }}
            />
          </View>
        </Sheet>
      ) : null}

      {printerOpen ? <PrinterSheet onClose={() => setPrinterOpen(false)} /> : null}

      {modalAwalOpen && session ? (
        <ModalAwalSheet
          cashierName={session.name}
          saving={membuka}
          onOpen={(modalAwal) => void handleOpenShift(modalAwal)}
          onCancel={() => setModalAwalOpen(false)}
        />
      ) : null}

      {tutupKasirConfirm && shift ? (
        <TutupKasirConfirm
          shift={shift}
          onConfirm={() => void openTutupKasir()}
          onCancel={() => setTutupKasirConfirm(false)}
        />
      ) : null}

      {modeUjiOpen ? (
        <ModeUjiSheet
          onCancel={() => setModeUjiOpen(false)}
          onConfirm={(reason) => {
            setModeUji({ reason });
            setModeUjiOpen(false);
            setTab("cashier");
          }}
        />
      ) : null}

      {tutupKasirOpen && shift && tutupKasirTotals ? (
        <TutupKasirSheet
          shift={shift}
          totals={tutupKasirTotals}
          differentCashier={
            session && shift.employeeId !== session.employeeId ? shift.employeeName : null
          }
          printing={printingShift}
          onClose={() => setTutupKasirOpen(false)}
          onPrint={(kasFisik) => void printTutupKasir(kasFisik)}
        />
      ) : null}

      {/* Layar Katalog/Uji menutupi, bukan menggantikan. Dulu ia `return`
          lebih awal sehingga seluruh isi tab ikut di-unmount, dan keranjang
          yang sedang diisi ikut terbuang. Layar ubah order tidak lagi di sini —
          ia rute app/edit-order/[id].tsx. */}
      {pengaturanOpen ? (
        <View
          style={[
            styles.overlay,
            {
              paddingTop: insets.top + (short ? 0 : spacing.lg),
              paddingBottom: insets.bottom,
            },
          ]}>
          <PengaturanScreen
            isOwner={isOwner}
            modeUjiMenyala={modeUji !== null}
            saluran={`${Updates.channel ?? "—"} · runtime ${
              Updates.runtimeVersion ?? "—"
            }`}
            bundel={describeBundle()}
            pembaruan={pembaruan}
            memeriksaPembaruan={memeriksaPembaruan}
            onKatalog={() => {
              setPengaturanOpen(false);
              setDebug(true);
            }}
            onModeUji={() => {
              setPengaturanOpen(false);
              setModeUjiOpen(true);
            }}
            onMatikanModeUji={() => {
              setPengaturanOpen(false);
              setModeUji(null);
              toast.success("Mode uji dimatikan.");
            }}
            onPeriksaPembaruan={() => void periksaPembaruan()}
            onPrinter={() => {
              setPengaturanOpen(false);
              setPrinterOpen(true);
            }}
            onClose={() => setPengaturanOpen(false)}
          />
        </View>
      ) : null}

      {debug ? (
        <View
          style={[
            styles.overlay,
            {
              paddingTop: insets.top + (short ? 0 : spacing.lg),
              paddingBottom: insets.bottom,
            },
          ]}>
          <DebugScreen
            onClose={() => {
              setDebug(false);
              bumpOrders();
            }}
          />
        </View>
      ) : null}
    </SafeAreaView>
  );
}

function TabButton({
  label,
  active,
  short,
  onPress,
}: {
  label: string;
  active: boolean;
  short: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.tab,
        short && styles.tabShort,
        active && styles.tabActive,
        pressed && styles.tabPressed,
      ]}>
      <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * Membedakan "belum pernah menerima update" dari "sudah pakai bundel kiriman".
 * Perbedaan itu yang menjawab pertanyaannya: ponsel yang salah saluran akan
 * selamanya berbunyi "bawaan APK" walau rilis sudah berkali-kali dipublikasikan.
 */
function describeBundle() {
  if (Updates.isEmbeddedLaunch || !Updates.updateId) {
    return "Bundel: bawaan APK, belum pernah menerima pembaruan.";
  }
  const kapan = Updates.createdAt
    ? Updates.createdAt.toLocaleString("id-ID")
    : "waktu tidak tercatat";
  return `Bundel: ${Updates.updateId.slice(0, 8)} · ${kapan}`;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: semantic.surface,
  },
  menu: {
    gap: spacing.sm,
    padding: spacing.lg,
  },
  shiftRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.lg,
  },
  gear: {
    width: touchTarget.primaryAction,
    height: touchTarget.primaryAction,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: semantic.border,
    borderRadius: radius.md,
    backgroundColor: semantic.surface,
  },
  gearPressed: {
    backgroundColor: semantic.surfaceMuted,
  },
  gearGlyph: {
    ...textStyles.actionButton,
    color: semantic.textPrimary,
  },
  shiftButton: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
  hidden: {
    display: "none",
  },
  overlay: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: semantic.surface,
  },
  tabs: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: semantic.border,
  },
  tab: {
    flex: 1,
    minHeight: touchTarget.comfortable,
    alignItems: "center",
    justifyContent: "center",
    borderTopWidth: 3,
    borderTopColor: "transparent",
  },
  // Turun ke ambang sentuh 48dp, bukan di bawahnya: yang dikorbankan hanya
  // kelonggaran, bukan kemampuan jari menyasar tombol.
  tabShort: {
    minHeight: touchTarget.min,
  },
  tabActive: {
    borderTopColor: colors.primary[600],
  },
  tabPressed: {
    backgroundColor: semantic.surfaceMuted,
  },
  tabLabel: {
    ...textStyles.bodyStrong,
    color: semantic.textSecondary,
  },
  tabLabelActive: {
    color: colors.primary[600],
  },
});
