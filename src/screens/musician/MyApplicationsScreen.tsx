import { EmptyState, ErrorState, Loading } from "../../components/states";
import { Icon } from "../../components/ui";
import { useAsync } from "../../hooks/useAsync";
import type { Me } from "../../services/account";
import { fetchMyApplications, type Application } from "../../services/events";
import { dayOfMonth, formatDateTime, monthLabel } from "../../utils/format";

function statusLabel({ status, event }: Application): { text: string; className: string } {
  if (status === "APROVADO") return { text: event.status === "CONCLUIDO" ? "Show concluído" : "Você foi contratado", className: "contracted" };
  if (status === "RECUSADO") return { text: "Não selecionado", className: "closed" };
  return { text: "Aguardando resposta", className: "open" };
}

// Aba "Meus eventos" do músico: apenas os eventos em que ele se inscreveu.
export default function MyApplicationsScreen({ me, onOpen }: { me: Me; onOpen: (eventId: string) => void }) {
  const applications = useAsync(`applications:${me.id}`, () => fetchMyApplications(me.id));

  return <>
    <header className="topbar"><div><h1>Meus eventos</h1><p className="meta">Eventos em que você se inscreveu</p></div></header>
    {applications.error && <ErrorState message={applications.error} onRetry={applications.reload}/>}
    {!applications.error && !applications.data && <Loading/>}
    {applications.data?.length === 0 && <EmptyState icon="calendar" title="Você ainda não se inscreveu em eventos"><p>Encontre oportunidades no seu feed e inscreva-se sem custo.</p></EmptyState>}
    <div className="manager-list">{applications.data?.map((application) => {
      const { event } = application;
      const label = statusLabel(application);
      return <button className="manager-card" key={application.id} onClick={() => onOpen(event.id)}>
        <div className="date-box"><b>{dayOfMonth(event.inicio)}</b><span>{monthLabel(event.inicio)}</span></div>
        <div className="manager-info"><h3>{event.titulo}</h3><p><Icon name="pin" size={15}/> {event.cidade}, {event.uf} · {formatDateTime(event.inicio)}</p></div>
        <span className={label.className}>{label.text}</span>
        <Icon name="chevron"/>
      </button>;
    })}</div>
  </>;
}
