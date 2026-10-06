import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { Image, Pressable, Text, View } from "react-native";
import type { EventItem, EventStatus } from "../../shared/client/events.ts";
import { formatCurrency } from "../../shared/client/format.ts";
import { colors, radius, space, styles, type } from "../lib/theme";
import { Icon, Pill, Tag } from "./ui";

const statusLabels: Record<EventStatus, string> = {
  ABERTO: "Inscrições abertas",
  CONTRATADO: "Músico contratado",
  CONCLUIDO: "Concluído",
  CANCELADO: "Cancelado",
};

/** Evento aberto cuja data já passou aparece como encerrado, embora o status no banco continue ABERTO. */
export function EventStatusPill({ status, encerrado }: { status: EventStatus; encerrado?: boolean }) {
  if (status === "ABERTO" && encerrado) return <Pill text="Encerrado" tone="muted"/>;
  if (status === "CANCELADO") return <Pill text={statusLabels[status]} tone="muted"/>;
  if (status === "ABERTO") return <Pill text={statusLabels[status]} tone="accent"/>;
  return <Pill text={statusLabels[status]} tone="success"/>;
}

const dateParts = (iso: string) => {
  const d = new Date(iso);
  return {
    day: String(d.getDate()).padStart(2, "0"),
    month: d.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "").toUpperCase(),
    time: d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
  };
};

/** Card do feed: foto grande e quase sem bordas, título em caixa alta, cachê em destaque. */
export function EventCard({ event }: { event: EventItem }) {
  const router = useRouter();
  const { day, month, time } = dateParts(event.inicio);
  return <Pressable accessibilityRole="button" accessibilityLabel={`${event.titulo}, ${formatCurrency(event.cache)}`} onPress={() => router.push(`/event/${event.id}`)} style={({ pressed }) => ({ gap: space.md, opacity: pressed ? 0.85 : 1 })}>
    <View style={{ height: 240, borderRadius: radius.md, overflow: "hidden", backgroundColor: colors.surface }}>
      <Image source={{ uri: event.imagemUrl }} style={{ width: "100%", height: "100%" }}/>
      <LinearGradient colors={["#0a0a0c66", "transparent", "#0a0a0ce6"]} locations={[0, 0.4, 1]} style={{ position: "absolute", inset: 0 }}/>
      <View style={{ position: "absolute", top: 12, left: 12, flexDirection: "row", gap: 6 }}><Tag text={event.estilosMusicais.length > 1 ? `${event.estilosMusicais[0]} +${event.estilosMusicais.length - 1}` : event.estilosMusicais[0]} onImage/>{event.distanciaKm ? <Tag text={`${event.distanciaKm} km`} onImage/> : <Tag text="Sua cidade" onImage/>}</View>
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
        <Icon name="arrow-forward" size={20} color={colors.accent}/>
      </View>
    </View>
    <View style={styles.divider}/>
  </Pressable>;
}

/** Linha de lista (eventos do contratante e inscrições do músico): data grande à esquerda, linha fina abaixo. */
/** "detail": informação extra na linha de horário e cidade (ex.: número de candidatos). */
export function EventRow({ event, trailing, detail, onPress }: { event: EventItem; trailing: React.ReactNode; detail?: string; onPress: () => void }) {
  const { day, month, time } = dateParts(event.inicio);
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
