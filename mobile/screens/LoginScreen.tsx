import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
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
  const { height } = useWindowDimensions();
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

  // Aplikasi dikunci landscape karena targetnya tablet kasir. Di tablet, tinggi
  // landscape masih cukup untuk menumpuk semuanya. Di ponsel tidak — tombol
  // "Masuk" terdorong keluar layar dan PIN tidak bisa dikonfirmasi. Jadi pada
  // viewport pendek, isinya dipecah jadi dua kolom: keypad di kanan, sisanya di
  // kiri. Ambangnya soal tinggi, bukan jenis perangkat.
  const compact = height < 520;

  const dots = (
    <View style={[styles.dotRow, compact && styles.dotRowCompact]}>
      {Array.from({ length: PIN_LENGTH }, (_, index) => {
        const filled = pin.length > index;
        return (
          <View
            key={index}
            style={[
              styles.dotSlot,
              compact && styles.dotSlotCompact,
              filled && styles.dotSlotFilled,
            ]}>
            <View style={[styles.dot, filled && styles.dotFilled]} />
          </View>
        );
      })}
    </View>
  );

  const keypad = (
    <View style={styles.keypad}>
      {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((digit) => (
        <Key
          key={digit}
          label={String(digit)}
          compact={compact}
          onPress={() => appendDigit(String(digit))}
          disabled={loading || pinFull}
        />
      ))}

      <Key
        label="Hapus"
        muted
        compact={compact}
        onPress={clear}
        disabled={loading || !pin}
      />
      <Key
        label="0"
        compact={compact}
        onPress={() => appendDigit("0")}
        disabled={loading || pinFull}
      />
      <Key
        label="⌫"
        accessibilityLabel="Hapus satu digit"
        compact={compact}
        onPress={backspace}
        disabled={loading || !pin}
      />
    </View>
  );

  const submitButton = (
    <Pressable
      accessibilityRole="button"
      onPress={submit}
      disabled={loading || !pinFull}
      style={({ pressed }) => [
        styles.submit,
        compact && styles.submitCompact,
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
          style={[styles.submitLabel, !pinFull && styles.submitLabelDisabled]}>
          Masuk
        </Text>
      )}
    </Pressable>
  );

  const errorSlot = (
    <View style={[styles.errorSlot, compact && styles.errorSlotCompact]}>
      {error ? (
        <Text style={styles.errorText} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
    </View>
  );

  return (
    <View style={[styles.screen, compact && styles.screenCompact]}>
      <View style={[styles.card, compact && styles.cardCompact]}>
        {compact ? (
          <>
            <View style={styles.column}>
              <View style={styles.header}>
                <Text style={styles.brand}>Rusen Kopitiam</Text>
                <Text style={styles.tagline}>Point of Sale System</Text>
              </View>
              {dots}
              {errorSlot}
              {submitButton}
            </View>
            <View style={styles.column}>{keypad}</View>
          </>
        ) : (
          <View style={styles.columnStacked}>
            <View style={styles.header}>
              <Text style={styles.brand}>Rusen Kopitiam</Text>
              <Text style={styles.tagline}>Point of Sale System</Text>
            </View>
            <Text style={styles.prompt}>Masukkan PIN {PIN_LENGTH} digit</Text>
            {dots}
            {errorSlot}
            {keypad}
            {submitButton}
          </View>
        )}
      </View>
    </View>
  );
}

function Key({
  label,
  onPress,
  disabled,
  muted,
  compact,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  muted?: boolean;
  compact?: boolean;
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
        compact && styles.keyCompact,
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
  screenCompact: {
    padding: spacing.md,
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
  cardCompact: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xl,
    maxWidth: 620,
    padding: spacing.lg,
  },
  // Hanya untuk mode compact, tempat dua kolom berbagi lebar kartu.
  column: {
    flex: 1,
    justifyContent: "center",
  },
  /**
   * Mode tegak hanya punya satu kolom, jadi tidak ada yang perlu dibagi — dan
   * `flex: 1` di sini justru merusak. `flex: 1` berarti `flexBasis: 0`, sehingga
   * kolom melapor butuh tinggi nol ke kartu yang tingginya `auto`. Kartu pun
   * menciut jadi setinggi padding-nya saja, lalu semua isinya digambar di luar
   * kotak itu dan saling menimpa. Di sini kolom harus setinggi isinya.
   */
  columnStacked: {
    width: "100%",
  },
  header: {
    alignItems: "center",
    marginBottom: spacing.xl,
    flexShrink: 0,
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
  dotRowCompact: {
    marginTop: spacing.md,
    marginBottom: spacing.sm,
    gap: spacing.xs,
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
  dotSlotCompact: {
    width: 32,
    height: 32,
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
  errorSlotCompact: {
    minHeight: 40,
    marginBottom: spacing.xs,
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
    // Tanpa ini Yoga memampatkan kotak keypad saat isi kartu lebih tinggi dari
    // layar, sementara tombol yang sudah ter-wrap tetap tergambar di luar kotak
    // — hasilnya tombol "Masuk" menimpa keypad, bukan terdorong ke bawah.
    flexShrink: 0,
  },
  key: {
    // Tiga kolom: sisa lebar setelah dua celah, dibagi tiga.
    //
    // minWidth harus muat tiga kolom di ponsel tersempit yang kita dukung.
    // Lebar dalam kartu = layar - padding layar (24*2) - padding kartu (24*2);
    // di ponsel 375dp itu tinggal 279dp, sedangkan 3*88 + 2*12 = 288dp. Selisih
    // 9dp itu membuat keypad turun ke dua kolom, tingginya bertambah dua baris,
    // dan seluruh kartu meluber — jadi angka ini bukan sekadar selera.
    flexGrow: 1,
    flexBasis: 0,
    minWidth: 72,
    height: touchTarget.comfortable,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  // Tetap di atas ambang 48dp DESIGN.md walau layarnya pendek — target sentuh
  // tidak dikorbankan demi muat.
  keyCompact: {
    minWidth: 64,
    height: touchTarget.min,
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
  submitCompact: {
    height: touchTarget.comfortable,
    marginTop: spacing.sm,
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
