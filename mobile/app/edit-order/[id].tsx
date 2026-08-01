import { useLocalSearchParams, useRouter } from "expo-router";
import { StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import EditOrderScreen from "../../screens/EditOrderScreen";
import { semantic } from "../../theme";

/**
 * Layar ubah order, dulu lapisan penutup milik AppShell.
 *
 * Jadi rute supaya halaman "Tambah item" bisa jadi rute juga: keduanya rute
 * bersebelahan, dan yang di bawah tetap terpasang selama yang di atas terbuka —
 * jadi kembali dari Tambah item tidak pernah membuang layar ini.
 */
export default function EditOrderRoute() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  return (
    <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
      <EditOrderScreen orderId={id} onClose={() => router.back()} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: semantic.surface,
  },
});
