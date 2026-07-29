import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import {
  colors,
  radius,
  semantic,
  spacing,
  textStyles,
  touchTarget,
} from "../theme";

type ToastType = "success" | "error";

interface ToastItem {
  id: number;
  type: ToastType;
  message: string;
}

interface ToastApi {
  success: (message: string) => void;
  error: (message: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error("useToast harus dipakai di dalam <ToastProvider>");
  return api;
}

const AUTO_DISMISS_MS = 3000;

/**
 * Port dari components/Toast.tsx milik web, termasuk aturannya: notifikasi
 * sukses hilang sendiri, notifikasi gagal harus ditutup kasir. Pesan gagal yang
 * lenyap sendiri mudah terlewat saat ramai, dan justru itu yang perlu dibaca.
 */
export default function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback(
    (type: ToastType, message: string) => {
      const id = nextId.current++;
      setToasts((current) => [...current, { id, type, message }]);
      if (type === "success") {
        setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
      }
    },
    [dismiss]
  );

  const api = useMemo<ToastApi>(
    () => ({
      success: (message) => push("success", message),
      error: (message) => push("error", message),
    }),
    [push]
  );

  return (
    <ToastContext.Provider value={api}>
      {children}

      {/* pointerEvents="box-none" supaya area kosong di sekitar notifikasi tetap
          meneruskan sentuhan ke layar di bawahnya. */}
      <View style={styles.stack} pointerEvents="box-none">
        {toasts.map((toast) => (
          <View
            key={toast.id}
            accessibilityRole={toast.type === "error" ? "alert" : "text"}
            style={[
              styles.toast,
              toast.type === "success" ? styles.success : styles.error,
            ]}>
            <Text
              style={[
                styles.message,
                toast.type === "success"
                  ? styles.successText
                  : styles.errorText,
              ]}>
              {toast.message}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Tutup notifikasi"
              onPress={() => dismiss(toast.id)}
              style={styles.close}>
              <Text
                style={[
                  styles.closeLabel,
                  toast.type === "success"
                    ? styles.successText
                    : styles.errorText,
                ]}>
                ✕
              </Text>
            </Pressable>
          </View>
        ))}
      </View>
    </ToastContext.Provider>
  );
}

const styles = StyleSheet.create({
  stack: {
    position: "absolute",
    top: spacing.xl,
    left: spacing.md,
    right: spacing.md,
    gap: spacing.sm,
  },
  toast: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingLeft: spacing.md,
    borderRadius: radius.md,
    borderWidth: 2,
  },
  success: {
    borderColor: colors.status.paid,
    backgroundColor: colors.status.paidLight,
  },
  error: {
    borderColor: colors.status.void,
    backgroundColor: colors.status.voidLight,
  },
  message: {
    ...textStyles.caption,
    flex: 1,
    paddingVertical: spacing.md,
  },
  successText: {
    color: colors.status.paid,
  },
  errorText: {
    color: colors.status.void,
  },
  close: {
    width: touchTarget.min,
    height: touchTarget.min,
    alignItems: "center",
    justifyContent: "center",
  },
  closeLabel: {
    ...textStyles.bodyStrong,
    color: semantic.textPrimary,
  },
});
