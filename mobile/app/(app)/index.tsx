import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { fetchFeed, fetchMyEvents, fetchOpenFines, filterFeed, filtrosAtivos, FILTROS_VAZIOS, type FeedFilters, type PeriodoFeed } from "../../../shared/client/events.ts";
import { formatCurrency } from "../../../shared/client/format.ts";
import { useAsync } from "../../../shared/client/useAsync.ts";
import { CASA_PRECO, camposFaltantes, ESTILOS_MUSICAIS, descreverFaltantes, emAcessoAntecipado, isPro, PRO_PRECO, RAIOS_FEED_KM, RAIOS_FEED_PRO_KM, TIPOS_EVENTO } from "../../../shared/dominio.ts";
import { ActiveEventCard, OpportunityCard, withEncerrado } from "../../components/events";
import { Alert, Avatar, Button, Chips, EmptyState, ErrorState, Field, Icon, Letreiro, Reveal, Screen, Section, Skeleton } from "../../components/ui";
import { colors, radius, space, styles, type } from "../../lib/theme";
import { useMe } from "../../lib/useMe";
import { useRefreshOnFocus } from "../../lib/useRefreshOnFocus";
import { useUnreadNotifications } from "../../lib/useUnreadNotifications";

export default function HomeScreen() {
  const me = useMe();
  return me.role === "MUSICIAN" ? <Feed/> : <Dashboard/>;
}

function TopBar({ title, subtitle, role }: { title: string; subtitle: string; role: string }) {
  const me = useMe();
  const router = useRouter();
  return <SafeAreaView edges={["top"]} style={{ backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.line }}>
    <View style={{ width: "100%", maxWidth: 480, alignSelf: "center", paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: space.lg, gap: space.md }}>
      <View style={styles.between}>
        <View style={styles.row}><View style={{ width: 3, height: 20, backgroundColor: colors.accent }}/><Text style={{ fontFamily: "Archivo_900Black", fontSize: 18, lineHeight: 22, letterSpacing: 1, color: colors.ink }}>MUVE</Text><Text style={[type.bodySmall, { color: colors.ink2 }]}>/ {role}</Text></View>
        <View style={[styles.row, { gap: space.sm }]}>
        <NotificationBell/>
        <Pressable accessibilityRole="button" accessibilityLabel="Abrir meu perfil" onPress={() => router.push("/(app)/profile")} style={{ width: 48, height: 48, alignItems: "center", justifyContent: "center" }}><Avatar uri={me.fotoPerfilUrl} name={me.nome} size={40}/></Pressable>
        </View>
      </View>
      <View style={{ gap: space.xs }}><Text style={[type.headline, { textTransform: "none", fontSize: 28, lineHeight: 32 }]} accessibilityRole="header">{title}</Text><Text style={[type.bodySmall, { fontSize: 14, lineHeight: 21, color: colors.ink2 }]} numberOfLines={2}>{subtitle}</Text></View>
    </View>
  </SafeAreaView>;
}

function NotificationBell() {
  const me = useMe();
  const router = useRouter();
  const unread = useUnreadNotifications(me.id);
  return <Pressable accessibilityRole="button" accessibilityLabel={unread > 0 ? `Notificações, ${unread} não lidas` : "Notificações"} onPress={() => router.push("/notificacoes")} style={{ width: 48, height: 48, alignItems: "center", justifyContent: "center" }}>
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
  return <View style={[styles.card, { borderWidth: 1, borderColor: colors.line, gap: space.md }]}>
    <View style={{ gap: space.xs }}><Text style={type.titleSmall}>Encontre seu show</Text><Text style={[type.bodySmall, { fontSize: 14, lineHeight: 21 }]}>Busque por nome, cidade ou estilo e ajuste o que importa para você.</Text></View>
    <Field label="Buscar oportunidades" value={filtros.busca} onChangeText={(busca) => onChange({ ...filtros, busca })} placeholder="Evento, cidade ou estilo" autoCapitalize="none" returnKeyType="search"/>
    <View style={{ alignItems: "flex-start" }}>
      <Button title={ativos > 0 ? `Filtros (${ativos})` : "Filtros"} variant={aberto ? "tonal" : "outlined"} icon="options-outline" block={false} onPress={() => setAberto(!aberto)}/>
    </View>
    {aberto && <View style={{ gap: space.md }}>
      <Text style={type.bodySmall}>Quando</Text>
      <Chips scroll options={Object.keys(PERIODOS)} selected={[filtros.periodo]} onToggle={(periodo) => onChange({ ...filtros, periodo: periodo as PeriodoFeed })} labels={(p) => PERIODOS[p as PeriodoFeed]}/>
      <Text style={type.bodySmall}>Tipo de evento</Text>
      <Chips scroll options={[...TIPOS_EVENTO]} selected={filtros.tipos} onToggle={(tipo) => onChange({ ...filtros, tipos: filtros.tipos.includes(tipo) ? filtros.tipos.filter((t) => t !== tipo) : [...filtros.tipos, tipo] })}/>
      <Text style={type.bodySmall}>Cachê mínimo</Text>
      <Chips scroll options={CACHES_MINIMOS} selected={[String(filtros.cacheMinimo)]} onToggle={(valor) => onChange({ ...filtros, cacheMinimo: Number(valor) })} labels={cacheLabel}/>
      {filtrosAtivos(filtros) > 0 && <Button title="Limpar filtros" variant="text" block={false} onPress={() => onChange(FILTROS_VAZIOS)}/>}
    </View>}
  </View>;
}

function HomeLoading({ label }: { label: string }) {
  return <View style={[styles.card, { borderWidth: 1, borderColor: colors.line, gap: space.md }]} accessibilityRole="progressbar" accessibilityLabel={label}>
    <View style={[styles.row, { gap: space.md }]}><Skeleton width={80} height={80}/><View style={{ flex: 1, gap: space.sm }}><Skeleton width="90%" height={20}/><Skeleton width="65%" height={16}/><Skeleton width="75%" height={16}/></View></View>
    <Skeleton width="45%" height={22}/>
  </View>;
}

const RADIUS_KEY = "muve.feedRadiusKm";
const RAIO_PADRAO_KM = 50;
const aguardarRaioSalvo = () => new Promise<never>(() => {});
const lerRaioSalvo = (salvo: string | null) => (salvo !== null && /^\d+$/.test(salvo) ? Number(salvo) : RAIO_PADRAO_KM);
const radiusLabel = (km: string) => (km === "0" ? "Minha cidade" : km === "400" ? "400 km · Pro" : `${km} km`);

function Feed() {
  const me = useMe();
  const router = useRouter();
  const [raioEscolhido, setRaioEscolhido] = useState<number | null>(null);
  const [filtros, setFiltros] = useState<FeedFilters>(FILTROS_VAZIOS);
  const reduzida = Boolean(me.visibilidadeReduzidaAte && new Date(me.visibilidadeReduzidaAte) > new Date());
  const pro = isPro(me.proAte);
  const raios: readonly number[] = pro ? RAIOS_FEED_PRO_KM : RAIOS_FEED_KM;
  const raioCarregado = raioEscolhido !== null;
  const radius = raioEscolhido !== null && raios.includes(raioEscolhido) ? raioEscolhido : RAIO_PADRAO_KM;
  const multas = useAsync(`multas:${me.id}`, fetchOpenFines);
  const setupPending = camposFaltantes(me, "feed").length > 0;
  const feed = useAsync(`feed:${raioCarregado ? radius : "pendente"}:${setupPending}`, () => (setupPending ? Promise.resolve([]) : raioCarregado ? fetchFeed(radius) : aguardarRaioSalvo()));
  useRefreshOnFocus(feed.reload);

  useEffect(() => {
    AsyncStorage.getItem(RADIUS_KEY).then(
      (saved) => setRaioEscolhido((atual) => atual ?? lerRaioSalvo(saved)),
      () => setRaioEscolhido((atual) => atual ?? RAIO_PADRAO_KM),
    );
  }, []);

  const visiveis = filterFeed(feed.data ?? [], filtros);

  function changeRadius(value: string) {
    setRaioEscolhido(Number(value));
    AsyncStorage.setItem(RADIUS_KEY, value).catch(() => {});
  }

  return <View style={styles.screen}>
    <TopBar title="Oportunidades" role="Músico" subtitle={me.cidade ? `${me.cidade}, ${me.uf} · ${(me.estilosMusicais ?? []).join(", ")}` : `Olá, ${me.nome}`}/>
    <Screen onRefresh={feed.reload}>
      {setupPending && <EmptyState title="Monte seu feed" action={<Button title="Montar meu feed" icon="arrow-forward" block={false} onPress={() => router.push({ pathname: "/account/edit", params: { acao: "feed" } })}/>}>
        <Text style={type.bodySmall}>Diga sua cidade e os estilos que você toca. É assim que escolhemos os eventos que aparecem aqui.</Text>
      </EmptyState>}
      {reduzida && <Alert tone="info">Por causa de uma desistência em cima da hora ou de uma ausência, novos eventos não aparecem para você até {new Date(me.visibilidadeReduzidaAte!).toLocaleDateString("pt-BR")}.</Alert>}
      {(multas.data ?? 0) > 0 && <Alert tone="info">Você tem {formatCurrency(multas.data!)} em multa por ausência, que será descontado do seu próximo cachê.</Alert>}
      {!setupPending && <View style={{ gap: space.md }}><FeedFiltersPanel filtros={filtros} onChange={setFiltros}/><View style={{ gap: space.sm }}><Text style={[type.bodySmall, { fontSize: 14, lineHeight: 21 }]}>Distância de busca</Text><Chips scroll options={raios.map(String)} selected={[String(radius)]} onToggle={changeRadius} labels={radiusLabel}/></View></View>}
      {!setupPending && <Letreiro itens={me.estilosMusicais?.length ? me.estilosMusicais : [...ESTILOS_MUSICAIS]}/>}
      {!setupPending && <Text style={type.headline} accessibilityRole="header">Shows para você</Text>}
      {!setupPending && (feed.data?.length ?? 0) > 0 && visiveis.length === 0 && <EmptyState title="Nenhum evento com esses filtros" action={<Button title="Limpar filtros" variant="tonal" block={false} onPress={() => setFiltros(FILTROS_VAZIOS)}/>}/>}
      {!setupPending && feed.error && <ErrorState message={feed.error} onRetry={feed.reload}/>}
      {!setupPending && !feed.error && !feed.data && <HomeLoading label="Buscando eventos..."/>}
      {!setupPending && feed.data?.length === 0 && <EmptyState title={radius === 0 ? "Nada na sua cidade por enquanto" : `Nada até ${radius} km por enquanto`} action={radius < 200 ? <Button title="Aumentar a distância" variant="tonal" block={false} onPress={() => changeRadius(String(RAIOS_FEED_KM[RAIOS_FEED_KM.indexOf(radius as 0) + 1] ?? 200))}/> : undefined}>
        <Text style={[type.bodySmall, { textAlign: "center" }]}>Os eventos são filtrados pelos seus estilos ({(me.estilosMusicais ?? []).join(", ")}). Novos shows compatíveis aparecem aqui assim que forem publicados.</Text>
      </EmptyState>}
      {visiveis.map((event, index) => <Reveal key={event.id} index={index} empilhar><OpportunityCard event={event} antecipado={pro && emAcessoAntecipado({ inicio: event.inicio, criadoEm: event.createdAt })}/></Reveal>)}
      {!setupPending && !pro && <Pressable accessibilityRole="button" onPress={() => router.push("/pro")} style={({ pressed }) => [styles.card, styles.row, { gap: space.md, borderWidth: 1, borderColor: colors.accent, opacity: pressed ? 0.8 : 1 }]}>
        <Icon name="flash-outline" size={20} color={colors.accentText}/>
        <Text style={[type.bodySmall, { flex: 1 }]}>Veja eventos novos 24h antes de todo mundo e apareça primeiro para o contratante. Muve Pro por {formatCurrency(PRO_PRECO)}/mês.</Text>
        <Icon name="chevron-forward" size={18} color={colors.ink3}/>
      </Pressable>}
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
  const comCandidaturas = active.filter((event) => event.status === "ABERTO" && (event.totalCandidatos ?? 0) > 0);
  const concluidos = all.filter((e) => e.status === "CONCLUIDO");
  const investido = concluidos.reduce((sum, e) => sum + e.cachePago, 0);
  const emRepasse = concluidos.reduce((sum, e) => sum + e.cacheEmRepasse, 0);
  const faltando = camposFaltantes(me, "criarEvento");
  const create = () => (faltando.length ? router.push({ pathname: "/account/edit", params: { acao: "criarEvento" } }) : router.push("/event/new"));

  return <View style={styles.screen}>
    <TopBar title="Seu painel" role="Contratante" subtitle={me.nome}/>
    <Screen onRefresh={events.reload}>
      <View style={[styles.card, { backgroundColor: colors.surface2, borderTopWidth: 2, borderTopColor: colors.accent, gap: space.md }]}>
        <View style={{ gap: space.xs }}><Text style={type.titleSmall}>{events.data && all.length > 0 ? "Seus eventos em um só lugar" : "Seu próximo evento começa aqui"}</Text><Text style={[type.bodySmall, { fontSize: 14, lineHeight: 21 }]}>{events.data && all.length > 0 ? "Acompanhe os eventos publicados e prepare o próximo show." : "Publique um show e acompanhe as candidaturas em um só lugar."}</Text></View>
        <Button title={faltando.length ? "Completar perfil para criar" : "Criar novo evento"} icon="add" onPress={create}/>
      </View>
      {faltando.length > 0 && <Alert tone="info">Antes de publicar seu primeiro evento, complete o perfil: {descreverFaltantes(faltando)}.</Alert>}
      {events.data && <View style={[styles.row, { alignItems: "stretch", gap: space.sm }]}>
        {[[active.length, "Ativos"], [candidaturas, "Candidaturas"], [concluidos.length, "Concluídos"]].map(([value, label]) => <View key={String(label)} style={[styles.card, { flex: 1, minWidth: 0, padding: space.md, gap: space.xs }]}>
          <Text style={[type.stat, { fontSize: 30, lineHeight: 34 }]}>{value}</Text><Text style={[type.bodySmall, { fontSize: 12, lineHeight: 17 }]}>{label}</Text>
        </View>)}
      </View>}
      {events.data && comCandidaturas.length > 0 && <View style={[styles.card, { borderWidth: 1, borderColor: colors.accent, gap: space.md }]}>
        <View style={[styles.row, { alignItems: "flex-start", gap: space.md }]}><Icon name="people-outline" size={22} color={colors.accentText}/><View style={{ flex: 1, gap: space.xs }}><Text style={type.titleSmall}>Eventos com candidaturas</Text><Text style={[type.bodySmall, { fontSize: 14, lineHeight: 21 }]}>{comCandidaturas.length === 1 ? "Um evento aberto recebeu candidaturas." : `${comCandidaturas.length} eventos abertos receberam candidaturas.`}</Text></View></View>
        <Button title={comCandidaturas.length === 1 ? "Ver evento" : "Ver eventos"} variant="outlined" icon="arrow-forward" onPress={() => router.push(comCandidaturas.length === 1 ? `/event/${comCandidaturas[0].id}` : "/(app)/events")}/>
      </View>}
      <Section title="Em andamento" action={all.length > 0 ? <Button title="Ver todos" variant="text" block={false} onPress={() => router.push("/(app)/events")}/> : undefined}>
        {events.error && <ErrorState message={events.error} onRetry={events.reload}/>}
        {!events.error && !events.data && <HomeLoading label="Buscando seus eventos..."/>}
        {events.data && active.length === 0 && <EmptyState title={all.length ? "Nenhum evento em andamento" : "Publique seu primeiro evento"}>
          <Text style={[type.bodySmall, { textAlign: "center" }]}>Descreva o show, o cachê e o estilo. Músicos da região se candidatam e você escolhe quem aprovar.</Text>
        </EmptyState>}
        {active.map((event, index) => <Reveal key={event.id} index={index}><ActiveEventCard event={event} onPress={() => router.push(`/event/${event.id}`)}/></Reveal>)}
      </Section>
      {isPro(me.casaAte)
        ? <View style={{ flexDirection: "row", gap: space.sm }}>
          <View style={{ flex: 1 }}><Button title="Agenda" variant="tonal" icon="calendar-outline" onPress={() => router.push("/agenda")}/></View>
          <View style={{ flex: 1 }}><Button title="Favoritos" variant="tonal" icon="heart-outline" onPress={() => router.push("/favoritos")}/></View>
        </View>
        : events.data && all.length > 0 && <Pressable accessibilityRole="button" onPress={() => router.push("/casa")} style={({ pressed }) => [styles.card, styles.row, { gap: space.md, borderWidth: 1, borderColor: colors.accent, opacity: pressed ? 0.8 : 1 }]}>
          <Icon name="business-outline" size={20} color={colors.accentText}/>
          <Text style={[type.bodySmall, { flex: 1 }]}>Contrata com frequência? No Muve Casa a taxa cai para 6%, com eventos recorrentes, favoritos e agenda. {formatCurrency(CASA_PRECO)}/mês.</Text>
          <Icon name="chevron-forward" size={18} color={colors.ink3}/>
        </Pressable>}
      {investido > 0 && <Text style={type.bodySmall}>{formatCurrency(investido)} em cachês pagos a músicos até hoje.</Text>}
      {emRepasse > 0 && <Text style={type.bodySmall}>{formatCurrency(emRepasse)} em repasse aos músicos.</Text>}
    </Screen>
  </View>;
}
