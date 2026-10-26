import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { fetchFeed, fetchMyEvents, fetchOpenFines, filterFeed, filtrosAtivos, FILTROS_VAZIOS, type FeedFilters, type PeriodoFeed } from "../../../shared/client/events.ts";
import { formatCurrency } from "../../../shared/client/format.ts";
import { useAsync } from "../../../shared/client/useAsync.ts";
import { camposFaltantes, descreverFaltantes, RAIOS_FEED_KM, TIPOS_EVENTO } from "../../../shared/dominio.ts";
import { EventCard, EventRow, EventStatusPill, withEncerrado } from "../../components/events";
import { Alert, Avatar, Button, Chips, EmptyState, ErrorState, Fab, Field, Icon, Loading, Screen, Section } from "../../components/ui";
import { colors, space, styles, type } from "../../lib/theme";
import { useMe } from "../../lib/useMe";
import { useRefreshOnFocus } from "../../lib/useRefreshOnFocus";
import { useUnreadNotifications } from "../../lib/useUnreadNotifications";

export default function HomeScreen() {
  const me = useMe();
  return me.role === "MUSICIAN" ? <Feed/> : <Dashboard/>;
}

function TopBar({ title, subtitle }: { title: string; subtitle: string }) {
  const me = useMe();
  const router = useRouter();
  return <SafeAreaView edges={["top"]} style={{ backgroundColor: colors.surface }}>
    <View style={[styles.between, { paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: space.sm, alignItems: "flex-end" }]}>
      <View style={{ flex: 1, gap: 6 }}><Text style={[type.display, { fontSize: 26, lineHeight: 28 }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} accessibilityRole="header">{title}</Text><Text style={type.labelSmall} numberOfLines={1}>{subtitle}</Text></View>
      <View style={[styles.row, { gap: space.md }]}>
        <NotificationBell/>
        <Pressable accessibilityRole="button" accessibilityLabel="Abrir meu perfil" onPress={() => router.push("/(app)/profile")} hitSlop={6}><Avatar uri={me.fotoPerfilUrl} name={me.nome} size={44}/></Pressable>
      </View>
    </View>
  </SafeAreaView>;
}

function NotificationBell() {
  const me = useMe();
  const router = useRouter();
  const unread = useUnreadNotifications(me.id);
  return <Pressable accessibilityRole="button" accessibilityLabel={unread > 0 ? `Notificações, ${unread} não lidas` : "Notificações"} onPress={() => router.push("/notificacoes")} hitSlop={8} style={{ width: 40, height: 40, alignItems: "center", justifyContent: "center" }}>
    <Icon name={unread > 0 ? "notifications" : "notifications-outline"} size={24}/>
    {unread > 0 && <View style={{ position: "absolute", top: 2, right: 0, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" }}>
      <Text style={[type.labelSmall, { color: colors.onAccent, letterSpacing: 0 }]}>{unread > 9 ? "9+" : unread}</Text>
    </View>}
  </Pressable>;
}

const PERIODOS: Record<PeriodoFeed, string> = { QUALQUER: "Qualquer data", SEMANA: "Próximos 7 dias", MES: "Próximos 30 dias" };
const CACHES_MINIMOS = ["0", "300", "500", "1000"];
const cacheLabel = (valor: string) => (valor === "0" ? "Qualquer cachê" : `${formatCurrency(Number(valor)).replace(",00", "")} ou mais`);

function FeedFiltersPanel({ filtros, onChange }: { filtros: FeedFilters; onChange: (filtros: FeedFilters) => void }) {
  const [aberto, setAberto] = useState(false);
  const ativos = filtrosAtivos({ ...filtros, busca: "" });
  return <View style={{ gap: space.sm }}>
    <View style={[styles.row, { gap: space.sm }]}>
      <View style={{ flex: 1 }}>
        <Field label="Buscar" value={filtros.busca} onChangeText={(busca) => onChange({ ...filtros, busca })} placeholder="Nome do evento, cidade, estilo..." autoCapitalize="none" returnKeyType="search"/>
      </View>
      <Button title={ativos > 0 ? `Filtros (${ativos})` : "Filtros"} variant={aberto ? "tonal" : "outlined"} icon="options-outline" block={false} onPress={() => setAberto(!aberto)}/>
    </View>
    {aberto && <View style={{ gap: space.sm }}>
      <Chips scroll options={Object.keys(PERIODOS)} selected={[filtros.periodo]} onToggle={(periodo) => onChange({ ...filtros, periodo: periodo as PeriodoFeed })} labels={(p) => PERIODOS[p as PeriodoFeed]}/>
      <Chips scroll options={[...TIPOS_EVENTO]} selected={filtros.tipos} onToggle={(tipo) => onChange({ ...filtros, tipos: filtros.tipos.includes(tipo) ? filtros.tipos.filter((t) => t !== tipo) : [...filtros.tipos, tipo] })}/>
      <Chips scroll options={CACHES_MINIMOS} selected={[String(filtros.cacheMinimo)]} onToggle={(valor) => onChange({ ...filtros, cacheMinimo: Number(valor) })} labels={cacheLabel}/>
      {filtrosAtivos(filtros) > 0 && <Button title="Limpar filtros" variant="text" block={false} onPress={() => onChange(FILTROS_VAZIOS)}/>}
    </View>}
  </View>;
}

const RADIUS_KEY = "muve.feedRadiusKm";
const radiusLabel = (km: string) => (km === "0" ? "Minha cidade" : `${km} km`);

function Feed() {
  const me = useMe();
  const router = useRouter();
  const [radius, setRadius] = useState(50);
  const [filtros, setFiltros] = useState<FeedFilters>(FILTROS_VAZIOS);
  const reduzida = Boolean(me.visibilidadeReduzidaAte && new Date(me.visibilidadeReduzidaAte) > new Date());
  const multas = useAsync(`multas:${me.id}`, fetchOpenFines);
  const setupPending = camposFaltantes(me, "feed").length > 0;
  const feed = useAsync(`feed:${radius}:${setupPending}`, () => (setupPending ? Promise.resolve([]) : fetchFeed(radius)));
  useRefreshOnFocus(feed.reload);

  useEffect(() => {
    AsyncStorage.getItem(RADIUS_KEY).then((saved) => {
      const value = Number(saved);
      if ((RAIOS_FEED_KM as readonly number[]).includes(value)) setRadius(value);
    });
  }, []);

  const visiveis = filterFeed(feed.data ?? [], filtros);

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
      {reduzida && <Alert tone="info">Por causa de uma desistência em cima da hora ou de uma ausência, novos eventos não aparecem para você até {new Date(me.visibilidadeReduzidaAte!).toLocaleDateString("pt-BR")}.</Alert>}
      {(multas.data ?? 0) > 0 && <Alert tone="info">Você tem {formatCurrency(multas.data!)} em multa por ausência, que será descontado do seu próximo cachê.</Alert>}
      {!setupPending && <Chips scroll options={RAIOS_FEED_KM.map(String)} selected={[String(radius)]} onToggle={changeRadius} labels={radiusLabel}/>}
      {!setupPending && (feed.data?.length ?? 0) > 0 && <FeedFiltersPanel filtros={filtros} onChange={setFiltros}/>}
      {!setupPending && (feed.data?.length ?? 0) > 0 && visiveis.length === 0 && <EmptyState title="Nenhum evento com esses filtros" action={<Button title="Limpar filtros" variant="tonal" block={false} onPress={() => setFiltros(FILTROS_VAZIOS)}/>}/>}
      {!setupPending && feed.error && <ErrorState message={feed.error} onRetry={feed.reload}/>}
      {!setupPending && !feed.error && !feed.data && <Loading label="Buscando eventos..."/>}
      {!setupPending && feed.data?.length === 0 && <EmptyState title={radius === 0 ? "Nada na sua cidade por enquanto" : `Nada até ${radius} km por enquanto`} action={radius < 200 ? <Button title="Aumentar a distância" variant="tonal" block={false} onPress={() => changeRadius(String(RAIOS_FEED_KM[RAIOS_FEED_KM.indexOf(radius as 0) + 1] ?? 200))}/> : undefined}>
        <Text style={[type.bodySmall, { textAlign: "center" }]}>Os eventos são filtrados pelos seus estilos ({(me.estilosMusicais ?? []).join(", ")}). Novos shows compatíveis aparecem aqui assim que forem publicados.</Text>
      </EmptyState>}
      {visiveis.map((event) => <EventCard key={event.id} event={event}/>)}
    </Screen>
  </View>;
}

function Dashboard() {
  const me = useMe();
  const router = useRouter();
  const events = useAsync(`my-events:${me.id}`, async () => (await fetchMyEvents(me.id)).map((event) => withEncerrado(event)));
  useRefreshOnFocus(events.reload);
  const all = events.data ?? [];
  const active = all.filter((event) => (event.status === "ABERTO" && !event.encerrado) || event.status === "CONTRATADO");
  const candidaturas = active.filter((e) => e.status === "ABERTO").reduce((sum, e) => sum + (e.totalCandidatos ?? 0), 0);
  const concluidos = all.filter((e) => e.status === "CONCLUIDO");
  const investido = concluidos.reduce((sum, e) => sum + (e.cachePago ?? e.cache), 0);
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
        {events.data && active.length === 0 && <EmptyState title={all.length ? "Nenhum evento em andamento" : "Publique seu primeiro evento"} action={<Button title="Criar evento" icon="add" block={false} onPress={create}/>}>
          <Text style={[type.bodySmall, { textAlign: "center" }]}>Descreva o show, o cachê e o estilo. Músicos da região se candidatam e você escolhe quem aprovar.</Text>
        </EmptyState>}
        {active.map((event) => <EventRow key={event.id} event={event} onPress={() => router.push(`/event/${event.id}`)} detail={`${event.totalCandidatos ?? 0} ${event.totalCandidatos === 1 ? "candidato" : "candidatos"}`} trailing={<EventStatusPill status={event.status} encerrado={event.encerrado} inscricoesEncerradas={event.inscricoesEncerradas}/>}/>)}
      </Section>
    </Screen>
    {active.length > 0 && <Fab label="Novo evento" icon="add" onPress={create}/>}
  </View>;
}
