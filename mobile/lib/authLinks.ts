import * as WebBrowser from "expo-web-browser";
import { Platform } from "react-native";
import { AUTH_REDIRECT_URL, supabase } from "./client";

WebBrowser.maybeCompleteAuthSession();

export async function consumeAuthLink(url: string | null, onRecovery: () => void): Promise<void> {
  if (!url?.includes("access_token=")) return;
  const params = new URLSearchParams(url.split("#")[1] ?? url.split("?")[1] ?? "");
  const access_token = params.get("access_token");
  const refresh_token = params.get("refresh_token");
  if (!access_token || !refresh_token) return;
  if (params.get("type") === "recovery") onRecovery();
  await supabase.auth.setSession({ access_token, refresh_token });
  if (Platform.OS === "web") window.history.replaceState(null, "", window.location.pathname);
}

const googleIndisponivel = () => new Error("O login com Google ainda não foi ativado. Use e-mail e senha por enquanto.");

export async function signInWithGoogle(): Promise<void> {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: AUTH_REDIRECT_URL, skipBrowserRedirect: true },
  });
  if (error || !data.url) throw googleIndisponivel();

  const providerCheck = await fetch(data.url, { method: "GET", redirect: "manual" }).catch(() => null);
  if (providerCheck && providerCheck.status >= 400) throw googleIndisponivel();

  if (Platform.OS === "web") {
    window.location.assign(data.url);
    return;
  }
  const result = await WebBrowser.openAuthSessionAsync(data.url, AUTH_REDIRECT_URL);
  if (result.type === "success") await consumeAuthLink(result.url, () => {});
}
