import { useRouter } from "expo-router";
import { Text } from "react-native";
import { fetchMyApplications, fetchMyEvents, type Application } from "../../../shared/client/events.ts";
import { useAsync } from "../../../shared/client/useAsync.ts";
import { EventRow, EventStatusPill } from "../../components/events";
import { EmptyState, ErrorState, Heading, Loading, Pill, Screen } from "../../components/ui";
import { type } from "../../lib/theme";
import { useMe } from "../../lib/useMe";

export default function EventsScreen() {
  const me = useMe();
  return me.role === "MUSICIAN" ? <MyApplications/> : <MyEvents/>;
}

function applicationLabel({ status, event }: Application): { text: string; tone: "accent" | "success" | "muted" } {
  if (status === "APROVADO") return { text: event.status === "CONCLUIDO" ? "Show concluído" : "Você foi contratado", tone: "success" };
  if (status === "RECUSADO") return { text: "Não selecionado", tone: "muted" };
  return { text: "Aguardando resposta", tone: "accent" };
}

// Aba do músico: apenas os eventos em que ele se inscreveu.
function MyApplications() {
  const me = useMe();
  const router = useRouter();
  const applications = useAsync(`applications:${me.id}`, () => fetchMyApplications(me.id));

  return <Screen>
    <Heading title="Minhas inscrições" subtitle="Os eventos em que você se candidatou e a resposta de cada um."/>
    {applications.error && <ErrorState message={applications.error} onRetry={applications.reload}/>}
    {!applications.error && !applications.data && <Loading cards={1}/>}
    {applications.data?.length === 0 && <EmptyState icon="paper-plane-outline" title="Você ainda não se inscreveu em nenhum evento"><Text style={[type.bodySmall, { textAlign: "center" }]}>Encontre oportunidades no Início e inscreva-se sem custo. O contratante escolhe entre os inscritos.</Text></EmptyState>}
    {applications.data?.map((application) => {
      const label = applicationLabel(application);
      return <EventRow key={application.id} event={application.event} onPress={() => router.push(`/event/${application.event.id}`)} trailing={<Pill text={label.text} tone={label.tone}/>}/>;
    })}
  </Screen>;
}

// Aba do contratante: histórico completo.
function MyEvents() {
  const me = useMe();
  const router = useRouter();
  const events = useAsync(`all-events:${me.id}`, async () => {
    const now = Date.now();
    return (await fetchMyEvents(me.id)).map((event) => ({ ...event, encerrado: event.status === "ABERTO" && new Date(event.inicio).getTime() <= now }));
  });

  return <Screen>
    <Heading title="Meus eventos" subtitle="Todos os eventos que você publicou, dos abertos aos concluídos."/>
    {events.error && <ErrorState message={events.error} onRetry={events.reload}/>}
    {!events.error && !events.data && <Loading cards={1}/>}
    {events.data?.length === 0 && <EmptyState icon="calendar-outline" title="Você ainda não criou eventos"/>}
    {events.data?.map((event) => <EventRow key={event.id} event={event} onPress={() => router.push(`/event/${event.id}`)} trailing={<EventStatusPill status={event.status} encerrado={event.encerrado}/>}/>)}
  </Screen>;
}
