import "../lib/client";
import { Geist_400Regular, Geist_500Medium, Geist_600SemiBold, Geist_700Bold, useFonts } from "@expo-google-fonts/geist";
import * as Linking from "expo-linking";
import { Stack, useRouter } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import { AuthProvider, useAuth } from "../../shared/client/AuthContext.tsx";
import { Abertura } from "../components/Abertura";
import { consumeAuthLink } from "../lib/authLinks";
import { usePushNotifications } from "../lib/push";
import { colors, stackOptions } from "../lib/theme";

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [fontsLoaded] = useFonts({ Geist_400Regular, Geist_500Medium, Geist_600SemiBold, Geist_700Bold });
  const [abrindo, setAbrindo] = useState(true);
  const encerrarAbertura = useCallback(() => setAbrindo(false), []);
  useEffect(() => {
    if (fontsLoaded) SplashScreen.hideAsync().catch(() => {});
  }, [fontsLoaded]);
  if (!fontsLoaded) return null;
  return <AuthProvider>
    <StatusBar style="light"/>
    <WebFrame>
      <AuthGate/>
      {abrindo && <Abertura onFim={encerrarAbertura}/>}
    </WebFrame>
  </AuthProvider>;
}

function WebFrame({ children }: { children: ReactNode }) {
  if (Platform.OS !== "web") return children;
  return <View style={{ flex: 1, alignItems: "center", backgroundColor: "#050508" }}>
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
      <Stack.Screen name="event/new" options={{ title: "Novo evento" }}/>
      <Stack.Screen name="event/[id]/index" options={{ title: "" }}/>
      <Stack.Screen name="event/[id]/edit" options={{ title: "Editar evento" }}/>
      <Stack.Screen name="event/[id]/checkout" options={{ title: "Pagamento" }}/>
      <Stack.Screen name="event/[id]/hiring" options={{ title: "Contratação" }}/>
      <Stack.Screen name="event/[id]/candidate/[candidateId]" options={{ title: "Perfil do músico" }}/>
      <Stack.Screen name="conversa/[candidateId]" options={{ title: "Conversa" }}/>
      <Stack.Screen name="notificacoes" options={{ title: "Notificações" }}/>
      <Stack.Screen name="pro" options={{ title: "Muve Pro" }}/>
      <Stack.Screen name="casa" options={{ title: "Muve Casa" }}/>
      <Stack.Screen name="favoritos" options={{ title: "Favoritos" }}/>
      <Stack.Screen name="agenda" options={{ title: "Agenda" }}/>
      <Stack.Screen name="account/edit" options={{ title: "Editar perfil" }}/>
      <Stack.Screen name="account/privacy" options={{ title: "Conta e privacidade" }}/>
      <Stack.Screen name="account/delete" options={{ title: "Excluir conta" }}/>
    </Stack.Protected>
    <Stack.Screen name="terms" options={{ title: "Termos de Uso" }}/>
    <Stack.Screen name="auth" options={{ headerShown: false }}/>
  </Stack>;
}
