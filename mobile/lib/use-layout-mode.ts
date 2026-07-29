import { useWindowDimensions } from "react-native";

import { breakpoints } from "../theme";

export type LayoutMode = "phone" | "tablet";

/**
 * Tata letak ditentukan oleh lebar viewport, bukan oleh jenis perangkat.
 *
 * Alasannya sederhana: yang menentukan tiga kolom muat atau tidak adalah lebar
 * yang tersedia, bukan merek atau kelas perangkatnya. Ponsel yang diputar
 * mendatar layak dapat tata letak lebar; tablet yang dipegang tegak tidak.
 *
 * Ambangnya tinggal di satu tempat (theme/layout.ts) supaya tidak tersebar
 * sebagai angka ajaib di banyak layar. LoginScreen memakai pola yang sama,
 * hanya pada tinggi — layar itu soal muat ke bawah, bukan ke samping.
 */
export function useLayoutMode(): LayoutMode {
  const { width } = useWindowDimensions();
  return width >= breakpoints.wide ? "tablet" : "phone";
}
