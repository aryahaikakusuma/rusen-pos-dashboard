import { useEffect } from 'react';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { SQLiteProvider } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { migrateDbIfNeeded } from './db/migrations';
import { AuthProvider, useAuth } from './lib/auth-context';
import HomeScreen from './screens/HomeScreen';
import LoginScreen from './screens/LoginScreen';
import { appFonts, colors } from './theme';

SplashScreen.preventAutoHideAsync();

export default function App() {
  const [fontsLoaded, fontError] = useFonts(appFonts);

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    // SQLiteProvider di luar AuthProvider: database lokal tidak bergantung pada
    // sesi, dan justru harus tetap ada saat pegawai keluar — order yang belum
    // tersinkron tidak boleh hilang hanya karena ganti shift.
    <SQLiteProvider databaseName="rusen-pos.db" onInit={migrateDbIfNeeded}>
      <AuthProvider>
        <Root />
      </AuthProvider>
    </SQLiteProvider>
  );
}

/**
 * Dua keadaan saja untuk sekarang, jadi percabangan biasa sudah cukup.
 * expo-router baru dipasang di langkah 5, saat ada layar yang benar-benar
 * perlu dinavigasi.
 */
function Root() {
  const { session, restoring } = useAuth();

  if (restoring) {
    return (
      <View style={styles.splash}>
        <StatusBar style="light" />
        <ActivityIndicator color={colors.neutral[0]} />
      </View>
    );
  }

  return (
    <>
      <StatusBar style={session ? 'dark' : 'light'} />
      {session ? <HomeScreen /> : <LoginScreen />}
    </>
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.login.bg,
  },
});
