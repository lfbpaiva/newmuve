import { useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import { Alert as NativeAlert, Linking, Pressable, Text, View } from "react-native";
import { errorMessage } from "../../../../shared/client/api.ts";
import { cancelHiring, confirmCompletion, fetchHiring, reportNoShow, reviewEvent } from "../../../../shared/client/events.ts";
import { formatCurrency, formatDateTime, formatDuration } from "../../../../shared/client/format.ts";
import { useAsync } from "../../../../shared/client/useAsync.ts";
import { maskPhone } from "../../../../shared/client/validators.ts";
import { EventStatusPill } from "../../../components/events";
import { Alert, Avatar, Button, ErrorState, Field, Icon, Loading, Screen, Section, Snackbar } from "../../../components/ui";
import { colors, space, styles, type } from "../../../lib/theme";

const payoutLabels: Record<string, string> = {
  RETIDO: "Retido na plataforma até a conclusão do show",
  PROCESSANDO: "Repasse ao músico em processamento",
  REPASSADO: "Repassado ao músico",
  FALHOU: "Repasse falhou; verifique a chave Pix. Será tentado novamente.",
};
const paymentLabels: Record<string, string> = { PAGO: "Pago", ESTORNADO: "Estornado ao contratante", PENDENTE: "Aguardando pagamento", EXPIRADO: "Cobrança expirada", CANCELADO: "Cobrança cancelada" };

const confirm = (title: string, message: string, action: () => void) =>
  NativeAlert.alert(title, message, [{ text: "Voltar", style: "cancel" }, { text: "Confirmar", style: "destructive", onPress: action }]);

// Comprovante da contratação: endereço, contato, valores, cancelamento, confirmação e avaliação.
export default function HiringScreen() {
  const { id: eventId } = useLocalSearchParams<{ id: string }>();
  const hiring = useAsync(`hiring:${eventId}`, () => fetchHiring(eventId));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [snack, setSnack] = useState("");
  const hideSnack = useCallback(() => setSnack(""), []);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");

  async function run(action: () => Promise<unknown>, done?: (result: unknown) => string) {
    setBusy(true);
    setError("");
    try {
      const result = await action();
      if (done) setSnack(done(result));
      hiring.reload();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (hiring.error) return <Screen><ErrorState message={hiring.error} onRetry={hiring.reload}/></Screen>;
  if (!hiring.data) return <Screen><Loading cards={1}/></Screen>;
  const { papel, evento, contratante, musico, pagamento, avaliou, cancelamento, naoComparecimento } = hiring.data;
  const isContractor = papel === "contratante";
  const other = isContractor ? musico : contratante;
  const started = new Date(evento.inicio) <= new Date();
  const concluded = evento.status === "CONCLUIDO";
  const active = evento.status === "CONTRATADO";
  const parties = [
    { mine: isContractor, done: evento.confirmacaoContratante, title: "Contratante" },
    { mine: !isContractor, done: evento.confirmacaoMusico, title: "Músico" },
  ];

  function cancel() {
    const message = isContractor
      ? cancelamento.reembolso ? "O valor pago será estornado integralmente." : "Faltam menos de 24h: não há devolução e o cachê será repassado ao músico."
      : "O contratante será reembolsado e o evento voltará a receber candidatos.";
    confirm(isContractor ? "Cancelar contratação" : "Desistir do show", message, () => void run(() => cancelHiring(evento.id), (r) => ((r as { reembolsado: boolean }).reembolsado ? "Contratação cancelada. O valor foi estornado ao contratante." : "Contratação cancelada. O cachê será repassado ao músico.")));
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
          <Icon name="location-outline" size={20} color={colors.accent}/>
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
      </Section>

      {active && <Section title="Confirmação do show">
        <Text style={type.bodySmall}>Após o evento, cada parte confirma pelo próprio acesso. Com as duas confirmações, o cachê é repassado ao músico; com apenas uma, o repasse acontece automaticamente após 7 dias.</Text>
        {parties.map((party) => <View key={party.title} style={[styles.card, styles.between]}>
          <View style={[styles.row, { gap: 10 }]}><Icon name={party.done ? "checkmark-circle" : "ellipse-outline"} size={22} color={party.done ? colors.success : colors.line}/><Text style={type.titleSmall}>{party.title}</Text></View>
          {party.done && <Text style={[type.bodySmall, { color: colors.success }]}>Confirmado</Text>}
          {!party.done && !party.mine && <Text style={type.bodySmall}>Aguardando</Text>}
          {!party.done && party.mine && (started ? <Button title="Confirmar" block={false} loading={busy} onPress={() => run(() => confirmCompletion(evento.id))}/> : <Text style={type.bodySmall}>Após o início</Text>)}
        </View>)}
      </Section>}

      {concluded && !avaliou && <Section title="Como foi a experiência?">
        <View style={[styles.row, { gap: 4 }]} accessibilityRole="radiogroup">{[1, 2, 3, 4, 5].map((star) => <Pressable key={star} accessibilityRole="radio" accessibilityState={{ checked: star === rating }} accessibilityLabel={`${star} estrelas`} onPress={() => setRating(star)} hitSlop={4} style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}><Icon name={star <= rating ? "star" : "star-outline"} size={30} color={star <= rating ? colors.star : colors.line}/></Pressable>)}</View>
        <Field label="Comentário (opcional)" value={comment} onChangeText={setComment} multiline maxLength={1000}/>
        <Button title="Enviar avaliação" disabled={!rating} loading={busy} onPress={() => run(() => reviewEvent(evento.id, rating, comment), () => "Avaliação enviada. Obrigado!")}/>
      </Section>}
      {concluded && avaliou && <Alert tone="success">Avaliação enviada. Obrigado!</Alert>}

      {(naoComparecimento.permitido || cancelamento.permitido) && <Section title="Precisa desfazer?">
        {naoComparecimento.permitido && <View style={[styles.card, { gap: space.sm }]}>
          <Text style={type.bodySmall}>O músico não apareceu? Enquanto ele não confirmar o show, você pode registrar o não comparecimento e receber o valor integral de volta.</Text>
          <Button variant="danger" title="Registrar não comparecimento" block={false} loading={busy} onPress={() => confirm("Não comparecimento", "O valor pago será estornado e a contratação, cancelada.", () => void run(() => reportNoShow(evento.id), () => "Não comparecimento registrado. O valor foi estornado."))}/>
        </View>}
        {cancelamento.permitido && <View style={[styles.card, { gap: space.sm }]}>
          <Text style={type.bodySmall}>{isContractor ? (cancelamento.reembolso ? "Cancelamento com estorno integral até 24h antes do evento." : "Faltam menos de 24h: ao cancelar, o cachê é repassado ao músico.") : "Ao desistir, o contratante é reembolsado e o evento volta a receber candidatos."}</Text>
          <Button variant="danger" title={isContractor ? "Cancelar contratação" : "Desistir do show"} block={false} loading={busy} onPress={cancel}/>
        </View>}
      </Section>}
      {error ? <Alert tone="error">{error}</Alert> : null}
    </Screen>
    {snack ? <Snackbar message={snack} onHide={hideSnack}/> : null}
  </View>;
}
