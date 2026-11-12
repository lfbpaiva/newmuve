import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import type { ReactNode } from "react";
import { Image, Pressable, Text, View } from "react-native";
import { fetchReviewsOf, type EventItem, type EventStatus } from "../../shared/client/events.ts";
import { eventDateParts, formatCurrency, formatDuration } from "../../shared/client/format.ts";
import { useAsync } from "../../shared/client/useAsync.ts";
import { colors, radius, space, styles, type } from "../lib/theme";
import { CabecalhoFixo, ErrorState, Icon, Parallax, Pill, Section, Stars, Tag } from "./ui";

const statusLabels: Record<EventStatus, string> = {
  ABERTO: "Inscrições abertas",
  CONTRATADO: "Músico contratado",
  CONCLUIDO: "Concluído",
  CANCELADO: "Cancelado",
};

export const withEncerrado = (event: EventItem, now = Date.now()) => ({ ...event, encerrado: event.status === "ABERTO" && new Date(event.inicio).getTime() <= now });

export function EventStatusPill({ status, encerrado, inscricoesEncerradas }: { status: EventStatus; encerrado?: boolean; inscricoesEncerradas?: boolean }) {
  if (status === "ABERTO" && encerrado) return <Pill text="Encerrado" tone="muted"/>;
  if (status === "ABERTO" && inscricoesEncerradas) return <Pill text="Inscrições encerradas" tone="muted"/>;
  if (status === "CANCELADO") return <Pill text={statusLabels[status]} tone="muted"/>;
  if (status === "ABERTO") return <Pill text={statusLabels[status]}/>;
  return <Pill text={statusLabels[status]} tone="success"/>;
}


export function EventCard({ event, antecipado = false }: { event: EventItem; antecipado?: boolean }) {
  const router = useRouter();
  const { day, month, time } = eventDateParts(event.inicio, event.uf);
  return <Pressable accessibilityRole="button" accessibilityLabel={`${event.titulo}, ${formatCurrency(event.cache)}`} onPress={() => router.push(`/event/${event.id}`)} style={({ pressed }) => ({ gap: space.md, opacity: pressed ? 0.85 : 1 })}>
    <View style={{ height: 240, borderRadius: radius.md, overflow: "hidden", backgroundColor: colors.surface }}>
      <Image source={{ uri: event.imagemUrl }} style={{ width: "100%", height: "100%" }}/>
      <LinearGradient colors={["#0a0a0c66", "transparent", "#0a0a0ce6"]} locations={[0, 0.4, 1]} style={{ position: "absolute", inset: 0 }}/>
      <View style={{ position: "absolute", top: 12, left: 12, flexDirection: "row", gap: 6 }}><Tag text={event.estilosMusicais.length > 1 ? `${event.estilosMusicais[0]} +${event.estilosMusicais.length - 1}` : event.estilosMusicais[0]} onImage/>{event.distanciaKm ? <Tag text={`${event.distanciaKm} km`} onImage/> : <Tag text="Sua cidade" onImage/>}{antecipado ? <Tag text="Pro · 24h antes" onImage/> : null}</View>
      <View style={{ position: "absolute", right: 12, top: 12, alignItems: "flex-end" }}>
        <Text style={[type.stat, { fontSize: 34, lineHeight: 34 }]}>{day}</Text>
        <Text style={[type.labelSmall, { color: colors.ink }]}>{month} · {time}</Text>
      </View>
      <View style={{ position: "absolute", left: 14, right: 14, bottom: 14 }}>
        <Text style={type.headline} numberOfLines={2}>{event.titulo}</Text>
      </View>
    </View>
    <View style={styles.between}>
      <View>
        <Text style={type.labelSmall}>{event.cidade}, {event.uf} · {event.tipoEvento}</Text>
        <Text style={type.price}>{formatCurrency(event.cache)}</Text>
      </View>
      <View style={[styles.row, { gap: 6 }]}>
        {event.formacao !== "Indiferente" && <Tag text={event.formacao}/>}
        {event.somDisponivel && <Tag text="Som no local"/>}
        <Icon name="arrow-forward" size={20} color={colors.accentText}/>
      </View>
    </View>
    <View style={styles.divider}/>
  </Pressable>;
}

const valorCartaz = (valor: number) => formatCurrency(valor).replace(/,00$/, "");

const creditos = (event: EventItem) =>
  [event.tipoEvento, ...event.estilosMusicais, event.formacao !== "Indiferente" ? event.formacao : null, event.somDisponivel ? "Som no local" : null].filter(Boolean).join(" · ");

export function DateTile({ iso, uf }: { iso: string; uf: string }) {
  const { day, month, weekday } = eventDateParts(iso, uf);
  return <View style={{ width: 56, paddingRight: space.md, borderRightWidth: 1, borderRightColor: colors.line }}>
    <Text style={type.labelSmall}>{weekday}</Text>
    <Text style={[type.stat, { fontSize: 34, lineHeight: 36 }]}>{day}</Text>
    <Text style={[type.labelSmall, { color: colors.ink2 }]}>{month}</Text>
  </View>;
}

export function CachePoster({ rotulo, valor, children }: { rotulo: string; valor: number; children?: ReactNode }) {
  return <View style={{ borderTopWidth: 2, borderTopColor: colors.accent, paddingTop: space.md, gap: space.xs }}>
    <Text style={type.labelSmall}>{rotulo}</Text>
    <Text style={[type.stat, { fontSize: 52, lineHeight: 54, color: colors.accentText }]} accessibilityLabel={`${rotulo}: ${formatCurrency(valor)}`}>{valorCartaz(valor)}</Text>
    {children}
  </View>;
}

export function OpportunityCard({ event, antecipado }: { event: EventItem; antecipado: boolean }) {
  const router = useRouter();
  const { day, month, cartaz } = eventDateParts(event.inicio, event.uf);
  const distancia = event.distanciaKm ? `${event.distanciaKm} km` : "Sua cidade";
  return <Pressable accessibilityRole="button" accessibilityLabel={`${event.titulo}, ${day} de ${month}, ${event.cidade}, cachê de ${formatCurrency(event.cache)}`} onPress={() => router.push(`/event/${event.id}`)} style={({ pressed }) => ({ borderTopWidth: 2, borderTopColor: pressed ? colors.accent : colors.ink, paddingTop: space.md, paddingBottom: space.sm, gap: space.md, backgroundColor: pressed ? colors.surface : colors.bg })}>
    <View style={styles.between}>
      <Text style={type.label}>{cartaz}</Text>
      <Text style={[type.label, { color: colors.ink2 }]}>{distancia}</Text>
    </View>
    <View style={{ gap: space.sm }}>
      {antecipado ? <Pill text="Pro · antes de todos"/> : null}
      <Text style={[type.display, { fontSize: 34, lineHeight: 34 }]} numberOfLines={3}>{event.titulo}</Text>
      <Text style={[type.labelSmall, { lineHeight: 16 }]} numberOfLines={2}>{creditos(event)} · {event.cidade}, {event.uf}</Text>
    </View>
    <View style={{ height: 148, borderRadius: radius.xs, overflow: "hidden", backgroundColor: colors.surface2 }}>
      <Image source={{ uri: event.imagemUrl }} style={{ width: "100%", height: "100%" }}/>
    </View>
    <View style={[styles.between, { alignItems: "flex-end" }]}>
      <View>
        <Text style={type.labelSmall}>Cachê</Text>
        <Text style={[type.stat, { fontSize: 40, lineHeight: 42, color: colors.accentText }]}>{valorCartaz(event.cache)}</Text>
      </View>
      <View style={[styles.row, { gap: space.sm, minHeight: 44, paddingHorizontal: space.lg, borderWidth: 1, borderColor: colors.ink, borderRadius: radius.xs }]}>
        <Text style={type.label}>Ver</Text>
        <Icon name="arrow-forward" size={16} color={colors.ink}/>
      </View>
    </View>
  </Pressable>;
}

const ALTURA_HERO = 320;

export function EventStickyHeader({ titulo, valor }: { titulo: string; valor: number }) {
  return <CabecalhoFixo aparecerEm={ALTURA_HERO}>
    <View style={[styles.between, { gap: space.md }]}>
      <Text style={[type.title, { flex: 1 }]} numberOfLines={1}>{titulo}</Text>
      <Text style={[type.price, { fontSize: 20, lineHeight: 24, color: colors.accentText }]}>{valorCartaz(valor)}</Text>
    </View>
  </CabecalhoFixo>;
}

export function EventHero({ event, children }: { event: EventItem; children?: ReactNode }) {
  const { cartaz } = eventDateParts(event.inicio, event.uf);
  return <View style={{ marginHorizontal: -space.lg, marginTop: -space.lg }}>
    <Parallax height={ALTURA_HERO}>
      <Image source={{ uri: event.imagemUrl }} style={{ width: "100%", height: "100%" }} accessibilityLabel={`Foto do evento ${event.titulo}`}/>
    </Parallax>
    <LinearGradient pointerEvents="none" colors={["#0a0a0c00", colors.bg]} style={{ position: "absolute", left: 0, right: 0, top: 150, height: 172 }}/>
    <View style={{ paddingHorizontal: space.lg, marginTop: -96, gap: space.sm }}>
      {children}
      <Text style={[type.display, { fontSize: 42, lineHeight: 42 }]} accessibilityRole="header">{event.titulo}</Text>
      <View style={[styles.rule, { marginTop: space.sm }]}/>
      <View style={styles.between}>
        <Text style={type.label}>{cartaz}</Text>
        <Text style={[type.label, { color: colors.ink2 }]}>{formatDuration(event.duracaoMinutos)}</Text>
      </View>
      <Text style={[type.label, { color: colors.ink2 }]}>{event.cidade}, {event.uf}{event.distanciaKm ? ` · a ${event.distanciaKm} km` : ""}</Text>
    </View>
  </View>;
}

export function EventFacts({ event }: { event: EventItem }) {
  const linhas: [string, string][] = [
    ["Tipo", event.tipoEvento],
    ["Estilo", event.estilosMusicais.join(", ")],
    ["Formação", event.formacao],
    ["Som", event.somDisponivel ? "Disponível no local" : "Leve seu equipamento"],
  ];
  return <View>{linhas.map(([rotulo, valor], index) => <View key={rotulo} style={[styles.between, { alignItems: "flex-start", paddingVertical: space.md, borderTopWidth: 1, borderTopColor: colors.line, borderBottomWidth: index === linhas.length - 1 ? 1 : 0, borderBottomColor: colors.line }]}>
    <Text style={[type.labelSmall, { paddingTop: 3 }]}>{rotulo}</Text>
    <Text style={[type.titleSmall, { flexShrink: 1, textAlign: "right" }]}>{valor}</Text>
  </View>)}</View>;
}

export function ActiveEventCard({ event, onPress }: { event: EventItem & { encerrado: boolean }; onPress: () => void }) {
  const { day, month, time } = eventDateParts(event.inicio, event.uf);
  const total = event.totalCandidatos ?? 0;
  return <Pressable accessibilityRole="button" accessibilityLabel={`${event.titulo}, ${day} de ${month}, ${total} ${total === 1 ? "candidatura" : "candidaturas"}`} onPress={onPress} style={({ pressed }) => [styles.row, { alignItems: "flex-start", gap: space.md, paddingVertical: space.lg, borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: pressed ? colors.surface : "transparent" }]}>
    <DateTile iso={event.inicio} uf={event.uf}/>
    <View style={{ flex: 1, gap: space.sm }}>
      <Text style={type.title} numberOfLines={2}>{event.titulo}</Text>
      <Text style={[type.labelSmall, { color: colors.ink2 }]}>{time} · {event.cidade}, {event.uf}</Text>
      <EventStatusPill status={event.status} encerrado={event.encerrado} inscricoesEncerradas={event.inscricoesEncerradas}/>
    </View>
    <View style={{ alignItems: "flex-end" }}>
      <Text style={[type.stat, { fontSize: 34, lineHeight: 36 }]}>{total}</Text>
      <Text style={type.labelSmall}>{total === 1 ? "Inscrito" : "Inscritos"}</Text>
    </View>
  </Pressable>;
}

export function EventRow({ event, trailing, detail, onPress }: { event: EventItem; trailing: ReactNode; detail?: string; onPress: () => void }) {
  const { day, month, time } = eventDateParts(event.inicio, event.uf);
  return <Pressable accessibilityRole="button" onPress={onPress} android_ripple={{ color: colors.surface2 }} style={({ pressed }) => [styles.row, { gap: 14, paddingVertical: space.md, borderBottomWidth: 1, borderBottomColor: colors.line, opacity: pressed ? 0.7 : 1 }]}>
    <View style={{ width: 56, alignItems: "center" }}>
      <Text style={[type.stat, { fontSize: 32, lineHeight: 32 }]}>{day}</Text>
      <Text style={type.labelSmall}>{month}</Text>
    </View>
    <Image source={{ uri: event.imagemUrl }} style={{ width: 56, height: 56, borderRadius: radius.sm, backgroundColor: colors.surface2 }}/>
    <View style={{ flex: 1, gap: 4 }}>
      <Text style={type.titleSmall} numberOfLines={2}>{event.titulo}</Text>
      <Text style={type.bodySmall} numberOfLines={1}>{time} · {event.cidade}{detail ? ` · ${detail}` : ""}</Text>
      <View style={[styles.row, { marginTop: 2 }]}>{trailing}</View>
    </View>
    <Icon name="arrow-forward" size={18} color={colors.ink3}/>
  </Pressable>;
}

export function ReviewsSection({ userId, empty }: { userId: string; empty: string }) {
  const reviews = useAsync(`reviews:${userId}`, () => fetchReviewsOf(userId));
  return <Section title="Avaliações recebidas">
    {reviews.error && <ErrorState message={reviews.error} onRetry={reviews.reload}/>}
    {!reviews.error && !reviews.data && <Text style={type.bodySmall}>Carregando avaliações...</Text>}
    {reviews.data?.length === 0 && <Text style={type.bodySmall}>{empty}</Text>}
    {reviews.data?.map((review) => <View key={review.id} style={styles.card}>
      <View style={styles.between}><Stars rating={review.rating}/><Text style={type.bodySmall}>{new Date(review.createdAt).toLocaleDateString("pt-BR")}</Text></View>
      {review.comment ? <Text style={type.body}>{review.comment}</Text> : null}
    </View>)}
  </Section>;
}
