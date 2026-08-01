import { useEffect } from 'react';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { SQLiteProvider } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { Slot } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { migrateDbIfNeeded } from '../db/migrations';
import { AuthProvider, useAuth } from '../lib/auth-context';
import LoginScreen from '../screens/LoginScreen';
import { appFonts, colors } from '../theme';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
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
    <SafeAreaProvider>
      <SQLiteProvider databaseName="rusen-pos.db" onInit={migrateDbIfNeeded}>
        <AuthProvider>
          <Root />
        </AuthProvider>
      </SQLiteProvider>
    </SafeAreaProvider>
  );
}

/**
 * Masuk atau tidak masuk — dua keadaan, jadi percabangan biasa sudah cukup.
 * Perpindahan antar layar di dalam sesi ditangani oleh route di dalam app/.
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
      {session ? <Slot /> : <LoginScreen />}
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
