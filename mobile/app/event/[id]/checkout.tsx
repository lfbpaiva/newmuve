import * as Clipboard from "expo-clipboard";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Image, Text, View } from "react-native";
import { errorMessage } from "../../../../shared/client/api.ts";
import { fetchCheckoutStatus, fetchEvent, startCheckout, type Checkout } from "../../../../shared/client/events.ts";
import { formatCountdown, formatCurrency, formatDateTime } from "../../../../shared/client/format.ts";
import { useAsync } from "../../../../shared/client/useAsync.ts";
import { Alert, Button, ErrorState, Icon, Loading, Screen, Snackbar } from "../../../components/ui";
import { colors, radius, space, styles, type } from "../../../lib/theme";

const POLLING_INTERVAL_MS = 5000;
const secondsUntil = (iso: string) => Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 1000));

export default function CheckoutScreen() {
  const { id: eventId, candidateId } = useLocalSearchParams<{ id: string; candidateId: string }>();
  const router = useRouter();
  const event = useAsync(`checkout-event:${eventId}`, () => fetchEvent(eventId));
  const [checkout, setCheckout] = useState<Checkout | null>(null);
  const [error, setError] = useState("");
  const [generating, setGenerating] = useState(true);
  const [seconds, setSeconds] = useState(0);
  const [snack, setSnack] = useState("");
  const hideSnack = useCallback(() => setSnack(""), []);

  // Gera a cobrança na API (ou recupera a que ainda está válida para este candidato).
  const load = useCallback(
    () =>
      startCheckout(eventId, candidateId)
        .then((created) => { setCheckout(created); setSeconds(secondsUntil(created.expiraEm)); })
        .catch((e: unknown) => setError(errorMessage(e)))
        .finally(() => setGenerating(false)),
    [eventId, candidateId],
  );
  useEffect(() => { void load(); }, [load]);

  const expiraEm = checkout?.expiraEm;
  useEffect(() => {
    if (!expiraEm) return;
    const timer = setInterval(() => setSeconds(secondsUntil(expiraEm)), 1000);
    return () => clearInterval(timer);
  }, [expiraEm]);

  // A API confere a cobrança na Asaas a cada consulta: funciona mesmo sem o webhook.
  const waiting = checkout?.status === "PENDENTE";
  useEffect(() => {
    if (!waiting) return;
    const poll = setInterval(async () => {
      const latest = await fetchCheckoutStatus(eventId).catch(() => null);
      if (latest?.status === "PAGO") router.replace(`/event/${eventId}/hiring`);
      else if (latest && latest.status !== "PENDENTE") setCheckout(latest);
    }, POLLING_INTERVAL_MS);
    return () => clearInterval(poll);
  }, [waiting, eventId, router]);

  async function copy() {
    if (!checkout?.pixCopiaCola) return;
    await Clipboard.setStringAsync(checkout.pixCopiaCola);
    setSnack("Código Pix copiado. Cole no app do seu banco.");
  }

  const expired = Boolean(checkout) && (seconds === 0 || checkout?.status !== "PENDENTE");

  return <View style={styles.screen}>
    <Screen>
      {generating && <Loading label="Gerando cobrança Pix..." cards={1}/>}
      {!generating && error && <ErrorState message={error} onRetry={() => { setGenerating(true); setError(""); void load(); }}/>}
      {!generating && !error && checkout && <View style={[styles.cardRaised, { alignItems: "center", gap: space.md }]}>
        <Text style={type.title}>{expired ? "Cobrança expirada" : "Pague com Pix"}</Text>
        {checkout.pixQrCode && <View style={{ padding: 10, backgroundColor: "#fff", borderRadius: radius.md, opacity: expired ? 0.25 : 1 }}><Image source={{ uri: `data:image/png;base64,${checkout.pixQrCode}` }} style={{ width: 196, height: 196 }} accessibilityLabel="QR Code Pix"/></View>}
        <View style={styles.row}><Icon name="time-outline" size={16} color={colors.ink2}/><Text style={type.bodySmall}>Expira em <Text style={[type.label, { color: colors.ink }]}>{formatCountdown(seconds)}</Text></Text></View>
        {expired
          ? <Button title="Gerar nova cobrança" icon="refresh" onPress={() => { setGenerating(true); void load(); }}/>
          : <Button title="Copiar código Pix" icon="copy-outline" onPress={copy}/>}
        {!expired && <Text style={[type.bodySmall, { textAlign: "center" }]}>No celular, copie o código e cole em "Pix copia e cola" no app do seu banco. Assim que o pagamento cair, esta tela avança sozinha.</Text>}
      </View>}
      <View style={[styles.card, { gap: 6 }]}>
        {event.data ? <>
          <Text style={type.titleSmall}>{event.data.titulo}</Text>
          <Text style={type.bodySmall}>{formatDateTime(event.data.inicio)}</Text>
          <View style={[styles.divider, { marginVertical: 6 }]}/>
          <View style={styles.between}><Text style={type.bodySmall}>Cachê do músico</Text><Text style={type.body}>{formatCurrency(checkout?.cache ?? event.data.cache)}</Text></View>
          {checkout && <View style={styles.between}><Text style={type.bodySmall}>Taxa de serviço (10%)</Text><Text style={type.body}>{formatCurrency(checkout.comissao)}</Text></View>}
          <View style={styles.between}><Text style={type.titleSmall}>Total</Text><Text style={type.price}>{formatCurrency(checkout?.valor ?? event.data.cache)}</Text></View>
        </> : <Text style={type.bodySmall}>{event.error ?? "Carregando..."}</Text>}
      </View>
      <Alert tone="info">O cachê fica retido e só é repassado ao músico depois que vocês dois confirmarem o show. A taxa cobre essa garantia: se o músico não comparecer, ou se você cancelar com mais de 24h, recebe o valor integral de volta.</Alert>
    </Screen>
    {snack ? <Snackbar message={snack} onHide={hideSnack}/> : null}
  </View>;
}
