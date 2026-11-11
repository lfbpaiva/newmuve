import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View, type ScrollViewInstance } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { errorMessage } from "../../../shared/client/api.ts";
import { answerProposal, fetchConversation, fetchMessages, proposeValue, sendMessage, subscribeToMessages, type Message } from "../../../shared/client/conversation.ts";
import { formatCurrency, parseValor } from "../../../shared/client/format.ts";
import { isValidCache } from "../../../shared/dominio.ts";
import { useAsync } from "../../../shared/client/useAsync.ts";
import { Alert, Avatar, Button, ErrorState, Icon, Loading, Screen } from "../../components/ui";
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
  const scroll = useRef<ScrollViewInstance>(null);
  const recebidasDuranteBusca = useRef<Map<string, Message> | null>(null);

  const aplicarMensagens = useCallback((incoming: Message[]) => {
    const recebidas = recebidasDuranteBusca.current;
    if (recebidas) for (const message of incoming) recebidas.set(message.id, message);
    setMessages((current) => mergeMessages(current, incoming));
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
            setMessages((current) => mergeMessages(mergeMessages(current, loaded), [...recebidas.values()]));
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

  async function run(action: () => Promise<Message>) {
    setSending(true);
    setSendError("");
    try {
      const message = await action();
      aplicarMensagens([message]);
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
    if (await run(() => proposeValue(candidateId, valor))) {
      setProposing(false);
      setValorProposta("");
    }
  }

  async function answer(message: Message, aceitar: boolean) {
    if (await run(() => answerProposal(candidateId, message.id, aceitar))) {
      aplicarMensagens([{ ...message, statusProposta: aceitar ? "ACEITA" : "RECUSADA" }]);
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
  const { event, musician, contractor, status, valorProposto } = conversation.data;
  const other = me.id === musician.id ? contractor : musician;
  const open = status !== "RECUSADO" && (event.status === "ABERTO" || event.status === "CONTRATADO");
  const negotiable = status === "PENDENTE" && event.status === "ABERTO";

  return <SafeAreaView style={styles.screen} edges={["left", "right", "bottom"]}>
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={90}>
      <View style={{ padding: space.lg, gap: space.sm, borderBottomWidth: 1, borderBottomColor: colors.line }}>
        <View style={[styles.row, { gap: 12 }]}>
          <Avatar uri={other.fotoPerfilUrl} name={other.nome} size={40}/>
          <View style={{ flex: 1 }}>
            <Text style={type.titleSmall}>{other.nome}</Text>
            <Text style={type.bodySmall} numberOfLines={1}>{event.titulo}</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel={`Denunciar ${other.nome}`} onPress={() => { setLinkError(""); denunciar(other.nome, `conversa sobre "${event.titulo}"`, me.email, setLinkError); }} style={{ minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" }}>
            <Icon name="flag-outline" size={20} color={colors.ink2}/>
          </Pressable>
        </View>
        <Text style={type.bodySmall}>
          Cachê oferecido {formatCurrency(event.cache)} · valor da inscrição {formatCurrency(valorProposto ?? event.cache)}
        </Text>
      </View>

      <ScrollView ref={scroll} contentContainerStyle={{ padding: space.lg, gap: space.sm, flexGrow: 1 }} onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: false })}>
        {linkError ? <Alert tone="error">{linkError}</Alert> : null}
        {loadError ? <Alert tone="error">{loadError}</Alert> : null}
        {messages.length === 0 && !loadError && <Text style={[type.bodySmall, { textAlign: "center", marginTop: space.xl }]}>
          Combinem aqui repertório, horário e valor. Pagamentos feitos fora da Muve ficam sem a garantia do cachê retido.
        </Text>}
        {messages.map((message) => message.tipo === "PROPOSTA"
          ? <ProposalBubble key={message.id} message={message} mine={message.authorId === me.id} canAnswer={negotiable && !sending} onAnswer={(aceitar) => void answer(message, aceitar)}/>
          : <Bubble key={message.id} message={message} mine={message.authorId === me.id}/>)}
      </ScrollView>

      {open
        ? <View style={{ padding: space.md, gap: space.sm, borderTopWidth: 1, borderTopColor: colors.line }}>
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
                style={[styles.input, { flex: 1, borderBottomWidth: 0, backgroundColor: colors.surface, borderRadius: radius.md, paddingHorizontal: space.md }]}
              />
              <Button title="Propor" block={false} loading={sending} onPress={() => void sendProposal()}/>
              <Button title="Fechar" variant="text" block={false} onPress={() => setProposing(false)}/>
            </View>
            : <Button title="Propor um valor" variant="text" icon="cash-outline" block={false} onPress={() => setProposing(true)}/>)}
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
              style={[styles.input, { flex: 1, maxHeight: 120, borderBottomWidth: 0, backgroundColor: colors.surface, borderRadius: radius.md, paddingHorizontal: space.md }]}
            />
            <Pressable accessibilityRole="button" accessibilityLabel="Enviar mensagem" disabled={sending || !texto.trim()} onPress={send} style={({ pressed }) => ({ width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", backgroundColor: pressed ? colors.accentPressed : colors.accent, opacity: sending || !texto.trim() ? 0.5 : 1 })}>
              <Icon name="send" size={20} color={colors.onAccent}/>
            </Pressable>
          </View>
        </View>
        : <View style={{ padding: space.lg }}><Alert tone="info">Esta conversa está encerrada.</Alert></View>}
    </KeyboardAvoidingView>
  </SafeAreaView>;
}

const propostaRespondida = (message: Message) => message.statusProposta !== null && message.statusProposta !== "ABERTA";

const mergeMessages = (current: Message[], incoming: Message[]) => {
  const byId = new Map(current.map((message) => [message.id, message]));
  for (const message of incoming) {
    const known = byId.get(message.id);
    byId.set(message.id, known && propostaRespondida(known) && !propostaRespondida(message) ? known : message);
  }
  return [...byId.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
};

const statusLabels = { ACEITA: "Aceita", RECUSADA: "Recusada", SUBSTITUIDA: "Substituída por outra proposta", ABERTA: "Aguardando resposta" } as const;

function ProposalBubble({ message, mine, canAnswer, onAnswer }: { message: Message; mine: boolean; canAnswer: boolean; onAnswer: (aceitar: boolean) => void }) {
  const status = message.statusProposta ?? "ABERTA";
  return <View style={{ alignSelf: mine ? "flex-end" : "flex-start", width: "80%", borderRadius: radius.lg, borderWidth: 1, borderColor: status === "ACEITA" ? colors.success : colors.accentText, backgroundColor: colors.surface, padding: space.md, gap: space.sm }}>
    <Text style={type.labelSmall}>{mine ? "Sua proposta" : "Proposta recebida"}</Text>
    <Text style={type.price}>{formatCurrency(message.valor ?? 0)}</Text>
    <Text style={[type.bodySmall, status === "ACEITA" ? { color: colors.success } : null]}>{statusLabels[status]}</Text>
    {!mine && status === "ABERTA" && canAnswer && <View style={{ flexDirection: "row", gap: space.sm }}>
      <View style={{ flex: 1 }}><Button title="Aceitar" icon="checkmark" onPress={() => onAnswer(true)}/></View>
      <View style={{ flex: 1 }}><Button title="Recusar" variant="outlined" onPress={() => onAnswer(false)}/></View>
    </View>}
  </View>;
}

function Bubble({ message, mine }: { message: Message; mine: boolean }) {
  return <View style={{ alignSelf: mine ? "flex-end" : "flex-start", maxWidth: "80%", backgroundColor: mine ? colors.accent : colors.surface2, borderRadius: radius.lg, paddingHorizontal: 14, paddingVertical: 10, gap: 2 }}>
    <Text style={[type.body, { color: mine ? colors.onAccent : colors.ink }]}>{message.texto}</Text>
    <Text style={[type.labelSmall, { color: mine ? "#e4dcff" : colors.ink3, letterSpacing: 0, textTransform: "none" }]}>{hora.format(new Date(message.createdAt))}</Text>
  </View>;
}
