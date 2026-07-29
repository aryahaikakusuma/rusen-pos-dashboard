import "react-native-url-polyfill/auto";

import { createClient } from "@supabase/supabase-js";

import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./env";
import { getActiveToken } from "./session";

/**
 * Klien Supabase untuk aplikasi mobile.
 *
 * Berbeda dengan aplikasi web — yang memakai service_role dan melewati RLS —
 * klien ini memakai anon key dan tunduk penuh pada policy RLS. Hak aksesnya
 * datang dari token yang diterbitkan Edge Function `pin-login`.
 *
 * Auth bawaan Supabase sengaja dimatikan: identitas di sini adalah PIN pegawai,
 * bukan email/password, jadi tidak ada sesi GoTrue yang perlu dijaga. Opsi
 * `accessToken` adalah jalur resmi untuk memasok token dari sumber lain.
 */
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  accessToken: async () => getActiveToken(),
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});
