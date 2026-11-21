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
  fetchEvent,
  fetchEventWithContractor,
  fetchMyApplication,
  fetchMyInvite,
  declineCandidate,
  setApplicationsClosed,
  updateProposal,
  type Candidate,
} from "../../../../shared/client/events.ts";
import { mostraEstimativaParaContratante } from "../../../../shared/client/conversation.ts";
import { detalharTotalDoContratante, formatCurrency, formatTotalDoContratante } from "../../../../shared/client/format.ts";
import { useAsync } from "../../../../shared/client/useAsync.ts";
import { calcularCobranca, camposFaltantes, comissaoPercentual, descreverFaltantes, emAcessoAntecipado, estimarCobrancaDoContratante, hasCancellationNotice, isPro, valorDaInscricao, type EstimativaDoContratante } from "../../../../shared/dominio.ts";
import { CachePoster, EventFacts, EventHero, EventStatusPill, EventStickyHeader, ReviewsSection, textoDaAbertura, withEncerrado } from "../../../components/events";
import { ProposalForm } from "../../../components/proposal";
import { Alert, Avatar, Button, EmptyState, ErrorState, Icon, Loading, Pill, RatingSummary, Reveal, Screen, Section } from "../../../components/ui";
import { aparenciaDoCoracao } from "../../../lib/favoritos";
import { useFavoritos } from "../../../lib/useFavoritos";
import { confirmAction } from "../../../lib/confirm";
import { abrirLink } from "../../../lib/links";
import { colors, radius, space, styles, type } from "../../../lib/theme";
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
    const [{ event, contractor }, application, convidado] = await Promise.all([fetchEventWithContractor(eventId), fetchMyApplication(eventId, me.id), fetchMyInvite(eventId, me.id).catch(() => false)]);
    return { event, application, contractor, convidado };
  });
  useRefreshOnFocus(details.reload);
  const { busy, error, run } = useAction(details.reload);
  const [editingProposal, setEditingProposal] = useState(false);
  const [propostaSalva, setPropostaSalva] = useState<{ valor: number | null; base: typeof details.data } | null>(null);

  if (details.error) return <Screen><ErrorState message={details.error} onRetry={details.reload}/></Screen>;
  if (!details.data) return <Screen><Loading cards={1}/></Screen>;
  const { event, contractor, convidado } = details.data;
  const application = details.data.application && propostaSalva?.base === details.data ? { ...details.data.application, valorProposto: propostaSalva.valor } : details.data.application;
  const hired = event.musicoContratadoId === me.id;
  const cancellable = hasCancellationNotice(new Date(event.inicio), new Date());
  const faltando = camposFaltantes(me, "candidatar");
  const conversar = application ? () => router.push(`/conversa/${application.id}`) : null;
  const aguardandoResposta = application?.status === "PENDENTE" && event.status === "ABERTO" && new Date(event.inicio) > new Date();
  const aguardandoAbertura = !convidado && !isPro(me.proAte) && emAcessoAntecipado({ inicio: event.inicio, criadoEm: event.createdAt });

  return <Screen onRefresh={details.reload} carregando={details.loading} evitarTeclado cabecalho={<EventStickyHeader titulo={event.titulo} valor={event.cache}/>}>
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
          : aguardandoAbertura
            ? <>
              <Alert tone="info">{`${textoDaAbertura(event)}. Nas primeiras 24 horas, só músicos Muve Pro se inscrevem em eventos marcados com 7 dias ou mais de antecedência.`}</Alert>
              <Button title="Conhecer o Muve Pro" variant="outlined" icon="flash-outline" onPress={() => router.push("/pro")}/>
            </>
            : <ProposalForm cacheOferecido={event.cache} valorAtual={null} submitLabel="Inscrever-se" icon="paper-plane-outline" busy={busy} onSubmit={(valor) => run(() => applyToEvent(event.id, valor))}/>
        : <Alert tone="info">As inscrições para este evento estão encerradas.</Alert>)}
      {!hired && application && <>
        <Alert tone={aguardandoResposta ? "success" : "info"}>{application.status === "RECUSADO" ? "Sua inscrição não foi selecionada para este evento." : aguardandoResposta ? "Inscrição enviada. Você recebe uma notificação quando o contratante responder." : "Este evento não recebe mais respostas: ele já começou ou foi encerrado sem a sua contratação."}</Alert>
        {application.status === "PENDENTE" && <>
          <View style={[styles.card, { gap: space.xs }]}>
            <Text style={type.bodySmall}>{application.valorProposto === null ? "Você aceitou o cachê oferecido" : "Sua proposta"}</Text>
            <Text style={type.titleSmall}>{formatCurrency(application.valorProposto ?? event.cache)}</Text>
          </View>
          {aguardandoResposta && (editingProposal
            ? <ProposalForm cacheOferecido={event.cache} valorAtual={application.valorProposto} submitLabel="Salvar valor" icon="checkmark" busy={busy} onSubmit={(valor) => run(async () => { await updateProposal(event.id, valor); setPropostaSalva({ valor: valorDaInscricao(valor, event.cache), base: details.data }); setEditingProposal(false); })}/>
            : <Button variant="text" title="Alterar valor" onPress={() => setEditingProposal(true)}/>)}
          {conversar && <Button title="Conversar com o contratante" variant="outlined" icon="chatbubbles-outline" onPress={conversar}/>}
          {aguardandoResposta && <Button variant="outlined" title={cancellable ? "Cancelar inscrição" : "Cancelamento indisponível (menos de 24h)"} disabled={!cancellable} loading={busy} onPress={() => confirmAction({ title: "Cancelar inscrição", message: "Cancelar sua inscrição neste evento? A conversa com o contratante também é apagada.", confirmLabel: "Cancelar inscrição", cancelLabel: "Voltar", onConfirm: () => void run(() => cancelApplication(event.id)) })}/>}
        </>}
      </>}
      {error ? <Alert tone="error">{error}</Alert> : null}
    </View></Section>
    {event.descricao ? <Section title="Sobre o evento"><View style={styles.card}><Text style={type.body}>{event.descricao}</Text></View></Section> : null}
    <Section title="Quem está contratando">
      {contractor
        ? <View style={[styles.card, styles.row, { gap: 12 }]}>
          <Avatar uri={contractor.fotoPerfilUrl} name={contractor.nome}/>
          <View style={{ flex: 1, minWidth: 0 }}><Text style={type.titleSmall}>{contractor.nome}</Text><RatingSummary media={contractor.avaliacaoMedia} total={contractor.totalAvaliacoes}/></View>
        </View>
        : <Text style={type.bodySmall}>O contratante excluiu a conta.</Text>}
      <Text style={[type.bodySmall, { fontSize: 14, lineHeight: 21 }]}>Endereço completo e telefone são liberados após a contratação.</Text>
    </Section>
    {contractor && event.contractorId ? <ReviewsSection userId={event.contractorId} titulo="Avaliações do contratante" empty="Este contratante ainda não recebeu avaliações."/> : null}
  </Screen>;
}

function Manage({ eventId }: { eventId: string }) {
  const router = useRouter();
  const details = useAsync(`manage:${eventId}`, async () => {
    const [raw, candidates, checkout] = await Promise.all([fetchEvent(eventId), fetchCandidates(eventId), fetchCheckoutStatus(eventId)]);
    return { event: withEncerrado(raw), candidates, checkout };
  });
  useRefreshOnFocus(details.reload);
  const { busy, error, run } = useAction(() => router.back());
  const decline = useAction(details.reload);
  const runDecline = decline.run;
  const me = useMe();
  const casa = isPro(me.casaAte);
  const favoritos = useFavoritos(me.id, casa);

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
    confirmAction({ title: "Excluir evento", message: pendentes + candidates.filter((c) => c.status !== "PENDENTE").length > 0 ? `Excluir "${event.titulo}"? O evento sai do feed e as inscrições são encerradas; as conversas continuam no histórico.` : `Excluir "${event.titulo}"?`, confirmLabel: "Excluir", cancelLabel: "Manter", onConfirm: () => void run(() => deleteEvent(event.id)) });
  }

  return <Screen onRefresh={details.reload} carregando={details.loading} cabecalho={<EventStickyHeader titulo={event.titulo} valor={calcularCobranca(event.cache, comissaoPercentual(me.casaAte)).total}/>}>
    <EventHero event={event}><EventStatusPill status={event.status} encerrado={event.encerrado} inscricoesEncerradas={event.inscricoesEncerradas}/></EventHero>
    <Reveal index={1}><CachePoster rotulo={`Total com a taxa de ${comissaoPercentual(me.casaAte)}%`} valor={calcularCobranca(event.cache, comissaoPercentual(me.casaAte)).total}>
      <Text style={type.bodySmall}>Cachê do músico: {formatCurrency(event.cache)}</Text>
    </CachePoster></Reveal>
    <Reveal index={2}><EventFacts event={event}/></Reveal>
    {event.status === "CONTRATADO" && <Alert tone="success">Músico contratado: os dados do evento não podem mais ser alterados.</Alert>}
    {paymentInProgress && <Alert tone="info">Há um pagamento em andamento; conclua-o ou aguarde a cobrança expirar para editar.</Alert>}
    {event.status === "ABERTO" && event.encerrado && <Alert tone="info">A data do evento passou sem contratação. Você pode excluí-lo para limpar a lista.</Alert>}
    <Section title="Gerenciar evento">
    {deletable && <View style={[styles.row, { gap: space.sm }]}>
      {!locked && <View style={{ flex: 1 }}><Button variant="tonal" icon="create-outline" title="Editar" disabled={paymentInProgress || busy} onPress={() => router.push(`/event/${event.id}/edit`)}/></View>}
      <View style={{ flex: 1 }}><Button variant="danger" icon="trash-outline" title="Excluir" disabled={paymentInProgress} loading={busy} onPress={remove}/></View>
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
    {favoritos.erro ? <Alert tone="error">{favoritos.erro}</Alert> : null}
    {favoritos.erro && favoritos.podeTentarDeNovo ? <Button title="Tentar novamente" variant="text" icon="refresh" block={false} onPress={favoritos.tentarDeNovo}/> : null}
    </Section>

    <Section title={candidates.length === 0 ? "Candidatos" : `${candidates.length} ${candidates.length === 1 ? "candidato" : "candidatos"}`}>
      {hired && <Text style={type.bodySmall}>Contratado: {hired.musician.nome}</Text>}
      {candidates.length === 0 && <EmptyState title="Ninguém se inscreveu ainda"><Text style={[type.bodySmall, { textAlign: "center" }]}>Músicos de {event.estilosMusicais.join(", ")} num raio de até 200 km de {event.cidade} veem este evento. As inscrições aparecem aqui.</Text></EmptyState>}
      {payingFor && <Alert tone="info">Há um Pix em andamento para um dos candidatos. Conclua ou cancele esse pagamento antes de escolher outro.</Alert>}
      {candidates.map((candidate, index) => {
        const botaoFavorito = favoritos.botao(candidate.musician.id);
        return <Reveal key={candidate.id} index={index}><CandidateCard candidate={candidate} estimativa={!locked && !payingFor && mostraEstimativaParaContratante({ souContratante: true, inscricao: candidate.status, evento: event.status, eventoEncerrado: event.encerrado }) ? estimarCobrancaDoContratante(candidate.valorProposto ?? event.cache, me.casaAte) : null} canApprove={!locked && (!payingFor || payingFor === candidate.id)} canDecline={!locked && !payingFor} approveLabel={payingFor === candidate.id ? "Continuar pagamento" : "Aprovar e pagar"} cacheOferecido={event.cache} favorito={botaoFavorito.visivel ? botaoFavorito.favorito : null} favoritoPendente={botaoFavorito.salvando} onFavorite={(on) => void favoritos.alternar(candidate.musician.id, on)} onProfile={() => router.push(`/event/${event.id}/candidate/${candidate.id}`)} onChat={() => router.push(`/conversa/${candidate.id}`)} onPortfolio={(url) => { decline.fail(""); abrirLink(url, decline.fail); }} onDecline={() => confirmAction({ title: "Recusar inscrição", message: `Recusar ${candidate.musician.nome}? O músico será avisado e a conversa será encerrada.`, confirmLabel: "Recusar", cancelLabel: "Voltar", onConfirm: () => void runDecline(() => declineCandidate(event.id, candidate.id)) })} onApprove={() => router.push({ pathname: `/event/${event.id}/checkout`, params: { candidateId: candidate.id } })}/></Reveal>;
      })}
    </Section>
  </Screen>;
}

function CandidateCard({ candidate, estimativa, canApprove, canDecline, approveLabel, cacheOferecido, favorito, favoritoPendente, onFavorite, onProfile, onChat, onPortfolio, onDecline, onApprove }: { candidate: Candidate; estimativa: EstimativaDoContratante | null; canApprove: boolean; canDecline: boolean; approveLabel: string; cacheOferecido: number; favorito: boolean | null; favoritoPendente: boolean; onFavorite: (on: boolean) => void; onProfile: () => void; onChat: () => void; onPortfolio: (url: string) => void; onDecline: () => void; onApprove: () => void }) {
  const { musician } = candidate;
  const pedeOutro = candidate.valorProposto !== null && candidate.valorProposto !== cacheOferecido;
  const coracao = aparenciaDoCoracao({ favorito: favorito === true });
  return <View style={[styles.card, { gap: space.lg, padding: 0, overflow: "hidden" }, candidate.status === "APROVADO" ? { borderColor: "rgba(110,231,160,0.35)" } : null]}>
    <View style={{ padding: space.lg, paddingBottom: 0, gap: space.md }}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Ver perfil de ${musician.nome}`} onPress={onProfile} style={({ pressed }) => [styles.row, { gap: space.md, opacity: pressed ? 0.7 : 1 }]}>
        <View style={{ borderRadius: radius.pill, padding: 2, borderWidth: 1, borderColor: musician.pro ? "rgba(139,107,255,0.5)" : colors.hairline }}><Avatar uri={musician.fotoPerfilUrl} name={musician.nome} size={52}/></View>
        <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
          <View style={[styles.row, { flexWrap: "wrap", gap: 6 }]}><Text style={[type.title, { flexShrink: 1 }]}>{musician.nome}</Text>{musician.pro ? <Pill text="Pro" tone="accent"/> : null}</View>
          <Text style={type.bodySmall} numberOfLines={1}>{musician.cidade}, {musician.uf} · {musician.estilosMusicais.join(", ")}</Text>
          <RatingSummary media={musician.avaliacaoMedia} total={musician.totalAvaliacoes}/>
        </View>
        {favorito !== null && <Pressable accessibilityRole="button" accessibilityLabel={favorito ? `Remover ${musician.nome} dos favoritos` : `Salvar ${musician.nome} nos favoritos`} accessibilityState={{ busy: favoritoPendente }} onPress={() => onFavorite(!favorito)} hitSlop={8} style={({ pressed }) => ({ width: 40, height: 40, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", opacity: coracao.opacidade, backgroundColor: pressed || coracao.preenchido ? colors.accentSoft : colors.surface2 })}>
          <Icon name={coracao.preenchido ? "heart" : "heart-outline"} size={18} color={coracao.preenchido ? colors.accentText : colors.ink2}/>
        </Pressable>}
      </Pressable>
      {musician.bio ? <Text style={type.bodySmall} numberOfLines={3}>{musician.bio}</Text> : null}
    </View>
    <View style={[styles.between, { marginHorizontal: space.lg, padding: space.md, borderRadius: radius.md, backgroundColor: pedeOutro ? colors.accentSoft : colors.surface2 }]}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={type.labelSmall}>{pedeOutro ? "Proposta do músico" : "Cachê"}</Text>
        <Text style={type.bodySmall}>{pedeOutro ? `Você ofereceu ${formatCurrency(cacheOferecido)}` : "Aceita o cachê oferecido"}</Text>
      </View>
      <Text style={[type.price, { color: pedeOutro ? colors.accentText : colors.ink }]}>{formatCurrency(candidate.valorProposto ?? cacheOferecido)}</Text>
    </View>
    {estimativa && <View style={{ marginHorizontal: space.lg, gap: 2 }}>
      <Text style={[type.titleSmall, { color: colors.accentText }]}>{formatTotalDoContratante(estimativa)}</Text>
      <Text style={[type.bodySmall, { fontSize: 12, lineHeight: 16 }]}>{detalharTotalDoContratante(estimativa)}</Text>
    </View>}
    <View style={{ padding: space.lg, paddingTop: 0, gap: space.sm }}>
      {candidate.status === "APROVADO" && <Pill text="Contratado" tone="success"/>}
      {candidate.status === "RECUSADO" && <Pill text="Não selecionado" tone="muted"/>}
      {candidate.status === "PENDENTE" && canApprove && <Button icon="checkmark" title={approveLabel} onPress={onApprove}/>}
      <View style={[styles.row, { gap: space.sm }]}>
        {candidate.status !== "RECUSADO" && <View style={{ flex: 1 }}><Button variant="tonal" icon="chatbubbles-outline" title="Conversar" onPress={onChat}/></View>}
        {musician.portfolioUrl ? <View style={{ flex: 1 }}><Button variant="tonal" icon="play-circle-outline" title="Ver trabalho" onPress={() => onPortfolio(musician.portfolioUrl!)}/></View> : null}
      </View>
      {candidate.status === "PENDENTE" && canDecline && <Button variant="text" title="Recusar inscrição" onPress={onDecline}/>}
    </View>
  </View>;
}
