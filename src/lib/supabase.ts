import { createClient } from "@supabase/supabase-js";
import { configureClient } from "../../shared/client/config.ts";
import { env } from "../config/env";

// Cliente do navegador: usa apenas a chave pública. A sessão fica no
// localStorage e é renovada automaticamente pelo SDK.
export const supabase = createClient(env.supabaseUrl, env.supabaseAnonKey);

configureClient({
  supabase,
  apiUrl: env.apiUrl,
  redirectUrl: window.location.origin,
  storage: {
    get: async (key) => localStorage.getItem(key),
    set: async (key, value) => localStorage.setItem(key, value),
    remove: async (key) => localStorage.removeItem(key),
  },
});
