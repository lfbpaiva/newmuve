import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import Constants from "expo-constants";
import { Platform } from "react-native";
import { configureClient } from "../../shared/client/config.ts";

function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`Variável ${name} não definida. Consulte mobile/.env.`);
  return value;
}

export const AUTH_REDIRECT_URL = "muve://auth";

function apiUrl(): string {
  const configured = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (configured) return configured;

  const devHost = Platform.OS === "web" ? window.location.hostname : Constants.expoConfig?.hostUri;
  if (devHost) {
    const host = new URL(devHost.includes("://") ? devHost : `http://${devHost}`).hostname;
    const apiHost = Platform.OS === "android" && (host === "localhost" || host === "127.0.0.1") ? "10.0.2.2" : host;
    return `http://${apiHost}:3333/api`;
  }

  throw new Error("Defina EXPO_PUBLIC_API_URL para esta execução do app.");
}

export const supabase = createClient(
  required("EXPO_PUBLIC_SUPABASE_URL", process.env.EXPO_PUBLIC_SUPABASE_URL),
  required("EXPO_PUBLIC_SUPABASE_ANON_KEY", process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY),
  {
    auth: { storage: AsyncStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
  },
);

configureClient({
  supabase,
  apiUrl: apiUrl(),
  redirectUrl: AUTH_REDIRECT_URL,
  storage: {
    get: (key) => AsyncStorage.getItem(key),
    set: (key, value) => AsyncStorage.setItem(key, value),
    remove: (key) => AsyncStorage.removeItem(key),
  },
});
