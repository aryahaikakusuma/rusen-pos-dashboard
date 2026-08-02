import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";

import {
  colors,
  radius,
  semantic,
  spacing,
  textStyles,
  touchTarget,
} from "../theme";

interface ButtonProps {
  label: string;
  onPress: () => void;
  /**
   * "primary" biru dipakai untuk SATU tombol saja per layar (DESIGN.md) —
   * supaya kasir tidak salah tekan saat ramai.
   */
  variant?: "primary" | "secondary" | "danger";
  disabled?: boolean;
  loading?: boolean;
  loadingLabel?: string;
  /**
   * Wajib diisi kalau tombolnya hanya ikon. Tanpa ini tombolnya tak bernama
   * bagi pembaca layar — dan sebuah bentuk yang digambar sendiri tidak
   * dibacakan sama sekali, tidak seperti emoji yang setidaknya berbunyi "tong
   * sampah" tanpa menyebut apa yang akan terjadi.
   */
  accessibilityLabel?: string;
  /**
   * Menggantikan teks `label` di dalam tombol. `label` tetap wajib dan tetap
   * jadi nama cadangan bagi pembaca layar kalau accessibilityLabel kosong.
   */
  icon?: ReactNode;
  labelStyle?: StyleProp<TextStyle>;
  style?: StyleProp<ViewStyle>;
}

export default function Button({
  label,
  onPress,
  variant = "secondary",
  disabled,
  loading,
  loadingLabel,
  accessibilityLabel,
  icon,
  labelStyle,
  style,
}: ButtonProps) {
  const inactive = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: Boolean(inactive) }}
      onPress={onPress}
      disabled={inactive}
      style={({ pressed }) => [
        styles.base,
        styles[variant],
        pressed && styles.pressed,
        inactive && styles.inactive,
        style,
      ]}>
      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator
            color={variant === "primary" ? colors.neutral[0] : colors.neutral[600]}
          />
          <Text style={[styles.label, styles[`${variant}Label`], labelStyle]}>
            {loadingLabel ?? label}
          </Text>
        </View>
      ) : icon ? (
        icon
      ) : (
        <Text style={[styles.label, styles[`${variant}Label`], labelStyle]}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: touchTarget.primaryAction,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
  },
  primary: {
    backgroundColor: colors.primary[600],
  },
  secondary: {
    borderWidth: 2,
    borderColor: semantic.border,
    backgroundColor: semantic.surface,
  },
  danger: {
    backgroundColor: colors.status.voidLight,
  },
  pressed: {
    opacity: 0.85,
  },
  inactive: {
    opacity: 0.45,
  },
  loading: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  label: {
    ...textStyles.actionButton,
    textAlign: "center",
  },
  primaryLabel: {
    color: colors.neutral[0],
  },
  secondaryLabel: {
    color: semantic.textPrimary,
  },
  dangerLabel: {
    color: colors.status.void,
  },
});
