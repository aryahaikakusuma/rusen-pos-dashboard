import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { useSQLiteContext } from "expo-sqlite";
import * as Updates from "expo-updates";

import Button from "../components/Button";
import KasSheet from "../components/KasSheet";
import ModalAwalGate from "../components/ModalAwalGate";
import PrinterSheet from "../components/PrinterSheet";
import Sheet from "../components/Sheet";
import ToastProvider, { useToast } from "../components/Toast";
import TutupKasirSheet from "../components/TutupKasirSheet";
import {
  cashTotals,
  recordCashMovement,
  shiftCashMovements,
  voidCashMovement,
  type CashMovement,
  type CashTotals,
} from "../db/cash";
import { pushPending } from "../db/push";
import {
  closeShift,
  currentShift,
  openShift,
  shiftTotals,
  type OpenShift,
  type ShiftTotals,
} from "../db/shift";
import { useAuth } from "../lib/auth-context";
import { printShiftReport, translatePrinterError } from "../lib/printer";
import { kasSeharusnya, type ShiftReport } from "../lib/receipt";
import { useShortViewport } from "../lib/use-layout-mode";
import {
  colors,
  semantic,
  spacing,
  textStyles,
  touchTarget,
} from "../theme";
import CashierScreen from "./CashierScreen";
import DebugScreen from "./DebugScreen";
import EditOrderScreen from "./EditOrderScreen";
import OrdersScreen from "./OrdersScreen";

type Tab = "cashier" | "orders";

/**
 * Dua layar saja, jadi navigasinya cukup sebuah state. expo-router sengaja
 * belum dipasang: routing berbasis berkas baru sepadan kalau layarnya banyak
 * atau butuh tautan dalam, dan keduanya belum berlaku di sini.
 */
export default function AppShell() {
  return (
    <ToastProvider>
      <Shell />
    </ToastProvider>
  );
}

function Shell() {
  const db = useSQLiteContext();
  const { session, logout } = useAuth();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("cashier");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [debug, setDebug] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [printerOpen, setPrinterOpen] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);
  const [pembaruan, setPembaruan] = useState<string | null>(null);
  const [memeriksaPembaruan, setMemeriksaPembaruan] = useState(false);

  // Sif kasir. `undefined` = belum dimuat dari SQLite, `null` = tidak ada sif
  // terbuka (gerbang Modal Awal harus tampil), objek = sif sedang berjalan.
  const [shift, setShift] = useState<OpenShift | null | undefined>(undefined);
  const [openingShift, setOpeningShift] = useState(false);
  const [tutupKasirOpen, setTutupKasirOpen] = useState(false);
  const [tutupKasirTotals, setTutupKasirTotals] = useState<ShiftTotals | null>(null);
  // Rincian kas untuk kertas, diambil pada MOMEN YANG SAMA dengan
  // tutupKasirTotals di atas — bukan dibaca ulang saat mencetak, dan bukan
  // diambil dari kasEntries (yang masih kosong kalau lembar Kas belum pernah
  // dibuka sesi ini, sehingga kertas akan memuat total tanpa rinciannya).
  // Rincian dan total yang berasal dari dua momen berbeda bisa mencetak baris
  // yang tidak terhitung di totalnya, dan tidak ada yang akan menyadarinya.
  const [tutupKasirGerakan, setTutupKasirGerakan] = useState<CashMovement[]>([]);
  const [printingShift, setPrintingShift] = useState(false);

  // Kas non-penjualan sif berjalan. Entri dan totalnya dimuat bersama dan
  // dimuat ulang bersama, supaya daftar di layar tidak pernah menunjukkan
  // entri yang belum ikut dihitung di totalnya.
  const [kasOpen, setKasOpen] = useState(false);
  const [kasEntries, setKasEntries] = useState<CashMovement[]>([]);
  const [kasTotals, setKasTotals] = useState<CashTotals | null>(null);
  const [savingKas, setSavingKas] = useState(false);

  // Lapisan penutup diposisikan absolut, dan posisi absolut di Yoga diukur
  // dari tepi induk — bukan dari dalam sisa aman yang sudah disisakan
  // SafeAreaView. Jadi jaraknya harus dipasang sendiri di sini.
  const insets = useSafeAreaInsets();
  const short = useShortViewport();

  const isOwner = session?.role === "owner";

  const bumpOrders = useCallback(() => {
    setRefreshToken((n) => n + 1);
  }, []);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    currentShift(db).then((found) => {
      if (!cancelled) setShift(found);
    });
    return () => {
      cancelled = true;
    };
  }, [db, session]);

  const handleOpenShift = async (modalAwal: number) => {
    if (!session) return;
    setOpeningShift(true);
    try {
      await openShift(db, {
        employeeId: session.employeeId,
        employeeName: session.name,
        modalAwal,
      });
      setShift(await currentShift(db));
    } finally {
      setOpeningShift(false);
    }
  };

  const openTutupKasir = async () => {
    if (!shift) return;
    setMenuOpen(false);
    const [totals, gerakan] = await Promise.all([
      shiftTotals(db, shift),
      shiftCashMovements(db, shift.id),
    ]);
    setTutupKasirTotals(totals);
    setTutupKasirGerakan(gerakan);
    setTutupKasirOpen(true);
  };

  // Menu hanya bisa dibuka sesudah gerbang ModalAwalGate dilewati, jadi
  // `shift` pasti ada di sini — tidak perlu penjagaan "belum ada sif".
  const muatKas = async (shiftId: string) => {
    const [entries, totals] = await Promise.all([
      shiftCashMovements(db, shiftId),
      cashTotals(db, shiftId),
    ]);
    setKasEntries(entries);
    setKasTotals(totals);
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

  const openKas = async () => {
    if (!shift) return;
    setMenuOpen(false);
    await muatKas(shift.id);
    setKasOpen(true);
  };

  const simpanKas = async (params: {
    direction: CashMovement["direction"];
    method: CashMovement["method"];
    amount: number;
    note: string;
  }): Promise<boolean> => {
    if (!shift || !session) return false;
    setSavingKas(true);
    try {
      await recordCashMovement(db, {
        shiftId: shift.id,
        ...params,
        employeeId: session.employeeId,
        employeeName: session.name,
      });
      await muatKas(shift.id);
      return true;
    } catch (caught) {
      // recordCashMovement melempar kalimat berbahasa Indonesia yang memang
      // ditujukan ke kasir, jadi diteruskan apa adanya.
      toast.error(caught instanceof Error ? caught.message : String(caught));
      return false;
    } finally {
      setSavingKas(false);
    }
  };

  const batalkanKas = async (id: string) => {
    if (!shift) return;
    setSavingKas(true);
    try {
      await voidCashMovement(db, id);
      await muatKas(shift.id);
    } finally {
      setSavingKas(false);
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
      // Kas sif berikutnya mulai dari nol; sisa state lembar Kas milik sif
      // yang baru saja ditutup tidak boleh terbawa.
      setKasEntries([]);
      setKasTotals(null);
      setShift(null); // gerbang Modal Awal tampil lagi untuk sif berikutnya
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

  // Gerbang wajib: tidak ada apa pun yang bisa dilayani sebelum Modal Awal
  // diisi. Muncul sesudah login pertama, dan lagi sesudah Tutup Kasir
  // berhasil dicetak (shift di-reset ke null di printTutupKasir). `undefined`
  // (belum selesai dibaca dari SQLite) sengaja tidak menampilkan apa pun,
  // supaya gerbang tidak berkedip sekilas untuk kasir yang sifnya sudah ada.
  if (session && shift === null) {
    return (
      <SafeAreaView style={styles.root} edges={["top", "bottom"]}>
        <ModalAwalGate
          cashierName={session.name}
          saving={openingShift}
          onOpen={handleOpenShift}
        />
      </SafeAreaView>
    );
  }

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
          onSaved={() => {
            bumpOrders();
            setTab("orders");
          }}
        />
      </View>
      <View style={[styles.content, tab !== "orders" && styles.hidden]}>
        <OrdersScreen
          refreshToken={refreshToken}
          onEdit={setEditingId}
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
            <Button
              // Layar yang sama, isi berbeda menurut peran: owner dapat alat
              // uji, peran lain hanya penarikan katalog. Labelnya ikut
              // menyesuaikan — tombol "Uji" yang membuka layar berjudul
              // "Katalog" membingungkan.
              label={isOwner ? "Uji" : "Katalog"}
              onPress={() => {
                setMenuOpen(false);
                setDebug(true);
              }}
            />
            {/* Versinya ditampilkan tanpa ditekan apa pun. Yang mau dijawab
                adalah "ponsel ini menerima rilis atau tidak", dan jawaban yang
                harus dicari dulu tidak akan pernah dibaca oleh orang yang
                sedang jaga. Saluran selain `production` berarti APK-nya
                dibangun dengan profil yang salah: ia tidak error, ia hanya
                diam di versi lama selamanya. */}
            <Button
              label="Periksa Pembaruan"
              disabled={memeriksaPembaruan}
              onPress={() => void periksaPembaruan()}
            />
            <Text style={styles.versiBaris}>
              Saluran: {Updates.channel ?? "—"} · runtime{" "}
              {Updates.runtimeVersion ?? "—"}
            </Text>
            <Text style={styles.versiBaris}>{describeBundle()}</Text>
            {pembaruan ? (
              <Text style={styles.versiBaris}>{pembaruan}</Text>
            ) : null}

            {/* Dipilih sekali lalu tersimpan, jadi tempatnya memang di menu
                yang jarang dibuka — bukan di layar kasir. */}
            <Button
              label="Printer"
              onPress={() => {
                setMenuOpen(false);
                setPrinterOpen(true);
              }}
            />
            {/* Tidak dibatasi isOwner: yang membeli gas dan es batu dengan
                uang laci adalah kasir yang sedang jaga, dan mencatatnya
                harus semudah membelinya. */}
            <Button
              label="Kas Masuk / Keluar"
              onPress={() => void openKas()}
            />
            <Button label="Tutup Kasir" onPress={() => void openTutupKasir()} />
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

      {kasOpen && shift && kasTotals ? (
        <KasSheet
          entries={kasEntries}
          totals={kasTotals}
          saving={savingKas}
          onClose={() => setKasOpen(false)}
          onSimpan={simpanKas}
          onBatalkan={(id) => void batalkanKas(id)}
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

      {/* Layar uji dan layar ubah order menutupi, bukan menggantikan. Dulu
          keduanya `return` lebih awal sehingga seluruh isi tab ikut
          di-unmount: menekan "Ubah" pada satu order lalu kembali juga
          mengosongkan keranjang yang sedang diisi. */}
      {editingId ? (
        <View
          style={[
            styles.overlay,
            {
              paddingTop: insets.top + (short ? 0 : spacing.lg),
              paddingBottom: insets.bottom,
            },
          ]}>
          <EditOrderScreen
            orderId={editingId}
            onClose={() => {
              setEditingId(null);
              bumpOrders();
            }}
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
  versiBaris: { ...textStyles.caption, color: semantic.textSecondary },
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
