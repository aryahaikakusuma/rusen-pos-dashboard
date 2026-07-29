import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { useAuth } from "../lib/auth-context";
import { PIN_LENGTH } from "../lib/types";
import {
  colors,
  fontFamily,
  fontSize,
  radius,
  spacing,
  textStyles,
  touchTarget,
} from "../theme";

/**
 * Port dari app/login/page.tsx. Struktur dan teksnya sengaja dipertahankan;
 * yang hilang hanya penanganan keyboard fisik — di tablet kasir tidak ada
 * keyboard, dan tombolnya justru dibesarkan agar nyaman ditekan jari.
 */
export default function LoginScreen() {
  const { login } = useAuth();
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const appendDigit = useCallback((digit: string) => {
    setError("");
    setPin((current) =>
      current.length < PIN_LENGTH ? current + digit : current
    );
  }, []);

  const backspace = useCallback(() => {
    setError("");
    setPin((current) => current.slice(0, -1));
  }, []);

  const clear = useCallback(() => {
    setError("");
    setPin("");
  }, []);

  const submit = useCallback(async () => {
    if (pin.length !== PIN_LENGTH || loading) return;

    setLoading(true);
    setError("");

    const result = await login(pin);

    // Saat PIN benar, provider mengganti sesi dan layar ini dilepas — jadi
    // penanganan di bawah hanya jalan untuk kegagalan.
    if (result?.error) {
      setError(result.error);
      setPin("");
      setLoading(false);
    }
  }, [pin, loading, login]);

  const pinFull = pin.length === PIN_LENGTH;

  return (
    <View style={styles.screen}>
      <View style={styles.card}>
        <View style={styles.header}>
          <Text style={styles.brand}>Rusen Kopitiam</Text>
          <Text style={styles.tagline}>Point of Sale System</Text>
        </View>

        <Text style={styles.prompt}>Masukkan PIN {PIN_LENGTH} digit</Text>

        <View style={styles.dotRow}>
          {Array.from({ length: PIN_LENGTH }, (_, index) => {
            const filled = pin.length > index;
            return (
              <View
                key={index}
                style={[styles.dotSlot, filled && styles.dotSlotFilled]}>
                <View style={[styles.dot, filled && styles.dotFilled]} />
              </View>
            );
          })}
        </View>

        <View style={styles.errorSlot}>
          {error ? (
            <Text style={styles.errorText} accessibilityRole="alert">
              {error}
            </Text>
          ) : null}
        </View>

        <View style={styles.keypad}>
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((digit) => (
            <Key
              key={digit}
              label={String(digit)}
              onPress={() => appendDigit(String(digit))}
              disabled={loading || pinFull}
            />
          ))}

          <Key label="Hapus" muted onPress={clear} disabled={loading || !pin} />
          <Key
            label="0"
            onPress={() => appendDigit("0")}
            disabled={loading || pinFull}
          />
          <Key
            label="⌫"
            accessibilityLabel="Hapus satu digit"
            onPress={backspace}
            disabled={loading || !pin}
          />
        </View>

        <Pressable
          accessibilityRole="button"
          onPress={submit}
          disabled={loading || !pinFull}
          style={({ pressed }) => [
            styles.submit,
            (loading || !pinFull) && styles.submitDisabled,
            pressed && styles.submitPressed,
          ]}>
          {loading ? (
            <View style={styles.submitLoading}>
              <ActivityIndicator color={colors.neutral[0]} />
              <Text style={styles.submitLabel}>Memeriksa PIN</Text>
            </View>
          ) : (
            <Text
              style={[
                styles.submitLabel,
                !pinFull && styles.submitLabelDisabled,
              ]}>
              Masuk
            </Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

function Key({
  label,
  onPress,
  disabled,
  muted,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  muted?: boolean;
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.key,
        pressed && styles.keyPressed,
        disabled && styles.keyDisabled,
      ]}>
      <Text style={[styles.keyLabel, muted && styles.keyLabelMuted]}>
        {label}
      </Text>
    </Pressable>
  );
}

const KEY_GAP = spacing.md;

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
    backgroundColor: colors.login.bg,
  },
  card: {
    width: "100%",
    maxWidth: 380,
    padding: spacing.xl,
    borderRadius: radius.lg,
    backgroundColor: colors.login.primary + "33",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  header: {
    alignItems: "center",
    marginBottom: spacing.xl,
  },
  brand: {
    ...textStyles.screenTitle,
    color: colors.neutral[0],
  },
  tagline: {
    ...textStyles.caption,
    color: "rgba(255,255,255,0.5)",
  },
  prompt: {
    ...textStyles.caption,
    textAlign: "center",
    color: "rgba(255,255,255,0.6)",
  },
  dotRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: spacing.sm,
    marginTop: spacing.lg,
    marginBottom: spacing.lg,
  },
  dotSlot: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: colors.login.muted,
  },
  dotSlotFilled: {
    borderColor: colors.login.accent,
    backgroundColor: colors.login.accent + "26",
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: "rgba(255,255,255,0.25)",
  },
  dotFilled: {
    width: 12,
    height: 12,
    backgroundColor: colors.login.accent,
  },
  // Tinggi tetap supaya keypad tidak melompat saat pesan error muncul-hilang.
  errorSlot: {
    minHeight: 44,
    justifyContent: "center",
    marginBottom: spacing.sm,
  },
  errorText: {
    ...textStyles.caption,
    textAlign: "center",
    color: "#fca5a5",
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.25)",
    backgroundColor: "rgba(239,68,68,0.1)",
  },
  keypad: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: KEY_GAP,
  },
  key: {
    // Tiga kolom: sisa lebar setelah dua celah, dibagi tiga.
    width: `${100 / 3}%`,
    flexGrow: 1,
    flexBasis: 0,
    minWidth: 88,
    height: touchTarget.comfortable,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  keyPressed: {
    backgroundColor: "rgba(255,255,255,0.09)",
  },
  keyDisabled: {
    opacity: 0.4,
  },
  keyLabel: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.lg,
    color: colors.neutral[0],
  },
  keyLabelMuted: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    color: "rgba(255,255,255,0.6)",
  },
  submit: {
    height: touchTarget.primaryAction,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.login.accent,
  },
  submitPressed: {
    opacity: 0.9,
  },
  submitDisabled: {
    backgroundColor: "rgba(255,255,255,0.07)",
  },
  submitLoading: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  submitLabel: {
    ...textStyles.actionButton,
    color: colors.neutral[0],
  },
  submitLabelDisabled: {
    color: "rgba(255,255,255,0.35)",
  },
});
