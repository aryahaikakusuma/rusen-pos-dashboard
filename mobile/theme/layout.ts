/** 4px base scale, matching Tailwind's spacing steps used by the web app. */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  '2xl': 32,
  '3xl': 48,
} as const;

export const radius = {
  sm: 6,
  md: 10,
  lg: 14,
  pill: 999,
} as const;

/**
 * Touch targets. The target device is a finger-operated Android tablet, so
 * everything interactive is sized well above the 48dp Android minimum
 * (DESIGN.md: "large enough for finger touch, not high-precision mouse clicks").
 */
export const touchTarget = {
  min: 48,
  comfortable: 56,
  primaryAction: 64,
} as const;

/**
 * Satu-satunya ambang lebar di aplikasi ini. Di bawahnya tata letak disusun
 * menumpuk (ponsel tegak), di atasnya tiga kolom (tablet mendatar).
 *
 * Dipilih berdasarkan lebar, bukan deteksi jenis perangkat: ponsel yang
 * diputar mendatar memang pantas dapat tata letak lebar, dan tablet yang
 * dipegang tegak memang tidak muat tiga kolom.
 */
export const breakpoints = {
  wide: 700,
} as const;

/** Cashier screen is a fixed three-column layout in landscape (DESIGN.md). */
export const cashierLayout = {
  sidebarWidth: 200,
  cartWidth: 340,
  productGridColumns: 3,
  productCardMinHeight: 104,
  /** Tegak: dua kolom. Tiga kolom di ~400dp membuat kode produk tak terbaca. */
  productGridColumnsPhone: 2,
} as const;

/** Flat surfaces, no gradients — a single hairline border instead of shadows. */
export const border = {
  hairline: 1,
} as const;
