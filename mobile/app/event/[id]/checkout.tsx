import * as Clipboard from "expo-clipboard";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Image, Text, View } from "react-native";
import { errorMessage } from "../../../../shared/client/api.ts";
import { cancelPendingCheckout, fetchCheckoutStatus, fetchEvent, startCheckout, type Checkout } from "../../../../shared/client/events.ts";
import { formatCountdown, formatCurrency, formatEventDateTime } from "../../../../shared/client/format.ts";
import { useAsync } from "../../../../shared/client/useAsync.ts";
import { calcularCobranca, COBRANCA_VALIDADE_MS, comissaoPercentual } from "../../../../shared/dominio.ts";
import { Alert, Button, ErrorState, Icon, Loading, Pill, PontoAoVivo, Reveal, Screen, Skeleton, Snackbar, Surface } from "../../../components/ui";
import { confirmAction } from "../../../lib/confirm";
import { colors, radius, space, styles, type } from "../../../lib/theme";
import { useMe } from "../../../lib/useMe";

const POLLING_INTERVAL_MS = 5000;
const secondsUntil = (iso: string) => Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 1000));

export default function CheckoutScreen() {
  const { id: eventId, candidateId } = useLocalSearchParams<{ id: string; candidateId: string }>();
  const me = useMe();
  const router = useRouter();
  const event = useAsync(`checkout-event:${eventId}`, () => fetchEvent(eventId));
  const [checkout, setCheckout] = useState<Checkout | null>(null);
  const [error, setError] = useState("");
  const [generating, setGenerating] = useState(true);
  const [seconds, setSeconds] = useState(0);
  const [snack, setSnack] = useState("");
  const hideSnack = useCallback(() => setSnack(""), []);
  const [statusError, setStatusError] = useState("");
  const [canceling, setCanceling] = useState(false);
  const [cancelError, setCancelError] = useState("");
  const [cancelled, setCancelled] = useState(false);

  const load = useCallback(
    () =>
      startCheckout(eventId, candidateId)
        .then((created) => { setCheckout(created); setSeconds(secondsUntil(created.expiraEm)); })
        .catch((e: unknown) => setError(errorMessage(e)))
        .finally(() => setGenerating(false)),
    [eventId, candidateId],
  );
  useEffect(() => { void load(); }, [load]);

  function generate() {
    setGenerating(true);
    setError("");
    void load();
  }

  const expiraEm = checkout?.expiraEm;
  useEffect(() => {
    if (!expiraEm) return;
    const timer = setInterval(() => setSeconds(secondsUntil(expiraEm)), 1000);
    return () => clearInterval(timer);
  }, [expiraEm]);

  const waiting = checkout?.status === "PENDENTE";
  useEffect(() => {
    if (!waiting) return;
    let inFlight = false;
    const poll = setInterval(async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const latest = await fetchCheckoutStatus(eventId);
        setStatusError("");
        if (latest?.status === "PAGO") router.replace(`/event/${eventId}/hiring`);
        else if (latest && latest.status !== "PENDENTE") setCheckout(latest);
      } catch (e) {
        setStatusError(errorMessage(e));
      } finally {
        inFlight = false;
      }
    }, POLLING_INTERVAL_MS);
    return () => clearInterval(poll);
  }, [waiting, eventId, router]);

  async function copy() {
    if (!checkout?.pixCopiaCola) return;
    await Clipboard.setStringAsync(checkout.pixCopiaCola);
    setSnack("Código Pix copiado. Cole no app do seu banco.");
  }

  function cancelCharge() {
    if (canceling) return;
    confirmAction({
      title: "Cancelar cobrança",
      message: "Cancelar esta cobrança Pix pendente? Nenhum valor foi recebido, portanto não haverá reembolso.",
      confirmLabel: "Cancelar cobrança",
      onConfirm: async () => {
        setCanceling(true);
        setCancelError("");
        try {
          await cancelPendingCheckout(eventId);
          setCheckout(null);
          setCancelled(true);
        } catch (e) {
          setCancelError(errorMessage(e));
        } finally {
          setCanceling(false);
        }
      },
    });
  }

  const expired = Boolean(checkout) && (seconds === 0 || checkout?.status !== "PENDENTE");
  const total = checkout?.valor ?? (event.data ? calcularCobranca(event.data.cache, comissaoPercentual(me.casaAte)).total : null);
  const restante = Math.min(1, (seconds * 1000) / COBRANCA_VALIDADE_MS);

  if (cancelled) return <Screen>
    <Alert tone="success">Cobrança pendente cancelada. Não houve reembolso porque o pagamento não foi recebido.</Alert>
    <Button title="Voltar ao evento" variant="outlined" onPress={() => router.back()}/>
  </Screen>;

  return <View style={styles.screen}>
    <Screen>
      <Reveal><View style={{ gap: space.xs }}>
        <Text style={type.labelSmall}>Total a pagar</Text>
        {total !== null ? <Text style={[type.stat, { fontSize: 44, lineHeight: 48 }]}>{formatCurrency(total)}</Text> : <Skeleton width={180} height={44}/>}
        {event.data ? <Text style={type.bodySmall} numberOfLines={2}>{event.data.titulo} · {formatEventDateTime(event.data.inicio, event.data.uf)}</Text> : null}
      </View></Reveal>

      {generating && <Loading label="Gerando cobrança Pix..." cards={1}/>}
      {!generating && error ? <ErrorState message={error} onRetry={generate}/> : null}
      {!generating && !error && checkout && <Reveal index={1}><Surface destaque>
        <View style={styles.between}>
          {expired
            ? <Pill text="Cobrança expirada" tone="muted"/>
            : <View style={[styles.row, { gap: space.sm }]}><PontoAoVivo/><Text style={[type.label, { color: colors.ink2 }]}>Aguardando pagamento</Text></View>}
          <View style={[styles.row, { gap: 6 }]}>
            <Icon name="time-outline" size={15} color={colors.ink3}/>
            <Text style={[type.label, { fontVariant: ["tabular-nums"] }]}>{formatCountdown(seconds)}</Text>
          </View>
        </View>
        <View style={{ height: 4, borderRadius: 2, backgroundColor: colors.surface3, overflow: "hidden" }}>
          <View style={{ height: 4, width: `${Math.round(restante * 100)}%`, borderRadius: 2, backgroundColor: restante < 0.2 ? colors.warning : colors.accentBright }}/>
        </View>
        {checkout.pixQrCode ? <View style={{ alignSelf: "center", padding: 14, backgroundColor: "#ffffff", borderRadius: radius.lg, opacity: expired ? 0.2 : 1 }}>
          <Image source={{ uri: `data:image/png;base64,${checkout.pixQrCode}` }} style={{ width: 200, height: 200 }} accessibilityLabel="QR Code Pix"/>
        </View> : null}
        {expired
          ? <Button title="Gerar nova cobrança" icon="refresh" onPress={generate}/>
          : <>
            <Button title="Copiar código Pix" icon="copy-outline" onPress={copy}/>
            <View style={{ gap: space.sm }}>
              {["Copie o código Pix", "Cole em \"Pix copia e cola\" no app do seu banco", "Esta tela avança sozinha quando o pagamento cair"].map((passo, index) => <View key={passo} style={[styles.row, { gap: space.md }]}>
                <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: colors.accentSoft, alignItems: "center", justifyContent: "center" }}><Text style={[type.label, { fontSize: 12, color: colors.accentText }]}>{index + 1}</Text></View>
                <Text style={[type.bodySmall, { flex: 1 }]}>{passo}</Text>
              </View>)}
            </View>
          </>}
        {cancelError ? <Alert tone="error">{cancelError}</Alert> : null}
        {statusError ? <Alert tone="info">Não foi possível atualizar o pagamento: {statusError}</Alert> : null}
        {checkout.refundStatus ? <Alert tone="info">Este Pix foi pago depois que a cobrança deixou de valer, então não contratou o músico. O valor será devolvido integralmente; você recebe uma notificação sobre a devolução.</Alert> : null}
      </Surface></Reveal>}

      {event.data ? <Reveal index={2}><View style={[styles.card, { gap: space.sm }]}>
        <View style={styles.between}><Text style={type.bodySmall}>Cachê do músico</Text><Text style={type.body}>{formatCurrency(checkout?.cache ?? event.data.cache)}</Text></View>
        <View style={styles.between}><Text style={type.bodySmall}>Taxa de serviço ({checkout ? Math.round((checkout.comissao / checkout.cache) * 100) : comissaoPercentual(me.casaAte)}%)</Text><Text style={type.body}>{formatCurrency(checkout?.comissao ?? calcularCobranca(event.data.cache, comissaoPercentual(me.casaAte)).comissao)}</Text></View>
        <View style={[styles.between, { paddingTop: space.sm, borderTopWidth: 1, borderTopColor: colors.hairline }]}><Text style={type.titleSmall}>Total</Text><Text style={type.price}>{formatCurrency(checkout?.valor ?? calcularCobranca(event.data.cache, comissaoPercentual(me.casaAte)).total)}</Text></View>
      </View></Reveal> : event.error ? <Alert tone="error">{event.error}</Alert> : null}

      <View style={[styles.row, { alignItems: "flex-start", gap: space.md }]}>
        <View style={{ width: 36, height: 36, borderRadius: radius.md, backgroundColor: colors.accentSoft, alignItems: "center", justifyContent: "center" }}><Icon name="shield-checkmark-outline" size={18} color={colors.accentText}/></View>
        <Text style={[type.bodySmall, { flex: 1 }]}>O cachê fica guardado pela Muve e só é repassado ao músico depois que vocês dois confirmarem o show. Se o músico não comparecer, ou se você cancelar com mais de 24h, o valor volta integralmente.</Text>
      </View>
      {checkout && !expired && <Button title="Cancelar cobrança pendente" variant="text" loading={canceling} onPress={cancelCharge}/>}
    </Screen>
    {snack ? <Snackbar message={snack} onHide={hideSnack}/> : null}
  </View>;
}
