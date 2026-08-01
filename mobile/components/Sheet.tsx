import type { ReactNode } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

import { useLayoutMode } from "../lib/use-layout-mode";
import {
  radius,
  semantic,
  spacing,
  textStyles,
  touchTarget,
} from "../theme";

interface SheetProps {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  /** Kaki tetap: tombol aksi yang tidak boleh ikut tergulung. */
  footer?: ReactNode;
  /**
   * Sisi tempat lembar menempel di ponsel. Bawah adalah bawaannya — paling
   * dekat dengan jempol. Pakai "top" kalau isinya punya kolom ketik: papan
   * ketik naik dari bawah dan menutupi lembar yang berlabuh di sana.
   */
  anchor?: "bottom" | "top";
}

/**
 * Satu wadah untuk semua dialog. Di ponsel ia lembar penuh dari bawah; di
 * tablet kartu di tengah layar. Dipisah jadi komponen sendiri supaya keputusan
 * bentuk itu hanya ditulis sekali.
 *
 * Modal bawaan React Native dipakai, bukan overlay buatan sendiri, karena ia
 * menangani tombol kembali Android — di ponsel itu cara paling wajar menutup
 * lembar, dan kalau diabaikan aplikasi terasa rusak.
 */
export default function Sheet({
  title,
  subtitle,
  onClose,
  children,
  footer,
  anchor = "bottom",
}: SheetProps) {
  const phone = useLayoutMode() === "phone";
  const top = phone && anchor === "top";

  return (
    <Modal
      visible
      transparent
      // animationType="slide" selalu masuk dari bawah. Untuk lembar yang
      // berlabuh di atas itu berarti terbang melintasi layar, jadi dipudarkan.
      animationType={phone && !top ? "slide" : "fade"}
      onRequestClose={onClose}
      statusBarTranslucent
      navigationBarTranslucent>
      {/*
        Modal Android adalah jendela tersendiri. SafeAreaProvider di
        app/_layout.tsx
        mengukur jendela utama, dan di dalam sini nilainya nol — batang navigasi
        menutupi baris terakhir lembar tanpa ada yang menyadarinya. Provider
        kedua memaksa pengukuran ulang terhadap jendela milik modal ini.
      */}
      <SafeAreaProvider>
        <SheetPanel
          title={title}
          subtitle={subtitle}
          onClose={onClose}
          footer={footer}
          phone={phone}
          top={top}>
          {children}
        </SheetPanel>
      </SafeAreaProvider>
    </Modal>
  );
}

interface SheetPanelProps {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  phone: boolean;
  top: boolean;
}

/**
 * Isi lembar, dipisah supaya `useSafeAreaInsets` terbaca di bawah
 * SafeAreaProvider milik modal — bukan milik layar di belakangnya.
 */
function SheetPanel({
  title,
  subtitle,
  onClose,
  children,
  footer,
  phone,
  top,
}: SheetPanelProps) {
  const insets = useSafeAreaInsets();
  // Lembar yang berlabuh di bawah berakhir di tepi layar, dan batang navigasi
  // duduk di atasnya — tombol terakhir tertutup separuh. Ruangnya disisakan di
  // dalam panel, bukan di backdrop, supaya warna lembar tetap mengisi sampai
  // tepi dan tidak muncul pita gelap di bawah tombol.
  const bottomInset = phone && !top ? insets.bottom : 0;

  return (
    <View
        style={[
          styles.backdrop,
          phone && styles.backdropPhone,
          top && styles.backdropTop,
          top && { paddingTop: insets.top },
        ]}>
        <View
          style={[
            styles.panel,
            phone ? styles.panelPhone : styles.panelWide,
            top && styles.panelTop,
            !footer && bottomInset > 0 ? { paddingBottom: bottomInset } : null,
          ]}>
          <View style={styles.header}>
            <View style={styles.headerText}>
              <Text style={styles.title}>{title}</Text>
              {subtitle ? (
                <Text style={styles.subtitle}>{subtitle}</Text>
              ) : null}
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Tutup"
              onPress={onClose}
              style={styles.close}>
              <Text style={styles.closeLabel}>✕</Text>
            </Pressable>
          </View>

          <View style={styles.body}>{children}</View>

          {footer ? (
            <View
              style={[
                styles.footer,
                bottomInset > 0
                  ? { paddingBottom: spacing.lg + bottomInset }
                  : null,
              ]}>
              {footer}
            </View>
          ) : null}
        </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  backdropPhone: {
    padding: 0,
    justifyContent: "flex-end",
  },
  backdropTop: {
    justifyContent: "flex-start",
  },
  panel: {
    backgroundColor: semantic.surface,
    overflow: "hidden",
  },
  panelWide: {
    width: "100%",
    maxWidth: 480,
    maxHeight: "90%",
    borderRadius: radius.lg,
  },
  panelPhone: {
    width: "100%",
    // Menyisakan sedikit celah di atas: lembar yang menutup layar penuh
    // menghilangkan petunjuk bahwa masih ada layar di belakangnya.
    maxHeight: "92%",
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
  },
  // Sudut tumpul berpindah ke sisi yang menghadap layar, supaya lembar tetap
  // terbaca sebagai sesuatu yang menempel di tepi dan bukan kartu melayang.
  panelTop: {
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    borderBottomLeftRadius: radius.lg,
    borderBottomRightRadius: radius.lg,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: semantic.border,
  },
  headerText: {
    flex: 1,
  },
  title: {
    ...textStyles.sectionTitle,
    color: semantic.textPrimary,
  },
  subtitle: {
    ...textStyles.caption,
    color: semantic.textSecondary,
  },
  close: {
    width: touchTarget.min,
    height: touchTarget.min,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.sm,
  },
  closeLabel: {
    ...textStyles.bodyStrong,
    color: semantic.textSecondary,
  },
  body: {
    flexShrink: 1,
  },
  footer: {
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: semantic.border,
    gap: spacing.sm,
  },
});
