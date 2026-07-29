import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./env";
import { clearSession, loadSession, saveSession } from "./session";
import { PIN_LENGTH, type Session } from "./types";

/**
 * Pesan cadangan kalau jaringan putus sebelum fungsi sempat menjawab. Kegagalan
 * yang datang dari server dipakai apa adanya — pesannya sudah sengaja dibuat
 * generik di sisi Edge Function.
 */
const NETWORK_ERROR = "Tidak bisa menghubungi server. Periksa koneksi.";

interface AuthValue {
  session: Session | null;
  /** true selama sesi tersimpan sedang dibaca dari secure store. */
  restoring: boolean;
  login: (pin: string) => Promise<{ error: string } | null>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [restoring, setRestoring] = useState(true);

  useEffect(() => {
    let cancelled = false;
    loadSession()
      .then((restored) => {
        if (!cancelled) setSession(restored);
      })
      .finally(() => {
        if (!cancelled) setRestoring(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (pin: string) => {
    if (pin.length !== PIN_LENGTH) {
      return { error: "PIN tidak dikenali. Coba lagi." };
    }

    let response: Response;
    try {
      response = await fetch(`${SUPABASE_URL}/functions/v1/pin-login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ pin }),
      });
    } catch {
      return { error: NETWORK_ERROR };
    }

    const body = await response.json().catch(() => null);

    if (!response.ok) {
      return { error: body?.error ?? NETWORK_ERROR };
    }

    const next: Session = {
      employeeId: body.employee.id,
      name: body.employee.name,
      role: body.employee.role,
      token: body.token,
      expiresAt: body.expiresAt,
    };

    await saveSession(next);
    setSession(next);
    return null;
  }, []);

  const logout = useCallback(async () => {
    await clearSession();
    setSession(null);
  }, []);

  const value = useMemo(
    () => ({ session, restoring, login, logout }),
    [session, restoring, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth harus dipakai di dalam <AuthProvider>.");
  return value;
}
