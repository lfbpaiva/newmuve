import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { errorMessage } from "../../../../shared/client/api.ts";
import {
  applyToEvent,
  cancelApplication,
  deleteEvent,
  fetchCandidates,
  fetchCheckoutStatus,
  fetchContractor,
  fetchEvent,
  fetchFavoriteIds,
  fetchMyApplication,
  fetchMyInvite,
  setFavorite,
  declineCandidate,
  setApplicationsClosed,
  updateProposal,
  type Candidate,
} from "../../../../shared/client/events.ts";
import { formatCurrency } from "../../../../shared/client/format.ts";
import { useAsync } from "../../../../shared/client/useAsync.ts";
import { calcularCobranca, camposFaltantes, comissaoPercentual, descreverFaltantes, hasCancellationNotice, isPro } from "../../../../shared/dominio.ts";
import { CachePoster, EventFacts, EventHero, EventStatusPill, EventStickyHeader, withEncerrado } from "../../../components/events";
import { ProposalForm } from "../../../components/proposal";
import { Alert, Avatar, Button, EmptyState, ErrorState, Icon, Loading, Pill, RatingSummary, Reveal, Screen, Section } from "../../../components/ui";
import { confirmAction } from "../../../lib/confirm";
import { abrirLink } from "../../../lib/links";
import { colors, space, styles, type } from "../../../lib/theme";
import { useMe } from "../../../lib/useMe";
import { useRefreshOnFocus } from "../../../lib/useRefreshOnFocus";

export default function EventScreen() {
  const me = useMe();
  const { id } = useLocalSearchParams<{ id: string }>();
  return me.role === "MUSICIAN" ? <Opportunity eventId={id}/> : <Manage eventId={id}/>;
}

function useAction(onDone: () => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await action();
      onDone();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, run, fail: setError };
}

function Opportunity({ eventId }: { eventId: string }) {
  const me = useMe();
  const router = useRouter();
  const details = useAsync(`opportunity:${eventId}`, async () => {
    const event = await fetchEvent(eventId);
    const [application, contractor, convidado] = await Promise.all([fetchMyApplication(eventId, me.id), fetchContractor(event.contractorId), fetchMyInvite(eventId, me.id).catch(() => false)]);
    return { event, application, contractor, convidado };
  });
  useRefreshOnFocus(details.reload);
  const { busy, error, run } = useAction(details.reload);
  const [editingProposal, setEditingProposal] = useState(false);

  if (details.error) return <Screen><ErrorState message={details.error} onRetry={details.reload}/></Screen>;
  if (!details.data) return <Screen><Loading cards={1}/></Screen>;
  const { event, application, contractor, convidado } = details.data;
  const hired = event.musicoContratadoId === me.id;
  const cancellable = hasCancellationNotice(new Date(event.inicio), new Date());
  const faltando = camposFaltantes(me, "candidatar");
  const conversar = application ? () => router.push(`/conversa/${application.id}`) : null;

  return <Screen onRefresh={details.reload} cabecalho={<EventStickyHeader titulo={event.titulo} valor={event.cache}/>}>
    <EventHero event={event}/>
    <Reveal index={1}><CachePoster rotulo="Cachê oferecido" valor={event.cache}>
      <Text style={type.bodySmall}>Pago a você após o show, sem taxa de candidatura.</Text>
    </CachePoster></Reveal>
    <Reveal index={2}><EventFacts event={event}/></Reveal>
    <Section title="Sua participação"><View style={{ gap: space.md }}>
      {hired && <>
        {event.status === "CANCELADO"
          ? <Alert tone="info">Esta contratação foi cancelada. O comprovante mostra a situação do pagamento.</Alert>
          : <Alert tone="success">Você foi contratado para este evento.</Alert>}
        <Button title="Ver contratação" icon="document-text-outline" onPress={() => router.push(`/event/${event.id}/hiring`)}/>
        {conversar && <Button title="Conversar com o contratante" variant="outlined" icon="chatbubbles-outline" onPress={conversar}/>}
      </>}
      {!hired && !application && convidado && event.status === "ABERTO" && <Alert tone="success">{contractor?.nome ?? "O contratante"} convidou você para este evento. A inscrição está liberada para você.</Alert>}
      {!hired && !application && (event.status === "ABERTO" && (!event.inscricoesEncerradas || convidado)
        ? faltando.length > 0
          ? <>
            <Alert tone="info">Para se inscrever, complete seu perfil: {descreverFaltantes(faltando)}.</Alert>
            <Button title="Completar perfil" icon="arrow-forward" onPress={() => router.push({ pathname: "/account/edit", params: { acao: "candidatar" } })}/>
          </>
          : <ProposalForm cacheOferecido={event.cache} valorAtual={null} submitLabel="Inscrever-se" icon="paper-plane-outline" busy={busy} onSubmit={(valor) => run(() => applyToEvent(event.id, valor))}/>
        : <Alert tone="info">As inscrições para este evento estão encerradas.</Alert>)}
      {!hired && application && <>
        <Alert tone={application.status === "RECUSADO" ? "info" : "success"}>{application.status === "RECUSADO" ? "Sua inscrição não foi selecionada para este evento." : "Inscrição enviada. Você recebe uma notificação quando o contratante responder."}</Alert>
        {application.status === "PENDENTE" && <>
          <View style={[styles.card, { borderWidth: 1, borderColor: colors.line, gap: space.xs }]}>
            <Text style={type.bodySmall}>{application.valorProposto === null ? "Você aceitou o cachê oferecido" : "Sua proposta"}</Text>
            <Text style={type.titleSmall}>{formatCurrency(application.valorProposto ?? event.cache)}</Text>
          </View>
          {editingProposal
            ? <ProposalForm cacheOferecido={event.cache} valorAtual={application.valorProposto} submitLabel="Salvar valor" icon="checkmark" busy={busy} onSubmit={(valor) => run(async () => { await updateProposal(event.id, valor); setEditingProposal(false); })}/>
            : <Button variant="text" title="Alterar valor" onPress={() => setEditingProposal(true)}/>}
          {conversar && <Button title="Conversar com o contratante" variant="outlined" icon="chatbubbles-outline" onPress={conversar}/>}
          <Button variant="outlined" title={cancellable ? "Cancelar inscrição" : "Cancelamento indisponível (menos de 24h)"} disabled={!cancellable} loading={busy} onPress={() => run(() => cancelApplication(event.id))}/>
        </>}
      </>}
      {error ? <Alert tone="error">{error}</Alert> : null}
    </View></Section>
    {event.descricao ? <Section title="Sobre o evento"><View style={[styles.card, { borderWidth: 1, borderColor: colors.line }]}><Text style={type.body}>{event.descricao}</Text></View></Section> : null}
    <Section title="Quem está contratando">
      {contractor
        ? <View style={[styles.card, styles.row, { gap: 12, borderWidth: 1, borderColor: colors.line }]}>
          <Avatar uri={contractor.fotoPerfilUrl} name={contractor.nome}/>
          <View style={{ flex: 1, minWidth: 0 }}><Text style={type.titleSmall}>{contractor.nome}</Text><RatingSummary media={contractor.avaliacaoMedia} total={contractor.totalAvaliacoes}/></View>
        </View>
        : <Text style={type.bodySmall}>O contratante excluiu a conta.</Text>}
      <Text style={[type.bodySmall, { fontSize: 14, lineHeight: 21 }]}>Endereço completo e telefone são liberados após a contratação.</Text>
    </Section>
  </Screen>;
}

function Manage({ eventId }: { eventId: string }) {
  const router = useRouter();
  const details = useAsync(`manage:${eventId}`, async () => {
    const [raw, candidates, checkout] = await Promise.all([fetchEvent(eventId), fetchCandidates(eventId), fetchCheckoutStatus(eventId).catch(() => null)]);
    return { event: withEncerrado(raw), candidates, checkout };
  });
  useRefreshOnFocus(details.reload);
  const { busy, error, run } = useAction(() => router.back());
  const decline = useAction(details.reload);
  const runDecline = decline.run;
  const me = useMe();
  const casa = isPro(me.casaAte);
  const favoritos = useAsync(`favoritos-ids:${me.id}`, () => (casa ? fetchFavoriteIds(me.id) : Promise.resolve([])));

  if (details.error) return <Screen><ErrorState message={details.error} onRetry={details.reload}/></Screen>;
  if (!details.data) return <Screen><Loading cards={1}/></Screen>;
  const { event, candidates, checkout } = details.data;
  const locked = event.status !== "ABERTO" || event.encerrado;
  const deletable = event.status === "ABERTO" && !event.musicoContratadoId;
  const pendentes = candidates.filter((c) => c.status === "PENDENTE").length;
  const paymentInProgress = checkout?.status === "PENDENTE" && new Date(checkout.expiraEm) > new Date();
  const payingFor = paymentInProgress ? checkout?.candidateId ?? null : null;
  const hired = candidates.find((c) => c.status === "APROVADO");

  function remove() {
    confirmAction({ title: "Excluir evento", message: `Excluir "${event.titulo}"? As candidaturas recebidas serão perdidas.`, confirmLabel: "Excluir", cancelLabel: "Manter", onConfirm: () => void run(() => deleteEvent(event.id)) });
  }

  return <Screen onRefresh={details.reload} cabecalho={<EventStickyHeader titulo={event.titulo} valor={calcularCobranca(event.cache, comissaoPercentual(me.casaAte)).total}/>}>
    <EventHero event={event}><EventStatusPill status={event.status} encerrado={event.encerrado} inscricoesEncerradas={event.inscricoesEncerradas}/></EventHero>
    <Reveal index={1}><CachePoster rotulo={`Total com a taxa de ${comissaoPercentual(me.casaAte)}%`} valor={calcularCobranca(event.cache, comissaoPercentual(me.casaAte)).total}>
      <Text style={type.bodySmall}>Cachê do músico: {formatCurrency(event.cache)}</Text>
    </CachePoster></Reveal>
    <Reveal index={2}><EventFacts event={event}/></Reveal>
    {event.status === "CONTRATADO" && <Alert tone="success">Músico contratado: os dados do evento não podem mais ser alterados.</Alert>}
    {paymentInProgress && <Alert tone="info">Há um pagamento em andamento; conclua-o ou aguarde a cobrança expirar para editar.</Alert>}
    {event.status === "ABERTO" && event.encerrado && <Alert tone="info">A data do evento passou sem contratação. Você pode excluí-lo para limpar a lista.</Alert>}
    <Section title="Gerenciar evento">
    {deletable && <View style={{ gap: space.sm }}>
      {!locked && <Button variant="tonal" icon="create-outline" title="Editar" disabled={paymentInProgress || busy} onPress={() => router.push(`/event/${event.id}/edit`)}/>}
      <Button variant="danger" icon="trash-outline" title="Excluir" disabled={paymentInProgress} loading={busy} onPress={remove}/>
    </View>}
    {!locked && <Button
      variant="outlined"
      icon={event.inscricoesEncerradas ? "lock-open-outline" : "lock-closed-outline"}
      title={event.inscricoesEncerradas ? "Reabrir inscrições" : "Encerrar inscrições"}
      loading={decline.busy}
      onPress={() => void runDecline(() => setApplicationsClosed(event.id, !event.inscricoesEncerradas))}
    />}
    {!locked && event.inscricoesEncerradas && <Text style={type.bodySmall}>O evento não aparece mais para novos músicos. Você ainda pode aprovar quem já se inscreveu.</Text>}
    {!locked && pendentes > 0 && <Text style={type.bodySmall}>Se você mudar data, local, estilos ou cachê, {pendentes === 1 ? "o inscrito será avisado" : `os ${pendentes} inscritos serão avisados`}.</Text>}
    {event.status !== "ABERTO" && <Button title="Ver contratação" icon="document-text-outline" onPress={() => router.push(`/event/${event.id}/hiring`)}/>}
    {error ? <Alert tone="error">{error}</Alert> : null}
    {decline.error ? <Alert tone="error">{decline.error}</Alert> : null}
    </Section>

    <Section title={candidates.length === 0 ? "Candidatos" : `${candidates.length} ${candidates.length === 1 ? "candidato" : "candidatos"}`}>
      {hired && <Text style={type.bodySmall}>Contratado: {hired.musician.nome}</Text>}
      {candidates.length === 0 && <EmptyState title="Ninguém se inscreveu ainda"><Text style={[type.bodySmall, { textAlign: "center" }]}>Músicos de {event.estilosMusicais.join(", ")} num raio de até 200 km de {event.cidade} veem este evento. As inscrições aparecem aqui.</Text></EmptyState>}
      {payingFor && <Alert tone="info">Há um Pix em andamento para um dos candidatos. Conclua ou cancele esse pagamento antes de escolher outro.</Alert>}
      {candidates.map((candidate) => <CandidateCard key={candidate.id} candidate={candidate} canApprove={!locked && (!payingFor || payingFor === candidate.id)} canDecline={!locked && !payingFor} approveLabel={payingFor === candidate.id ? "Continuar pagamento" : "Aprovar e pagar"} cacheOferecido={event.cache} favorito={casa ? (favoritos.data ?? []).includes(candidate.musician.id) : null} onFavorite={(on) => void runDecline(() => setFavorite(candidate.musician.id, on).then(favoritos.reload))} onProfile={() => router.push(`/event/${event.id}/candidate/${candidate.id}`)} onChat={() => router.push(`/conversa/${candidate.id}`)} onPortfolio={(url) => { decline.fail(""); abrirLink(url, decline.fail); }} onDecline={() => confirmAction({ title: "Recusar inscrição", message: `Recusar ${candidate.musician.nome}? O músico será avisado e a conversa será encerrada.`, confirmLabel: "Recusar", cancelLabel: "Voltar", onConfirm: () => void runDecline(() => declineCandidate(event.id, candidate.id)) })} onApprove={() => router.push({ pathname: `/event/${event.id}/checkout`, params: { candidateId: candidate.id } })}/>)}
    </Section>
  </Screen>;
}

function CandidateCard({ candidate, canApprove, canDecline, approveLabel, cacheOferecido, favorito, onFavorite, onProfile, onChat, onPortfolio, onDecline, onApprove }: { candidate: Candidate; canApprove: boolean; canDecline: boolean; approveLabel: string; cacheOferecido: number; favorito: boolean | null; onFavorite: (on: boolean) => void; onProfile: () => void; onChat: () => void; onPortfolio: (url: string) => void; onDecline: () => void; onApprove: () => void }) {
  const { musician } = candidate;
  return <View style={[styles.card, { gap: space.md, borderWidth: 1, borderColor: colors.line }]}>
    <Pressable accessibilityRole="button" accessibilityLabel={`Ver perfil de ${musician.nome}`} onPress={onProfile} style={({ pressed }) => [styles.row, { gap: 12, opacity: pressed ? 0.7 : 1 }]}>
      <Avatar uri={musician.fotoPerfilUrl} name={musician.nome} size={56}/>
      <View style={{ flex: 1, minWidth: 0, gap: space.xs }}><View style={[styles.row, { flexWrap: "wrap", gap: 6 }]}><Text style={[type.titleSmall, { flexShrink: 1 }]}>{musician.nome}</Text>{musician.pro ? <Pill text="Pro" tone="accent"/> : null}</View><Text style={type.bodySmall}>{musician.cidade}, {musician.uf} · {musician.estilosMusicais.join(", ")}</Text><RatingSummary media={musician.avaliacaoMedia} total={musician.totalAvaliacoes}/></View>
      {favorito !== null && <Pressable accessibilityRole="button" accessibilityLabel={favorito ? `Remover ${musician.nome} dos favoritos` : `Salvar ${musician.nome} nos favoritos`} onPress={() => onFavorite(!favorito)} hitSlop={8} style={{ padding: 6 }}><Icon name={favorito ? "heart" : "heart-outline"} size={22} color={favorito ? colors.accentText : colors.ink2}/></Pressable>}
      <Icon name="chevron-forward" size={18} color={colors.ink3}/>
    </Pressable>
    {musician.bio ? <Text style={type.bodySmall}>{musician.bio}</Text> : null}
    <View style={{ gap: space.xs }}>
      <Text style={type.bodySmall}>{candidate.valorProposto === null ? "Aceita o cachê oferecido" : `Pede outro cachê (você ofereceu ${formatCurrency(cacheOferecido)})`}</Text>
      <Text style={type.titleSmall}>{formatCurrency(candidate.valorProposto ?? cacheOferecido)}</Text>
    </View>
    {candidate.status === "PENDENTE" && canApprove && <Button icon="checkmark" title={approveLabel} onPress={onApprove}/>}
    {candidate.status !== "RECUSADO" && <Button variant="outlined" icon="chatbubbles-outline" title="Conversar" onPress={onChat}/>}
    {musician.portfolioUrl ? <Button variant="outlined" icon="play-circle-outline" title="Ver trabalho" onPress={() => onPortfolio(musician.portfolioUrl!)}/> : null}
    {candidate.status === "APROVADO" && <Alert tone="success">Contratado</Alert>}
    {candidate.status === "PENDENTE" && canDecline && <Button variant="text" title="Recusar inscrição" onPress={onDecline}/>}
    {candidate.status === "RECUSADO" && <Alert tone="info">Não selecionado</Alert>}
  </View>;
}
