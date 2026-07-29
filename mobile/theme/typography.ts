import type { TextStyle } from 'react-native';

/**
 * Poppins only, per DESIGN.md. Family names match the keys passed to `useFonts`
 * in `theme/fonts.ts` — React Native resolves fonts by family string, so a typo
 * silently falls back to the system font instead of throwing.
 */
export const fontFamily = {
  regular: 'Poppins_400Regular',
  medium: 'Poppins_500Medium',
  semibold: 'Poppins_600SemiBold',
  bold: 'Poppins_700Bold',
} as const;

export const fontSize = {
  xs: 12,
  sm: 14,
  base: 16,
  lg: 18,
  xl: 20,
  '2xl': 24,
  '3xl': 30,
  '4xl': 36,
} as const;

/**
 * Named text styles. `productCode` is deliberately larger than `productName`:
 * the cashier reads the code first (DESIGN.md).
 */
export const textStyles = {
  screenTitle: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize['2xl'],
    lineHeight: 32,
  },
  sectionTitle: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.lg,
    lineHeight: 26,
  },
  body: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.base,
    lineHeight: 24,
  },
  bodyStrong: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.base,
    lineHeight: 24,
  },
  caption: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    lineHeight: 20,
  },
  productCode: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.xl,
    lineHeight: 28,
  },
  productName: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    lineHeight: 20,
  },
  price: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.base,
    lineHeight: 24,
  },
  grandTotal: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize['3xl'],
    lineHeight: 40,
  },
  actionButton: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.lg,
    lineHeight: 26,
  },
  statusBadge: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.sm,
    lineHeight: 20,
  },
} as const satisfies Record<string, TextStyle>;

export type TextStyleName = keyof typeof textStyles;
