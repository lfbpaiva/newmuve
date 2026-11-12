import { useRouter } from "expo-router";
import { Children, useState, type ReactNode } from "react";
import { Text, View } from "react-native";
import { useAuth } from "../../../shared/client/AuthContext.tsx";
import { EMAIL_SUPORTE, isPro } from "../../../shared/dominio.ts";
import { TopBar } from "../../components/TopBar";
import { Alert, ListItem, Screen, TituloGrande } from "../../components/ui";
import { confirmAction } from "../../lib/confirm";
import { forgetPushToken } from "../../lib/push";
import { escreverParaSuporte } from "../../lib/suporte";
import { colors, space, styles, type } from "../../lib/theme";
import { useMe } from "../../lib/useMe";

export default function SettingsScreen() {
  const me = useMe();
  const { signOut } = useAuth();
  const router = useRouter();
  const [linkError, setLinkError] = useState("");

  function confirmSignOut() {
    confirmAction({ title: "Sair da conta", message: "Você precisará entrar de novo para usar o app.", confirmLabel: "Sair", cancelLabel: "Ficar", destructive: false, onConfirm: () => void forgetPushToken().finally(() => signOut()) });
  }

  const estilos = (me.estilosMusicais ?? []).join(", ");
  const recebimento = [estilos || "Escolha seus estilos", me.chavePix ? "chave Pix cadastrada" : "cadastre sua chave Pix"].join(" · ");

  return <Screen topo={<TopBar titulo="Ajustes"/>}>
    <TituloGrande titulo="Ajustes" subtitulo={me.email}/>
    <Group title="Perfil">
      <ListItem icon="person-outline" title="Editar perfil" subtitle="Nome, foto, CPF/CNPJ, telefone e cidade" onPress={() => router.push("/account/edit")}/>
      {me.role === "CONTRACTOR" && <ListItem icon="business-outline" title="Muve Casa" subtitle={isPro(me.casaAte) ? `Ativo até ${new Date(me.casaAte!).toLocaleDateString("pt-BR")}` : "Taxa de 6%, eventos recorrentes e favoritos"} onPress={() => router.push("/casa")}/>}
      {me.role === "MUSICIAN" && <ListItem icon="flash-outline" title="Muve Pro" subtitle={isPro(me.proAte) ? `Ativo até ${new Date(me.proAte!).toLocaleDateString("pt-BR")}` : "Eventos 24h antes e destaque nas inscrições"} onPress={() => router.push("/pro")}/>}
      {me.role === "MUSICIAN" && <ListItem icon="musical-notes-outline" title="Estilos e recebimento" subtitle={recebimento} onPress={() => router.push("/account/edit")}/>}
    </Group>
    <Group title="Conta">
      <ListItem icon="shield-checkmark-outline" title="Conta e privacidade" subtitle="Seus dados e encerramento da conta" onPress={() => router.push("/account/privacy")}/>
      <ListItem icon="help-circle-outline" title="Ajuda e suporte" subtitle={EMAIL_SUPORTE} onPress={() => { setLinkError(""); escreverParaSuporte(`Muve: ajuda (${me.email})`, setLinkError); }}/>
      <ListItem icon="document-text-outline" title="Termos de Uso" subtitle="Taxa, pagamento, cancelamentos e seus dados" onPress={() => router.push("/terms")}/>
      <ListItem icon="log-out-outline" title="Sair da conta" subtitle="Você pode entrar de novo quando quiser" tone="danger" onPress={confirmSignOut} trailing={null}/>
    </Group>
    {linkError ? <Alert tone="error">{linkError}</Alert> : null}
    <Text style={[type.bodySmall, { textAlign: "center" }]}>Muve · versão 1.0</Text>
  </Screen>;
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  const itens = Children.toArray(children).filter(Boolean);
  return <View style={{ gap: space.sm }}>
    <Text style={[type.labelSmall, { paddingHorizontal: space.xs }]}>{title}</Text>
    <View style={[styles.card, { paddingVertical: space.xs, gap: 0 }]}>
      {itens.map((item, index) => <View key={index} style={{ borderTopWidth: index ? 1 : 0, borderTopColor: colors.hairline }}>{item}</View>)}
    </View>
  </View>;
}
