import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { fetchMyEvents, type EventItem } from "../../shared/client/events.ts";
import { eventDateParts } from "../../shared/client/format.ts";
import { useAsync } from "../../shared/client/useAsync.ts";
import { isPro } from "../../shared/dominio.ts";
import { EventRow, EventStatusPill, withEncerrado } from "../components/events";
import { Button, EmptyState, ErrorState, Icon, Loading, Screen, Section } from "../components/ui";
import { colors, radius, space, styles, type } from "../lib/theme";
import { useMe } from "../lib/useMe";
import { useRefreshOnFocus } from "../lib/useRefreshOnFocus";

const DIAS = ["D", "S", "T", "Q", "Q", "S", "S"];
const mesAno = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" });

const corDoDia = (eventos: EventItem[]) => {
  if (eventos.some((e) => e.status === "CONTRATADO" || e.status === "CONCLUIDO")) return colors.success;
  if (eventos.some((e) => e.status === "ABERTO")) return colors.accentText;
  return colors.ink3;
};

export default function AgendaScreen() {
  const me = useMe();
  const router = useRouter();
  const [mes, setMes] = useState(() => {
    const hoje = new Date();
    return new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  });
  const [diaSelecionado, setDiaSelecionado] = useState<number | null>(null);
  const eventos = useAsync(`agenda:${me.id}`, async () => (await fetchMyEvents(me.id)).map((e) => withEncerrado(e)));
  useRefreshOnFocus(eventos.reload);

  if (!isPro(me.casaAte)) return <Screen>
    <EmptyState title="A agenda do mês faz parte do Muve Casa" action={<Button title="Conhecer o Muve Casa" block={false} onPress={() => router.push("/casa")}/>}>
      <Text style={[type.bodySmall, { textAlign: "center" }]}>Veja num calendário o que já está contratado e o que ainda está aberto.</Text>
    </EmptyState>
  </Screen>;
  if (eventos.error) return <Screen><ErrorState message={eventos.error} onRetry={eventos.reload}/></Screen>;
  if (!eventos.data) return <Screen><Loading cards={2}/></Screen>;

  const doMes = eventos.data.filter((e) => {
    const { data } = eventDateParts(e.inicio, e.uf);
    const [, m, a] = data.split("/").map(Number);
    return m === mes.getMonth() + 1 && a === mes.getFullYear();
  });
  const porDia = new Map<number, typeof doMes>();
  for (const e of doMes) {
    const dia = Number(eventDateParts(e.inicio, e.uf).day);
    porDia.set(dia, [...(porDia.get(dia) ?? []), e]);
  }
  const diasNoMes = new Date(mes.getFullYear(), mes.getMonth() + 1, 0).getDate();
  const vazios = mes.getDay();
  const celulas = [...Array(vazios).fill(null), ...Array.from({ length: diasNoMes }, (_, i) => i + 1)];
  const lista = diaSelecionado ? porDia.get(diaSelecionado) ?? [] : doMes;
  const mudarMes = (delta: number) => {
    setMes(new Date(mes.getFullYear(), mes.getMonth() + delta, 1));
    setDiaSelecionado(null);
  };

  return <Screen>
    <View style={styles.between}>
      <Pressable accessibilityRole="button" accessibilityLabel="Mês anterior" onPress={() => mudarMes(-1)} hitSlop={8} style={{ padding: 8 }}><Icon name="chevron-back"/></Pressable>
      <Text style={type.title}>{mesAno.format(mes)}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Próximo mês" onPress={() => mudarMes(1)} hitSlop={8} style={{ padding: 8 }}><Icon name="chevron-forward"/></Pressable>
    </View>
    <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
      {DIAS.map((d, i) => <Text key={`${d}${i}`} style={[type.labelSmall, { width: `${100 / 7}%`, textAlign: "center", paddingVertical: 6 }]}>{d}</Text>)}
      {celulas.map((dia, i) => {
        const doDia = dia ? porDia.get(dia) ?? [] : [];
        const ativo = dia !== null && dia === diaSelecionado;
        return <Pressable key={i} disabled={!dia} accessibilityRole="button" accessibilityLabel={dia ? `Dia ${dia}, ${doDia.length} eventos` : undefined} onPress={() => setDiaSelecionado(ativo ? null : dia)} style={{ width: `${100 / 7}%`, aspectRatio: 1, padding: 2 }}>
          {dia ? <View style={{ flex: 1, borderRadius: radius.sm, alignItems: "center", justifyContent: "center", gap: 4, backgroundColor: ativo ? colors.accent : doDia.length ? colors.surface2 : "transparent" }}>
            <Text style={[type.body, { color: ativo ? colors.onAccent : colors.ink }]}>{dia}</Text>
            {doDia.length > 0 && <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: ativo ? colors.onAccent : corDoDia(doDia) }}/>}
          </View> : null}
        </Pressable>;
      })}
    </View>
    <View style={[styles.row, { gap: space.lg, flexWrap: "wrap" }]}>
      <Legenda cor={colors.success} texto="Músico contratado"/>
      <Legenda cor={colors.accentText} texto="Inscrições abertas"/>
    </View>
    <Section title={diaSelecionado ? `Dia ${diaSelecionado}` : "Eventos do mês"}>
      {lista.length === 0 && <Text style={type.bodySmall}>{diaSelecionado ? "Nenhum evento neste dia." : "Nenhum evento neste mês."}</Text>}
      {lista.map((e) => <EventRow key={e.id} event={e} onPress={() => router.push(`/event/${e.id}`)} trailing={<EventStatusPill status={e.status} encerrado={e.encerrado} inscricoesEncerradas={e.inscricoesEncerradas}/>}/>)}
    </Section>
  </Screen>;
}

function Legenda({ cor, texto }: { cor: string; texto: string }) {
  return <View style={[styles.row, { gap: 6 }]}><View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: cor }}/><Text style={type.bodySmall}>{texto}</Text></View>;
}
