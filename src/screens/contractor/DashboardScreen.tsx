import { EmptyState, ErrorState, EventStatusPill, Loading } from "../../components/states";
import { Icon } from "../../components/ui";
import { useAsync } from "../../hooks/useAsync";
import type { Me } from "../../services/account";
import { fetchMyEvents } from "../../services/events";
import { dayOfMonth, formatDateTime, monthLabel } from "../../utils/format";
import { camposFaltantes, descreverFaltantes } from "../../../shared/dominio.ts";

interface Props {
  me: Me;
  /** false: visão geral com indicadores e eventos em andamento. true: histórico completo. */
  showAll: boolean;
  onCreate: () => void;
  onOpen: (eventId: string) => void;
  onComplete: () => void;
}

const two = (value: number) => String(value).padStart(2, "0");

export default function DashboardScreen({ me, showAll, onCreate, onOpen, onComplete }: Props) {
  const faltando = camposFaltantes(me, "criarEvento");
  const create = faltando.length > 0 ? onComplete : onCreate;
  // "encerrado": aberto, mas com a data já passada (o status no banco continua ABERTO).
  const events = useAsync(`my-events:${me.id}`, async () => {
    const now = Date.now();
    return (await fetchMyEvents(me.id)).map((event) => ({ ...event, encerrado: event.status === "ABERTO" && new Date(event.inicio).getTime() <= now }));
  });
  const all = events.data ?? [];
  const active = all.filter((event) => (event.status === "ABERTO" && !event.encerrado) || event.status === "CONTRATADO");
  const open = active.filter((event) => event.status === "ABERTO");
  const listed = showAll ? all : active;

  return <>
    <header className="topbar">
      <div><h1>{showAll ? "Meus eventos" : `Olá, ${me.nome}`}</h1><p className="meta">{showAll ? "Todos os eventos que você publicou" : "Visão geral dos seus shows"}</p></div>
      <button className="primary new-event" onClick={create} aria-label="Criar novo evento"><Icon name="plus"/> Criar novo evento</button>
    </header>
    {faltando.length > 0 && <p className="notice">Antes de publicar seu primeiro evento, complete o perfil: <b>{descreverFaltantes(faltando)}</b>. <button className="text-btn" onClick={onComplete}>Completar agora</button></p>}

    {!showAll && <div className="stats">
      <div><span>Eventos ativos</span><b>{two(active.length)}</b><small>Abertos ou com músico contratado</small></div>
      <div><span>Candidaturas recebidas</span><b>{two(open.reduce((sum, event) => sum + (event.totalCandidatos ?? 0), 0))}</b><small>Em eventos com inscrições abertas</small></div>
      <div><span>Shows realizados</span><b>{two(all.filter((event) => event.status === "CONCLUIDO").length)}</b><small>Confirmados pelas duas partes</small></div>
    </div>}

    <div className="section-title"><h2>{showAll ? "Todos os eventos" : "Eventos em andamento"}</h2></div>

    {events.error && <ErrorState message={events.error} onRetry={events.reload}/>}
    {!events.error && !events.data && <Loading/>}
    {events.data && listed.length === 0 && <EmptyState icon="calendar" title={all.length ? "Nenhum evento em andamento" : "Você ainda não criou eventos"}>
      <p>Publique um evento para receber candidaturas.</p>
      <button className="primary" onClick={create}>Criar evento</button>
    </EmptyState>}
    <div className="manager-list">{listed.map((event) => {
      const total = event.totalCandidatos ?? 0;
      return <button className="manager-card" key={event.id} onClick={() => onOpen(event.id)}>
        <div className="date-box"><b>{dayOfMonth(event.inicio)}</b><span>{monthLabel(event.inicio)}</span></div>
        <div className="manager-info">
          <h3>{event.titulo}</h3>
          <p><Icon name="pin" size={15}/> {event.cidade}, {event.uf} · {formatDateTime(event.inicio)}</p>
          <div className="candidate-faces"><b>{total} {total === 1 ? "candidato" : "candidatos"}</b></div>
        </div>
        <EventStatusPill status={event.status} encerrado={event.encerrado}/>
        <Icon name="chevron"/>
      </button>;
    })}</div>
  </>;
}
