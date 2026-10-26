import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { useAuth } from "../../shared/client/AuthContext.tsx";
import { Button, Heading, Loading, Screen } from "../components/ui";
import { space, type } from "../lib/theme";

export default function AuthLinkScreen() {
  const { state, recoveringPassword } = useAuth();
  const router = useRouter();
  const [waited, setWaited] = useState(false);

  useEffect(() => {
    if (state.status === "signedIn" && !recoveringPassword) router.replace("/");
  }, [state.status, recoveringPassword, router]);

  useEffect(() => {
    const timer = setTimeout(() => setWaited(true), 4000);
    return () => clearTimeout(timer);
  }, []);

  if (state.status !== "signedOut" || !waited) return <Screen><Loading label="Confirmando o link..." cards={1}/></Screen>;

  return <Screen>
    <View style={{ gap: space.md, paddingTop: space.xl }}>
      <Heading title="Link expirado" subtitle="Este link já foi usado ou passou da validade."/>
      <Text style={type.body}>Se você acabou de confirmar o e-mail, a conta já está ativa: é só entrar. Para trocar a senha, peça um novo link.</Text>
      <Button title="Ir para o login" onPress={() => router.replace("/(auth)/login")}/>
    </View>
  </Screen>;
}
