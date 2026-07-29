import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSQLiteContext } from "expo-sqlite";

import ToastProvider from "../components/Toast";
import { pushPending } from "../db/push";
import { useAuth } from "../lib/auth-context";
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
  const [refreshToken, setRefreshToken] = useState(0);

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

  if (debug) {
    return (
      <SafeAreaView style={styles.root} edges={["top", "bottom"]}>
        <DebugScreen
          onClose={() => {
            setDebug(false);
            bumpOrders();
          }}
        />
      </SafeAreaView>
    );
  }

  if (editingId) {
    return (
      <SafeAreaView style={styles.root} edges={["top", "bottom"]}>
        <EditOrderScreen
          orderId={editingId}
          onClose={() => {
            setEditingId(null);
            bumpOrders();
          }}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.name}>{session?.name}</Text>
          <Text style={styles.role}>{session?.role}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Buka layar uji"
          onPress={() => setDebug(true)}
          style={styles.headerButton}>
          <Text style={styles.headerButtonLabel}>Uji</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={logout}
          style={styles.headerButton}>
          <Text style={styles.headerButtonLabel}>Keluar</Text>
        </Pressable>
      </View>

      <View style={styles.content}>
        {tab === "cashier" ? (
          <CashierScreen
            onSaved={() => {
              bumpOrders();
              setTab("orders");
            }}
          />
        ) : (
          <OrdersScreen refreshToken={refreshToken} onEdit={setEditingId} />
        )}
      </View>

      <View style={styles.tabs}>
        <TabButton
          label="Kasir"
          active={tab === "cashier"}
          onPress={() => setTab("cashier")}
        />
        <TabButton
          label="Order"
          active={tab === "orders"}
          onPress={() => {
            bumpOrders();
            setTab("orders");
          }}
        />
      </View>
    </SafeAreaView>
  );
}

function TabButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.tab,
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
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: semantic.border,
  },
  headerText: {
    flex: 1,
  },
  name: {
    ...textStyles.bodyStrong,
    color: semantic.textPrimary,
  },
  role: {
    ...textStyles.caption,
    color: semantic.textSecondary,
  },
  headerButton: {
    minHeight: touchTarget.min,
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
  },
  headerButtonLabel: {
    ...textStyles.caption,
    color: semantic.textSecondary,
  },
  content: {
    flex: 1,
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
