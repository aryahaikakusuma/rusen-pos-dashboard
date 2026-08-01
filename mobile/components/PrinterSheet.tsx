import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useSQLiteContext } from "expo-sqlite";

import { forgetPrinter, savePrinter, savedPrinter } from "../db/settings";
import {
  bluetoothStatus,
  ensureBluetoothPermission,
  listPrinters,
  printTo,
  sampleReceiptOrder,
  translatePrinterError,
  type BondedDevice,
} from "../lib/printer";
import {
  colors,
  radius,
  semantic,
  spacing,
  textStyles,
  touchTarget,
} from "../theme";
import Button from "./Button";
import Sheet from "./Sheet";
import { useToast } from "./Toast";

/**
 * Pemilih printer.
 *
 * Tidak ada pemindaian dan tidak ada pemasangan di sini, dan itu disengaja:
 * memasangkan perangkat Bluetooth adalah pekerjaan Pengaturan Android, yang
 * sudah menangani PIN, penolakan, dan perangkat yang berganti nama jauh lebih
 * baik daripada yang pantas ditulis ulang di dalam aplikasi kasir. Yang
 * dikerjakan layar ini hanya satu: dari daftar yang sudah terpasang, mana yang
 * dipakai mencetak.
 *
 * Dipilih sekali, tersimpan di perangkat, bertahan melewati pergantian sif.
 */
export default function PrinterSheet({ onClose }: { onClose: () => void }) {
  const db = useSQLiteContext();
  const toast = useToast();

  const [devices, setDevices] = useState<BondedDevice[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  /** Sebab daftar kosong. Kosong tanpa penjelasan adalah layar yang bohong. */
  const [problem, setProblem] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setProblem("");
    try {
      const current = await savedPrinter(db);
      setSelected(current?.address ?? null);

      // Izin diminta lebih dulu: tanpa ini daftar terpasang pulang kosong di
      // Android 12+, tanpa error apa pun untuk menjelaskan kenapa.
      const granted = await ensureBluetoothPermission();
      const status = await bluetoothStatus();

      if (!status.supported) {
        setProblem("Perangkat ini tidak punya Bluetooth.");
      } else if (!granted || !status.hasPermission) {
        setProblem("Izin Bluetooth ditolak. Aktifkan lewat Pengaturan aplikasi.");
      } else if (!status.enabled) {
        setProblem("Bluetooth mati. Nyalakan dulu, lalu tekan Muat ulang.");
      } else {
        setDevices(await listPrinters());
      }
    } catch (caught) {
      setProblem(translatePrinterError(caught));
    } finally {
      setLoading(false);
    }
  }, [db]);

  useEffect(() => {
    void load();
  }, [load]);

  const choose = async (device: BondedDevice) => {
    await savePrinter(db, { address: device.address, name: device.name });
    setSelected(device.address);
    toast.success(`Printer: ${device.name}`);
  };

  /**
   * Uji cetak memakai perangkat yang baru ditekan, bukan yang tersimpan.
   * Menyimpan lalu mencetak dari simpanan akan menguji dua hal sekaligus dan
   * menyembunyikan yang mana yang gagal.
   */
  const test = async () => {
    if (!selected) return;
    setTesting(true);
    try {
      await printTo(selected, sampleReceiptOrder);
      toast.success("Struk contoh terkirim.");
    } catch (caught) {
      toast.error(translatePrinterError(caught));
    } finally {
      setTesting(false);
    }
  };

  const clear = async () => {
    await forgetPrinter(db);
    setSelected(null);
  };

  return (
    <Sheet
      title="Printer"
      subtitle="Pasangkan printer lewat Pengaturan Bluetooth Android dulu"
      onClose={onClose}
      footer={
        <>
          <Button
            label="Cetak contoh"
            variant="primary"
            disabled={!selected}
            loading={testing}
            loadingLabel="Mencetak…"
            onPress={() => void test()}
          />
          <Button label="Muat ulang" onPress={() => void load()} />
          {selected ? (
            <Button label="Lupakan printer" variant="danger" onPress={() => void clear()} />
          ) : null}
        </>
      }>
      <View style={styles.body}>
        {loading ? (
          <ActivityIndicator style={styles.spinner} />
        ) : problem ? (
          <Text style={styles.problem}>{problem}</Text>
        ) : devices.length === 0 ? (
          <Text style={styles.problem}>
            Belum ada perangkat terpasang. Buka Pengaturan → Bluetooth di
            Android, pasangkan printernya, lalu tekan Muat ulang.
          </Text>
        ) : (
          devices.map((device) => (
            <Pressable
              key={device.address}
              accessibilityRole="radio"
              accessibilityState={{ selected: device.address === selected }}
              onPress={() => void choose(device)}
              style={({ pressed }) => [
                styles.row,
                device.address === selected && styles.rowSelected,
                pressed && styles.rowPressed,
              ]}>
              <View style={styles.rowText}>
                <Text style={styles.name}>{device.name}</Text>
                <Text style={styles.meta}>
                  {device.address}
                  {device.supportsSpp ? " · siap cetak" : ""}
                </Text>
              </View>
              {device.address === selected ? (
                <Text style={styles.check}>✓</Text>
              ) : null}
            </Pressable>
          ))
        )}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: {
    padding: spacing.lg,
    gap: spacing.sm,
  },
  spinner: {
    marginVertical: spacing.lg,
  },
  problem: {
    ...textStyles.body,
    color: semantic.textSecondary,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minHeight: touchTarget.comfortable,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: semantic.border,
    backgroundColor: semantic.surface,
  },
  rowSelected: {
    borderColor: colors.primary[600],
  },
  rowPressed: {
    backgroundColor: semantic.surfaceMuted,
  },
  rowText: {
    flex: 1,
  },
  name: {
    ...textStyles.bodyStrong,
    color: semantic.textPrimary,
  },
  meta: {
    ...textStyles.caption,
    color: semantic.textSecondary,
  },
  check: {
    ...textStyles.bodyStrong,
    color: colors.primary[600],
  },
});
