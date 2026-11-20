import { Stack } from "expo-router";
import { voltarNaWeb } from "../../components/BotaoVoltar";
import { stackOptions } from "../../lib/theme";

export const unstable_settings = { anchor: "login" };

export default function AuthLayout() {
  return <Stack screenOptions={{ ...stackOptions, ...voltarNaWeb }}>
    <Stack.Screen name="index" options={{ headerShown: false, animation: "none" }}/>
    <Stack.Screen name="login" options={{ headerShown: false }}/>
    <Stack.Screen name="signup" options={{ title: "" }}/>
    <Stack.Screen name="recover" options={{ title: "" }}/>
    <Stack.Screen name="reset" options={{ title: "Nova senha", headerShown: false }}/>
    <Stack.Screen name="completar" options={{ headerShown: false }}/>
  </Stack>;
}
