import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Linking, Pressable, Text, View } from "react-native";
import { errorMessage } from "../../../../shared/client/api.ts";
import { cancelHiring, confirmCompletion, fetchHiring, reportNoShow, reviewEvent, type CancellationResult } from "../../../../shared/client/events.ts";
import { formatCurrency, formatDateTime, formatDuration } from "../../../../shared/client/format.ts";
import { useAsync } from "../../../../shared/client/useAsync.ts";
import { maskPhone } from "../../../../shared/client/validators.ts";
import { EventStatusPill } from "../../../components/events";
import { Alert, Avatar, Button, ErrorState, Field, Icon, Loading, Screen, Section, Snackbar } from "../../../components/ui";
import { confirmAction } from "../../../lib/confirm";
import { colors, space, styles, type } from "../../../lib/theme";

const payoutLabels: Record<string, string> = {
  RETIDO: "Retido na plataforma até a conclusão do show",
  PROCESSANDO: "Repasse ao músico em processamento",
  REPASSADO: "Repassado ao músico",
  FALHOU: "Repasse falhou; verifique a chave Pix. Será tentado novamente.",
};
const paymentLabels: Record<string, string> = { PAGO: "Pago", ESTORNADO: "Estornado ao contratante", PENDENTE: "Aguardando pagamento", EXPIRADO: "Cobrança expirada", CANCELADO: "Cobrança cancelada" };

const finishedMessages: Record<Exclude<CancellationResult["situacao"], "ESTORNO_PROCESSANDO">, string> = {
  ESTORNADO: "O Asaas confirmou o estorno ao contratante. A contratação foi encerrada.",
  SEM_ESTORNO: "A contratação foi cancelada sem estorno, conforme a regra de prazo. O cachê será repassado ao músico.",
  COBRANCA_CANCELADA: "A cobrança pendente foi cancelada. Nenhum valor havia sido recebido, portanto não há reembolso.",
};

export default function HiringScreen() {
  const { id: eventId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const hiring = useAsync(`hiring:${eventId}`, () => fetchHiring(eventId));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [finished, setFinished] = useState("");
  const [snack, setSnack] = useState("");
  const hideSnack = useCallback(() => setSnack(""), []);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");

  async function run(action: () => Promise<unknown>, done?: string) {
    setBusy(true);
    setError("");
    try {
      await action();
      if (done) setSnack(done);
      hiring.reload();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function runCancellation(action: () => Promise<CancellationResult>) {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const { situacao } = await action();
      if (situacao === "ESTORNO_PROCESSANDO") {
        setNotice("Estorno solicitado ao Asaas. A contratação continua ativa até a confirmação da devolução.");
        hiring.reload();
      } else {
        setFinished(finishedMessages[situacao]);
      }
    } catch (e) {
      setError(errorMessage(e));
      hiring.reload();
    } finally {
      setBusy(false);
    }
  }

  if (finished) return <Screen>
    <Alert tone="success">{finished}</Alert>
    <Button title="Voltar" variant="outlined" onPress={() => router.back()}/>
  </Screen>;
  if (hiring.error) return <Screen><ErrorState message={hiring.error} onRetry={hiring.reload}/></Screen>;
  if (!hiring.data) return <Screen><Loading cards={1}/></Screen>;
  const { papel, evento, contratante, musico, pagamento, avaliou, cancelamento, naoComparecimento } = hiring.data;
  const isContractor = papel === "contratante";
  const other = isContractor ? musico : contratante;
  const started = new Date(evento.inicio) <= new Date();
  const concluded = evento.status === "CONCLUIDO";
  const active = evento.status === "CONTRATADO";
  const refundUnresolved = pagamento?.refundStatus === "PROCESSANDO";
  const parties = [
    { mine: isContractor, done: evento.confirmacaoContratante, title: "Contratante" },
    { mine: !isContractor, done: evento.confirmacaoMusico, title: "Músico" },
  ];

  function cancel() {
    const message = isContractor
      ? cancelamento.reembolso
        ? "O estorno integral será solicitado ao Asaas. A contratação termina quando a devolução for confirmada."
        : "Faltam menos de 24h: não há devolução e o cachê será repassado ao músico."
      : "O estorno integral ao contratante será solicitado. Depois da confirmação da devolução, o evento volta a receber candidatos.";
    confirmAction({ title: isContractor ? "Cancelar contratação" : "Desistir do show", message, onConfirm: () => void runCancellation(() => cancelHiring(evento.id)) });
  }

  function noShow() {
    confirmAction({ title: "Não comparecimento", message: "Registrar que o músico não compareceu e solicitar o estorno integral? A devolução será confirmada pelo Asaas.", onConfirm: () => void runCancellation(() => reportNoShow(evento.id)) });
  }

  return <View style={styles.screen}>
    <Screen>
      <View style={{ gap: space.sm }}>
        <EventStatusPill status={evento.status}/>
        <Text style={type.headline}>{evento.titulo}</Text>
        <Text style={type.bodySmall}>{formatDateTime(evento.inicio)} · {formatDuration(evento.duracaoMinutos)} · {evento.tipoEvento} · {evento.estilosMusicais.join(", ")} · {evento.formacao} · {evento.somDisponivel ? "som no local" : "sem som no local"}</Text>
      </View>

      <View style={[styles.cardRaised, { gap: space.md }]}>
        <View style={[styles.row, { alignItems: "flex-start", gap: 12 }]}>
          <Icon name="location-outline" size={20} color={colors.accentText}/>
          <View style={{ flex: 1 }}><Text style={type.titleSmall}>{evento.endereco ?? "Endereço não informado"}</Text><Text style={type.bodySmall}>{evento.cidade}, {evento.uf}</Text></View>
        </View>
        {other && <>
          <View style={styles.divider}/>
          <View style={[styles.row, { gap: 12 }]}>
            <Avatar uri={other.fotoPerfilUrl} name={other.nome}/>
            <View style={{ flex: 1 }}><Text style={type.bodySmall}>{isContractor ? "Músico contratado" : "Contratante"}</Text><Text style={type.titleSmall}>{other.nome}</Text></View>
            <Pressable accessibilityRole="button" accessibilityLabel={`Conversar com ${other.nome} no WhatsApp`} onPress={() => Linking.openURL(`https://wa.me/55${other.telefone}`)} style={({ pressed }) => [styles.row, { minHeight: 44, paddingHorizontal: 14, borderRadius: 999, backgroundColor: pressed ? "#1f3d26" : colors.successBg, gap: 6 }]}>
              <Icon name="logo-whatsapp" size={18} color={colors.success}/><Text style={[type.label, { color: colors.success }]}>{maskPhone(other.telefone)}</Text>
            </Pressable>
          </View>
        </>}
      </View>

      <Section title="Valores">
        <View style={[styles.card, { gap: 6 }]}>
          {pagamento ? <>
            <View style={styles.between}><Text style={type.bodySmall}>Cachê do músico</Text><Text style={type.body}>{formatCurrency(pagamento.cache)}</Text></View>
            <View style={styles.between}><Text style={type.bodySmall}>Taxa de serviço</Text><Text style={type.body}>{formatCurrency(pagamento.comissao)}</Text></View>
            <View style={styles.between}><Text style={type.titleSmall}>Total pago</Text><Text style={type.price}>{formatCurrency(pagamento.total)}</Text></View>
            <View style={styles.divider}/>
            <Text style={type.bodySmall}>{paymentLabels[pagamento.status]}{pagamento.repasseStatus ? ` · ${payoutLabels[pagamento.repasseStatus]}` : ""}</Text>
          </> : <Text style={type.bodySmall}>Sem pagamento registrado.</Text>}
        </View>
        {pagamento?.refundStatus === "PROCESSANDO" && <Alert tone="info">Estorno em processamento no Asaas. A devolução ainda não foi confirmada.</Alert>}
        {pagamento?.refundStatus === "NEGADO" && <Alert tone="error">O estorno solicitado não foi concluído pelo Asaas. A contratação continua ativa e pode ser confirmada ou cancelada normalmente.</Alert>}
      </Section>

      {active && <Section title="Confirmação do show">
        <Text style={type.bodySmall}>Após o evento, cada parte confirma pelo próprio acesso. Com as duas confirmações, o cachê é repassado ao músico; com apenas uma, o repasse acontece automaticamente após 7 dias.</Text>
        {refundUnresolved && <Text style={type.bodySmall}>A confirmação fica suspensa até a resolução do estorno.</Text>}
        {parties.map((party) => <View key={party.title} style={[styles.card, styles.between]}>
          <View style={[styles.row, { gap: 10 }]}><Icon name={party.done ? "checkmark-circle" : "ellipse-outline"} size={22} color={party.done ? colors.success : colors.line}/><Text style={type.titleSmall}>{party.title}</Text></View>
          {party.done && <Text style={[type.bodySmall, { color: colors.success }]}>Confirmado</Text>}
          {!party.done && !party.mine && <Text style={type.bodySmall}>Aguardando</Text>}
          {!party.done && party.mine && (refundUnresolved
            ? <Text style={type.bodySmall}>Suspensa</Text>
            : started
              ? <Button title="Confirmar" block={false} loading={busy} onPress={() => run(() => confirmCompletion(evento.id))}/>
              : <Text style={type.bodySmall}>Após o início</Text>)}
        </View>)}
      </Section>}

      {concluded && !avaliou && <Section title="Como foi a experiência?">
        <View style={[styles.row, { gap: 4 }]} accessibilityRole="radiogroup">{[1, 2, 3, 4, 5].map((star) => <Pressable key={star} accessibilityRole="radio" accessibilityState={{ checked: star === rating }} accessibilityLabel={`${star} ${star === 1 ? "estrela" : "estrelas"}`} onPress={() => setRating(star)} hitSlop={4} style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}><Icon name={star <= rating ? "star" : "star-outline"} size={30} color={star <= rating ? colors.star : colors.line}/></Pressable>)}</View>
        <Field label="Comentário (opcional)" value={comment} onChangeText={setComment} multiline maxLength={1000}/>
        <Button title="Enviar avaliação" disabled={!rating} loading={busy} onPress={() => run(() => reviewEvent(evento.id, rating, comment), "Avaliação enviada. Obrigado!")}/>
      </Section>}
      {concluded && avaliou && <Alert tone="success">Avaliação enviada. Obrigado!</Alert>}

      {(naoComparecimento.permitido || cancelamento.permitido) && <Section title="Precisa desfazer?">
        {naoComparecimento.permitido && <View style={[styles.card, { gap: space.sm }]}>
          <Text style={type.bodySmall}>O músico não apareceu? Enquanto ele não confirmar o show, você pode registrar o não comparecimento e solicitar o estorno integral.</Text>
          <Button variant="danger" title="Registrar não comparecimento" block={false} loading={busy} onPress={noShow}/>
        </View>}
        {cancelamento.permitido && <View style={[styles.card, { gap: space.sm }]}>
          <Text style={type.bodySmall}>{isContractor
            ? (cancelamento.reembolso ? "Até 24h antes do evento, é possível solicitar o estorno integral. A contratação termina quando o Asaas confirmar a devolução." : "Faltam menos de 24h: ao cancelar, o cachê é repassado ao músico.")
            : "Ao desistir, o estorno ao contratante é solicitado. Depois da confirmação da devolução, o evento volta a receber candidatos."}</Text>
          <Button variant="danger" title={isContractor ? "Cancelar contratação" : "Desistir do show"} block={false} loading={busy} onPress={cancel}/>
        </View>}
      </Section>}
      {notice ? <Alert tone="info">{notice}</Alert> : null}
      {error ? <Alert tone="error">{error}</Alert> : null}
    </Screen>
    {snack ? <Snackbar message={snack} onHide={hideSnack}/> : null}
  </View>;
}
