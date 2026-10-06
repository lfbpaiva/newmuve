import { useRouter } from "expo-router";
import { Linking, Text, View } from "react-native";
import { fetchMyEvents, fetchReviewsOf } from "../../../shared/client/events.ts";
import { formatDateTime } from "../../../shared/client/format.ts";
import { useAsync } from "../../../shared/client/useAsync.ts";
import { maskDocumento, maskPhone } from "../../../shared/client/validators.ts";
import { ROTULOS_CHAVE_PIX, type TipoChavePix } from "../../../shared/dominio.ts";
import { EventStatusPill } from "../../components/events";
import { Avatar, Button, ErrorState, Icon, Pill, RatingSummary, Screen, Section, Stars, Tag, type IconName } from "../../components/ui";
import { colors, space, styles, type } from "../../lib/theme";
import { useMe } from "../../lib/useMe";

// "Meu perfil": exibe exclusivamente os dados da conta autenticada.
export default function ProfileScreen() {
  const me = useMe();
  const router = useRouter();
  const isMusician = me.role === "MUSICIAN";

  const rows: { icon: IconName; text: string }[] = [
    ...(me.documento ? [{ icon: "card-outline" as IconName, text: `${me.documento.length === 11 ? "CPF" : "CNPJ"} ${maskDocumento(me.documento)}` }] : []),
    ...(me.telefone ? [{ icon: "call-outline" as IconName, text: maskPhone(me.telefone) }] : []),
    { icon: "mail-outline", text: me.email },
    ...(me.cidade ? [{ icon: "location-outline" as IconName, text: `${me.cidade}, ${me.uf}` }] : []),
    ...(isMusician && me.chavePix ? [{ icon: "flash-outline" as IconName, text: `Pix (${ROTULOS_CHAVE_PIX[me.chavePixTipo as TipoChavePix] ?? me.chavePixTipo}): ${me.chavePix}` }] : []),
  ];

  return <Screen>
    <View style={{ gap: space.lg }}>
      <View style={styles.rule}/>
      <View style={[styles.row, { gap: space.lg }]}>
        <Avatar uri={me.fotoPerfilUrl} name={me.nome} size={88}/>
        <View style={{ flex: 1, gap: space.sm }}>
          <Pill text={isMusician ? "Músico" : "Contratante"}/>
          <Text style={type.headline} accessibilityRole="header">{me.nome}</Text>
          <RatingSummary media={me.avaliacaoMedia} total={me.totalAvaliacoes}/>
        </View>
      </View>
      <Button title="Editar perfil" variant="outlined" icon="create-outline" onPress={() => router.push("/account/edit")}/>
    </View>
    {isMusician && (me.bio || me.portfolioUrl) && <View style={[styles.card, { gap: space.md }]}>
      {me.bio ? <Text style={type.body}>{me.bio}</Text> : null}
      {me.portfolioUrl ? <Button title="Ver meu trabalho" variant="outlined" icon="play-circle-outline" onPress={() => Linking.openURL(me.portfolioUrl!)}/> : null}
    </View>}
    {isMusician && <View style={[styles.row, { flexWrap: "wrap" }]}>{(me.estilosMusicais ?? []).map((estilo) => <Tag key={estilo} text={estilo}/>)}</View>}
    <View style={styles.card}>
      {rows.map((row, i) => <View key={row.text} style={[styles.row, { gap: 12, minHeight: 36, borderTopWidth: i ? 1 : 0, borderTopColor: colors.line, paddingTop: i ? 8 : 0 }]}>
        <Icon name={row.icon} size={18} color={colors.ink2}/><Text style={[type.body, { flex: 1 }]}>{row.text}</Text>
      </View>)}
    </View>
    <ReviewsReceived userId={me.id}/>
    {!isMusician && <EventHistory contractorId={me.id}/>}
  </Screen>;
}

function ReviewsReceived({ userId }: { userId: string }) {
  const reviews = useAsync(`my-reviews:${userId}`, () => fetchReviewsOf(userId));
  return <Section title="Avaliações recebidas">
    {reviews.error && <ErrorState message={reviews.error} onRetry={reviews.reload}/>}
    {reviews.data?.length === 0 && <Text style={type.bodySmall}>Depois do primeiro show concluído, a avaliação da outra parte aparece aqui.</Text>}
    {reviews.data?.map((review) => <View key={review.id} style={styles.card}>
      <View style={styles.between}><Stars rating={review.rating}/><Text style={type.bodySmall}>{new Date(review.createdAt).toLocaleDateString("pt-BR")}</Text></View>
      {review.comment && <Text style={type.body}>{review.comment}</Text>}
    </View>)}
  </Section>;
}

function EventHistory({ contractorId }: { contractorId: string }) {
  const events = useAsync(`history:${contractorId}`, () => fetchMyEvents(contractorId));
  return <Section title="Histórico de eventos">
    {events.error && <ErrorState message={events.error} onRetry={events.reload}/>}
    {events.data?.length === 0 && <Text style={type.bodySmall}>Nenhum evento criado até o momento.</Text>}
    {events.data?.map((event) => <View key={event.id} style={styles.card}>
      <View style={styles.between}><Text style={[type.titleSmall, { flex: 1 }]} numberOfLines={1}>{event.titulo}</Text><EventStatusPill status={event.status}/></View>
      <Text style={type.bodySmall}>{formatDateTime(event.inicio)} · {event.cidade}, {event.uf}</Text>
    </View>)}
  </Section>;
}
