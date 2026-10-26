import { Stack } from "expo-router";
import { stackOptions } from "../../lib/theme";

export default function AuthLayout() {
  return <Stack screenOptions={stackOptions}>
    <Stack.Screen name="login" options={{ headerShown: false }}/>
    <Stack.Screen name="signup" options={{ title: "" }}/>
    <Stack.Screen name="recover" options={{ title: "" }}/>
    <Stack.Screen name="reset" options={{ title: "Nova senha", headerShown: false }}/>
  </Stack>;
}
