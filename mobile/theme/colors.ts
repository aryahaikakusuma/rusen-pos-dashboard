/**
 * Ported 1:1 from the web app's `app/globals.css` @theme block.
 * Keep the hex values in sync with the web build — the two clients must not drift.
 */

export const colors = {
  /** Primary action blue — reserved for the one primary button per screen (DESIGN.md). */
  primary: {
    50: '#eff6ff',
    100: '#dbeafe',
    500: '#3b82f6',
    600: '#2563eb',
    700: '#1d4ed8',
    900: '#1e3a8a',
  },

  /** Order status. Pending = awaiting payment, paid = confirmed, void = cancelled. */
  status: {
    pending: '#f59e0b',
    pendingLight: '#fef3c7',
    paid: '#0f766e',
    paidLight: '#ccfbf1',
    void: '#7f1d1d',
    voidLight: '#fee2e2',
  },

  /** Login surface — dark, distinct from the cashier screen. */
  login: {
    bg: '#0f172a',
    primary: '#1e3a5f',
    accent: '#059669',
    muted: '#10192e',
  },

  /**
   * Neutrals. The web app leans on Tailwind's default slate/gray scale; these are
   * the same values, named explicitly because React Native has no utility classes.
   */
  neutral: {
    0: '#ffffff',
    50: '#f8fafc',
    100: '#f1f5f9',
    200: '#e2e8f0',
    300: '#cbd5e1',
    400: '#94a3b8',
    500: '#64748b',
    600: '#475569',
    700: '#334155',
    800: '#1e293b',
    900: '#0f172a',
  },
} as const;

/** Semantic aliases — prefer these in components over raw scale steps. */
export const semantic = {
  surface: colors.neutral[0],
  surfaceMuted: colors.neutral[50],
  border: colors.neutral[200],
  textPrimary: colors.neutral[900],
  textSecondary: colors.neutral[500],
  textInverse: colors.neutral[0],
  /** Active category in the sidebar is dark neutral, NOT blue, so it does not
   *  compete with the primary action button (DESIGN.md). */
  sidebarActive: colors.neutral[800],
  sidebarActiveText: colors.neutral[0],
  focusRing: colors.primary[600],
} as const;

export type Colors = typeof colors;
