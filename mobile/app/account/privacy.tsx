import { useRouter } from "expo-router";
import { Text, View } from "react-native";
import { Button, Heading, Icon, Screen, type IconName } from "../../components/ui";
import { colors, space, styles, type } from "../../lib/theme";
import { useMe } from "../../lib/useMe";

// Explica o que a plataforma guarda e por quê. A exclusão fica no fim, como
// ação secundária, e ainda exige e-mail e senha na tela seguinte.
export default function PrivacyScreen() {
  const me = useMe();
  const router = useRouter();

  const items: { icon: IconName; title: string; text: string }[] = [
    { icon: "mail-outline", title: "E-mail de acesso", text: `${me.email}. Para trocar, entre em contato com o suporte.` },
    { icon: "card-outline", title: "CPF/CNPJ e telefone", text: "Usados para identificar a conta e, no caso do músico, para o repasse do cachê. Nunca aparecem para outros usuários; só o telefone é compartilhado com a outra parte depois de uma contratação." },
    { icon: "location-outline", title: "Cidade", text: "Define quais eventos aparecem para você e a que distância. O endereço exato de um evento só é mostrado ao músico contratado." },
    { icon: "star-outline", title: "Avaliações", text: "As notas que você recebe são públicas no seu perfil e ajudam a outra parte a decidir." },
  ];

  return <Screen>
    <Heading title="Conta e privacidade" subtitle="O que a Muve guarda sobre você e para que cada dado serve."/>
    <View style={[styles.card, { gap: space.lg }]}>
      {items.map((item) => <View key={item.title} style={[styles.row, { alignItems: "flex-start", gap: 14 }]}>
        <Icon name={item.icon} size={20} color={colors.accent}/>
        <View style={{ flex: 1, gap: 2 }}><Text style={type.titleSmall}>{item.title}</Text><Text style={type.bodySmall}>{item.text}</Text></View>
      </View>)}
    </View>
    <View style={{ gap: space.sm, marginTop: space.xl }}>
      <Text style={type.title}>Encerrar a conta</Text>
      <Text style={type.bodySmall}>Remove seu perfil, eventos, candidaturas e avaliações de forma permanente. Não é possível enquanto houver um show contratado em andamento.</Text>
      <Button title="Quero excluir minha conta" variant="text" block={false} onPress={() => router.push("/account/delete")}/>
    </View>
  </Screen>;
}
