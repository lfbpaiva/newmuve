import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { fetchFeed, fetchMyEvents } from "../../../shared/client/events.ts";
import { formatCurrency } from "../../../shared/client/format.ts";
import { useAsync } from "../../../shared/client/useAsync.ts";
import { camposFaltantes, descreverFaltantes, RAIOS_FEED_KM } from "../../../shared/dominio.ts";
import { EventCard, EventRow, EventStatusPill } from "../../components/events";
import { Alert, Avatar, Button, Chips, EmptyState, ErrorState, Fab, Loading, Screen, Section } from "../../components/ui";
import { colors, space, styles, type } from "../../lib/theme";
import { useMe } from "../../lib/useMe";

export default function HomeScreen() {
  const me = useMe();
  return me.role === "MUSICIAN" ? <Feed/> : <Dashboard/>;
}

function TopBar({ title, subtitle }: { title: string; subtitle: string }) {
  const me = useMe();
  const router = useRouter();
  return <SafeAreaView edges={["top"]} style={{ backgroundColor: colors.surface }}>
    <View style={[styles.between, { paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: space.sm, alignItems: "flex-end" }]}>
      <View style={{ flex: 1, gap: 6 }}><Text style={[type.display, { fontSize: 30, lineHeight: 30 }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} accessibilityRole="header">{title}</Text><Text style={type.labelSmall} numberOfLines={1}>{subtitle}</Text></View>
      <Pressable accessibilityRole="button" accessibilityLabel="Abrir meu perfil" onPress={() => router.push("/(app)/profile")} hitSlop={6}><Avatar uri={me.fotoPerfilUrl} name={me.nome} size={44}/></Pressable>
    </View>
  </SafeAreaView>;
}

const RADIUS_KEY = "muve.feedRadiusKm";
const radiusLabel = (km: string) => (km === "0" ? "Minha cidade" : `${km} km`);

function Feed() {
  const me = useMe();
  const router = useRouter();
  const [radius, setRadius] = useState(50);
  const setupPending = camposFaltantes(me, "feed").length > 0;
  const feed = useAsync(`feed:${radius}:${setupPending}`, () => (setupPending ? Promise.resolve([]) : fetchFeed(radius)));

  useEffect(() => {
    AsyncStorage.getItem(RADIUS_KEY).then((saved) => {
      const value = Number(saved);
      if ((RAIOS_FEED_KM as readonly number[]).includes(value)) setRadius(value);
    });
  }, []);

  function changeRadius(value: string) {
    setRadius(Number(value));
    AsyncStorage.setItem(RADIUS_KEY, value).catch(() => {});
  }

  return <View style={styles.screen}>
    <TopBar title="Oportunidades" subtitle={me.cidade ? `${me.cidade}, ${me.uf} · ${(me.estilosMusicais ?? []).join(", ")}` : `Olá, ${me.nome}`}/>
    <Screen>
      {setupPending && <EmptyState title={"Monte\nseu feed"} action={<Button title="Montar meu feed" icon="arrow-forward" block={false} onPress={() => router.push({ pathname: "/account/edit", params: { acao: "feed" } })}/>}>
        <Text style={type.bodySmall}>Diga sua cidade e os estilos que você toca. É assim que escolhemos os eventos que aparecem aqui.</Text>
      </EmptyState>}
      {!setupPending && <Chips scroll options={RAIOS_FEED_KM.map(String)} selected={[String(radius)]} onToggle={changeRadius} labels={radiusLabel}/>}
      {!setupPending && feed.error && <ErrorState message={feed.error} onRetry={feed.reload}/>}
      {!setupPending && !feed.error && !feed.data && <Loading label="Buscando eventos..."/>}
      {!setupPending && feed.data?.length === 0 && <EmptyState icon="musical-notes-outline" title={radius === 0 ? "Nada na sua cidade por enquanto" : `Nada até ${radius} km por enquanto`} action={radius < 200 ? <Button title="Aumentar a distância" variant="tonal" block={false} onPress={() => changeRadius(String(RAIOS_FEED_KM[RAIOS_FEED_KM.indexOf(radius as 0) + 1] ?? 200))}/> : undefined}>
        <Text style={[type.bodySmall, { textAlign: "center" }]}>Os eventos são filtrados pelos seus estilos ({(me.estilosMusicais ?? []).join(", ")}). Novos shows compatíveis aparecem aqui assim que forem publicados.</Text>
      </EmptyState>}
      {feed.data?.map((event) => <EventCard key={event.id} event={event}/>)}
    </Screen>
  </View>;
}

function Dashboard() {
  const me = useMe();
  const router = useRouter();
  const events = useAsync(`my-events:${me.id}`, async () => {
    const now = Date.now();
    return (await fetchMyEvents(me.id)).map((event) => ({ ...event, encerrado: event.status === "ABERTO" && new Date(event.inicio).getTime() <= now }));
  });
  const all = events.data ?? [];
  const active = all.filter((event) => (event.status === "ABERTO" && !event.encerrado) || event.status === "CONTRATADO");
  const candidaturas = active.filter((e) => e.status === "ABERTO").reduce((sum, e) => sum + (e.totalCandidatos ?? 0), 0);
  const concluidos = all.filter((e) => e.status === "CONCLUIDO");
  const investido = concluidos.reduce((sum, e) => sum + e.cache, 0);
  const faltando = camposFaltantes(me, "criarEvento");
  const create = () => (faltando.length ? router.push({ pathname: "/account/edit", params: { acao: "criarEvento" } }) : router.push("/event/new"));

  return <View style={styles.screen}>
    <TopBar title="Seu painel" subtitle={me.nome}/>
    <Screen>
      {events.data && all.length > 0 && <View style={{ flexDirection: "row", borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.line, paddingVertical: space.md }}>
        {[[active.length, "ativos"], [candidaturas, "candidaturas"], [concluidos.length, "shows"]].map(([value, label], i) => <View key={String(label)} style={{ flex: 1, borderLeftWidth: i ? 1 : 0, borderLeftColor: colors.line, paddingLeft: i ? space.md : 0 }}>
          <Text style={type.stat}>{String(value).padStart(2, "0")}</Text><Text style={type.labelSmall}>{label}</Text>
        </View>)}
      </View>}
      {investido > 0 && <Text style={type.bodySmall}>{formatCurrency(investido)} em cachês pagos a músicos até hoje.</Text>}
      {faltando.length > 0 && <Alert tone="info">Antes de publicar seu primeiro evento, complete o perfil: {descreverFaltantes(faltando)}.</Alert>}
      <Section title="Em andamento" action={all.length > 0 ? <Button title="Ver todos" variant="text" block={false} onPress={() => router.push("/(app)/events")}/> : undefined}>
        {events.error && <ErrorState message={events.error} onRetry={events.reload}/>}
        {!events.error && !events.data && <Loading cards={1}/>}
        {events.data && active.length === 0 && <EmptyState icon="calendar-outline" title={all.length ? "Nenhum evento em andamento" : "Publique seu primeiro evento"} action={<Button title="Criar evento" icon="add" block={false} onPress={create}/>}>
          <Text style={[type.bodySmall, { textAlign: "center" }]}>Descreva o show, o cachê e o estilo. Músicos da região se candidatam e você escolhe quem aprovar.</Text>
        </EmptyState>}
        {active.map((event) => <EventRow key={event.id} event={event} onPress={() => router.push(`/event/${event.id}`)} detail={`${event.totalCandidatos ?? 0} ${event.totalCandidatos === 1 ? "candidato" : "candidatos"}`} trailing={<EventStatusPill status={event.status} encerrado={event.encerrado}/>}/>)}
      </Section>
    </Screen>
    {active.length > 0 && <Fab label="Novo evento" icon="add" onPress={create}/>}
  </View>;
}
