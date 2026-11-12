import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import type { ReactNode } from "react";
import { Animated, Image, Pressable, Text, View } from "react-native";
import { fetchReviewsOf, type EventItem, type EventStatus } from "../../shared/client/events.ts";
import { eventDateParts, formatCurrency, formatDuration } from "../../shared/client/format.ts";
import { useAsync } from "../../shared/client/useAsync.ts";
import { colors, radius, space, styles, type } from "../lib/theme";
import { CabecalhoFixo, ErrorState, Icon, Parallax, Pill, Section, Stars, Surface, Tag, usePressao, type IconName } from "./ui";

const statusLabels: Record<EventStatus, string> = {
  ABERTO: "Inscrições abertas",
  CONTRATADO: "Músico contratado",
  CONCLUIDO: "Concluído",
  CANCELADO: "Cancelado",
};

export const withEncerrado = (event: EventItem, now = Date.now()) => ({ ...event, encerrado: event.status === "ABERTO" && new Date(event.inicio).getTime() <= now });

export function EventStatusPill({ status, encerrado, inscricoesEncerradas }: { status: EventStatus; encerrado?: boolean; inscricoesEncerradas?: boolean }) {
  if (status === "ABERTO" && encerrado) return <Pill text="Encerrado" tone="muted"/>;
  if (status === "ABERTO" && inscricoesEncerradas) return <Pill text="Inscrições encerradas" tone="warning"/>;
  if (status === "CANCELADO") return <Pill text={statusLabels[status]} tone="muted"/>;
  if (status === "ABERTO") return <Pill text={statusLabels[status]} tone="accent"/>;
  if (status === "CONCLUIDO") return <Pill text={statusLabels[status]}/>;
  return <Pill text={statusLabels[status]} tone="success"/>;
}

const valorCurto = (valor: number) => formatCurrency(valor).replace(/,00$/, "");

function Meta({ icon, text }: { icon: IconName; text: string }) {
  return <View style={[styles.row, { gap: 6, flexShrink: 1 }]}>
    <Icon name={icon} size={14} color={colors.ink3}/>
    <Text style={[type.bodySmall, { flexShrink: 1 }]} numberOfLines={1}>{text}</Text>
  </View>;
}

export function DateTile({ iso, uf }: { iso: string; uf: string }) {
  const { day, month, weekday } = eventDateParts(iso, uf);
  return <View style={{ width: 54, paddingVertical: space.sm, borderRadius: radius.md, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.hairline, alignItems: "center" }}>
    <Text style={[type.labelSmall, { color: colors.accentText, letterSpacing: 0.5 }]}>{weekday}</Text>
    <Text style={[type.price, { fontSize: 22, lineHeight: 26 }]}>{day}</Text>
    <Text style={type.labelSmall}>{month}</Text>
  </View>;
}

export function CachePoster({ rotulo, valor, children }: { rotulo: string; valor: number; children?: ReactNode }) {
  return <Surface destaque>
    <View style={[styles.row, { gap: space.sm }]}>
      <View style={{ width: 28, height: 28, borderRadius: radius.sm, backgroundColor: colors.accentSoft, alignItems: "center", justifyContent: "center" }}><Icon name="cash-outline" size={16} color={colors.accentText}/></View>
      <Text style={[type.label, { color: colors.ink2 }]}>{rotulo}</Text>
    </View>
    <Text style={[type.stat, { fontSize: 44, lineHeight: 48 }]} accessibilityLabel={`${rotulo}: ${formatCurrency(valor)}`}>{valorCurto(valor)}</Text>
    {children}
  </Surface>;
}

export function OpportunityCard({ event, antecipado }: { event: EventItem; antecipado: boolean }) {
  const router = useRouter();
  const { day, month, time, weekday } = eventDateParts(event.inicio, event.uf);
  const { escala, aoPressionar, aoSoltar } = usePressao();
  const distancia = event.distanciaKm ? `${event.distanciaKm} km` : "Sua cidade";
  return <Animated.View style={{ transform: [{ scale: escala }] }}>
    <Pressable accessibilityRole="button" accessibilityLabel={`${event.titulo}, ${day} de ${month}, ${event.cidade}, cachê de ${formatCurrency(event.cache)}`} onPress={() => router.push(`/event/${event.id}`)} onPressIn={aoPressionar} onPressOut={aoSoltar} style={({ pressed }) => ({ borderRadius: radius.lg, overflow: "hidden", backgroundColor: colors.surface, borderWidth: 1, borderColor: pressed ? "rgba(139,107,255,0.4)" : colors.hairline })}>
      <View style={{ height: 156, backgroundColor: colors.surface2 }}>
        <Image source={{ uri: event.imagemUrl }} style={{ width: "100%", height: "100%" }}/>
        <LinearGradient colors={["rgba(9,9,13,0)", "rgba(9,9,13,0.85)"]} style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 90 }}/>
        <View style={[styles.row, { position: "absolute", top: space.md, left: space.md, right: space.md, justifyContent: "space-between" }]}>
          <Tag text={`${weekday} ${day} ${month} · ${time}`} onImage/>
          <Tag text={distancia} onImage/>
        </View>
        {antecipado ? <View style={{ position: "absolute", left: space.md, bottom: space.md }}><Pill text="Pro · antes de todos" tone="accent"/></View> : null}
      </View>
      <View style={{ padding: space.lg, gap: space.md }}>
        <View style={{ gap: space.xs }}>
          <Text style={[type.title, { fontSize: 18, lineHeight: 23 }]} numberOfLines={2}>{event.titulo}</Text>
          <View style={[styles.row, { gap: space.md, flexWrap: "wrap" }]}>
            <Meta icon="location-outline" text={`${event.cidade}, ${event.uf}`}/>
            <Meta icon="musical-notes-outline" text={event.estilosMusicais.join(", ")}/>
          </View>
        </View>
        <View style={[styles.between, { alignItems: "flex-end", paddingTop: space.md, borderTopWidth: 1, borderTopColor: colors.hairline }]}>
          <View style={{ gap: 2 }}>
            <Text style={type.labelSmall}>Cachê</Text>
            <Text style={[type.price, { color: colors.ink }]}>{valorCurto(event.cache)}</Text>
          </View>
          <View style={[styles.row, { gap: 6, paddingHorizontal: 14, minHeight: 36, borderRadius: radius.pill, backgroundColor: colors.accentSoft }]}>
            <Text style={[type.label, { fontSize: 13, color: colors.accentText }]}>Ver evento</Text>
            <Icon name="arrow-forward" size={15} color={colors.accentText}/>
          </View>
        </View>
      </View>
    </Pressable>
  </Animated.View>;
}

const ALTURA_HERO = 300;

export function EventStickyHeader({ titulo, valor }: { titulo: string; valor: number }) {
  return <CabecalhoFixo aparecerEm={ALTURA_HERO}>
    <View style={[styles.between, { gap: space.md }]}>
      <Text style={[type.titleSmall, { flex: 1 }]} numberOfLines={1}>{titulo}</Text>
      <Text style={[type.titleSmall, { color: colors.accentText }]}>{valorCurto(valor)}</Text>
    </View>
  </CabecalhoFixo>;
}

export function EventHero({ event, children }: { event: EventItem; children?: ReactNode }) {
  const { weekday, day, month, time } = eventDateParts(event.inicio, event.uf);
  return <View style={{ marginHorizontal: -space.lg, marginTop: -space.lg }}>
    <Parallax height={ALTURA_HERO}>
      <Image source={{ uri: event.imagemUrl }} style={{ width: "100%", height: "100%" }} accessibilityLabel={`Foto do evento ${event.titulo}`}/>
    </Parallax>
    <LinearGradient pointerEvents="none" colors={["rgba(9,9,13,0)", colors.bg]} style={{ position: "absolute", left: 0, right: 0, top: 120, height: 182 }}/>
    <View style={{ paddingHorizontal: space.lg, marginTop: -72, gap: space.md }}>
      {children}
      <Text style={[type.display, { fontSize: 30, lineHeight: 34 }]} accessibilityRole="header">{event.titulo}</Text>
      <View style={[styles.row, { gap: space.lg, flexWrap: "wrap" }]}>
        <Meta icon="calendar-outline" text={`${weekday} ${day} ${month} · ${time}`}/>
        <Meta icon="time-outline" text={formatDuration(event.duracaoMinutos)}/>
        <Meta icon="location-outline" text={`${event.cidade}, ${event.uf}${event.distanciaKm ? ` · ${event.distanciaKm} km` : ""}`}/>
      </View>
    </View>
  </View>;
}

export function EventFacts({ event }: { event: EventItem }) {
  const linhas: [IconName, string, string][] = [
    ["pricetag-outline", "Tipo", event.tipoEvento],
    ["musical-notes-outline", "Estilo", event.estilosMusicais.join(", ")],
    ["people-outline", "Formação", event.formacao],
    ["volume-high-outline", "Som", event.somDisponivel ? "Disponível no local" : "Leve seu equipamento"],
  ];
  return <View style={[styles.card, { paddingVertical: space.xs, gap: 0 }]}>{linhas.map(([icone, rotulo, valor], index) => <View key={rotulo} style={[styles.between, { gap: space.md, paddingVertical: space.md, borderTopWidth: index ? 1 : 0, borderTopColor: colors.hairline }]}>
    <View style={[styles.row, { gap: space.sm }]}><Icon name={icone} size={16} color={colors.ink3}/><Text style={type.bodySmall}>{rotulo}</Text></View>
    <Text style={[type.titleSmall, { flexShrink: 1, textAlign: "right" }]}>{valor}</Text>
  </View>)}</View>;
}

export function EventPosterRow({ event, status, lado, onPress }: { event: EventItem; status: ReactNode; lado?: ReactNode; onPress: () => void }) {
  const { day, month, time } = eventDateParts(event.inicio, event.uf);
  const { escala, aoPressionar, aoSoltar } = usePressao();
  return <Animated.View style={{ transform: [{ scale: escala }] }}>
    <Pressable accessibilityRole="button" accessibilityLabel={`${event.titulo}, ${day} de ${month}, ${event.cidade}`} onPress={onPress} onPressIn={aoPressionar} onPressOut={aoSoltar} style={({ pressed }) => [styles.card, styles.row, { alignItems: "center", gap: space.md, borderColor: pressed ? "rgba(139,107,255,0.4)" : colors.hairline }]}>
      <DateTile iso={event.inicio} uf={event.uf}/>
      <View style={{ flex: 1, gap: 6 }}>
        <Text style={type.titleSmall} numberOfLines={2}>{event.titulo}</Text>
        <View style={[styles.row, { gap: space.md, flexWrap: "wrap" }]}>
          <Meta icon="time-outline" text={time}/>
          <Meta icon="location-outline" text={event.cidade}/>
        </View>
        {status}
      </View>
      {lado ?? <Icon name="chevron-forward" size={18} color={colors.ink3}/>}
    </Pressable>
  </Animated.View>;
}

export function ActiveEventCard({ event, onPress }: { event: EventItem & { encerrado: boolean }; onPress: () => void }) {
  const total = event.totalCandidatos ?? 0;
  return <EventPosterRow
    event={event}
    onPress={onPress}
    status={<EventStatusPill status={event.status} encerrado={event.encerrado} inscricoesEncerradas={event.inscricoesEncerradas}/>}
    lado={<View style={{ alignItems: "center", minWidth: 52, paddingVertical: space.sm, borderRadius: radius.md, backgroundColor: total ? colors.accentSoft : colors.surface2 }}>
      <Text style={[type.price, { fontSize: 22, lineHeight: 26, color: total ? colors.accentText : colors.ink2 }]}>{total}</Text>
      <Text style={[type.labelSmall, { fontSize: 9, letterSpacing: 0.4 }]}>{total === 1 ? "inscrito" : "inscritos"}</Text>
    </View>}
  />;
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
