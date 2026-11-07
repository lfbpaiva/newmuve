import { useRouter } from "expo-router";
import type { ReactNode } from "react";
import { Image, Pressable, Text, View } from "react-native";
import { fetchMyApplications, fetchMyEvents, type Application, type EventItem } from "../../../shared/client/events.ts";
import { eventDateParts, formatCurrency } from "../../../shared/client/format.ts";
import { useAsync } from "../../../shared/client/useAsync.ts";
import { EventStatusPill, withEncerrado } from "../../components/events";
import { Button, EmptyState, ErrorState, Icon, Loading, Pill, Screen } from "../../components/ui";
import { colors, radius, space, styles, type } from "../../lib/theme";
import { useMe } from "../../lib/useMe";
import { useRefreshOnFocus } from "../../lib/useRefreshOnFocus";

export default function EventsScreen() {
  const me = useMe();
  return me.role === "MUSICIAN" ? <MyApplications/> : <MyEvents/>;
}

function applicationLabel({ status, event }: Application): { text: string; tone: "accent" | "success" | "muted" } {
  if (event.status === "CANCELADO") return { text: "Evento cancelado", tone: "muted" };
  if (event.status === "ABERTO" && new Date(event.inicio) <= new Date()) return { text: "Encerrado sem contratação", tone: "muted" };
  if (status === "APROVADO") return { text: event.status === "CONCLUIDO" ? "Show concluído" : "Você foi contratado", tone: "success" };
  if (status === "RECUSADO") return { text: "Não selecionado", tone: "muted" };
  return { text: "Aguardando resposta", tone: "accent" };
}

function ListHeading({ title, subtitle }: { title: string; subtitle: string }) {
  return <View style={{ borderTopWidth: 2, borderTopColor: colors.accent, paddingTop: space.md, gap: space.xs }}>
    <Text style={[type.headline, { textTransform: "none", fontSize: 28, lineHeight: 33 }]} accessibilityRole="header">{title}</Text>
    <Text style={[type.bodySmall, { fontSize: 14, lineHeight: 21 }]}>{subtitle}</Text>
  </View>;
}

function EventListCard({ event, status, onPress }: { event: EventItem; status: ReactNode; onPress: () => void }) {
  const { day, month, time } = eventDateParts(event.inicio, event.uf);
  return <Pressable accessibilityRole="button" accessibilityLabel={`${event.titulo}, ${day} de ${month}, ${event.cidade}`} onPress={onPress} style={({ pressed }) => [styles.card, { borderWidth: 1, borderColor: colors.line, gap: space.md, opacity: pressed ? 0.75 : 1 }]}>
    <View style={[styles.row, { alignItems: "flex-start", gap: space.md }]}>
      <Image source={{ uri: event.imagemUrl }} style={{ width: 72, height: 72, borderRadius: radius.sm, backgroundColor: colors.surface2 }}/>
      <View style={{ flex: 1, minWidth: 0, gap: space.xs }}>
        <Text style={type.titleSmall}>{event.titulo}</Text>
        <Text style={[type.bodySmall, { fontSize: 14, lineHeight: 21 }]}>{day} {month} · {time} · {event.cidade}, {event.uf}</Text>
        <Text style={[type.bodySmall, { fontSize: 14, lineHeight: 21, color: colors.ink }]}>Cachê oferecido: {formatCurrency(event.cache)}</Text>
      </View>
      <Icon name="arrow-forward" size={18} color={colors.accentText}/>
    </View>
    <View style={{ borderTopWidth: 1, borderTopColor: colors.line, paddingTop: space.sm, alignItems: "flex-start" }}>{status}</View>
  </Pressable>;
}

function MyApplications() {
  const me = useMe();
  const router = useRouter();
  const applications = useAsync(`applications:${me.id}`, () => fetchMyApplications(me.id));
  useRefreshOnFocus(applications.reload);

  return <Screen onRefresh={applications.reload}>
    <ListHeading title="Minhas inscrições" subtitle="Os eventos em que você se candidatou e a resposta de cada um."/>
    {applications.error && <ErrorState message={applications.error} onRetry={applications.reload}/>}
    {!applications.error && !applications.data && <Loading cards={1}/>}
    {applications.data?.length === 0 && <EmptyState title="Nenhuma inscrição ainda" action={<Button title="Explorar oportunidades" variant="outlined" onPress={() => router.push("/(app)")}/>}><Text style={type.bodySmall}>Encontre oportunidades no Início e inscreva-se sem custo. O contratante escolhe entre os inscritos.</Text></EmptyState>}
    {applications.data?.map((application) => {
      const label = applicationLabel(application);
      return <EventListCard key={application.id} event={application.event} onPress={() => router.push(`/event/${application.event.id}`)} status={<Pill text={label.text} tone={label.tone}/>}/>;
    })}
  </Screen>;
}

function MyEvents() {
  const me = useMe();
  const router = useRouter();
  const events = useAsync(`all-events:${me.id}`, async () => (await fetchMyEvents(me.id)).map((event) => withEncerrado(event)));
  useRefreshOnFocus(events.reload);

  return <Screen onRefresh={events.reload}>
    <ListHeading title="Meus eventos" subtitle="Todos os eventos que você publicou, dos abertos aos concluídos."/>
    {events.error && <ErrorState message={events.error} onRetry={events.reload}/>}
    {!events.error && !events.data && <Loading cards={1}/>}
    {events.data?.length === 0 && <EmptyState title="Nenhum evento publicado" action={<Button title="Ir para o início" variant="outlined" onPress={() => router.push("/(app)")}/>}><Text style={type.bodySmall}>Crie seu primeiro evento pelo painel para começar a receber candidaturas.</Text></EmptyState>}
    {events.data?.map((event) => <EventListCard key={event.id} event={event} onPress={() => router.push(`/event/${event.id}`)} status={<EventStatusPill status={event.status} encerrado={event.encerrado} inscricoesEncerradas={event.inscricoesEncerradas}/>}/>)}
  </Screen>;
}
