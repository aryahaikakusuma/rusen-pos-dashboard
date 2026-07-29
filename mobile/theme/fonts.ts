import {
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
} from '@expo-google-fonts/poppins';

/**
 * The four Poppins weights the design uses. Loaded at runtime via `useFonts` so
 * the app still renders correctly in Expo Go during steps 1-6 of the migration;
 * once the printer development build lands, these can move to the expo-font
 * config plugin to be embedded natively instead.
 *
 * Keys must match `fontFamily` in `theme/typography.ts`.
 */
export const appFonts = {
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
};
