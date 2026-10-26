import * as Clipboard from "expo-clipboard";
import { useEffect, useState } from "react";
import { Image, Text, View } from "react-native";
import { errorMessage } from "../../shared/client/api.ts";
import { useAuth } from "../../shared/client/AuthContext.tsx";
import { cancelPro, fetchProStatus, subscribePro, type ProStatus } from "../../shared/client/events.ts";
import { formatCurrency } from "../../shared/client/format.ts";
import { camposFaltantes, descreverFaltantes, isPro, PRO_ANTECIPACAO_HORAS, PRO_PRECO, PRO_RAIO_MAXIMO_KM } from "../../shared/dominio.ts";
import { Alert, Button, ErrorState, Heading, Icon, Loading, Screen, Snackbar, type IconName } from "../components/ui";
import { confirmAction } from "../lib/confirm";
import { colors, radius, space, styles, type } from "../lib/theme";
import { useMe } from "../lib/useMe";

const beneficios: { icon: IconName; titulo: string; texto: string }[] = [
  { icon: "flash-outline", titulo: `Eventos ${PRO_ANTECIPACAO_HORAS}h antes`, texto: "Eventos novos marcados com mais de 7 dias de antecedência aparecem primeiro para você." },
  { icon: "trending-up-outline", titulo: "Destaque nas inscrições", texto: "Você aparece no topo da lista de candidatos, com o selo Pro." },
  { icon: "navigate-outline", titulo: `Raio de até ${PRO_RAIO_MAXIMO_KM} km`, texto: "Para quem toca em várias cidades da região." },
];

export default function ProScreen() {
  const me = useMe();
  const { refreshMe } = useAuth();
  const [status, setStatus] = useState<ProStatus | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [snack, setSnack] = useState("");
  const faltando = camposFaltantes(me, "pagar");
  const aguardando = status?.assinatura?.status === "AGUARDANDO_PAGAMENTO";

  useEffect(() => {
    let active = true;
    const load = () => fetchProStatus().then((next) => {
      if (!active) return;
      setStatus(next);
      if (isPro(next.ativoAte) && !isPro(me.proAte)) void refreshMe();
    }, (e: unknown) => active && setError(errorMessage(e)));
    load();
    const timer = aguardando ? setInterval(load, 5000) : null;
    return () => {
      active = false;
      if (timer) clearInterval(timer);
    };
  }, [aguardando, me.proAte, refreshMe]);

  async function run(action: () => Promise<ProStatus>) {
    setBusy(true);
    setError("");
    try {
      setStatus(await action());
      await refreshMe();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  function cancelar() {
    confirmAction({
      title: "Cancelar o Muve Pro",
      message: "A renovação mensal será encerrada. Você continua Pro até o fim do período já pago.",
      confirmLabel: "Cancelar renovação",
      cancelLabel: "Manter",
      onConfirm: () => void run(cancelPro),
    });
  }

  if (error && !status) return <Screen><ErrorState message={error} onRetry={() => { setError(""); void fetchProStatus().then(setStatus, (e: unknown) => setError(errorMessage(e))); }}/></Screen>;
  if (!status) return <Screen><Loading cards={2}/></Screen>;

  const ativo = isPro(status.ativoAte);
  const assinatura = status.assinatura;
  const renovando = ativo && assinatura?.status === "ATIVA";

  return <View style={styles.screen}>
    <Screen>
      <Heading size="display" title="Muve Pro" subtitle={`${formatCurrency(PRO_PRECO)} por mês, no Pix. Cancele quando quiser.`}/>
      {ativo && <Alert tone="success">Seu Muve Pro está ativo até {new Date(status.ativoAte!).toLocaleDateString("pt-BR")}{renovando ? ", com renovação mensal." : ". A renovação foi cancelada."}</Alert>}

      <View style={{ gap: space.md }}>
        {beneficios.map((b) => <View key={b.titulo} style={[styles.card, styles.row, { gap: space.md, alignItems: "flex-start" }]}>
          <Icon name={b.icon} size={22} color={colors.accentText}/>
          <View style={{ flex: 1, gap: 2 }}><Text style={type.titleSmall}>{b.titulo}</Text><Text style={type.bodySmall}>{b.texto}</Text></View>
        </View>)}
      </View>

      <Text style={type.bodySmall}>O Pro não muda as regras: a garantia do pagamento, os cancelamentos, as multas e as avaliações são iguais para todos.</Text>

      {assinatura?.cobranca && <View style={[styles.cardRaised, { alignItems: "center", gap: space.md }]}>
        <Text style={type.title}>{ativo ? "Próxima mensalidade" : "Pague para ativar"}</Text>
        <View style={{ padding: 10, backgroundColor: "#fff", borderRadius: radius.md }}>
          <Image source={{ uri: `data:image/png;base64,${assinatura.cobranca.pixQrCode}` }} style={{ width: 180, height: 180 }} accessibilityLabel="QR Code Pix do Muve Pro"/>
        </View>
        <Text style={type.bodySmall}>{formatCurrency(assinatura.valor)} · vence em {assinatura.cobranca.vencimento.split("-").reverse().join("/")}</Text>
        <Button title="Copiar código Pix" icon="copy-outline" onPress={() => void Clipboard.setStringAsync(assinatura.cobranca!.pixCopiaCola).then(() => setSnack("Código Pix copiado."))}/>
        {aguardando && <Text style={[type.bodySmall, { textAlign: "center" }]}>Assim que o pagamento cair, o Pro é ativado sozinho.</Text>}
      </View>}

      {faltando.length > 0 && !assinatura && <Alert tone="info">Para assinar, complete seu perfil: {descreverFaltantes(faltando)}.</Alert>}
      {error ? <Alert tone="error">{error}</Alert> : null}
      {(!assinatura || assinatura.status === "CANCELADA") && <Button title={ativo ? "Voltar a renovar" : `Assinar por ${formatCurrency(PRO_PRECO)}/mês`} icon="flash" loading={busy} disabled={faltando.length > 0} onPress={() => void run(subscribePro)}/>}
      {assinatura && assinatura.status !== "CANCELADA" && <Button title="Cancelar renovação" variant="text" loading={busy} onPress={cancelar}/>}
    </Screen>
    {snack ? <Snackbar message={snack} onHide={() => setSnack("")}/> : null}
  </View>;
}
