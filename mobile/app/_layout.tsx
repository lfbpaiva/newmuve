import "../lib/client";
import { Archivo_800ExtraBold, Archivo_900Black } from "@expo-google-fonts/archivo";
import { Manrope_500Medium, Manrope_700Bold, Manrope_800ExtraBold, useFonts } from "@expo-google-fonts/manrope";
import * as Linking from "expo-linking";
import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { AuthProvider, useAuth } from "../../shared/client/AuthContext.tsx";
import { supabase } from "../lib/client";
import { colors } from "../lib/theme";

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [fontsLoaded] = useFonts({ Manrope_500Medium, Manrope_700Bold, Manrope_800ExtraBold, Archivo_800ExtraBold, Archivo_900Black });
  if (!fontsLoaded) return null;
  return <AuthProvider>
    <StatusBar style="light"/>
    <AuthGate/>
  </AuthProvider>;
}

/** Abre a sessão a partir dos links de confirmação de e-mail e de redefinição de senha (muve://auth#access_token=...). */
function useAuthLinks() {
  useEffect(() => {
    async function handle(url: string | null) {
      if (!url?.startsWith("muve://auth")) return;
      const params = new URLSearchParams(url.split("#")[1] ?? url.split("?")[1] ?? "");
      const access_token = params.get("access_token");
      const refresh_token = params.get("refresh_token");
      if (access_token && refresh_token) await supabase.auth.setSession({ access_token, refresh_token });
    }
    Linking.getInitialURL().then(handle);
    const subscription = Linking.addEventListener("url", (event) => handle(event.url));
    return () => subscription.remove();
  }, []);
}

// Decide entre as telas públicas e as autenticadas; a sessão vem do AuthContext compartilhado com a web.
function AuthGate() {
  const { state, recoveringPassword } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  useAuthLinks();

  useEffect(() => {
    if (state.status === "loading") return;
    SplashScreen.hideAsync().catch(() => {});
    const inAuthGroup = segments[0] === "(auth)";
    if (recoveringPassword) router.replace("/(auth)/reset");
    else if (state.status === "signedIn" && inAuthGroup) router.replace("/(app)");
    else if (state.status === "signedOut" && !inAuthGroup) router.replace("/(auth)/login");
  }, [state.status, recoveringPassword, segments, router]);

  return <Stack screenOptions={{
    headerStyle: { backgroundColor: colors.bg },
    headerShadowVisible: false,
    headerTintColor: colors.ink,
    headerTitleStyle: { fontFamily: "Archivo_800ExtraBold", fontSize: 15 },
    headerBackButtonDisplayMode: "minimal",
    contentStyle: { backgroundColor: colors.bg },
    animation: "slide_from_right",
  }}>
    <Stack.Screen name="(auth)" options={{ headerShown: false }}/>
    <Stack.Screen name="(app)" options={{ headerShown: false }}/>
    <Stack.Screen name="event/new" options={{ title: "NOVO EVENTO" }}/>
    <Stack.Screen name="event/[id]/index" options={{ title: "" }}/>
    <Stack.Screen name="event/[id]/edit" options={{ title: "EDITAR EVENTO" }}/>
    <Stack.Screen name="event/[id]/checkout" options={{ title: "PAGAMENTO" }}/>
    <Stack.Screen name="event/[id]/hiring" options={{ title: "CONTRATAÇÃO" }}/>
    <Stack.Screen name="account/edit" options={{ title: "EDITAR PERFIL" }}/>
    <Stack.Screen name="account/privacy" options={{ title: "CONTA E PRIVACIDADE" }}/>
    <Stack.Screen name="account/delete" options={{ title: "EXCLUIR CONTA" }}/>
  </Stack>;
}
