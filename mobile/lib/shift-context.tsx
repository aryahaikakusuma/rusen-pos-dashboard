import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useSQLiteContext } from "expo-sqlite";

import { useToast } from "../components/Toast";
import { currentShift, openShift, type OpenShift, type ShiftLabel } from "../db/shift";
import { useAuth } from "./auth-context";

interface ShiftValue {
  /** `undefined` = belum selesai dibaca dari SQLite, `null` = tidak ada sif. */
  shift: OpenShift | null | undefined;
  /**
   * Satu-satunya penentu boleh-tidaknya menulis. Diturunkan dari `shift`, tidak
   * pernah dari state kedua — kalau ada dua penanda, salah satunya akan basi
   * dan aplikasi akan menerima order di luar sif tanpa ada yang tahu.
   *
   * `undefined` ikut dihitung sebagai TIDAK aktif: read-only adalah default
   * yang aman. Yang dikorbankan hanya jeda sepersekian detik sesudah login.
   */
  aktif: boolean;
  /** true selama openShift berjalan. */
  membuka: boolean;
  mulai: (modalAwal: number, label: ShiftLabel) => Promise<void>;
  /** Dipanggil sesudah Tutup Kasir menutup sif. */
  muatUlang: () => Promise<void>;
  /** Dipakai printTutupKasir: sif dianggap habis tanpa perlu membaca ulang. */
  tandaiTutup: () => void;
}

const ShiftContext = createContext<ShiftValue | null>(null);

export function ShiftProvider({ children }: { children: ReactNode }) {
  const db = useSQLiteContext();
  const { session } = useAuth();
  const [shift, setShift] = useState<OpenShift | null | undefined>(undefined);
  const [membuka, setMembuka] = useState(false);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    currentShift(db).then((found) => {
      if (!cancelled) setShift(found);
    });
    return () => {
      cancelled = true;
    };
  }, [db, session]);

  const muatUlang = useCallback(async () => {
    setShift(await currentShift(db));
  }, [db]);

  const mulai = useCallback(
    async (modalAwal: number, label: ShiftLabel) => {
      if (!session) return;
      setMembuka(true);
      try {
        await openShift(db, {
          employeeId: session.employeeId,
          employeeName: session.name,
          modalAwal,
          label,
        });
        setShift(await currentShift(db));
      } finally {
        setMembuka(false);
      }
    },
    [db, session]
  );

  const tandaiTutup = useCallback(() => setShift(null), []);

  const value = useMemo(
    () => ({
      shift,
      aktif: Boolean(shift),
      membuka,
      mulai,
      muatUlang,
      tandaiTutup,
    }),
    [shift, membuka, mulai, muatUlang, tandaiTutup]
  );

  return <ShiftContext.Provider value={value}>{children}</ShiftContext.Provider>;
}

export function useShift(): ShiftValue {
  const value = useContext(ShiftContext);
  if (!value) {
    throw new Error("useShift harus dipakai di dalam <ShiftProvider>.");
  }
  return value;
}

/**
 * Penjaga tunggal untuk setiap aksi yang MENULIS. Dipanggil di awal handler:
 *
 *     if (!gate("membuat order")) return;
 *
 * Tombol yang dimatikan saja tidak cukup — beberapa aksi punya jalan masuk
 * lewat lembar atau dialog yang tombolnya bukan yang dimatikan — jadi ini
 * jaring terakhirnya, dan ia yang memberi tahu kasir alasannya.
 *
 * Kenapa sif wajib: laporan Tutup Kasir dijendela oleh `shift.openedAt`
 * (db/shift.ts). Apa pun yang ditulis sebelum sif dibuka tidak akan pernah
 * terhitung di laporan mana pun, dan tidak ada yang akan menyadarinya.
 */
export function useGateShift(): (pekerjaan?: string) => boolean {
  const { aktif } = useShift();
  const toast = useToast();
  return useCallback(
    (pekerjaan?: string) => {
      if (aktif) return true;
      toast.error(
        pekerjaan
          ? `Mulai sif dulu sebelum ${pekerjaan}. Buka menu ☰ lalu tekan "Mulai Shift".`
          : 'Sif belum dimulai. Buka menu ☰ lalu tekan "Mulai Shift".'
      );
      return false;
    },
    [aktif, toast]
  );
}
