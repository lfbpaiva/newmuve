import { Tabs } from "expo-router";
import { useAuth } from "../../../shared/client/AuthContext.tsx";
import { BarraDeAbas } from "../../components/BarraDeAbas";

export default function AppLayout() {
  const { state } = useAuth();
  if (state.status !== "signedIn") return null;
  const isMusician = state.me.role === "MUSICIAN";

  return <Tabs tabBar={(props) => <BarraDeAbas {...props}/>} screenOptions={{ headerShown: false, animation: "fade" }}>
    <Tabs.Screen name="index" options={{ title: "Início" }}/>
    <Tabs.Screen name="events" options={{ title: isMusician ? "Inscrições" : "Eventos" }}/>
    <Tabs.Screen name="profile" options={{ title: "Perfil" }}/>
    <Tabs.Screen name="settings" options={{ title: "Ajustes" }}/>
  </Tabs>;
}
