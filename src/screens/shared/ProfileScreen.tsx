import ProfileOverview, { MusicianPublicFields } from "../../components/ProfileOverview";
import { ErrorState, EventStatusPill, Stars } from "../../components/states";
import { Icon, Secondary } from "../../components/ui";
import { useAsync } from "../../hooks/useAsync";
import type { Me } from "../../services/account";
import { fetchMyEvents, fetchReviewsOf } from "../../services/events";
import { formatDateTime } from "../../utils/format";
import { maskDocumento, maskPhone } from "../../utils/validators";
import { ROTULOS_CHAVE_PIX, type TipoChavePix } from "../../../shared/dominio.ts";

// "Meu perfil": exibe exclusivamente os dados da conta autenticada.
export default function ProfileScreen({ me, onBack }: { me: Me; onBack: () => void }) {
  const isMusician = me.role === "MUSICIAN";

  return <Secondary title="Meu perfil" subtitle="Dados da conta autenticada." onBack={onBack}>
    <ProfileOverview profile={me} label={isMusician ? "Perfil de músico" : "Perfil de contratante"}/>
    <div className="profile-grid">
      <section>
        <h3>Dados do perfil</h3>
        {me.documento && <p><b>{me.documento.length === 11 ? "CPF" : "CNPJ"}:</b> {maskDocumento(me.documento)}</p>}
        {me.telefone && <p><b>Telefone:</b> {maskPhone(me.telefone)}</p>}
        <p><b>E-mail:</b> {me.email}</p>
        {isMusician && <>
          {me.chavePix && <p><b>Chave Pix ({ROTULOS_CHAVE_PIX[me.chavePixTipo as TipoChavePix] ?? me.chavePixTipo}):</b> {me.chavePix}</p>}
          <MusicianPublicFields profile={me}/>
        </>}
      </section>
      {isMusician ? <ReviewsReceived userId={me.id}/> : <>
        <ReviewsReceived userId={me.id}/>
        <EventHistory contractorId={me.id}/>
      </>}
    </div>
  </Secondary>;
}

function ReviewsReceived({ userId }: { userId: string }) {
  const reviews = useAsync(`my-reviews:${userId}`, () => fetchReviewsOf(userId));

  return <section>
    <h3>Avaliações recebidas</h3>
    {reviews.error && <ErrorState message={reviews.error} onRetry={reviews.reload}/>}
    {reviews.data?.length === 0 && <div className="empty-inline"><Icon name="star"/><p>Nenhuma avaliação recebida.</p></div>}
    <div className="reviews">{reviews.data?.map((review) => <article key={review.id}>
      <div><Stars rating={review.rating}/><small>{new Date(review.createdAt).toLocaleDateString("pt-BR")}</small></div>
      {review.comment && <p>{review.comment}</p>}
    </article>)}</div>
  </section>;
}

function EventHistory({ contractorId }: { contractorId: string }) {
  const events = useAsync(`my-events:${contractorId}`, () => fetchMyEvents(contractorId));

  return <section>
    <h3>Histórico de eventos criados</h3>
    {events.error && <ErrorState message={events.error} onRetry={events.reload}/>}
    {events.data?.length === 0 && <div className="empty-inline"><Icon name="calendar"/><p>Nenhum evento criado até o momento.</p></div>}
    <div className="reviews">{events.data?.map((event) => <article key={event.id}>
      <div><b>{event.titulo}</b><EventStatusPill status={event.status}/></div>
      <p>{formatDateTime(event.inicio)} · {event.cidade}, {event.uf}</p>
    </article>)}</div>
  </section>;
}
