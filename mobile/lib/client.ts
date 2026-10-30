import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import Constants from "expo-constants";
<<<<<<< HEAD
=======
import * as Linking from "expo-linking";
>>>>>>> upstream/main
import { Platform } from "react-native";
import { configureClient } from "../../shared/client/config.ts";

function required(name: string, value: string | undefined): string {
<<<<<<< HEAD
  if (!value?.trim()) throw new Error("Variável " + name + " não definida. Consulte mobile/.env.example.");
  return value.trim();
}

/** Links de confirmação de e-mail e redefinição de senha. */
export const AUTH_REDIRECT_URL = "muve://auth";

function validatedApiUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("EXPO_PUBLIC_API_URL deve ser uma URL absoluta terminada em /api.");
  }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password ||
      url.pathname.replace(/\/+$/, "") !== "/api" || url.search || url.hash ||
      (!__DEV__ && url.protocol !== "https:")) {
    throw new Error("EXPO_PUBLIC_API_URL inválida: use HTTPS no app distribuído.");
  }
  return url.origin + "/api";
}

function apiUrl(): string {
  // A configuração explícita vale para dispositivo físico e para a API hospedada.
  const configured = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (configured) return validatedApiUrl(configured);
  if (!__DEV__) throw new Error("Defina EXPO_PUBLIC_API_URL para o app distribuído.");

  // Em desenvolvimento, usa o host da rede local anunciado pelo Expo.
  const devHost = Platform.OS === "web" ? window.location.hostname : Constants.expoConfig?.hostUri;
  if (!devHost) throw new Error("Defina EXPO_PUBLIC_API_URL para esta execução do app.");
  const host = new URL(devHost.includes("://") ? devHost : "http://" + devHost).hostname;
  const apiHost = Platform.OS === "android" && (host === "localhost" || host === "127.0.0.1") ? "10.0.2.2" : host;
  return validatedApiUrl("http://" + apiHost + ":3333/api");
}

// Sessão guardada no AsyncStorage do aparelho e renovada pelo SDK.
=======
  if (!value) throw new Error(`Variável ${name} não definida. Consulte mobile/.env.`);
  return value;
}

export const AUTH_REDIRECT_URL = Linking.createURL("auth");

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

>>>>>>> upstream/main
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
