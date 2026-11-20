import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { errorMessage } from "../../../../shared/client/api.ts";
import { acaoDeContestacao, avisoDoEstorno, confirmacaoDaParte, etapasDaContratacao, historicoDaContestacao, motivoDaConfirmacaoSuspensa, situacaoDoCache } from "../../../../shared/client/contratacao.ts";
import { cancelHiring, confirmCompletion, fetchHiring, openDispute, reportNoShow, reviewEvent, type CancellationResult } from "../../../../shared/client/events.ts";
import { formatCurrency, formatDuration } from "../../../../shared/client/format.ts";
import { useAsync } from "../../../../shared/client/useAsync.ts";
import { maskPhone } from "../../../../shared/client/validators.ts";
import { EventStatusPill } from "../../../components/events";
import { HiringAgreement } from "../../../components/HiringAgreement";
import { HiringTimeline } from "../../../components/HiringTimeline";
import { Alert, Avatar, Button, ErrorState, Field, Icon, Loading, Screen, Section, Snackbar } from "../../../components/ui";
import { confirmAction } from "../../../lib/confirm";
import { depoisDoEnvio, FORMULARIO_FECHADO } from "../../../lib/formularioContestacao";
import { colors, space, styles, type } from "../../../lib/theme";
import { abrirLink } from "../../../lib/links";
import { denunciar } from "../../../lib/suporte";
import { useMe } from "../../../lib/useMe";
import { useRefreshOnFocus } from "../../../lib/useRefreshOnFocus";

const finishedMessages: Record<Exclude<CancellationResult["situacao"], "ESTORNO_PROCESSANDO">, string> = {
  ESTORNADO: "O Asaas confirmou o estorno ao contratante. A contratação foi encerrada.",
  SEM_ESTORNO: "A contratação foi cancelada sem estorno, conforme a regra de prazo. O cachê será repassado ao músico.",
  COBRANCA_CANCELADA: "A cobrança pendente foi cancelada. Nenhum valor havia sido recebido, portanto não há reembolso.",
};

type AreaDoRetorno = "contato" | "confirmacao" | "contestacao" | "avaliacao" | "desfazer";
type Retorno = { area: AreaDoRetorno; tom: "error" | "info"; texto: string };

export default function HiringScreen() {
  const { id: eventId } = useLocalSearchParams<{ id: string }>();
  const me = useMe();
  const router = useRouter();
  const hiring = useAsync(`hiring:${eventId}`, () => fetchHiring(eventId));
  useRefreshOnFocus(hiring.reload);
  const [busy, setBusy] = useState(false);
  const [retorno, setRetorno] = useState<Retorno | null>(null);
  const [finished, setFinished] = useState("");
  const [snack, setSnack] = useState("");
  const hideSnack = useCallback(() => setSnack(""), []);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [formulario, setFormulario] = useState(FORMULARIO_FECHADO);

  const falha = (area: AreaDoRetorno) => (texto: string) => setRetorno(texto ? { area, tom: "error", texto } : null);

  async function run(area: AreaDoRetorno, action: () => Promise<unknown>, done?: string): Promise<boolean> {
    if (busy) return false;
    setBusy(true);
    setRetorno(null);
    try {
      await action();
      if (done) setSnack(done);
      hiring.reload();
      return true;
    } catch (e) {
      setRetorno({ area, tom: "error", texto: errorMessage(e) });
      hiring.reload();
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function runCancellation(action: () => Promise<CancellationResult>) {
    if (busy) return;
    setBusy(true);
    setRetorno(null);
    try {
      const { situacao } = await action();
      if (situacao === "ESTORNO_PROCESSANDO") {
        setRetorno({ area: "desfazer", tom: "info", texto: "Estorno solicitado ao Asaas. A contratação continua ativa até a confirmação da devolução." });
        hiring.reload();
      } else {
        setFinished(finishedMessages[situacao]);
      }
    } catch (e) {
      setRetorno({ area: "desfazer", tom: "error", texto: errorMessage(e) });
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
  const { papel, evento, contratante, musico, pagamento, avaliou, cancelamento, naoComparecimento, contestacao, podeContestar } = hiring.data;
  const isContractor = papel === "contratante";
  const other = isContractor ? musico : contratante;
  const concluded = evento.status === "CONCLUIDO";
  const active = evento.status === "CONTRATADO";
  const parties = [
    { parte: "contratante" as const, title: "Contratante" },
    { parte: "musico" as const, title: "Músico" },
  ];
  const motivoSuspensao = motivoDaConfirmacaoSuspensa(hiring.data);
  const estorno = avisoDoEstorno(hiring.data);
  const historico = historicoDaContestacao(hiring.data);
  const acaoContestar = acaoDeContestacao(hiring.data);
  const desfazerVisivel = naoComparecimento.permitido || cancelamento.permitido;
  const avaliacaoVisivel = concluded && !avaliou;
  const areasVisiveis: Record<AreaDoRetorno, boolean> = { contato: true, confirmacao: active, contestacao: podeContestar, avaliacao: avaliacaoVisivel, desfazer: desfazerVisivel };
  const retornoDa = (area: AreaDoRetorno) => (retorno?.area === area ? <Alert tone={retorno.tom}>{retorno.texto}</Alert> : null);
  const retornoSemSecao = retorno && !areasVisiveis[retorno.area] ? <Alert tone={retorno.tom}>{retorno.texto}</Alert> : null;

  function cancel() {
    const message = isContractor
      ? cancelamento.reembolso
        ? "O estorno integral será solicitado ao Asaas. A contratação termina quando a devolução for confirmada."
        : "Faltam menos de 24h: não há devolução e o cachê será repassado ao músico."
      : "O estorno integral ao contratante será solicitado. Depois da confirmação da devolução, o evento volta a receber candidatos.";
    const esperado = isContractor ? (cancelamento.reembolso ? "COM_ESTORNO" : "SEM_ESTORNO") : undefined;
    confirmAction({ title: isContractor ? "Cancelar contratação" : "Desistir do show", message, onConfirm: () => void runCancellation(() => cancelHiring(evento.id, esperado)) });
  }

  async function enviarContestacao() {
    const enviada = await run("contestacao", () => openDispute(evento.id, formulario.motivo.trim()), "Contestação enviada ao suporte.");
    setFormulario((atual) => depoisDoEnvio(atual, enviada));
  }

  function noShow() {
    confirmAction({ title: "Não comparecimento", message: "Registrar que o músico não compareceu e solicitar o estorno integral? A devolução será confirmada pelo Asaas.", onConfirm: () => void runCancellation(() => reportNoShow(evento.id)) });
  }

  return <View style={styles.screen}>
    <Screen onRefresh={hiring.reload} carregando={hiring.loading}>
      <View style={{ gap: space.sm }}>
        <HiringAgreement
          numero={evento.id.slice(0, 8).toUpperCase()}
          titulo={evento.titulo}
          inicio={evento.inicio}
          uf={evento.uf}
          cidade={evento.cidade}
          status={<EventStatusPill status={evento.status}/>}
          contratante={isContractor ? { papel: "Contratante", nome: me.nome, foto: me.fotoPerfilUrl, voce: true } : { papel: "Contratante", nome: contratante?.nome ?? "Conta excluída", foto: contratante?.fotoPerfilUrl, voce: false }}
          musico={isContractor ? { papel: "Músico", nome: musico?.nome ?? "Conta excluída", foto: musico?.fotoPerfilUrl, voce: false } : { papel: "Músico", nome: me.nome, foto: me.fotoPerfilUrl, voce: true }}
          valor={pagamento ? formatCurrency(pagamento.cache).replace(/,00$/, "") : null}
          situacaoDoValor={situacaoDoCache(hiring.data)}
        />
        <Text style={type.bodySmall}>{formatDuration(evento.duracaoMinutos)} · {evento.tipoEvento} · {evento.estilosMusicais.join(", ")} · {evento.formacao} · {evento.somDisponivel ? "som no local" : "sem som no local"}</Text>
      </View>
      {retornoSemSecao}

      <Section title="Andamento">
        <View style={styles.card}><HiringTimeline etapas={etapasDaContratacao(hiring.data)}/></View>
      </Section>

      <View style={[styles.cardRaised, { gap: space.md }]}>
        <View style={[styles.row, { alignItems: "flex-start", gap: 12 }]}>
          <Icon name="location-outline" size={20} color={colors.accentText}/>
          <View style={{ flex: 1 }}><Text style={type.titleSmall}>{evento.endereco ?? "Endereço não informado"}</Text><Text style={type.bodySmall}>{evento.cidade}, {evento.uf}</Text></View>
        </View>
        {evento.endereco && <Button title="Abrir no mapa" variant="outlined" icon="map-outline" onPress={() => { setRetorno(null); abrirLink(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${evento.endereco}, ${evento.cidade}, ${evento.uf}`)}`, falha("contato")); }}/>}
        {other && <>
          <View style={styles.divider}/>
          <View style={[styles.row, { gap: 12 }]}>
            <Avatar uri={other.fotoPerfilUrl} name={other.nome}/>
            <View style={{ flex: 1 }}><Text style={type.bodySmall}>{isContractor ? "Músico contratado" : "Contratante"}</Text><Text style={type.titleSmall}>{other.nome}</Text></View>
            <Pressable accessibilityRole="button" accessibilityLabel={`Conversar com ${other.nome} no WhatsApp`} onPress={() => { setRetorno(null); abrirLink(`https://wa.me/55${other.telefone}`, falha("contato")); }} style={({ pressed }) => [styles.row, { minHeight: 44, paddingHorizontal: 14, borderRadius: 999, backgroundColor: pressed ? "#1f3d26" : colors.successBg, gap: 6 }]}>
              <Icon name="logo-whatsapp" size={18} color={colors.success}/><Text style={[type.label, { color: colors.success }]}>{maskPhone(other.telefone)}</Text>
            </Pressable>
          </View>
          <Button title={`Denunciar ${other.nome}`} variant="text" icon="flag-outline" onPress={() => { setRetorno(null); denunciar(other.nome, `evento "${evento.titulo}"`, me.email, falha("contato")); }}/>
        </>}
        {retornoDa("contato")}
      </View>

      <Section title="Valores">
        <View style={[styles.card, { gap: 6 }]}>
          {pagamento ? <>
            {isContractor ? <>
              <View style={styles.between}><Text style={type.bodySmall}>Cachê do músico</Text><Text style={type.body}>{formatCurrency(pagamento.cache)}</Text></View>
              <View style={styles.between}><Text style={type.bodySmall}>Taxa de serviço</Text><Text style={type.body}>{formatCurrency(pagamento.comissao)}</Text></View>
              <View style={styles.between}><Text style={type.titleSmall}>Total pago</Text><Text style={type.price}>{formatCurrency(pagamento.total)}</Text></View>
            </> : pagamento.multaDescontada > 0 ? <>
              <View style={styles.between}><Text style={type.bodySmall}>Cachê</Text><Text style={type.body}>{formatCurrency(pagamento.cache)}</Text></View>
              <View style={styles.between}><Text style={type.bodySmall}>Multa por ausência descontada</Text><Text style={type.body}>− {formatCurrency(pagamento.multaDescontada)}</Text></View>
              <View style={styles.between}><Text style={type.titleSmall}>Você recebe</Text><Text style={type.price}>{formatCurrency(pagamento.cache - pagamento.multaDescontada)}</Text></View>
            </> : <View style={styles.between}><Text style={type.titleSmall}>Seu cachê</Text><Text style={type.price}>{formatCurrency(pagamento.cache)}</Text></View>}
          </> : <Text style={type.bodySmall}>Sem pagamento registrado.</Text>}
        </View>
        {estorno && <Alert tone={estorno.tom}>{estorno.texto}</Alert>}
      </Section>

      {active && <Section title="Confirmação do show">
        <Text style={type.bodySmall}>Após o evento, cada parte confirma pelo próprio acesso. Com as duas confirmações, o cachê é repassado ao músico. Sem elas, e sem registro de não comparecimento, o show é dado como realizado 7 dias após a data.</Text>
        {motivoSuspensao && <Text style={type.bodySmall}>{motivoSuspensao}</Text>}
        {parties.map((party) => {
          const confirmacao = confirmacaoDaParte(hiring.data!, party.parte);
          const feita = confirmacao.situacao === "confirmada";
          return <View key={party.title} style={[styles.card, styles.between]}>
            <View style={[styles.row, { gap: 10 }]}><Icon name={feita ? "checkmark-circle" : "ellipse-outline"} size={22} color={feita ? colors.success : colors.line}/><Text style={type.titleSmall}>{party.title}</Text></View>
            {confirmacao.situacao === "disponivel"
              ? <Button title={confirmacao.texto} block={false} loading={busy} onPress={() => run("confirmacao", () => confirmCompletion(evento.id), "Confirmação registrada.")}/>
              : <Text style={[type.bodySmall, feita ? { color: colors.success } : null]}>{confirmacao.texto}</Text>}
          </View>;
        })}
        {retornoDa("confirmacao")}
      </Section>}

      {contestacao && <Alert tone="info">{contestacao.abertaPorMim ? "Você abriu uma contestação" : "A outra parte abriu uma contestação"}: "{contestacao.motivo}". {contestacao.status === "AGUARDANDO_ESTORNO"
        ? "O suporte decidiu devolver o valor ao contratante. O estorno ainda aguarda confirmação, e o repasse continua suspenso."
        : "O repasse fica suspenso até o suporte decidir; as duas partes serão avisadas."}</Alert>}
      {historico && <Section title="Histórico da contestação">
        <View style={{ gap: space.xs }} accessible accessibilityLabel={[historico.titulo, historico.resultado, historico.data, historico.aviso].filter(Boolean).join(". ")}>
          <Text style={type.label}>{historico.titulo}</Text>
          <Text style={type.body}>{historico.resultado}</Text>
          {historico.data && <Text style={type.bodySmall}>{historico.data}</Text>}
          <Text style={[type.bodySmall, { color: colors.ink3 }]}>{historico.aviso}</Text>
        </View>
      </Section>}
      {acaoContestar && <Section title="Algo deu errado?">
        {acaoContestar.explicacao && <Text style={type.bodySmall}>{acaoContestar.explicacao}</Text>}
        {formulario.aberto
          ? <View style={[styles.card, { gap: space.sm }]}>
            <Field label="O que aconteceu?" value={formulario.motivo} onChangeText={(motivo) => setFormulario((atual) => ({ ...atual, motivo }))} multiline maxLength={1000} placeholder="Ex.: o músico não apareceu; o show durou metade do combinado..."/>
            <Text style={type.bodySmall}>O suporte analisa os dois lados e decide se o cachê vai para o músico ou volta para o contratante. Enquanto isso, nada é repassado.</Text>
            <Button title="Enviar contestação" variant="danger" loading={busy} disabled={formulario.motivo.trim().length < 10} onPress={() => void enviarContestacao()}/>
            <Button title="Voltar" variant="text" onPress={() => setFormulario((atual) => ({ ...atual, aberto: false }))}/>
          </View>
          : <Button title={acaoContestar.botao} variant="text" icon="flag-outline" block={false} onPress={() => setFormulario((atual) => ({ ...atual, aberto: true }))}/>}
        {retornoDa("contestacao")}
      </Section>}

      {avaliacaoVisivel && <Section title="Como foi a experiência?">
        <View style={[styles.row, { gap: 4 }]} accessibilityRole="radiogroup">{[1, 2, 3, 4, 5].map((star) => <Pressable key={star} accessibilityRole="radio" accessibilityState={{ checked: star === rating }} accessibilityLabel={`${star} ${star === 1 ? "estrela" : "estrelas"}`} onPress={() => setRating(star)} hitSlop={4} style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}><Icon name={star <= rating ? "star" : "star-outline"} size={30} color={star <= rating ? colors.star : colors.line}/></Pressable>)}</View>
        <Field label="Comentário (opcional)" value={comment} onChangeText={setComment} multiline maxLength={1000}/>
        <Button title="Enviar avaliação" disabled={!rating} loading={busy} onPress={() => run("avaliacao", () => reviewEvent(evento.id, rating, comment), "Avaliação enviada. Obrigado!")}/>
        {retornoDa("avaliacao")}
      </Section>}
      {concluded && avaliou && <Alert tone="success">Avaliação enviada. Obrigado!</Alert>}

      {desfazerVisivel && <Section title="Precisa desfazer?">
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
        {retornoDa("desfazer")}
      </Section>}
    </Screen>
    {snack ? <Snackbar message={snack} onHide={hideSnack}/> : null}
  </View>;
}
