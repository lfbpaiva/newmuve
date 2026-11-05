import "../lib/client";
import { Archivo_800ExtraBold, Archivo_900Black } from "@expo-google-fonts/archivo";
import { Manrope_500Medium, Manrope_700Bold, Manrope_800ExtraBold, useFonts } from "@expo-google-fonts/manrope";
import * as Linking from "expo-linking";
import { Stack, useRouter } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect, type ReactNode } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import { AuthProvider, useAuth } from "../../shared/client/AuthContext.tsx";
import { consumeAuthLink } from "../lib/authLinks";
import { usePushNotifications } from "../lib/push";
import { colors, stackOptions } from "../lib/theme";

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [fontsLoaded] = useFonts({ Manrope_500Medium, Manrope_700Bold, Manrope_800ExtraBold, Archivo_800ExtraBold, Archivo_900Black });
  if (!fontsLoaded) return null;
  return <AuthProvider>
    <StatusBar style="light"/>
    <WebFrame><AuthGate/></WebFrame>
  </AuthProvider>;
}

function WebFrame({ children }: { children: ReactNode }) {
  if (Platform.OS !== "web") return children;
  return <View style={{ flex: 1, alignItems: "center", backgroundColor: "#050506" }}>
    <View style={{ flex: 1, width: "100%", maxWidth: 480, backgroundColor: colors.bg, borderLeftWidth: 1, borderRightWidth: 1, borderColor: colors.line, overflow: "hidden" }}>
      {children}
    </View>
  </View>;
}

function useAuthLinks() {
  const { beginPasswordRecovery } = useAuth();
  useEffect(() => {
    const handle = (url: string | null) => consumeAuthLink(url, beginPasswordRecovery);
    Linking.getInitialURL().then(handle);
    const subscription = Linking.addEventListener("url", (event) => handle(event.url));
    return () => subscription.remove();
  }, [beginPasswordRecovery]);
}

function AuthGate() {
  const { state, recoveringPassword, retrySession } = useAuth();
  const router = useRouter();
  useAuthLinks();
  usePushNotifications(state.status === "signedIn");
  const loading = state.status === "loading";
  const signedIn = state.status === "signedIn" && !recoveringPassword;

  useEffect(() => {
    if (loading) return;
    SplashScreen.hideAsync().catch(() => {});
    if (recoveringPassword) router.replace("/(auth)/reset");
    else if (state.status === "needsProfile") router.replace("/(auth)/completar");
  }, [loading, recoveringPassword, state.status, router]);

  if (loading) return null;

  if (state.status === "error") return <View style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 24, backgroundColor: colors.bg }}>
    <Text style={{ color: colors.ink, textAlign: "center", marginBottom: 20 }}>{state.notice}</Text>
    <Pressable onPress={() => void retrySession()} accessibilityRole="button" style={({ pressed }) => ({ paddingVertical: 14, paddingHorizontal: 20, backgroundColor: pressed ? colors.accentPressed : colors.accent, borderRadius: 4 })}>
      <Text style={{ color: colors.onAccent, fontWeight: "700" }}>Tentar novamente</Text>
    </Pressable>
  </View>;

  return <Stack screenOptions={{ ...stackOptions, animation: "slide_from_right" }}>
    <Stack.Protected guard={!signedIn}>
      <Stack.Screen name="(auth)" options={{ headerShown: false }}/>
    </Stack.Protected>
    <Stack.Protected guard={signedIn}>
      <Stack.Screen name="(app)" options={{ headerShown: false }}/>
      <Stack.Screen name="event/new" options={{ title: "NOVO EVENTO" }}/>
      <Stack.Screen name="event/[id]/index" options={{ title: "" }}/>
      <Stack.Screen name="event/[id]/edit" options={{ title: "EDITAR EVENTO" }}/>
      <Stack.Screen name="event/[id]/checkout" options={{ title: "PAGAMENTO" }}/>
      <Stack.Screen name="event/[id]/hiring" options={{ title: "CONTRATAÇÃO" }}/>
      <Stack.Screen name="event/[id]/candidate/[candidateId]" options={{ title: "PERFIL DO MÚSICO" }}/>
      <Stack.Screen name="conversa/[candidateId]" options={{ title: "CONVERSA" }}/>
      <Stack.Screen name="notificacoes" options={{ title: "NOTIFICAÇÕES" }}/>
      <Stack.Screen name="pro" options={{ title: "MUVE PRO" }}/>
      <Stack.Screen name="casa" options={{ title: "MUVE CASA" }}/>
      <Stack.Screen name="favoritos" options={{ title: "FAVORITOS" }}/>
      <Stack.Screen name="agenda" options={{ title: "AGENDA" }}/>
      <Stack.Screen name="account/edit" options={{ title: "EDITAR PERFIL" }}/>
      <Stack.Screen name="account/privacy" options={{ title: "CONTA E PRIVACIDADE" }}/>
      <Stack.Screen name="account/delete" options={{ title: "EXCLUIR CONTA" }}/>
    </Stack.Protected>
    <Stack.Screen name="terms" options={{ title: "TERMOS DE USO" }}/>
    <Stack.Screen name="auth" options={{ headerShown: false }}/>
  </Stack>;
}
