import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Alert as NativeAlert, Image, Linking, Text, View } from "react-native";
import { errorMessage } from "../../../../shared/client/api.ts";
import {
  applyToEvent,
  cancelApplication,
  deleteEvent,
  fetchCandidates,
  fetchCheckoutStatus,
  fetchContractor,
  fetchEvent,
  fetchMyApplication,
  type Candidate,
  type EventItem,
} from "../../../../shared/client/events.ts";
import { formatCurrency, formatDateTime, formatDuration } from "../../../../shared/client/format.ts";
import { useAsync } from "../../../../shared/client/useAsync.ts";
import { calcularCobranca, camposFaltantes, descreverFaltantes, hasCancellationNotice } from "../../../../shared/dominio.ts";
import { EventStatusPill } from "../../../components/events";
import { Alert, Avatar, Button, EmptyState, ErrorState, Icon, Loading, RatingSummary, Screen, Section, Tag, type IconName } from "../../../components/ui";
import { colors, radius, space, styles, type } from "../../../lib/theme";
import { useMe } from "../../../lib/useMe";

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
  return { busy, error, run };
}

/** Foto do evento com o título sobre ela: a imagem lidera a tela. */
function Hero({ event, children }: { event: EventItem; children?: React.ReactNode }) {
  return <View style={{ height: 260, borderRadius: radius.lg, overflow: "hidden", backgroundColor: colors.surface }}>
    <Image source={{ uri: event.imagemUrl }} style={{ width: "100%", height: "100%" }} accessibilityLabel={`Foto do evento ${event.titulo}`}/>
    <LinearGradient colors={["transparent", "#0f1016f5"]} locations={[0.25, 1]} style={{ position: "absolute", inset: 0 }}/>
    <View style={{ position: "absolute", left: 16, right: 16, bottom: 16, gap: 8 }}>
      {children}
      <Text style={type.headline}>{event.titulo}</Text>
      <Text style={[type.bodySmall, { color: "#d9d6e4" }]}>{formatDateTime(event.inicio)} · {formatDuration(event.duracaoMinutos)} · {event.cidade}, {event.uf}</Text>
    </View>
  </View>;
}

function Facts({ event }: { event: EventItem }) {
  const facts: { icon: IconName; text: string }[] = [
    { icon: "pricetag-outline", text: event.tipoEvento },
    { icon: "musical-notes-outline", text: `${event.estilosMusicais.join(", ")} · ${event.formacao}` },
    { icon: "volume-high-outline", text: event.somDisponivel ? "Som disponível no local" : "Leve seu equipamento de som" },
  ];
  return <View style={{ gap: 8 }}>{facts.map((f) => <View key={f.text} style={[styles.row, { gap: 10 }]}><Icon name={f.icon} size={18} color={colors.ink2}/><Text style={type.body}>{f.text}</Text></View>)}</View>;
}

// ---------------------------------------------------------------------------
// Músico: detalhes da oportunidade e candidatura
// ---------------------------------------------------------------------------

function Opportunity({ eventId }: { eventId: string }) {
  const me = useMe();
  const router = useRouter();
  const details = useAsync(`opportunity:${eventId}`, async () => {
    const event = await fetchEvent(eventId);
    const [application, contractor] = await Promise.all([fetchMyApplication(eventId, me.id), fetchContractor(event.contractorId)]);
    return { event, application, contractor };
  });
  const { busy, error, run } = useAction(details.reload);

  if (details.error) return <Screen><ErrorState message={details.error} onRetry={details.reload}/></Screen>;
  if (!details.data) return <Screen><Loading cards={1}/></Screen>;
  const { event, application, contractor } = details.data;
  const hired = event.musicoContratadoId === me.id;
  const cancellable = hasCancellationNotice(new Date(event.inicio), new Date());
  const faltando = camposFaltantes(me, "candidatar");

  return <Screen>
    <Hero event={event}><View style={[styles.row, { flexWrap: "wrap" }]}>{event.estilosMusicais.slice(0, 2).map((estilo) => <Tag key={estilo} text={estilo} onImage/>)}{event.distanciaKm ? <Tag text={`a ${event.distanciaKm} km`} onImage/> : null}</View></Hero>
    <View style={[styles.between, styles.cardRaised]}>
      <View><Text style={type.labelSmall}>CACHÊ</Text><Text style={type.price}>{formatCurrency(event.cache)}</Text></View>
      <Text style={[type.bodySmall, { flex: 1, textAlign: "right" }]}>Pago a você após o show, sem taxa de candidatura.</Text>
    </View>
    <Facts event={event}/>
    {event.descricao ? <Section title="Sobre o evento"><Text style={type.body}>{event.descricao}</Text></Section> : null}
    <Section title="Quem está contratando">
      <View style={[styles.card, styles.row, { gap: 12 }]}>
        <Avatar uri={contractor.fotoPerfilUrl} name={contractor.nome}/>
        <View style={{ flex: 1 }}><Text style={type.titleSmall}>{contractor.nome}</Text><RatingSummary media={contractor.avaliacaoMedia} total={contractor.totalAvaliacoes}/></View>
      </View>
      <Text style={type.bodySmall}>Endereço completo e telefone são liberados após a contratação.</Text>
    </Section>
    <View style={{ gap: space.md }}>
      {hired && <>
        <Alert tone="success">Você foi contratado para este evento.</Alert>
        <Button title="Ver contratação" icon="document-text-outline" onPress={() => router.push(`/event/${event.id}/hiring`)}/>
      </>}
      {!hired && !application && (event.status === "ABERTO"
        ? faltando.length > 0
          ? <>
            <Alert tone="info">Para se inscrever, complete seu perfil: {descreverFaltantes(faltando)}.</Alert>
            <Button title="Completar perfil" icon="arrow-forward" onPress={() => router.push({ pathname: "/account/edit", params: { acao: "candidatar" } })}/>
          </>
          : <Button title="Inscrever-se" icon="paper-plane-outline" onPress={() => run(() => applyToEvent(event.id))} loading={busy}/>
        : <Alert tone="info">As inscrições para este evento estão encerradas.</Alert>)}
      {!hired && application && <>
        <Alert tone={application.status === "RECUSADO" ? "info" : "success"}>{application.status === "RECUSADO" ? "Outro músico foi contratado para este evento." : "Inscrição enviada. Você será avisado por e-mail se for aprovado."}</Alert>
        {application.status === "PENDENTE" && <Button variant="outlined" title={cancellable ? "Cancelar inscrição" : "Cancelamento indisponível (menos de 24h)"} disabled={!cancellable} loading={busy} onPress={() => run(() => cancelApplication(event.id))}/>}
      </>}
      {error ? <Alert tone="error">{error}</Alert> : null}
    </View>
  </Screen>;
}

// ---------------------------------------------------------------------------
// Contratante: gestão do evento e dos candidatos
// ---------------------------------------------------------------------------

function Manage({ eventId }: { eventId: string }) {
  const router = useRouter();
  const details = useAsync(`manage:${eventId}`, async () => {
    const [raw, candidates, checkout] = await Promise.all([fetchEvent(eventId), fetchCandidates(eventId), fetchCheckoutStatus(eventId).catch(() => null)]);
    return { event: { ...raw, encerrado: raw.status === "ABERTO" && new Date(raw.inicio).getTime() <= Date.now() }, candidates, checkout };
  });
  const { busy, error, run } = useAction(() => router.back());

  if (details.error) return <Screen><ErrorState message={details.error} onRetry={details.reload}/></Screen>;
  if (!details.data) return <Screen><Loading cards={1}/></Screen>;
  const { event, candidates, checkout } = details.data;
  const locked = event.status !== "ABERTO" || event.encerrado;
  const paymentInProgress = checkout?.status === "PENDENTE" && new Date(checkout.expiraEm) > new Date();
  const hired = candidates.find((c) => c.status === "APROVADO");

  function remove() {
    NativeAlert.alert("Excluir evento", `Excluir "${event.titulo}"? As candidaturas recebidas serão perdidas.`, [
      { text: "Manter", style: "cancel" },
      { text: "Excluir", style: "destructive", onPress: () => void run(() => deleteEvent(event.id)) },
    ]);
  }

  return <Screen>
    <Hero event={event}><EventStatusPill status={event.status} encerrado={event.encerrado}/></Hero>
    <View style={[styles.cardRaised, { gap: 4 }]}>
      <View style={styles.between}><Text style={type.bodySmall}>Cachê do músico</Text><Text style={type.body}>{formatCurrency(event.cache)}</Text></View>
      <View style={styles.between}><Text style={type.bodySmall}>Total com a taxa de 10%</Text><Text style={type.price}>{formatCurrency(calcularCobranca(event.cache).total)}</Text></View>
    </View>
    <Facts event={event}/>
    {event.status === "CONTRATADO" && <Alert tone="success">Músico contratado: os dados do evento não podem mais ser alterados.</Alert>}
    {paymentInProgress && <Alert tone="info">Há um pagamento em andamento; conclua-o ou aguarde a cobrança expirar para editar.</Alert>}
    {!locked && <View style={{ flexDirection: "row", gap: space.md }}>
      <View style={{ flex: 1 }}><Button variant="tonal" icon="create-outline" title="Editar" disabled={paymentInProgress || busy} onPress={() => router.push(`/event/${event.id}/edit`)}/></View>
      <View style={{ flex: 1 }}><Button variant="danger" icon="trash-outline" title="Excluir" disabled={paymentInProgress} loading={busy} onPress={remove}/></View>
    </View>}
    {event.status !== "ABERTO" && checkout?.status === "PAGO" && <Button title="Ver contratação" icon="document-text-outline" onPress={() => router.push(`/event/${event.id}/hiring`)}/>}
    {error ? <Alert tone="error">{error}</Alert> : null}

    <Section title={candidates.length === 0 ? "Candidatos" : `${candidates.length} ${candidates.length === 1 ? "candidato" : "candidatos"}`}>
      {hired && <Text style={type.bodySmall}>Contratado: {hired.musician.nome}</Text>}
      {candidates.length === 0 && <EmptyState icon="people-outline" title="Ninguém se inscreveu ainda"><Text style={[type.bodySmall, { textAlign: "center" }]}>Músicos de {event.estilosMusicais.join(", ")} num raio de até 200 km de {event.cidade} veem este evento. Você recebe um aviso quando alguém se inscrever.</Text></EmptyState>}
      {candidates.map((candidate) => <CandidateCard key={candidate.id} candidate={candidate} canApprove={!locked} approveLabel={paymentInProgress ? "Continuar pagamento" : "Aprovar e pagar"} onApprove={() => router.push({ pathname: `/event/${event.id}/checkout`, params: { candidateId: candidate.id } })}/>)}
    </Section>
  </Screen>;
}

function CandidateCard({ candidate, canApprove, approveLabel, onApprove }: { candidate: Candidate; canApprove: boolean; approveLabel: string; onApprove: () => void }) {
  const { musician } = candidate;
  return <View style={[styles.card, { gap: space.md }]}>
    <View style={[styles.row, { gap: 12 }]}>
      <Avatar uri={musician.fotoPerfilUrl} size={56}/>
      <View style={{ flex: 1 }}><Text style={type.titleSmall}>{musician.nome}</Text><Text style={type.bodySmall}>{musician.cidade}, {musician.uf} · {musician.estilosMusicais.join(", ")}</Text><RatingSummary media={musician.avaliacaoMedia} total={musician.totalAvaliacoes}/></View>
    </View>
    {musician.bio ? <Text style={type.bodySmall}>{musician.bio}</Text> : null}
    <View style={{ flexDirection: "row", gap: space.sm }}>
      {musician.portfolioUrl && <View style={{ flex: 1 }}><Button variant="outlined" icon="play-circle-outline" title="Ver trabalho" onPress={() => Linking.openURL(musician.portfolioUrl!)}/></View>}
      {candidate.status === "PENDENTE" && canApprove && <View style={{ flex: 1 }}><Button icon="checkmark" title={approveLabel} onPress={onApprove}/></View>}
    </View>
    {candidate.status === "APROVADO" && <Alert tone="success">Contratado</Alert>}
    {candidate.status === "RECUSADO" && <Alert tone="info">Não selecionado</Alert>}
  </View>;
}
