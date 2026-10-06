import { useRouter } from "expo-router";
import { Alert as NativeAlert, Text, View } from "react-native";
import { useAuth } from "../../../shared/client/AuthContext.tsx";
import { Heading, ListItem, Screen } from "../../components/ui";
import { colors, space, type } from "../../lib/theme";
import { useMe } from "../../lib/useMe";

// Ajustes em grupos. A exclusão da conta fica dentro de "Conta e privacidade",
// atrás de uma tela explicativa: ações irreversíveis não ficam a um toque da lista.
export default function SettingsScreen() {
  const me = useMe();
  const { signOut } = useAuth();
  const router = useRouter();

  function confirmSignOut() {
    NativeAlert.alert("Sair da conta", "Você precisará entrar de novo para usar o app.", [
      { text: "Ficar", style: "cancel" },
      { text: "Sair", onPress: () => void signOut() },
    ]);
  }

  return <Screen>
    <Heading title="Ajustes"/>
    <Group title="Perfil">
      <ListItem icon="person-outline" title="Editar perfil" subtitle="Nome, foto, CPF/CNPJ, telefone e cidade" onPress={() => router.push("/account/edit")}/>
      {me.role === "MUSICIAN" && <ListItem icon="musical-notes-outline" title="Estilos e recebimento" subtitle={`${(me.estilosMusicais ?? []).join(", ")} · chave Pix`} onPress={() => router.push("/account/edit")}/>}
    </Group>
    <Group title="Conta">
      <ListItem icon="shield-checkmark-outline" title="Conta e privacidade" subtitle="Seus dados, e-mail de acesso e encerramento da conta" onPress={() => router.push("/account/privacy")}/>
      <ListItem icon="log-out-outline" title="Sair da conta" subtitle={me.email} onPress={confirmSignOut} trailing={null}/>
    </Group>
    <Text style={[type.bodySmall, { textAlign: "center" }]}>Muve · versão 1.0</Text>
  </Screen>;
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return <View style={{ gap: space.sm }}>
    <Text style={[type.labelSmall, { paddingHorizontal: space.lg }]}>{title.toUpperCase()}</Text>
    <View style={{ backgroundColor: colors.surface, borderRadius: 20, overflow: "hidden" }}>{children}</View>
  </View>;
}
