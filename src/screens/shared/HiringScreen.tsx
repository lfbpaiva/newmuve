import { useState } from "react";
import { ErrorState, EventStatusPill, Loading } from "../../components/states";
import { Icon, Secondary } from "../../components/ui";
import { useAsync } from "../../hooks/useAsync";
import { errorMessage } from "../../services/api";
import { cancelHiring, confirmCompletion, fetchHiring, reportNoShow, reviewEvent, type CancellationResult } from "../../services/events";
import { formatCurrency, formatDateTime, formatDuration } from "../../utils/format";
import { maskPhone } from "../../utils/validators";

const payoutLabels: Record<string, string> = {
  RETIDO: "Retido na plataforma até a conclusão do show",
  PROCESSANDO: "Repasse ao músico em processamento",
  REPASSADO: "Repassado ao músico",
  FALHOU: "Repasse falhou; verifique a chave Pix do músico. Será tentado novamente.",
};

const paymentLabels: Record<string, string> = {
  PAGO: "Pago",
  ESTORNADO: "Estornado ao contratante",
  PENDENTE: "Aguardando pagamento",
  EXPIRADO: "Cobrança expirada",
  CANCELADO: "Cobrança cancelada",
};

// Comprovante da contratação: a única tela em que as partes veem endereço e
// contato uma da outra. Também concentra cancelamento, confirmação e avaliação.
export default function HiringScreen({ eventId, onBack }: { eventId: string; onBack: () => void }) {
  const hiring = useAsync(`hiring:${eventId}`, () => fetchHiring(eventId));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [finished, setFinished] = useState("");

  async function run(action: () => Promise<unknown>, done?: (result: unknown) => string) {
    setBusy(true);
    setError("");
    try {
      const result = await action();
      if (done) setNotice(done(result));
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
    try {
      const result = await action();
      if (result.situacao === "ESTORNO_PROCESSANDO") {
        setNotice("Estorno solicitado ao Asaas. A contratação permanece ativa até a confirmação da devolução.");
        hiring.reload();
      } else {
        setFinished(result.situacao === "ESTORNADO"
          ? "O Asaas confirmou o estorno. A contratação foi encerrada."
          : "A contratação foi cancelada sem estorno, conforme a regra de prazo. O repasse ao músico será processado.");
      }
    } catch (e) {
      setError(errorMessage(e));
      hiring.reload();
    } finally {
      setBusy(false);
    }
  }

  const title = "Contratação";
  if (finished) return <Secondary title={title} subtitle="" onBack={onBack}><div className="confirm-card hiring"><p className="notice success" role="status">{finished}</p><button className="secondary" onClick={onBack}>Voltar aos eventos</button></div></Secondary>;
  if (hiring.error) return <Secondary title={title} subtitle="" onBack={onBack}><ErrorState message={hiring.error} onRetry={hiring.reload}/></Secondary>;
  if (!hiring.data) return <Secondary title={title} subtitle="" onBack={onBack}><Loading/></Secondary>;

  const { papel, evento, contratante, musico, pagamento, avaliou, cancelamento, naoComparecimento } = hiring.data;
  const isContractor = papel === "contratante";
  const other = isContractor ? musico : contratante;
  const started = new Date(evento.inicio) <= new Date();
  const concluded = evento.status === "CONCLUIDO";
  const active = evento.status === "CONTRATADO";
  const refundUnresolved = pagamento?.refundStatus === "PROCESSANDO" || pagamento?.refundStatus === "NEGADO";

  function cancel() {
    const aviso = isContractor
      ? cancelamento.reembolso
        ? "Cancelar a contratação e solicitar estorno integral? A devolução será confirmada pelo Asaas."
        : "Faltam menos de 24h para o evento. Ao cancelar agora, não há devolução: o cachê será repassado ao músico. Confirmar?"
      : "Desistir deste show e solicitar estorno integral? O evento voltará a receber candidatos após a confirmação da devolução.";
    if (!window.confirm(aviso)) return;
    void runCancellation(() => cancelHiring(evento.id));
  }

  const parties = [
    { mine: isContractor, done: evento.confirmacaoContratante, icon: "user", title: "Confirmação do contratante" },
    { mine: !isContractor, done: evento.confirmacaoMusico, icon: "music", title: "Confirmação do músico" },
  ];

  return <Secondary title={title} subtitle={evento.titulo} onBack={onBack}>
    <div className="confirm-card hiring">
      <EventStatusPill status={evento.status}/>
      <h2>{evento.titulo}</h2>
      <p>{formatDateTime(evento.inicio)} · {formatDuration(evento.duracaoMinutos)} · {evento.tipoEvento} · {evento.estilosMusicais.join(", ")} · {evento.formacao} · {evento.somDisponivel ? "som no local" : "sem som no local"}</p>

      <div className="hiring-grid">
        <section>
          <h3>Local</h3>
          <p><Icon name="pin" size={15}/> {evento.endereco ?? "Endereço não informado"}</p>
          <p className="muted">{evento.cidade}, {evento.uf}</p>
        </section>
        <section>
          <h3>{isContractor ? "Músico contratado" : "Contratante"}</h3>
          {other ? <div className="mini-artist"><img src={other.fotoPerfilUrl} alt=""/><div><b>{other.nome}</b><span><a href={`https://wa.me/55${other.telefone}`} target="_blank" rel="noreferrer">{maskPhone(other.telefone)}</a></span></div></div> : <p className="muted">Não disponível.</p>}
        </section>
        <section>
          <h3>Valores</h3>
          {pagamento ? <>
            <p><span>Cachê do músico</span><b>{formatCurrency(pagamento.cache)}</b></p>
            <p><span>Taxa de serviço</span><b>{formatCurrency(pagamento.comissao)}</b></p>
            <p><span>Total pago pelo contratante</span><b>{formatCurrency(pagamento.total)}</b></p>
            <p className="muted">{paymentLabels[pagamento.status]}{pagamento.repasseStatus ? ` · ${payoutLabels[pagamento.repasseStatus]}` : ""}</p>
            {pagamento.refundStatus === "PROCESSANDO" && <p className="muted" role="status">Estorno em processamento no Asaas. A devolução ainda não foi confirmada.</p>}
            {pagamento.refundStatus === "NEGADO" && <p className="form-error" role="alert">O estorno anterior não foi concluído. A contratação continua ativa; consulte o motivo no Asaas antes de tentar novamente.</p>}
          </> : <p className="muted">Sem pagamento registrado.</p>}
        </section>
      </div>

      {active && <>
        <h3 className="section-heading">Confirmação do show</h3>
        <p className="muted">Após o evento, cada parte confirma pelo próprio acesso. Com as duas confirmações, o cachê é repassado ao músico; com apenas uma, o repasse acontece automaticamente após 7 dias.</p>
        <div className="ok-grid">{parties.map((party) => <div key={party.title} className={party.done ? "done" : ""}>
          <Icon name={party.icon} size={28}/>
          <h3>{party.title}</h3>
          {party.done && <p>Confirmado.</p>}
          {!party.done && !party.mine && <p>Aguardando a confirmação da outra parte.</p>}
          {!party.done && party.mine && (refundUnresolved
            ? <p>A confirmação fica suspensa até a resolução do estorno.</p>
            : started
              ? <button className="primary" disabled={busy} onClick={() => run(() => confirmCompletion(evento.id))}>{busy ? "Confirmando..." : "Confirmar conclusão"}</button>
              : <p>Disponível após o início do evento.</p>)}
        </div>)}</div>
      </>}

      {concluded && !avaliou && <div className="rating-form">
        <h3>Como foi a experiência?</h3>
        <div className="rating-picker" role="radiogroup" aria-label="Nota de 1 a 5">{[1, 2, 3, 4, 5].map((star) => <button key={star} role="radio" aria-checked={star === rating} aria-label={`${star} ${star === 1 ? "estrela" : "estrelas"}`} className={star <= rating ? "selected" : ""} onClick={() => setRating(star)}><Icon name="star" size={28}/></button>)}</div>
        <label className="field"><span>Comentário (opcional)</span><textarea value={comment} maxLength={1000} onChange={(e) => setComment(e.target.value)} placeholder={isContractor ? "Conte como foi trabalhar com este profissional..." : "Conte como foi tocar neste evento..."}/></label>
        <button className="primary" disabled={!rating || busy} onClick={() => run(() => reviewEvent(evento.id, rating, comment))}>{busy ? "Enviando..." : "Enviar avaliação"}</button>
      </div>}
      {concluded && avaliou && <p className="notice success" role="status">Avaliação enviada. Obrigado!</p>}

      {naoComparecimento.permitido && <div className="cancel-box">
        <p className="muted">O músico não apareceu? Enquanto ele não confirmar o show, você pode registrar o não comparecimento e solicitar estorno integral.</p>
        <button className="danger-btn" disabled={busy} onClick={() => {
          if (!window.confirm("Registrar que o músico não compareceu e solicitar estorno? A devolução será confirmada pelo Asaas.")) return;
          void runCancellation(() => reportNoShow(evento.id));
        }}>Músico não compareceu</button>
      </div>}

      {cancelamento.permitido && <div className="cancel-box">
        <p className="muted">{isContractor
          ? (cancelamento.reembolso ? "Até 24h antes do evento, é possível solicitar estorno integral. A contratação termina quando o Asaas confirmar a devolução." : "Faltam menos de 24h: ao cancelar, o cachê é repassado ao músico.")
          : "Ao desistir, o estorno é solicitado. Após a confirmação da devolução, o evento volta a receber candidatos."}</p>
        <button className="danger-btn" disabled={busy} onClick={cancel}>{isContractor ? "Cancelar contratação" : "Desistir do show"}</button>
      </div>}

      {notice && <p className="notice success" role="status">{notice}</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
    </div>
  </Secondary>;
}
