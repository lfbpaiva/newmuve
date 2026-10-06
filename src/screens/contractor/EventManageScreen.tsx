import { useState } from "react";
import { ErrorState, EventStatusPill, Loading, RatingSummary, Stars } from "../../components/states";
import { Icon, Secondary } from "../../components/ui";
import { useAsync } from "../../hooks/useAsync";
import { errorMessage } from "../../services/api";
import { deleteEvent, fetchCandidates, fetchCheckoutStatus, fetchEvent, fetchReviewsOf, type Candidate } from "../../services/events";
import { formatCurrency, formatDateTime, formatDuration } from "../../utils/format";
import { calcularCobranca } from "../../../shared/dominio.ts";

interface Props {
  eventId: string;
  onBack: () => void;
  onEdit: (eventId: string) => void;
  onCheckout: (eventId: string, candidateId: string) => void;
  onHiring: (eventId: string) => void;
}

// "Meus eventos → Gerenciar candidatos": único lugar onde o contratante vê e aprova músicos.
export default function EventManageScreen({ eventId, onBack, onEdit, onCheckout, onHiring }: Props) {
  const details = useAsync(`manage:${eventId}`, async () => {
    const [raw, candidates, checkout] = await Promise.all([fetchEvent(eventId), fetchCandidates(eventId), fetchCheckoutStatus(eventId).catch(() => null)]);
    const event = { ...raw, encerrado: raw.status === "ABERTO" && new Date(raw.inicio).getTime() <= Date.now() };
    return { event, candidates, checkout };
  });
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(false);

  if (details.error) return <Secondary title="Meus eventos" subtitle="" onBack={onBack}><ErrorState message={details.error} onRetry={details.reload}/></Secondary>;
  if (!details.data) return <Secondary title="Meus eventos" subtitle="" onBack={onBack}><Loading/></Secondary>;

  const { event, candidates, checkout } = details.data;
  const locked = event.status !== "ABERTO" || event.encerrado;
  const paymentInProgress = checkout?.status === "PENDENTE" && new Date(checkout.expiraEm) > new Date();
  const hired = candidates.find((candidate) => candidate.status === "APROVADO");

  async function remove() {
    if (!window.confirm(`Excluir o evento "${event.titulo}"? As candidaturas recebidas serão perdidas.`)) return;
    setDeleting(true);
    try {
      await deleteEvent(event.id);
      onBack();
    } catch (e) {
      setError(errorMessage(e));
      setDeleting(false);
    }
  }

  return <Secondary title={event.titulo} subtitle={`${formatDateTime(event.inicio)} · ${formatDuration(event.duracaoMinutos)} · ${event.cidade}, ${event.uf}`} onBack={onBack}>
    {event.status === "CONTRATADO" && <div className="contracted-lock"><Icon name="check" size={16}/> Evento com músico contratado. Não é mais possível alterar os dados ou excluir esta oportunidade.</div>}
    <div className="event-summary">
      <div>
        <EventStatusPill status={event.status} encerrado={event.encerrado}/>
        <h3>{candidates.length} {candidates.length === 1 ? "músico se inscreveu" : "músicos se inscreveram"}</h3>
        <p>{hired ? `Contratado: ${hired.musician.nome}` : "Aprove um candidato para gerar o pagamento via Pix."}</p>
      </div>
      <div className="summary-meta">
        <span>Cachê oferecido<b>{formatCurrency(event.cache)}</b></span>
        <span>Total com taxa de 10%<b>{formatCurrency(calcularCobranca(event.cache).total)}</b></span>
        <span>Estilos<b>{event.estilosMusicais.join(", ")}</b></span>
        <span>Formação<b>{event.formacao}</b></span>
      </div>
    </div>

    <div className="event-actions">
      {!locked && <>
        <button className="secondary" disabled={paymentInProgress || deleting} onClick={() => onEdit(event.id)}>Editar evento</button>
        <button className="danger-btn" disabled={paymentInProgress || deleting} onClick={remove}>{deleting ? "Excluindo..." : "Excluir evento"}</button>
      </>}
      {event.status !== "ABERTO" && checkout?.status === "PAGO" && <button className="primary" onClick={() => onHiring(event.id)}>Ver contratação</button>}
    </div>
    {paymentInProgress && <p className="notice">Há um pagamento em andamento para este evento. Conclua ou aguarde a cobrança expirar para editar.</p>}
    {error && <p className="form-error" role="alert">{error}</p>}

    <div className="section-title"><h2>Candidatos</h2></div>
    {candidates.length === 0
      ? <div className="empty-state compact"><span><Icon name="user" size={30}/></span><h3>Nenhuma candidatura recebida</h3><p>Os músicos compatíveis com a cidade e o estilo do evento aparecerão aqui ao se inscreverem.</p></div>
      : <div className="candidates">{candidates.map((candidate) => <CandidateCard
          key={candidate.id}
          candidate={candidate}
          canApprove={!locked}
          approveLabel={paymentInProgress ? "Continuar pagamento" : "Aprovar e pagar"}
          onApprove={() => onCheckout(event.id, candidate.id)}
        />)}</div>}
  </Secondary>;
}

function CandidateCard({ candidate, canApprove, approveLabel, onApprove }: { candidate: Candidate; canApprove: boolean; approveLabel: string; onApprove: () => void }) {
  const { musician } = candidate;
  const [showReviews, setShowReviews] = useState(false);

  return <article className="candidate">
    <img src={musician.fotoPerfilUrl} alt={`Foto de ${musician.nome}`}/>
    <div>
      <div className="candidate-main">
        <div><h3>{musician.nome}</h3><p>{musician.cidade}, {musician.uf} · {musician.estilosMusicais.join(", ")}</p></div>
        <RatingSummary media={musician.avaliacaoMedia} total={musician.totalAvaliacoes}/>
      </div>
      {musician.bio && <p className="candidate-bio">{musician.bio}</p>}
      {musician.portfolioUrl && <p className="candidate-bio"><a href={musician.portfolioUrl} target="_blank" rel="noreferrer">Ver trabalho do músico <Icon name="external" size={14}/></a></p>}
      {showReviews && <CandidateReviews musicianId={musician.id}/>}
    </div>
    <div className="candidate-actions">
      {musician.totalAvaliacoes > 0 && <button className="secondary" aria-expanded={showReviews} onClick={() => setShowReviews(!showReviews)}>{showReviews ? "Ocultar avaliações" : "Ver avaliações"}</button>}
      {candidate.status === "APROVADO" && <span className="contracted">Contratado</span>}
      {candidate.status === "RECUSADO" && <span className="closed">Não selecionado</span>}
      {candidate.status === "PENDENTE" && canApprove && <button className="primary" onClick={onApprove}>{approveLabel}</button>}
    </div>
  </article>;
}

function CandidateReviews({ musicianId }: { musicianId: string }) {
  const reviews = useAsync(`reviews:${musicianId}`, () => fetchReviewsOf(musicianId));

  if (reviews.error) return <p className="form-error" role="alert">{reviews.error}</p>;
  if (!reviews.data) return <p className="muted">Carregando avaliações...</p>;
  return <div className="reviews">{reviews.data.map((review) => <article key={review.id}>
    <div><Stars rating={review.rating}/><small>{new Date(review.createdAt).toLocaleDateString("pt-BR")}</small></div>
    {review.comment && <p>{review.comment}</p>}
  </article>)}</div>;
}
