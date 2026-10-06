import { Tabs } from "expo-router";
import type { ColorValue } from "react-native";
import { useAuth } from "../../../shared/client/AuthContext.tsx";
import { Icon, type IconName } from "../../components/ui";
import { colors } from "../../lib/theme";

const tab = (outline: IconName, filled: IconName) => ({ color, focused }: { color: ColorValue; focused: boolean }) => <Icon name={focused ? filled : outline} size={22} color={String(color)}/>;

export default function AppLayout() {
  const { state } = useAuth();
  if (state.status !== "signedIn") return null;
  const isMusician = state.me.role === "MUSICIAN";

  return <Tabs screenOptions={{
    headerShown: false,
    tabBarStyle: { backgroundColor: colors.bg, borderTopColor: colors.line, height: 66, paddingTop: 8 },
    tabBarLabelStyle: { fontFamily: "Manrope_800ExtraBold", fontSize: 10, letterSpacing: 1, textTransform: "uppercase" },
    tabBarActiveTintColor: colors.accent,
    tabBarInactiveTintColor: colors.ink2,
  }}>
    <Tabs.Screen name="index" options={{ title: "Início", tabBarIcon: tab("home-outline", "home") }}/>
    <Tabs.Screen name="events" options={{ title: isMusician ? "Inscrições" : "Eventos", tabBarIcon: tab("calendar-outline", "calendar") }}/>
    <Tabs.Screen name="profile" options={{ title: "Perfil", tabBarIcon: tab("person-outline", "person") }}/>
    <Tabs.Screen name="settings" options={{ title: "Ajustes", tabBarIcon: tab("settings-outline", "settings") }}/>
  </Tabs>;
}
