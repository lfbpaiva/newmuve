import { useRouter } from "expo-router";
import { Text, View } from "react-native";
import { fetchMyApplications, fetchMyEvents, type Application } from "../../../shared/client/events.ts";
import { useAsync } from "../../../shared/client/useAsync.ts";
import { EventPosterRow, EventStatusPill, withEncerrado } from "../../components/events";
import { TopBar } from "../../components/TopBar";
import { Button, EmptyState, ErrorState, Loading, Pill, Reveal, Screen, TituloGrande } from "../../components/ui";
import { space, type } from "../../lib/theme";
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

function MyApplications() {
  const me = useMe();
  const router = useRouter();
  const applications = useAsync(`applications:${me.id}`, () => fetchMyApplications(me.id));
  useRefreshOnFocus(applications.reload);

  return <Screen onRefresh={applications.reload} topo={<TopBar titulo="Inscrições"/>}>
    <TituloGrande titulo="Minhas inscrições" subtitulo="Os eventos em que você se candidatou e a resposta de cada um"/>
    {applications.error && <ErrorState message={applications.error} onRetry={applications.reload}/>}
    {!applications.error && !applications.data && <Loading cards={1}/>}
    {applications.data?.length === 0 && <EmptyState title="Nenhuma inscrição ainda" action={<Button title="Explorar oportunidades" variant="outlined" onPress={() => router.push("/(app)")}/>}><Text style={type.bodySmall}>Encontre oportunidades no Início e inscreva-se sem custo. O contratante escolhe entre os inscritos.</Text></EmptyState>}
    {applications.data && <View style={{ gap: space.sm }}>{applications.data.map((application, index) => {
      const label = applicationLabel(application);
      return <Reveal key={application.id} index={index}><EventPosterRow event={application.event} onPress={() => router.push(`/event/${application.event.id}`)} status={<Pill text={label.text} tone={label.tone}/>}/></Reveal>;
    })}</View>}
  </Screen>;
}

function MyEvents() {
  const me = useMe();
  const router = useRouter();
  const events = useAsync(`all-events:${me.id}`, async () => (await fetchMyEvents(me.id)).map((event) => withEncerrado(event)));
  useRefreshOnFocus(events.reload);

  return <Screen onRefresh={events.reload} topo={<TopBar titulo="Meus eventos"/>}>
    <TituloGrande titulo="Meus eventos" subtitulo="Todos os eventos que você publicou, dos abertos aos concluídos"/>
    {events.error && <ErrorState message={events.error} onRetry={events.reload}/>}
    {!events.error && !events.data && <Loading cards={1}/>}
    {events.data?.length === 0 && <EmptyState title="Nenhum evento publicado" action={<Button title="Ir para o início" variant="outlined" onPress={() => router.push("/(app)")}/>}><Text style={type.bodySmall}>Crie seu primeiro evento pelo painel para começar a receber candidaturas.</Text></EmptyState>}
    {events.data && <View style={{ gap: space.sm }}>{events.data.map((event, index) => <Reveal key={event.id} index={index}><EventPosterRow event={event} onPress={() => router.push(`/event/${event.id}`)} status={<EventStatusPill status={event.status} encerrado={event.encerrado} inscricoesEncerradas={event.inscricoesEncerradas}/>}/></Reveal>)}</View>}
  </Screen>;
}
