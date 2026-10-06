import { useState } from "react";
import { camposFaltantes, descreverFaltantes, hasCancellationNotice } from "../../../shared/dominio.ts";
import { ErrorState, Loading, RatingSummary } from "../../components/states";
import { Icon, Secondary } from "../../components/ui";
import { useAsync } from "../../hooks/useAsync";
import type { Me } from "../../services/account";
import { errorMessage } from "../../services/api";
import { applyToEvent, cancelApplication, fetchContractor, fetchEvent, fetchMyApplication } from "../../services/events";
import { formatCurrency, formatDateTime, formatDuration } from "../../utils/format";

interface Props {
  me: Me;
  eventId: string;
  onBack: () => void;
  onHiring: (eventId: string) => void;
  onComplete: () => void;
}

export default function OpportunityScreen({ me, eventId, onBack, onHiring, onComplete }: Props) {
  const faltando = camposFaltantes(me, "candidatar");
  const details = useAsync(`opportunity:${eventId}`, async () => {
    const event = await fetchEvent(eventId);
    const [application, contractor] = await Promise.all([fetchMyApplication(eventId, me.id), fetchContractor(event.contractorId)]);
    return { event, application, contractor };
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await action();
      details.reload();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (details.error) return <Secondary title="Oportunidade" subtitle="Detalhes da oportunidade" onBack={onBack}><ErrorState message={details.error} onRetry={details.reload}/></Secondary>;
  if (!details.data) return <Secondary title="Oportunidade" subtitle="Detalhes da oportunidade" onBack={onBack}><Loading/></Secondary>;

  const { event, application, contractor } = details.data;
  const hired = event.musicoContratadoId === me.id;
  const cancellable = hasCancellationNotice(new Date(event.inicio), new Date());

  return <Secondary title="Oportunidade" subtitle={`${event.tipoEvento} · ${event.cidade}, ${event.uf}`} onBack={onBack}>
    <div className="opportunity-hero">
      <img src={event.imagemUrl} alt={`Foto do evento ${event.titulo}`}/>
      <div>
        <div className="tag-list">{event.estilosMusicais.map((estilo) => <span key={estilo}>{estilo}</span>)}<span>{event.tipoEvento}</span></div>
        <h2>{event.titulo}</h2>
        <p><Icon name="pin" size={17}/> {event.cidade}, {event.uf}</p>
        <p><Icon name="calendar" size={17}/> {formatDateTime(event.inicio)}</p>
        <p><Icon name="clock" size={17}/> Duração estimada: {formatDuration(event.duracaoMinutos)}</p>
        <p><Icon name="music" size={17}/> Formação: {event.formacao} · {event.somDisponivel ? "som disponível no local" : "leve seu equipamento de som"}</p>
      </div>
    </div>
    <div className="opportunity-content">
      <section>
        <h3>Sobre o evento</h3>
        <p>{event.descricao || "O contratante não adicionou uma descrição."}</p>
        <h3>Quem está contratando</h3>
        <div className="mini-artist">
          <img src={contractor.fotoPerfilUrl} alt=""/>
          <div><b>{contractor.nome}</b><span>{contractor.cidade}, {contractor.uf}</span><RatingSummary media={contractor.avaliacaoMedia} total={contractor.totalAvaliacoes}/></div>
        </div>
        <p className="muted small">O endereço completo e o telefone do contratante são liberados após a contratação.</p>
      </section>
      <aside>
        <span>Cachê oferecido</span><b>{formatCurrency(event.cache)}</b><small>Sem taxa de candidatura; o valor é pago a você após o show.</small>
        {hired && <>
          <p className="notice success">Você foi contratado para este evento.</p>
          <button className="primary wide" onClick={() => onHiring(event.id)}>Ver contratação</button>
        </>}
        {!hired && !application && (event.status === "ABERTO"
          ? faltando.length > 0
            ? <><p className="notice">Para se inscrever, complete seu perfil: <b>{descreverFaltantes(faltando)}</b>.</p><button className="primary wide" onClick={onComplete}>Completar perfil</button></>
            : <button className="primary wide" disabled={busy} onClick={() => run(() => applyToEvent(event.id))}>{busy ? "Enviando..." : "Inscrever-se"}</button>
          : <p className="notice">As inscrições para este evento estão encerradas.</p>)}
        {!hired && application && <>
          <p className="notice">{application.status === "RECUSADO" ? "Outro músico foi contratado para este evento." : "Inscrição enviada. Aguarde a resposta do contratante."}</p>
          {application.status === "PENDENTE" && <button className="secondary wide" disabled={busy || !cancellable} onClick={() => run(() => cancelApplication(event.id))}>
            {cancellable ? (busy ? "Cancelando..." : "Cancelar inscrição") : "Cancelamento indisponível (menos de 24h para o evento)"}
          </button>}
        </>}
        {error && <p className="form-error" role="alert">{error}</p>}
      </aside>
    </div>
  </Secondary>;
}
