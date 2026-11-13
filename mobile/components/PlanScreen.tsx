import * as Clipboard from "expo-clipboard";
import { useCallback, useEffect, useState } from "react";
import { Image, Text, View } from "react-native";
import { errorMessage } from "../../shared/client/api.ts";
import { useAuth } from "../../shared/client/AuthContext.tsx";
import { cancelPlan, fetchPlanStatus, subscribePlan, type PlanStatus } from "../../shared/client/events.ts";
import { formatCurrency } from "../../shared/client/format.ts";
import { camposFaltantes, descreverFaltantes, isPro } from "../../shared/dominio.ts";
import { confirmAction } from "../lib/confirm";
import { colors, radius, space, styles, type } from "../lib/theme";
import { useMe } from "../lib/useMe";
import { Alert, Button, ErrorState, Icon, Loading, Pill, Reveal, Screen, Snackbar, Surface, type IconName } from "./ui";

export interface Beneficio {
  icon: IconName;
  titulo: string;
  texto: string;
}

export function PlanScreen({ nome, preco, beneficios, observacao }: { nome: string; preco: number; beneficios: Beneficio[]; observacao: string }) {
  const me = useMe();
  const { refreshMe } = useAuth();
  const [status, setStatus] = useState<PlanStatus | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [snack, setSnack] = useState("");
  const hideSnack = useCallback(() => setSnack(""), []);
  const faltando = camposFaltantes(me, "pagar");
  const ativoNoPerfil = me.role === "MUSICIAN" ? me.proAte : me.casaAte;
  const aguardando = status?.assinatura?.status === "AGUARDANDO_PAGAMENTO";

  useEffect(() => {
    let active = true;
    const load = () => fetchPlanStatus().then((next) => {
      if (!active) return;
      setStatus(next);
      if (isPro(next.ativoAte) && !isPro(ativoNoPerfil)) void refreshMe();
    }, (e: unknown) => active && setError(errorMessage(e)));
    load();
    const timer = aguardando ? setInterval(load, 5000) : null;
    return () => {
      active = false;
      if (timer) clearInterval(timer);
    };
  }, [aguardando, ativoNoPerfil, refreshMe]);

  async function run(action: () => Promise<PlanStatus>) {
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
      title: `Cancelar o ${nome}`,
      message: "A renovação mensal será encerrada. Os benefícios continuam até o fim do período já pago.",
      confirmLabel: "Cancelar renovação",
      cancelLabel: "Manter",
      onConfirm: () => void run(cancelPlan),
    });
  }

  if (error && !status) return <Screen><ErrorState message={error} onRetry={() => { setError(""); void fetchPlanStatus().then(setStatus, (e: unknown) => setError(errorMessage(e))); }}/></Screen>;
  if (!status) return <Screen><Loading cards={2}/></Screen>;

  const ativo = isPro(status.ativoAte);
  const assinatura = status.assinatura;
  const renovando = ativo && assinatura?.status === "ATIVA";

  return <View style={styles.screen}>
    <Screen>
      <Reveal><Surface destaque>
        <View style={[styles.row, { gap: space.sm }]}>
          <View style={{ width: 32, height: 32, borderRadius: radius.sm, backgroundColor: colors.accentSoft, alignItems: "center", justifyContent: "center" }}><Icon name="flash" size={16} color={colors.accentText}/></View>
          <Text style={type.title} accessibilityRole="header">{nome}</Text>
          {ativo ? <Pill text="Ativo" tone="success"/> : null}
        </View>
        <View style={[styles.row, { alignItems: "flex-end", gap: space.xs }]}>
          <Text style={[type.stat, { fontSize: 44, lineHeight: 48 }]}>{formatCurrency(preco)}</Text>
          <Text style={[type.bodySmall, { marginBottom: 8 }]}>/mês no Pix</Text>
        </View>
        <View style={{ gap: space.md, paddingTop: space.md, borderTopWidth: 1, borderTopColor: colors.hairline }}>
          {beneficios.map((b) => <View key={b.titulo} style={[styles.row, { gap: space.md, alignItems: "flex-start" }]}>
            <View style={{ width: 32, height: 32, borderRadius: radius.sm, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.hairline, alignItems: "center", justifyContent: "center" }}><Icon name={b.icon} size={16} color={colors.accentText}/></View>
            <View style={{ flex: 1, gap: 2 }}><Text style={type.titleSmall}>{b.titulo}</Text><Text style={type.bodySmall}>{b.texto}</Text></View>
          </View>)}
        </View>
      </Surface></Reveal>
      {ativo && <Alert tone="success">Seu {nome} está ativo até {new Date(status.ativoAte!).toLocaleDateString("pt-BR")}{renovando ? ", com renovação mensal." : ". A renovação foi cancelada."}</Alert>}

      <Text style={type.bodySmall}>{observacao} Cancele quando quiser.</Text>

      {assinatura?.cobranca && <View style={[styles.cardRaised, { alignItems: "center", gap: space.md }]}>
        <Text style={type.title}>{ativo ? "Próxima mensalidade" : "Pague para ativar"}</Text>
        <View style={{ padding: 10, backgroundColor: "#fff", borderRadius: radius.md }}>
          <Image source={{ uri: `data:image/png;base64,${assinatura.cobranca.pixQrCode}` }} style={{ width: 180, height: 180 }} accessibilityLabel={`QR Code Pix do ${nome}`}/>
        </View>
        <Text style={type.bodySmall}>{formatCurrency(assinatura.valor)} · vence em {assinatura.cobranca.vencimento.split("-").reverse().join("/")}</Text>
        <Button title="Copiar código Pix" icon="copy-outline" onPress={() => void Clipboard.setStringAsync(assinatura.cobranca!.pixCopiaCola).then(() => setSnack("Código Pix copiado."))}/>
        {aguardando && <Text style={[type.bodySmall, { textAlign: "center" }]}>Assim que o pagamento cair, o plano é ativado sozinho.</Text>}
      </View>}

      {faltando.length > 0 && !assinatura && <Alert tone="info">Para assinar, complete seu perfil: {descreverFaltantes(faltando)}.</Alert>}
      {error ? <Alert tone="error">{error}</Alert> : null}
      {(!assinatura || assinatura.status === "CANCELADA") && <Button title={ativo ? "Voltar a renovar" : `Assinar por ${formatCurrency(preco)}/mês`} icon="flash" loading={busy} disabled={faltando.length > 0} onPress={() => void run(subscribePlan)}/>}
      {assinatura && assinatura.status !== "CANCELADA" && <Button title="Cancelar renovação" variant="text" loading={busy} onPress={cancelar}/>}
    </Screen>
    {snack ? <Snackbar message={snack} onHide={hideSnack}/> : null}
  </View>;
}
