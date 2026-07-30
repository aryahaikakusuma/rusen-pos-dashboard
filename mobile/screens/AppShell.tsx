import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { useSQLiteContext } from "expo-sqlite";

import Button from "../components/Button";
import Sheet from "../components/Sheet";
import ToastProvider from "../components/Toast";
import { pushPending } from "../db/push";
import { useAuth } from "../lib/auth-context";
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
  const [tab, setTab] = useState<Tab>("cashier");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [debug, setDebug] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);
  // Lapisan penutup diposisikan absolut, dan posisi absolut di Yoga diukur
  // dari tepi induk — bukan dari dalam sisa aman yang sudah disisakan
  // SafeAreaView. Jadi jaraknya harus dipasang sendiri di sini.
  const insets = useSafeAreaInsets();
  const short = useShortViewport();

  const isOwner = session?.role === "owner";

  const bumpOrders = useCallback(() => {
    setRefreshToken((n) => n + 1);
  }, []);

  // Satu percobaan kirim saat aplikasi dibuka dengan sesi aktif. Bukan pemantau
  // koneksi — hanya memanfaatkan momen yang sudah pasti terjadi. Gagal berarti
  // diam: badge di tab Order yang memberi tahu masih ada yang tertunda.
  useEffect(() => {
    if (!session) return;
    pushPending(db)
      .then(bumpOrders)
      .catch(() => {});
  }, [db, session, bumpOrders]);

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

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: semantic.surface,
  },
  menu: {
    gap: spacing.sm,
    padding: spacing.lg,
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
