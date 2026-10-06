import { useCallback, useEffect, useState } from "react";
import { ErrorState, Loading } from "../../components/states";
import { Icon, Secondary } from "../../components/ui";
import { useAsync } from "../../hooks/useAsync";
import { errorMessage } from "../../services/api";
import { fetchCheckoutStatus, fetchEvent, startCheckout, type Checkout } from "../../services/events";
import { formatCountdown, formatCurrency, formatDateTime } from "../../utils/format";

const POLLING_INTERVAL_MS = 5000;

interface Props {
  eventId: string;
  candidateId: string;
  onBack: () => void;
  onPaid: (eventId: string) => void;
}

const secondsUntil = (iso: string) => Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 1000));

export default function CheckoutScreen({ eventId, candidateId, onBack, onPaid }: Props) {
  const event = useAsync(`checkout-event:${eventId}`, () => fetchEvent(eventId));
  const [checkout, setCheckout] = useState<Checkout | null>(null);
  const [error, setError] = useState("");
  const [generating, setGenerating] = useState(true);
  const [seconds, setSeconds] = useState(0);
  const [toast, setToast] = useState("");

  // Gera a cobrança na API (ou recupera a que ainda está válida para este candidato).
  const load = useCallback(
    () =>
      startCheckout(eventId, candidateId)
        .then((created) => {
          setCheckout(created);
          setSeconds(secondsUntil(created.expiraEm));
        })
        .catch((e: unknown) => setError(errorMessage(e)))
        .finally(() => setGenerating(false)),
    [eventId, candidateId],
  );

  useEffect(() => {
    void load();
  }, [load]);

  function generate() {
    setGenerating(true);
    setError("");
    void load();
  }

  const expiraEm = checkout?.expiraEm;
  useEffect(() => {
    if (!expiraEm) return;
    const timer = window.setInterval(() => setSeconds(secondsUntil(expiraEm)), 1000);
    return () => window.clearInterval(timer);
  }, [expiraEm]);

  // A API confere a cobrança na Asaas a cada consulta: funciona mesmo que a
  // notificação (webhook) atrase. Ao expirar, a última consulta cancela a cobrança.
  const waiting = checkout?.status === "PENDENTE";
  useEffect(() => {
    if (!waiting) return;
    const poll = window.setInterval(async () => {
      const latest = await fetchCheckoutStatus(eventId).catch(() => null);
      if (latest?.status === "PAGO") onPaid(eventId);
      else if (latest && latest.status !== "PENDENTE") setCheckout(latest);
    }, POLLING_INTERVAL_MS);
    return () => window.clearInterval(poll);
  }, [waiting, eventId, onPaid]);

  async function copy() {
    if (!checkout?.pixCopiaCola) return;
    try {
      await navigator.clipboard.writeText(checkout.pixCopiaCola);
      setToast("Código Pix copiado.");
    } catch {
      setToast("Não foi possível copiar. Selecione o código manualmente.");
    }
    window.setTimeout(() => setToast(""), 2500);
  }

  const expired = Boolean(checkout) && (seconds === 0 || checkout?.status !== "PENDENTE");

  return <Secondary title="Pagamento via Pix" subtitle="Garanta a contratação do músico selecionado." onBack={onBack}>
    {toast && <div className="toast" role="status"><Icon name="check"/>{toast}</div>}
    <div className="checkout-grid">
      <section className={`payment-card ${expired ? "expired" : ""}`}>
        <span className="secure"><Icon name="check" size={16}/> Pagamento processado pela Asaas</span>
        {generating && <Loading label="Gerando cobrança Pix..."/>}
        {!generating && error && <ErrorState message={error} onRetry={generate}/>}
        {!generating && !error && checkout && <>
          <h2>{expired ? "Cobrança expirada" : "Escaneie o QR Code"}</h2>
          <p>{expired ? "Gere uma nova cobrança para continuar." : "Abra o app do seu banco e escolha pagar com Pix."}</p>
          <div className="qr">{checkout.pixQrCode && <img src={`data:image/png;base64,${checkout.pixQrCode}`} alt="QR Code Pix para pagamento"/>}</div>
          <div className="timer" role="timer"><Icon name="clock" size={18}/> Este código expira em <b>{formatCountdown(seconds)}</b></div>
          {expired
            ? <button className="primary wide" onClick={generate}>Gerar nova cobrança</button>
            : <>
              <label className="field pix-code"><span>Pix copia e cola</span><textarea readOnly rows={3} value={checkout.pixCopiaCola ?? ""} onFocus={(e) => e.target.select()}/></label>
              <button className="secondary wide" onClick={copy}>Copiar código Pix</button>
            </>}
        </>}
      </section>
      <aside className="order">
        <h3>Resumo</h3>
        {event.data ? <>
          <p className="subtitle">{event.data.titulo}</p><hr/>
          <p><span>Data</span><b>{formatDateTime(event.data.inicio)}</b></p>
          <p><span>Local</span><b>{event.data.cidade}, {event.data.uf}</b></p>
          <p><span>Cachê do músico</span><b>{formatCurrency(checkout?.cache ?? event.data.cache)}</b></p>
          {checkout && <p><span>Taxa de serviço (10%)</span><b>{formatCurrency(checkout.comissao)}</b></p>}
          <hr/>
          <p className="total"><span>Total</span><b>{formatCurrency(checkout?.valor ?? event.data.cache)}</b></p>
          <small className="muted">O cachê fica retido na plataforma e só é repassado ao músico depois que as duas partes confirmarem o show. A taxa de serviço cobre essa garantia: se o músico não comparecer, você recebe o valor integral de volta; se cancelar com mais de 24h de antecedência, também.</small>
        </> : <p className="muted">{event.error ?? "Carregando..."}</p>}
        {waiting && !expired && <span className="payment-wait" role="status"><Icon name="clock"/>Aguardando a confirmação do pagamento</span>}
      </aside>
    </div>
  </Secondary>;
}
