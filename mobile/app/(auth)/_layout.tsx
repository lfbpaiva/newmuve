import { Stack } from "expo-router";
import { colors } from "../../lib/theme";

export default function AuthLayout() {
  return <Stack screenOptions={{ headerStyle: { backgroundColor: colors.bg }, headerShadowVisible: false, headerTintColor: colors.ink, headerTitleStyle: { fontFamily: "Archivo_800ExtraBold", fontSize: 15 }, headerBackButtonDisplayMode: "minimal", contentStyle: { backgroundColor: colors.bg } }}>
    <Stack.Screen name="login" options={{ headerShown: false }}/>
    <Stack.Screen name="signup" options={{ title: "" }}/>
    <Stack.Screen name="recover" options={{ title: "" }}/>
    <Stack.Screen name="reset" options={{ title: "Nova senha", headerShown: false }}/>
  </Stack>;
}
