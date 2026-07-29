import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
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
  style?: StyleProp<ViewStyle>;
}

export default function Button({
  label,
  onPress,
  variant = "secondary",
  disabled,
  loading,
  loadingLabel,
  style,
}: ButtonProps) {
  const inactive = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
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
          <Text style={[styles.label, styles[`${variant}Label`]]}>
            {loadingLabel ?? label}
          </Text>
        </View>
      ) : (
        <Text style={[styles.label, styles[`${variant}Label`]]}>{label}</Text>
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
