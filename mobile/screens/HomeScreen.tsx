import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useAuth } from "../lib/auth-context";
import { supabase } from "../lib/supabase";
import {
  border,
  colors,
  radius,
  semantic,
  spacing,
  textStyles,
  touchTarget,
} from "../theme";

/**
 * Layar sementara untuk langkah 2. Layar kasir yang sesungguhnya menyusul di
 * langkah 5.
 *
 * Selain menampilkan sesi, layar ini sekaligus membuktikan jalur RLS bekerja:
 * query di bawah memakai anon key plus token dari pin-login, dan seharusnya
 * mengembalikan tepat satu baris — milik pegawai yang sedang masuk.
 */
export default function HomeScreen() {
  const { session, logout } = useAuth();
  const [rlsCheck, setRlsCheck] = useState("Memeriksa akses database…");

  useEffect(() => {
    let cancelled = false;

    supabase
      .from("employees")
      .select("id, name, role")
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          setRlsCheck(`RLS menolak: ${error.message}`);
        } else {
          setRlsCheck(
            `RLS oke — ${data.length} baris terbaca (${
              data.map((row) => row.name).join(", ") || "kosong"
            })`
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <View style={styles.screen}>
      <Text style={styles.greeting}>Halo, {session?.name}</Text>
      <Text style={styles.role}>{session?.role}</Text>
      <Text style={styles.check}>{rlsCheck}</Text>

      <Pressable
        accessibilityRole="button"
        onPress={logout}
        style={({ pressed }) => [styles.logout, pressed && styles.logoutPressed]}>
        <Text style={styles.logoutLabel}>Keluar</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    padding: spacing["2xl"],
    backgroundColor: semantic.surfaceMuted,
  },
  greeting: {
    ...textStyles.screenTitle,
    color: semantic.textPrimary,
  },
  role: {
    ...textStyles.statusBadge,
    color: semantic.textSecondary,
  },
  check: {
    ...textStyles.caption,
    textAlign: "center",
    color: semantic.textSecondary,
  },
  logout: {
    minHeight: touchTarget.min,
    justifyContent: "center",
    marginTop: spacing.lg,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.md,
    borderWidth: border.hairline,
    borderColor: semantic.border,
    backgroundColor: colors.neutral[0],
  },
  logoutPressed: {
    backgroundColor: colors.neutral[100],
  },
  logoutLabel: {
    ...textStyles.bodyStrong,
    color: semantic.textPrimary,
  },
});
