import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { fetchFeed, fetchMyEvents, fetchOpenFines, filterFeed, filtrosAtivos, FILTROS_VAZIOS, type FeedFilters, type PeriodoFeed } from "../../../shared/client/events.ts";
import { formatCurrency } from "../../../shared/client/format.ts";
import { useAsync } from "../../../shared/client/useAsync.ts";
import { CASA_PRECO, camposFaltantes, descreverFaltantes, emAcessoAntecipado, isPro, PRO_PRECO, RAIOS_FEED_KM, RAIOS_FEED_PRO_KM, TIPOS_EVENTO } from "../../../shared/dominio.ts";
import { ActiveEventCard, OpportunityCard, withEncerrado } from "../../components/events";
import { Alert, Button, NumeroAnimado, Surface, Chips, EmptyState, ErrorState, Icon, Reveal, Screen, Section, Skeleton, TituloGrande, type IconName } from "../../components/ui";
import { TopBar } from "../../components/TopBar";
import { colors, radius, radius as cantos, space, styles, type } from "../../lib/theme";
import { useMe } from "../../lib/useMe";
import { useRefreshOnFocus } from "../../lib/useRefreshOnFocus";

function saudacao(agora = new Date()): string {
  const hora = agora.getHours();
  if (hora < 12) return "Bom dia";
  if (hora < 18) return "Boa tarde";
  return "Boa noite";
}

const primeiroNome = (nome: string) => nome.trim().split(/\s+/)[0] || nome;

export default function HomeScreen() {
  const me = useMe();
  return me.role === "MUSICIAN" ? <Feed/> : <Dashboard/>;
}

const PERIODOS: Record<PeriodoFeed, string> = { QUALQUER: "Qualquer data", SEMANA: "Próximos 7 dias", MES: "Próximos 30 dias" };
const CACHES_MINIMOS = ["0", "300", "500", "1000"];
const cacheLabel = (valor: string) => (valor === "0" ? "Qualquer cachê" : `${formatCurrency(Number(valor)).replace(",00", "")} ou mais`);

function FeedFiltersPanel({ filtros, onChange }: { filtros: FeedFilters; onChange: (filtros: FeedFilters) => void }) {
  const [aberto, setAberto] = useState(false);
  const ativos = filtrosAtivos({ ...filtros, busca: "" });
  return <View style={{ gap: space.md }}>
    <View style={[styles.row, { gap: space.sm }]}>
      <View style={[styles.row, { flex: 1, gap: space.sm, minHeight: 48, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.hairline }]}>
        <Icon name="search" size={18} color={colors.ink3}/>
        <TextInput value={filtros.busca} onChangeText={(busca) => onChange({ ...filtros, busca })} placeholder="Buscar evento, cidade ou estilo" placeholderTextColor={colors.ink3} selectionColor={colors.accentText} autoCapitalize="none" returnKeyType="search" accessibilityLabel="Buscar oportunidades" style={[type.body, { flex: 1, paddingVertical: 10 }]}/>
        {filtros.busca ? <Pressable accessibilityRole="button" accessibilityLabel="Limpar busca" onPress={() => onChange({ ...filtros, busca: "" })} hitSlop={8}><Icon name="close" size={16} color={colors.ink3}/></Pressable> : null}
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel={ativos > 0 ? `Filtros, ${ativos} ativos` : "Filtros"} accessibilityState={{ expanded: aberto }} onPress={() => setAberto(!aberto)} style={({ pressed }) => ({ width: 48, height: 48, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: aberto || ativos > 0 ? colors.accentSoft : pressed ? colors.surface2 : colors.surface, borderWidth: 1, borderColor: aberto || ativos > 0 ? "rgba(139,107,255,0.45)" : colors.hairline })}>
        <Icon name="options-outline" size={18} color={aberto || ativos > 0 ? colors.accentText : colors.ink2}/>
        {ativos > 0 && <View style={{ position: "absolute", top: -2, right: -2, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4, backgroundColor: colors.accent, borderWidth: 2, borderColor: colors.bg, alignItems: "center", justifyContent: "center" }}><Text style={[type.label, { fontSize: 10, lineHeight: 12, color: colors.onAccent }]}>{ativos}</Text></View>}
      </Pressable>
    </View>
    {aberto && <Reveal><View style={[styles.card, { gap: space.md }]}>
      <Text style={type.labelSmall}>Quando</Text>
      <Chips scroll options={Object.keys(PERIODOS)} selected={[filtros.periodo]} onToggle={(periodo) => onChange({ ...filtros, periodo: periodo as PeriodoFeed })} labels={(p) => PERIODOS[p as PeriodoFeed]}/>
      <Text style={type.labelSmall}>Tipo de evento</Text>
      <Chips scroll options={[...TIPOS_EVENTO]} selected={filtros.tipos} onToggle={(tipo) => onChange({ ...filtros, tipos: filtros.tipos.includes(tipo) ? filtros.tipos.filter((t) => t !== tipo) : [...filtros.tipos, tipo] })}/>
      <Text style={type.labelSmall}>Cachê mínimo</Text>
      <Chips scroll options={CACHES_MINIMOS} selected={[String(filtros.cacheMinimo)]} onToggle={(valor) => onChange({ ...filtros, cacheMinimo: Number(valor) })} labels={cacheLabel}/>
      {filtrosAtivos(filtros) > 0 && <Button title="Limpar filtros" variant="text" block={false} onPress={() => onChange(FILTROS_VAZIOS)}/>}
    </View></Reveal>}
  </View>;
}

function HomeLoading({ label }: { label: string }) {
  return <View style={{ gap: space.sm }} accessibilityRole="progressbar" accessibilityLabel={label}>
    {[0, 1].map((i) => <View key={i} style={[styles.card, styles.row, { gap: space.md }]}>
      <Skeleton width={54} height={72} style={{ borderRadius: radius.md }}/>
      <View style={{ flex: 1, gap: space.sm }}><Skeleton width="80%" height={18}/><Skeleton width="55%" height={14}/><Skeleton width={110} height={22} style={{ borderRadius: radius.pill }}/></View>
    </View>)}
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
    <Screen onRefresh={feed.reload} topo={<TopBar titulo="Oportunidades"/>}>
      <TituloGrande titulo={`${saudacao()}, ${primeiroNome(me.nome)}`} subtitulo={me.cidade ? `Shows perto de ${me.cidade}, ${me.uf}` : "Encontre seu próximo show"}/>
      {setupPending && <EmptyState title="Monte seu feed" action={<Button title="Montar meu feed" icon="arrow-forward" block={false} onPress={() => router.push({ pathname: "/account/edit", params: { acao: "feed" } })}/>}>
        <Text style={type.bodySmall}>Diga sua cidade e os estilos que você toca. É assim que escolhemos os eventos que aparecem aqui.</Text>
      </EmptyState>}
      {reduzida && <Alert tone="info">Por causa de uma desistência em cima da hora ou de uma ausência, novos eventos não aparecem para você até {new Date(me.visibilidadeReduzidaAte!).toLocaleDateString("pt-BR")}.</Alert>}
      {(multas.data ?? 0) > 0 && <Alert tone="info">Você tem {formatCurrency(multas.data!)} em multa por ausência, que será descontado do seu próximo cachê.</Alert>}
      {!setupPending && <Reveal><View style={{ gap: space.md }}>
        <FeedFiltersPanel filtros={filtros} onChange={setFiltros}/>
        <Chips scroll options={raios.map(String)} selected={[String(radius)]} onToggle={changeRadius} labels={radiusLabel}/>
      </View></Reveal>}
      {!setupPending && <View style={[styles.between, { alignItems: "flex-end" }]}>
        <Text style={type.headline} accessibilityRole="header">Shows para você</Text>
        {feed.data ? <Text style={type.bodySmall}>{visiveis.length === 1 ? "1 oportunidade" : `${visiveis.length} oportunidades`}</Text> : null}
      </View>}
      {!setupPending && (feed.data?.length ?? 0) > 0 && visiveis.length === 0 && <EmptyState title="Nenhum evento com esses filtros" action={<Button title="Limpar filtros" variant="tonal" block={false} onPress={() => setFiltros(FILTROS_VAZIOS)}/>}/>}
      {!setupPending && feed.error && <ErrorState message={feed.error} onRetry={feed.reload}/>}
      {!setupPending && !feed.error && !feed.data && <HomeLoading label="Buscando eventos..."/>}
      {!setupPending && feed.data?.length === 0 && <EmptyState title={radius === 0 ? "Nada na sua cidade por enquanto" : `Nada até ${radius} km por enquanto`} action={radius < 200 ? <Button title="Aumentar a distância" variant="tonal" block={false} onPress={() => changeRadius(String(RAIOS_FEED_KM[RAIOS_FEED_KM.indexOf(radius as 0) + 1] ?? 200))}/> : undefined}>
        <Text style={[type.bodySmall, { textAlign: "center" }]}>Os eventos são filtrados pelos seus estilos ({(me.estilosMusicais ?? []).join(", ")}). Novos shows compatíveis aparecem aqui assim que forem publicados.</Text>
      </EmptyState>}
      {visiveis.map((event, index) => <Reveal key={event.id} index={index} empilhar><OpportunityCard event={event} antecipado={pro && emAcessoAntecipado({ inicio: event.inicio, criadoEm: event.createdAt })}/></Reveal>)}
      {!setupPending && !pro && <Pressable accessibilityRole="button" onPress={() => router.push("/pro")} style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}>
        <Surface destaque>
          <View style={[styles.row, { gap: space.md }]}>
            <View style={{ width: 40, height: 40, borderRadius: cantos.md, backgroundColor: colors.accentSoft, alignItems: "center", justifyContent: "center" }}><Icon name="flash" size={20} color={colors.accentText}/></View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={type.titleSmall}>Muve Pro</Text>
              <Text style={type.bodySmall}>Veja eventos 24h antes e apareça primeiro para o contratante. {formatCurrency(PRO_PRECO)}/mês.</Text>
            </View>
            <Icon name="chevron-forward" size={18} color={colors.ink3}/>
          </View>
        </Surface>
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

  const indicadores: { valor: number; rotulo: string; icone: IconName }[] = [
    { valor: active.length, rotulo: active.length === 1 ? "Evento ativo" : "Eventos ativos", icone: "calendar-outline" },
    { valor: candidaturas, rotulo: candidaturas === 1 ? "Candidatura" : "Candidaturas", icone: "people-outline" },
    { valor: concluidos.length, rotulo: concluidos.length === 1 ? "Concluído" : "Concluídos", icone: "checkmark-circle-outline" },
  ];

  return <View style={styles.screen}>
    <Screen onRefresh={events.reload} topo={<TopBar titulo="Painel"/>}>
      <TituloGrande titulo={`${saudacao()}, ${primeiroNome(me.nome)}`} subtitulo="Acompanhe seus eventos e contratações"/>
      <Reveal><Surface destaque>
        <View style={[styles.row, { alignItems: "stretch" }]}>
          {indicadores.map(({ valor, rotulo, icone }, index) => <View key={rotulo} style={{ flex: 1, gap: space.sm, paddingLeft: index ? space.md : 0, borderLeftWidth: index ? 1 : 0, borderLeftColor: colors.hairline }}>
            <Icon name={icone} size={16} color={colors.accentText}/>
            {events.data ? <NumeroAnimado valor={valor} style={[type.stat, { fontSize: 34, lineHeight: 38 }]}/> : <Skeleton width={36} height={34}/>}
            <Text style={[type.bodySmall, { fontSize: 12, lineHeight: 16 }]}>{rotulo}</Text>
          </View>)}
        </View>
        {investido > 0 && <View style={[styles.between, { paddingTop: space.md, borderTopWidth: 1, borderTopColor: colors.hairline }]}>
          <Text style={type.bodySmall}>Pago a músicos até hoje</Text>
          <NumeroAnimado valor={investido} formatar={formatCurrency} style={[type.titleSmall, { color: colors.accentText }]}/>
        </View>}
        {emRepasse > 0 && <Text style={type.bodySmall}>{formatCurrency(emRepasse)} em repasse aos músicos.</Text>}
      </Surface></Reveal>
      <Reveal index={1}><Button title={faltando.length ? "Completar perfil para criar" : "Criar novo evento"} icon="add" onPress={create}/></Reveal>
      {faltando.length > 0 && <Alert tone="info">Antes de publicar seu primeiro evento, complete o perfil: {descreverFaltantes(faltando)}.</Alert>}
      {events.data && comCandidaturas.length > 0 && <Reveal index={2}><Pressable accessibilityRole="button" onPress={() => router.push(comCandidaturas.length === 1 ? `/event/${comCandidaturas[0].id}` : "/(app)/events")} style={({ pressed }) => [styles.card, styles.row, { gap: space.md, borderColor: "rgba(139,107,255,0.32)", backgroundColor: pressed ? colors.surface2 : colors.surface }]}>
        <View style={{ width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.accentSoft, alignItems: "center", justifyContent: "center" }}><Icon name="people-outline" size={20} color={colors.accentText}/></View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={type.titleSmall}>{comCandidaturas.length === 1 ? "Um evento recebeu candidaturas" : `${comCandidaturas.length} eventos receberam candidaturas`}</Text>
          <Text style={type.bodySmall}>Veja quem se inscreveu e escolha o músico.</Text>
        </View>
        <Icon name="chevron-forward" size={18} color={colors.ink3}/>
      </Pressable></Reveal>}
      <Section title="Em andamento" action={all.length > 0 ? <Button title="Ver todos" variant="text" block={false} onPress={() => router.push("/(app)/events")}/> : undefined}>
        {events.error && <ErrorState message={events.error} onRetry={events.reload}/>}
        {!events.error && !events.data && <HomeLoading label="Buscando seus eventos..."/>}
        {events.data && active.length === 0 && <EmptyState title={all.length ? "Nenhum evento em andamento" : "Publique seu primeiro evento"}>
          <Text style={[type.bodySmall, { textAlign: "center" }]}>Descreva o show, o cachê e o estilo. Músicos da região se candidatam e você escolhe quem aprovar.</Text>
        </EmptyState>}
        <View style={{ gap: space.sm }}>
          {active.map((event, index) => <Reveal key={event.id} index={index}><ActiveEventCard event={event} onPress={() => router.push(`/event/${event.id}`)}/></Reveal>)}
        </View>
      </Section>
      {isPro(me.casaAte)
        ? <View style={{ flexDirection: "row", gap: space.sm }}>
          <View style={{ flex: 1 }}><Button title="Agenda" variant="tonal" icon="calendar-outline" onPress={() => router.push("/agenda")}/></View>
          <View style={{ flex: 1 }}><Button title="Favoritos" variant="tonal" icon="heart-outline" onPress={() => router.push("/favoritos")}/></View>
        </View>
        : events.data && all.length > 0 && <Pressable accessibilityRole="button" onPress={() => router.push("/casa")} style={({ pressed }) => [styles.card, styles.row, { gap: space.md, backgroundColor: pressed ? colors.surface2 : colors.surface }]}>
          <View style={{ width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.hairline, alignItems: "center", justifyContent: "center" }}><Icon name="business-outline" size={20} color={colors.ink2}/></View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={type.titleSmall}>Muve Casa</Text>
            <Text style={type.bodySmall}>Taxa de 6%, eventos recorrentes, favoritos e agenda por {formatCurrency(CASA_PRECO)}/mês.</Text>
          </View>
          <Icon name="chevron-forward" size={18} color={colors.ink3}/>
        </Pressable>}
    </Screen>
  </View>;
}
