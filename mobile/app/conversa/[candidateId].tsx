import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Pressable, ScrollView, Text, TextInput, View, type ScrollViewInstance } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { errorMessage } from "../../../shared/client/api.ts";
import { aplicarNovaProposta, answerProposal, fetchConversation, fetchMessages, mesclarMensagens, mostraEstimativaParaContratante, proposeValue, sendMessage, situacaoDaConversa, subscribeToMessages, type Conversation, type Message } from "../../../shared/client/conversation.ts";
import { detalharTotalDoContratante, formatCurrency, formatTotalDaInscricao, formatTotalSeAceita, parseValor } from "../../../shared/client/format.ts";
import { estimarCobrancaDoContratante, isValidCache, valorDaInscricao, type EstimativaDoContratante } from "../../../shared/dominio.ts";
import { useAsync } from "../../../shared/client/useAsync.ts";
import { Alert, Avatar, Button, ErrorState, EvitaTeclado, Icon, Loading, Pill, Reveal, Screen, Tag } from "../../components/ui";
import { colors, radius, space, styles, type } from "../../lib/theme";
import { denunciar } from "../../lib/suporte";
import { useMe } from "../../lib/useMe";
import { useRefreshOnFocus } from "../../lib/useRefreshOnFocus";

const hora = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

export default function ConversationScreen() {
  const me = useMe();
  const { candidateId } = useLocalSearchParams<{ candidateId: string }>();
  const conversation = useAsync(`conversa:${candidateId}`, () => fetchConversation(candidateId));
  const reloadConversation = conversation.reload;
  const reloadMessages = useRef<() => void>(() => {});
  useRefreshOnFocus(useCallback(() => {
    reloadConversation();
    reloadMessages.current();
  }, [reloadConversation]));
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadError, setLoadError] = useState("");
  const [linkError, setLinkError] = useState("");
  const [texto, setTexto] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const [proposing, setProposing] = useState(false);
  const [valorProposta, setValorProposta] = useState("");
  const [valorAceito, setValorAceito] = useState<{ valor: number | null; base: Conversation } | null>(null);
  const scroll = useRef<ScrollViewInstance>(null);
  const recebidasDuranteBusca = useRef<Map<string, Message> | null>(null);

  const aplicarMensagens = useCallback((incoming: Message[]) => {
    const recebidas = recebidasDuranteBusca.current;
    if (recebidas) for (const message of incoming) recebidas.set(message.id, message);
    setMessages((current) => mesclarMensagens(current, incoming));
  }, []);

  useEffect(() => {
    let active = true;
    let buscando = false;
    let buscarDeNovo = false;
    const refresh = () => {
      if (buscando) {
        buscarDeNovo = true;
        return;
      }
      buscando = true;
      const recebidas = new Map<string, Message>();
      recebidasDuranteBusca.current = recebidas;
      fetchMessages(candidateId)
        .then(
          (loaded) => {
            if (!active) return;
            setMessages((current) => mesclarMensagens(mesclarMensagens(current, loaded), [...recebidas.values()]));
            setLoadError("");
          },
          (error: unknown) => {
            if (active) setLoadError(errorMessage(error));
          },
        )
        .finally(() => {
          if (recebidasDuranteBusca.current === recebidas) recebidasDuranteBusca.current = null;
          buscando = false;
          if (active && buscarDeNovo) {
            buscarDeNovo = false;
            refresh();
          }
        });
    };
    reloadMessages.current = refresh;
    refresh();
    const unsubscribe = subscribeToMessages(candidateId, {
      onMessage: (message) => {
        if (!active) return;
        aplicarMensagens([message]);
        if (message.statusProposta === "ACEITA") reloadConversation();
      },
      onSubscribed: () => {
        if (active) refresh();
      },
    });
    const appState = AppState.addEventListener("change", (state) => {
      if (state === "active") refresh();
    });
    return () => {
      active = false;
      reloadMessages.current = () => {};
      recebidasDuranteBusca.current = null;
      unsubscribe();
      appState.remove();
    };
  }, [candidateId, reloadConversation, aplicarMensagens]);

  async function run(action: () => Promise<Message>, aplicar: (message: Message) => void = (message) => aplicarMensagens([message])) {
    setSending(true);
    setSendError("");
    try {
      aplicar(await action());
      return true;
    } catch (error) {
      setSendError(errorMessage(error));
      return false;
    } finally {
      setSending(false);
    }
  }

  async function sendProposal() {
    const valor = parseValor(valorProposta);
    if (!isValidCache(valor)) return setSendError("O valor mínimo é de R$ 100,00.");
    const aplicarProposta = (message: Message) => {
      aplicarMensagens([message]);
      setMessages((current) => aplicarNovaProposta(current, message));
    };
    if (await run(() => proposeValue(candidateId, valor), aplicarProposta)) {
      setProposing(false);
      setValorProposta("");
    }
  }

  async function answer(message: Message, aceitar: boolean) {
    if (await run(() => answerProposal(candidateId, message.id, aceitar))) {
      aplicarMensagens([{ ...message, statusProposta: aceitar ? "ACEITA" : "RECUSADA" }]);
      if (aceitar && message.valor !== null && conversation.data) setValorAceito({ valor: valorDaInscricao(message.valor, conversation.data.event.cache), base: conversation.data });
      conversation.reload();
    }
  }

  async function send() {
    const conteudo = texto.trim();
    if (!conteudo || sending) return;
    setSending(true);
    setSendError("");
    try {
      const message = await sendMessage(candidateId, conteudo);
      aplicarMensagens([message]);
      setTexto("");
    } catch (error) {
      setSendError(errorMessage(error));
    } finally {
      setSending(false);
    }
  }

  if (conversation.error) return <Screen><ErrorState message={conversation.error} onRetry={conversation.reload}/></Screen>;
  if (!conversation.data) return <Screen><Loading cards={1}/></Screen>;
  const { event, musician, contractor, status } = conversation.data;
  const valorProposto = valorAceito?.base === conversation.data ? valorAceito.valor : conversation.data.valorProposto;
  const other = me.id === musician.id ? contractor : musician;
  const situacao = situacaoDaConversa({ inscricao: status, evento: event.status, inicio: event.inicio });
  const open = situacao.aberta;
  const negotiable = situacao.negociavel;
  const souContratante = me.id === contractor.id;
  const estimativaDaInscricao = mostraEstimativaParaContratante({ souContratante, inscricao: status, evento: event.status, eventoEncerrado: situacao.encerrado }) ? estimarCobrancaDoContratante(valorProposto ?? event.cache, me.casaAte) : null;
  const estimativaDaProposta = (message: Message) =>
    mostraEstimativaParaContratante({ souContratante, inscricao: status, evento: event.status, eventoEncerrado: situacao.encerrado, statusProposta: message.statusProposta ?? "ABERTA" }) ? estimarCobrancaDoContratante(message.valor, me.casaAte) : null;

  return <SafeAreaView style={styles.screen} edges={["left", "right", "bottom"]}>
    <EvitaTeclado>
      <View style={{ paddingHorizontal: space.lg, paddingVertical: space.md, gap: space.md, borderBottomWidth: 1, borderBottomColor: colors.hairline, backgroundColor: colors.surface }}>
        <View style={[styles.row, { gap: 12 }]}>
          <View style={{ borderRadius: radius.pill, padding: 2, borderWidth: 1, borderColor: colors.hairline }}><Avatar uri={other.fotoPerfilUrl} name={other.nome} size={40}/></View>
          <View style={{ flex: 1 }}>
            <Text style={type.titleSmall}>{other.nome}</Text>
            <Text style={type.bodySmall} numberOfLines={1}>{event.titulo}</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel={`Denunciar ${other.nome}`} onPress={() => { setLinkError(""); denunciar(other.nome, `conversa sobre "${event.titulo}"`, me.email, setLinkError); }} style={{ minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" }}>
            <Icon name="flag-outline" size={20} color={colors.ink2}/>
          </Pressable>
        </View>
        <View style={[styles.row, { gap: space.sm, flexWrap: "wrap" }]}>
          <Tag text={`Cachê oferecido ${formatCurrency(event.cache)}`}/>
          <View style={{ borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: colors.accentSoft }}><Text style={[type.label, { fontSize: 12, lineHeight: 16, color: colors.accentText }]}>Inscrição {formatCurrency(valorProposto ?? event.cache)}</Text></View>
        </View>
        {estimativaDaInscricao && <Text style={[type.bodySmall, { fontSize: 12, lineHeight: 16 }]}>{formatTotalDaInscricao(estimativaDaInscricao)}. {detalharTotalDoContratante(estimativaDaInscricao)}</Text>}
      </View>

      <ScrollView ref={scroll} contentContainerStyle={{ padding: space.lg, gap: space.sm, flexGrow: 1 }} onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: false })}>
        {linkError ? <Alert tone="error">{linkError}</Alert> : null}
        {loadError ? <Alert tone="error">{loadError}</Alert> : null}
        {messages.length === 0 && !loadError && <View style={{ alignItems: "center", gap: space.md, marginTop: space.xxl, paddingHorizontal: space.lg }}>
          <View style={{ width: 52, height: 52, borderRadius: radius.md, backgroundColor: colors.accentSoft, alignItems: "center", justifyContent: "center" }}><Icon name="chatbubbles-outline" size={24} color={colors.accentText}/></View>
          <Text style={[type.title, { textAlign: "center" }]}>Comece a conversa</Text>
          <Text style={[type.bodySmall, { textAlign: "center" }]}>Combinem aqui repertório, horário e valor. Pagamentos feitos fora da Muve ficam sem a garantia do cachê retido.</Text>
        </View>}
        {messages.map((message) => message.tipo === "PROPOSTA"
          ? <ProposalBubble key={message.id} message={message} mine={message.authorId === me.id} estimativa={estimativaDaProposta(message)} canAnswer={negotiable && !sending} onAnswer={(aceitar) => void answer(message, aceitar)}/>
          : <Bubble key={message.id} message={message} mine={message.authorId === me.id}/>)}
      </ScrollView>

      {open
        ? <View style={{ padding: space.md, gap: space.sm, borderTopWidth: 1, borderTopColor: colors.hairline, backgroundColor: colors.surface }}>
          {sendError ? <Alert tone="error">{sendError}</Alert> : null}
          {negotiable && (proposing
            ? <View style={[styles.row, { gap: space.sm }]}>
              <TextInput
                value={valorProposta}
                onChangeText={(value) => { setValorProposta(value.replace(/[^\d.,]/g, "")); setSendError(""); }}
                placeholder="Valor do cachê (R$)"
                placeholderTextColor={colors.ink3}
                keyboardType="decimal-pad"
                accessibilityLabel="Valor da proposta"
                style={[styles.input, { flex: 1, backgroundColor: colors.bg, borderRadius: radius.lg, paddingHorizontal: space.md }]}
              />
              <Button title="Propor" block={false} loading={sending} onPress={() => void sendProposal()}/>
              <Button title="Fechar" variant="text" block={false} onPress={() => setProposing(false)}/>
            </View>
            : <Pressable accessibilityRole="button" onPress={() => setProposing(true)} style={({ pressed }) => [styles.row, { alignSelf: "flex-start", gap: 6, paddingHorizontal: 12, minHeight: 34, borderRadius: radius.pill, backgroundColor: pressed ? colors.surface3 : colors.surface2, borderWidth: 1, borderColor: colors.hairline }]}>
              <Icon name="cash-outline" size={15} color={colors.accentText}/>
              <Text style={[type.label, { fontSize: 13, color: colors.ink }]}>Propor um valor</Text>
            </Pressable>)}
          <View style={[styles.row, { gap: space.sm, alignItems: "flex-end" }]}>
            <TextInput
              value={texto}
              onChangeText={(value) => { setTexto(value); setSendError(""); }}
              placeholder="Escreva uma mensagem"
              placeholderTextColor={colors.ink3}
              selectionColor={colors.accentText}
              multiline
              maxLength={1000}
              accessibilityLabel="Mensagem"
              style={[styles.input, { flex: 1, maxHeight: 120, backgroundColor: colors.bg, borderRadius: radius.lg, paddingHorizontal: space.md }]}
            />
            <Pressable accessibilityRole="button" accessibilityLabel="Enviar mensagem" disabled={sending || !texto.trim()} onPress={send} style={({ pressed }) => ({ width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", backgroundColor: pressed ? colors.accentPressed : colors.accent, opacity: sending || !texto.trim() ? 0.5 : 1 })}>
              <Icon name="send" size={20} color={colors.onAccent}/>
            </Pressable>
          </View>
        </View>
        : <View style={{ padding: space.lg }}><Alert tone="info">Esta conversa está encerrada.</Alert></View>}
    </EvitaTeclado>
  </SafeAreaView>;
}

const statusLabels = { ACEITA: "Aceita", RECUSADA: "Recusada", SUBSTITUIDA: "Substituída por outra proposta", ABERTA: "Aguardando resposta" } as const;

function ProposalBubble({ message, mine, estimativa, canAnswer, onAnswer }: { message: Message; mine: boolean; estimativa: EstimativaDoContratante | null; canAnswer: boolean; onAnswer: (aceitar: boolean) => void }) {
  const status = message.statusProposta ?? "ABERTA";
  const tom = status === "ACEITA" ? "success" : status === "ABERTA" ? "accent" : "muted";
  return <Reveal><View style={{ alignSelf: mine ? "flex-end" : "flex-start", width: "82%", borderRadius: radius.lg, borderWidth: 1, borderColor: status === "ACEITA" ? "rgba(110,231,160,0.4)" : status === "ABERTA" ? "rgba(139,107,255,0.45)" : colors.hairline, backgroundColor: colors.surface, padding: space.lg, gap: space.sm }}>
    <View style={[styles.row, { gap: space.sm }]}>
      <View style={{ width: 28, height: 28, borderRadius: radius.sm, backgroundColor: colors.accentSoft, alignItems: "center", justifyContent: "center" }}><Icon name="cash-outline" size={15} color={colors.accentText}/></View>
      <Text style={[type.label, { color: colors.ink2 }]}>{mine ? "Sua proposta" : "Proposta recebida"}</Text>
    </View>
    <Text style={[type.stat, { fontSize: 30, lineHeight: 34 }]}>{formatCurrency(message.valor ?? 0)}</Text>
    {estimativa && <View style={{ gap: 2 }}>
      <Text style={[type.titleSmall, { color: colors.accentText }]}>{formatTotalSeAceita(estimativa)}</Text>
      <Text style={[type.bodySmall, { fontSize: 12, lineHeight: 16 }]}>{detalharTotalDoContratante(estimativa)}</Text>
    </View>}
    <Pill text={statusLabels[status]} tone={tom}/>
    {!mine && status === "ABERTA" && canAnswer && <View style={{ flexDirection: "row", gap: space.sm, marginTop: space.xs }}>
      <View style={{ flex: 1 }}><Button title="Aceitar" icon="checkmark" onPress={() => onAnswer(true)}/></View>
      <View style={{ flex: 1 }}><Button title="Recusar" variant="tonal" onPress={() => onAnswer(false)}/></View>
    </View>}
  </View></Reveal>;
}

function Bubble({ message, mine }: { message: Message; mine: boolean }) {
  return <Reveal><View style={{ alignSelf: mine ? "flex-end" : "flex-start", maxWidth: "80%", backgroundColor: mine ? colors.accent : colors.surface2, borderWidth: mine ? 0 : 1, borderColor: colors.hairline, borderRadius: radius.lg, borderBottomRightRadius: mine ? radius.xs : radius.lg, borderBottomLeftRadius: mine ? radius.lg : radius.xs, paddingHorizontal: 14, paddingVertical: 10, gap: 2 }}>
    <Text style={[type.body, { color: mine ? colors.onAccent : colors.ink }]}>{message.texto}</Text>
    <Text style={[type.bodySmall, { fontSize: 11, lineHeight: 14, alignSelf: "flex-end", color: mine ? "rgba(255,255,255,0.7)" : colors.ink3 }]}>{hora.format(new Date(message.createdAt))}</Text>
  </View></Reveal>;
}
