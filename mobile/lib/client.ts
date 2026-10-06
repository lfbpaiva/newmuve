import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import { configureClient } from "../../shared/client/config.ts";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Variável ${name} não definida. Consulte mobile/.env.example.`);
  return value;
}

/** Os links de confirmação de e-mail e de redefinição de senha abrem o app neste endereço. */
export const AUTH_REDIRECT_URL = "muve://auth";

// Sessão guardada no AsyncStorage do aparelho e renovada pelo SDK.
export const supabase = createClient(required("EXPO_PUBLIC_SUPABASE_URL"), required("EXPO_PUBLIC_SUPABASE_ANON_KEY"), {
  auth: { storage: AsyncStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
});

configureClient({
  supabase,
  apiUrl: required("EXPO_PUBLIC_API_URL"),
  redirectUrl: AUTH_REDIRECT_URL,
  storage: {
    get: (key) => AsyncStorage.getItem(key),
    set: (key, value) => AsyncStorage.setItem(key, value),
    remove: (key) => AsyncStorage.removeItem(key),
  },
});
