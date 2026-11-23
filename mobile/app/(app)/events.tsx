import { useRouter } from "expo-router";
import { useState, type ReactNode } from "react";
import { Text } from "react-native";
import { fetchMyApplications, fetchMyEvents, type Application } from "../../../shared/client/events.ts";
import { useAsync } from "../../../shared/client/useAsync.ts";
import { EventPosterRow, EventStatusPill, withEncerrado } from "../../components/events";
import { TopBar } from "../../components/TopBar";
import { BlocoMedido, Button, EmptyState, ErrorState, Loading, Pill, Reveal, Screen, Section, TituloGrande } from "../../components/ui";
import { eventoEmAndamento, HISTORICO_RESUMIDO, inscricaoEmAndamento, separarPorAndamento } from "../../lib/historico";
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

  return <Screen onRefresh={applications.reload} carregando={applications.loading} topo={<TopBar titulo="Inscrições"/>}>
    <TituloGrande titulo="Minhas inscrições" subtitulo="Os eventos em que você se candidatou e a resposta de cada um"/>
    {applications.error && <ErrorState message={applications.error} onRetry={applications.reload}/>}
    {!applications.error && !applications.data && <Loading cards={1}/>}
    {applications.data?.length === 0 && <EmptyState title="Nenhuma inscrição ainda" action={<Button title="Explorar oportunidades" variant="outlined" onPress={() => router.push("/(app)")}/>}><Text style={type.bodySmall}>Encontre oportunidades no Início e inscreva-se sem custo. O contratante escolhe entre os inscritos.</Text></EmptyState>}
    {applications.data && applications.data.length > 0 && <ListaComHistorico
      {...separarPorAndamento(applications.data, (application) => application.event.inicio, (application) => inscricaoEmAndamento(application))}
      vazio="Nenhuma inscrição aguardando resposta ou com show marcado."
      linha={(application) => {
        const label = applicationLabel(application);
        return <EventPosterRow key={application.id} event={application.event} onPress={() => router.push(`/event/${application.event.id}`)} status={<Pill text={label.text} tone={label.tone}/>}/>;
      }}/>}
  </Screen>;
}

function MyEvents() {
  const me = useMe();
  const router = useRouter();
  const events = useAsync(`all-events:${me.id}`, async () => (await fetchMyEvents(me.id)).map((event) => withEncerrado(event)));
  useRefreshOnFocus(events.reload);

  return <Screen onRefresh={events.reload} carregando={events.loading} topo={<TopBar titulo="Meus eventos"/>}>
    <TituloGrande titulo="Meus eventos" subtitulo="Todos os eventos que você publicou, dos abertos aos concluídos"/>
    {events.error && <ErrorState message={events.error} onRetry={events.reload}/>}
    {!events.error && !events.data && <Loading cards={1}/>}
    {events.data?.length === 0 && <EmptyState title="Nenhum evento publicado" action={<Button title="Ir para o início" variant="outlined" onPress={() => router.push("/(app)")}/>}><Text style={type.bodySmall}>Crie seu primeiro evento pelo painel para começar a receber candidaturas.</Text></EmptyState>}
    {events.data && events.data.length > 0 && <ListaComHistorico
      {...separarPorAndamento(events.data, (event) => event.inicio, (event) => eventoEmAndamento(event))}
      vazio="Nenhum evento aberto ou contratado no momento."
      linha={(event) => <EventPosterRow key={event.id} event={event} onPress={() => router.push(`/event/${event.id}`)} status={<EventStatusPill status={event.status} encerrado={event.encerrado} inscricoesEncerradas={event.inscricoesEncerradas}/>}/>}/>}
  </Screen>;
}

function ListaComHistorico<T>({ andamento, historico, vazio, linha }: { andamento: T[]; historico: T[]; vazio: string; linha: (item: T) => ReactNode }) {
  const [verTudo, setVerTudo] = useState(false);
  const visiveis = verTudo ? historico : historico.slice(0, HISTORICO_RESUMIDO);
  return <>
    <Section title="Em andamento">
      {andamento.length === 0
        ? <Text style={type.bodySmall}>{vazio}</Text>
        : <BlocoMedido style={{ gap: space.sm }}>{andamento.map((item, index) => <Reveal key={index} index={index}>{linha(item)}</Reveal>)}</BlocoMedido>}
    </Section>
    {historico.length > 0 && <Section title={`Histórico (${historico.length})`}>
      <BlocoMedido style={{ gap: space.sm }}>{visiveis.map((item, index) => <Reveal key={index} index={index}>{linha(item)}</Reveal>)}</BlocoMedido>
      {historico.length > HISTORICO_RESUMIDO && <Button title={verTudo ? "Mostrar menos" : `Ver todos (${historico.length})`} variant="text" onPress={() => setVerTudo((atual) => !atual)}/>}
    </Section>}
  </>;
}
