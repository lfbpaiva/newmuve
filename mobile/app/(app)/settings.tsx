import { useRouter } from "expo-router";
import { Linking } from "react-native";
import type { ReactNode } from "react";
import { Text, View } from "react-native";
import { useAuth } from "../../../shared/client/AuthContext.tsx";
import { EMAIL_SUPORTE, isPro } from "../../../shared/dominio.ts";
import { Heading, ListItem, Screen } from "../../components/ui";
import { confirmAction } from "../../lib/confirm";
import { forgetPushToken } from "../../lib/push";
import { colors, space, type } from "../../lib/theme";
import { useMe } from "../../lib/useMe";

export default function SettingsScreen() {
  const me = useMe();
  const { signOut } = useAuth();
  const router = useRouter();

  function confirmSignOut() {
    confirmAction({ title: "Sair da conta", message: "Você precisará entrar de novo para usar o app.", confirmLabel: "Sair", cancelLabel: "Ficar", destructive: false, onConfirm: () => void forgetPushToken().finally(() => signOut()) });
  }

  return <Screen>
    <Heading title="Ajustes"/>
    <Group title="Perfil">
      <ListItem icon="person-outline" title="Editar perfil" subtitle="Nome, foto, CPF/CNPJ, telefone e cidade" onPress={() => router.push("/account/edit")}/>
      {me.role === "CONTRACTOR" && <ListItem icon="business-outline" title="Muve Casa" subtitle={isPro(me.casaAte) ? `Ativo até ${new Date(me.casaAte!).toLocaleDateString("pt-BR")}` : "Taxa de 6%, eventos recorrentes e favoritos"} onPress={() => router.push("/casa")}/>}
      {me.role === "MUSICIAN" && <ListItem icon="flash-outline" title="Muve Pro" subtitle={isPro(me.proAte) ? `Ativo até ${new Date(me.proAte!).toLocaleDateString("pt-BR")}` : "Eventos 24h antes e destaque nas inscrições"} onPress={() => router.push("/pro")}/>}
      {me.role === "MUSICIAN" && <ListItem icon="musical-notes-outline" title="Estilos e recebimento" subtitle={`${(me.estilosMusicais ?? []).join(", ")} · chave Pix`} onPress={() => router.push("/account/edit")}/>}
    </Group>
    <Group title="Conta">
      <ListItem icon="shield-checkmark-outline" title="Conta e privacidade" subtitle="Seus dados, e-mail de acesso e encerramento da conta" onPress={() => router.push("/account/privacy")}/>
      <ListItem icon="help-circle-outline" title="Ajuda e suporte" subtitle={EMAIL_SUPORTE} onPress={() => void Linking.openURL(`mailto:${EMAIL_SUPORTE}?subject=${encodeURIComponent(`Muve: ajuda (${me.email})`)}`)}/>
      <ListItem icon="document-text-outline" title="Termos de Uso" subtitle="Taxa, pagamento, cancelamentos e seus dados" onPress={() => router.push("/terms")}/>
      <ListItem icon="log-out-outline" title="Sair da conta" subtitle={me.email} onPress={confirmSignOut} trailing={null}/>
    </Group>
    <Text style={[type.bodySmall, { textAlign: "center" }]}>Muve · versão 1.0</Text>
  </Screen>;
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return <View style={{ gap: space.sm }}>
    <Text style={[type.labelSmall, { paddingHorizontal: space.lg }]}>{title.toUpperCase()}</Text>
    <View style={{ backgroundColor: colors.surface, borderRadius: 20, overflow: "hidden" }}>{children}</View>
  </View>;
}
