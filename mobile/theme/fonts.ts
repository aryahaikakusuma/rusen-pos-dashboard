import { Poppins_400Regular } from '@expo-google-fonts/poppins/400Regular';
import { Poppins_500Medium } from '@expo-google-fonts/poppins/500Medium';
import { Poppins_600SemiBold } from '@expo-google-fonts/poppins/600SemiBold';
import { Poppins_700Bold } from '@expo-google-fonts/poppins/700Bold';

/**
 * The four Poppins weights the design uses. Loaded at runtime via `useFonts` so
 * the app still renders correctly in Expo Go during steps 1-6 of the migration;
 * once the printer development build lands, these can move to the expo-font
 * config plugin to be embedded natively instead.
 *
 * Imported per weight, not from the package root. The root index re-exports all
 * eighteen weights, and Metro bundles an asset it can see a reference to — so
 * the APK carried 3.0MB of Poppins to use 0.6MB of it. The four subpaths pull
 * only their own .ttf.
 *
 * Keys must match `fontFamily` in `theme/typography.ts`.
 */
export const appFonts = {
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
};
