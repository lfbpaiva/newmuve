import { useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { errorMessage } from "../../../shared/client/api.ts";
import { fetchConversation, fetchMessages, sendMessage, subscribeToMessages, type Message } from "../../../shared/client/conversation.ts";
import { formatCurrency } from "../../../shared/client/format.ts";
import { useAsync } from "../../../shared/client/useAsync.ts";
import { Alert, Avatar, ErrorState, Icon, Loading, Screen } from "../../components/ui";
import { colors, radius, space, styles, type } from "../../lib/theme";
import { useMe } from "../../lib/useMe";
import { useRefreshOnFocus } from "../../lib/useRefreshOnFocus";

const hora = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

export default function ConversationScreen() {
  const me = useMe();
  const { candidateId } = useLocalSearchParams<{ candidateId: string }>();
  const conversation = useAsync(`conversa:${candidateId}`, () => fetchConversation(candidateId));
  useRefreshOnFocus(conversation.reload);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadError, setLoadError] = useState("");
  const [texto, setTexto] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const scroll = useRef<ScrollView>(null);

  useEffect(() => {
    let active = true;
    const merge = (incoming: Message[]) => setMessages((current) => {
      const byId = new Map([...current, ...incoming].map((message) => [message.id, message]));
      return [...byId.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    });
    fetchMessages(candidateId).then((loaded) => active && merge(loaded), (error: unknown) => active && setLoadError(errorMessage(error)));
    const unsubscribe = subscribeToMessages(candidateId, (message) => active && merge([message]));
    return () => {
      active = false;
      unsubscribe();
    };
  }, [candidateId]);

  async function send() {
    const conteudo = texto.trim();
    if (!conteudo || sending) return;
    setSending(true);
    setSendError("");
    try {
      const message = await sendMessage(candidateId, conteudo);
      setMessages((current) => (current.some((m) => m.id === message.id) ? current : [...current, message]));
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

  return <SafeAreaView style={styles.screen} edges={["left", "right", "bottom"]}>
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={90}>
      <View style={{ padding: space.lg, gap: space.sm, borderBottomWidth: 1, borderBottomColor: colors.line }}>
        <View style={[styles.row, { gap: 12 }]}>
          <Avatar uri={other.fotoPerfilUrl} name={other.nome} size={40}/>
          <View style={{ flex: 1 }}>
            <Text style={type.titleSmall}>{other.nome}</Text>
            <Text style={type.bodySmall} numberOfLines={1}>{event.titulo}</Text>
          </View>
        </View>
        <Text style={type.bodySmall}>
          Cachê oferecido {formatCurrency(event.cache)}{valorProposto !== null ? ` · proposta do músico ${formatCurrency(valorProposto)}` : ""}
        </Text>
      </View>

      <ScrollView ref={scroll} contentContainerStyle={{ padding: space.lg, gap: space.sm, flexGrow: 1 }} onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: false })}>
        {loadError ? <Alert tone="error">{loadError}</Alert> : null}
        {messages.length === 0 && !loadError && <Text style={[type.bodySmall, { textAlign: "center", marginTop: space.xl }]}>
          Combinem aqui repertório, horário e valor. Pagamentos feitos fora da Muve ficam sem a garantia do cachê retido.
        </Text>}
        {messages.map((message) => <Bubble key={message.id} message={message} mine={message.authorId === me.id}/>)}
      </ScrollView>

      {open
        ? <View style={{ padding: space.md, gap: space.sm, borderTopWidth: 1, borderTopColor: colors.line }}>
          {sendError ? <Alert tone="error">{sendError}</Alert> : null}
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

function Bubble({ message, mine }: { message: Message; mine: boolean }) {
  return <View style={{ alignSelf: mine ? "flex-end" : "flex-start", maxWidth: "80%", backgroundColor: mine ? colors.accent : colors.surface2, borderRadius: radius.lg, paddingHorizontal: 14, paddingVertical: 10, gap: 2 }}>
    <Text style={[type.body, { color: mine ? colors.onAccent : colors.ink }]}>{message.texto}</Text>
    <Text style={[type.labelSmall, { color: mine ? "#e4dcff" : colors.ink3, letterSpacing: 0, textTransform: "none" }]}>{hora.format(new Date(message.createdAt))}</Text>
  </View>;
}
