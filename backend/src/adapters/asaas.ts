import { EMAIL_SUPORTE } from "../../../shared/dominio.ts";
import { AppError } from "../domain/errors.ts";
import { COBRANCA_REMOVIDA_NA_ASAAS, type AsaasGateway, type AsaasPayment, type AsaasTransfer, type ContextoAsaas } from "../services/ports.ts";

const TRANSFER_PAGE_SIZE = 100;
const TRANSFER_SEARCH_PAGES = 5;
const REQUEST_TIMEOUT_MS = 15_000;
export const PIX_QR_TEMPO_POR_TENTATIVA_MS = 20_000;
export const PIX_QR_INTERVALO_MS = 2_000;
export const PIX_QR_TEMPO_MINIMO_MS = 5_000;
export const PIX_QR_TENTATIVAS_MAXIMAS = 3;
export const PIX_QR_PRAZO_PADRAO_MS = 38_000;
const COBRANCA_AGUARDANDO_PAGAMENTO = ["PENDING", "OVERDUE"];

type ResultadoDaRequisicao = "ok" | "tempo_esgotado" | "rede" | "http" | "resposta_invalida";

export interface RegistroDaAsaas {
  origem: "asaas";
  correlacao: string | null;
  etapa: string | null;
  tentativa: number | null;
  metodo: string;
  rota: string;
  resultado: ResultadoDaRequisicao;
  httpStatus: number | null;
  codigos: string[];
  descricoes: string[];
  duracaoMs: number;
}

export const DESCRICAO_TAMANHO_MAXIMO = 200;
export const DESCRICOES_MAXIMAS = 3;

export function sanitizarDescricao(texto: string): string {
  const semControle = Array.from(texto, (caractere) => (caractere.charCodeAt(0) < 32 || caractere.charCodeAt(0) === 127 ? " " : caractere)).join("");
  const limpo = semControle
    .replace(/\$aact_[A-Za-z0-9_$-]+/g, "[chave]")
    .replace(/eyJ[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*/g, "[token]")
    .replace(/\b(?:bearer|token|access_token|senha|password)\b\s*[:=]?\s*\S+/gi, "[credencial]")
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[email]")
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "[chave]")
    .replace(/\d[\d.\-/ ]{9,}\d/g, "[numero]")
    .replace(/[A-Za-z0-9+/_=-]{32,}/g, "[valor]")
    .replace(/\s+/g, " ")
    .trim();
  return limpo.length > DESCRICAO_TAMANHO_MAXIMO ? `${limpo.slice(0, DESCRICAO_TAMANHO_MAXIMO)}…` : limpo;
}

function descricoesDoErro(corpo: unknown): string[] {
  if (typeof corpo !== "object" || corpo === null) return [];
  const { errors, message, error } = corpo as { errors?: unknown; message?: unknown; error?: unknown };
  const textos = Array.isArray(errors)
    ? errors.map((item) => {
      if (typeof item === "string") return item;
      if (typeof item !== "object" || item === null) return null;
      const { description, message: mensagem } = item as { description?: unknown; message?: unknown };
      return typeof description === "string" ? description : typeof mensagem === "string" ? mensagem : null;
    })
    : [typeof message === "string" ? message : typeof error === "string" ? error : null];
  return textos.filter((texto): texto is string => typeof texto === "string" && texto.trim().length > 0).slice(0, DESCRICOES_MAXIMAS).map(sanitizarDescricao);
}

const registrarPadrao = (registro: RegistroDaAsaas) => {
  const linha = `Asaas ${JSON.stringify(registro)}`;
  if (registro.resultado === "ok") console.info(linha);
  else console.error(linha);
};

class TempoEsgotado extends Error {
  override name = "TimeoutError";
}

const tempoEsgotado = (erro: unknown) => erro instanceof TempoEsgotado || (erro instanceof Error && (erro.name === "TimeoutError" || erro.name === "AbortError"));
type TipoDaFalha = "tempo_esgotado" | "rede" | "http";

class FalhaDaAsaas extends AppError {
  readonly tipo: TipoDaFalha;
  readonly httpStatus: number | null;

  constructor(tipo: TipoDaFalha, httpStatus: number | null) {
    super(502, "PAGAMENTO_INDISPONIVEL", "Não foi possível falar com o serviço de pagamentos. Tente novamente em instantes.");
    this.tipo = tipo;
    this.httpStatus = httpStatus;
  }
}

const falhaTransitoria = (erro: unknown) => erro instanceof FalhaDaAsaas && (erro.tipo !== "http" || (erro.httpStatus ?? 0) >= 500);
const qrAindaIndisponivel = (erro: unknown) => erro instanceof AppError && erro.code === "PAGAMENTO_QR_INDISPONIVEL";
export const VERIFICACAO_DO_QR_TEMPO_LIMITE_MS = 5_000;

type RemoteTransfer = { id: string; status: string; externalReference?: string | null; value: number };
type RemotePayment = AsaasPayment & { deleted?: boolean };
type RemoteTransferPage = { data?: unknown; hasMore?: unknown; totalCount?: unknown; offset?: unknown; limit?: unknown };

const toTransfer = (transfer: RemoteTransfer): AsaasTransfer => ({
  id: transfer.id,
  status: transfer.status,
  externalReference: transfer.externalReference ?? null,
  value: transfer.value,
});

const respostaInvalida = () =>
  new AppError(502, "PAGAMENTO_RESPOSTA_INVALIDA", "O serviço de pagamentos respondeu de forma inesperada. Tente novamente.");
const buscaIncompleta = (motivo: string) => {
  console.error("Busca de transferências na Asaas incompleta:", motivo);
  return new AppError(502, "PAGAMENTO_BUSCA_INCOMPLETA", "Não foi possível comprovar que a busca de transferências na Asaas percorreu todas as páginas; a conferência precisa ser refeita.");
};
const esperar = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const isRemoteTransfer = (item: unknown): item is RemoteTransfer =>
  typeof item === "object" && item !== null
  && typeof (item as RemoteTransfer).id === "string" && (item as RemoteTransfer).id.length > 0
  && typeof (item as RemoteTransfer).status === "string";

export function createAsaasGateway(config: { apiUrl: string; apiKey: string | undefined; registrar?: (registro: RegistroDaAsaas) => void }): AsaasGateway {
  const registrar = config.registrar ?? registrarPadrao;

  async function comPrazo<T>(ms: number, executar: (sinal: AbortSignal) => Promise<T>): Promise<T> {
    const controle = new AbortController();
    let temporizador: ReturnType<typeof setTimeout> | undefined;
    const limite = new Promise<never>((_resolver, rejeitar) => {
      temporizador = setTimeout(() => {
        const erro = new TempoEsgotado("tempo esgotado");
        controle.abort(erro);
        rejeitar(erro);
      }, ms);
    });
    try {
      return await Promise.race([executar(controle.signal), limite]);
    } finally {
      clearTimeout(temporizador);
    }
  }

  async function request<T>(method: string, path: string, body?: unknown, options: { allowNotFound?: boolean; timeoutMs?: number; contexto?: ContextoAsaas } = {}): Promise<T | null> {
    if (!config.apiKey) {
      throw new AppError(503, "PAGAMENTO_NAO_CONFIGURADO", "Os pagamentos ainda não foram configurados nesta instalação.");
    }
    const apiKey = config.apiKey;
    const inicio = Date.now();
    const registrarResultado = (resultado: ResultadoDaRequisicao, httpStatus: number | null = null, codigos: string[] = [], descricoes: string[] = []) =>
      registrar({
        origem: "asaas",
        correlacao: options.contexto?.correlacao ?? null,
        etapa: options.contexto?.etapa ?? null,
        tentativa: options.contexto?.tentativa ?? null,
        metodo: method,
        rota: path.split("?")[0],
        resultado,
        httpStatus,
        codigos,
        descricoes,
        duracaoMs: Date.now() - inicio,
      });

    let resposta: { response: Response; corpo: unknown; jsonValido: boolean };
    try {
      resposta = await comPrazo(options.timeoutMs ?? REQUEST_TIMEOUT_MS, async (signal) => {
        const response = await fetch(`${config.apiUrl}${path}`, {
          method,
          headers: { access_token: apiKey, "Content-Type": "application/json", "User-Agent": "muve-api" },
          body: body === undefined ? undefined : JSON.stringify(body),
          signal,
        });
        if (response.status === 204 || (response.status === 404 && options.allowNotFound)) return { response, corpo: null, jsonValido: true };
        try {
          return { response, corpo: await response.json(), jsonValido: true };
        } catch (error) {
          if (tempoEsgotado(error)) throw error;
          return { response, corpo: null, jsonValido: false };
        }
      });
    } catch (error) {
      const tipo = tempoEsgotado(error) ? "tempo_esgotado" : "rede";
      registrarResultado(tipo);
      throw new FalhaDaAsaas(tipo, null);
    }

    const { response, corpo, jsonValido } = resposta;
    if (response.status === 404 && options.allowNotFound) {
      registrarResultado("ok", 404);
      return null;
    }
    if (!response.ok) {
      const listaDeErros = typeof corpo === "object" && corpo !== null && Array.isArray((corpo as { errors?: unknown }).errors) ? (corpo as { errors: unknown[] }).errors : [];
      const detail = { errors: listaDeErros.filter((item): item is { code?: string; description?: string } => typeof item === "object" && item !== null) };
      const codigos = (detail?.errors ?? []).map((item) => item.code ?? "").filter(Boolean);
      registrarResultado("http", response.status, codigos, descricoesDoErro(corpo));
      if (path.endsWith("/pixQrCode") && response.status === 400 && detail?.errors?.some((item) => item.code === "invalid_action")) {
        throw new AppError(503, "PAGAMENTO_QR_INDISPONIVEL", "O QR Code Pix ainda não está disponível. Tente novamente em instantes.");
      }
      if (path.endsWith("/refund") && (response.status === 400 || response.status === 422)) {
        const insufficient = detail?.errors?.some((item) => /saldo|balance/i.test(`${item.code ?? ""} ${item.description ?? ""}`));
        throw new AppError(409, insufficient ? "ESTORNO_SALDO_INSUFICIENTE" : "ESTORNO_RECUSADO",
          insufficient
            ? "O Asaas recusou o estorno por saldo insuficiente. A contratação continua ativa; regularize o saldo do Sandbox e tente novamente."
            : "O Asaas recusou o estorno. A contratação continua ativa; confira a situação da cobrança e tente novamente.");
      }
      if (path.endsWith("/refund") && response.status === 404) {
        throw new AppError(409, "ESTORNO_COBRANCA_NAO_ENCONTRADA", `A cobrança não foi encontrada no Asaas. A contratação continua ativa; escreva para ${EMAIL_SUPORTE}.`);
      }
      if (method === "DELETE" && (response.status === 400 || response.status === 422)) {
        throw new AppError(409, "CANCELAMENTO_COBRANCA_RECUSADO", "A cobrança não pôde ser cancelada no Asaas. Atualize o pagamento antes de tentar novamente.");
      }
      if (response.status === 401 || response.status === 403) {
        throw new AppError(503, "PAGAMENTO_CREDENCIAIS_INVALIDAS", `O serviço de pagamentos não está configurado corretamente. Escreva para ${EMAIL_SUPORTE}.`);
      }
      if (response.status === 400 || response.status === 422) {
        if (method === "GET" && path.startsWith("/payments/")) {
          throw new AppError(502, "PAGAMENTO_CONSULTA_RECUSADA", "Não foi possível verificar a cobrança no Asaas. Tente novamente em instantes.");
        }
        if (method === "POST" && (path === "/payments" || path === "/subscriptions") && detail?.errors?.some((item) => item.code === "invalid_customer")) {
          throw new AppError(502, "PAGAMENTO_CLIENTE_INVALIDO", "O cadastro de pagamento não foi aceito. Tente novamente em instantes.");
        }
        throw new AppError(422, "PAGAMENTO_DADOS_INVALIDOS", "O serviço de pagamentos recusou os dados da cobrança. Revise seu perfil e tente novamente.");
      }
      if (response.status === 429) {
        throw new AppError(503, "PAGAMENTO_LIMITE", "O serviço de pagamentos está ocupado. Aguarde alguns instantes e tente novamente.");
      }
      throw new FalhaDaAsaas("http", response.status);
    }
    if (response.status === 204) {
      registrarResultado("ok", 204);
      return null;
    }
    if (!jsonValido) {
      registrarResultado("resposta_invalida", response.status);
      throw respostaInvalida();
    }
    registrarResultado("ok", response.status);
    return corpo as T;
  }

  const paymentPath = (paymentId: string) => `/payments/${encodeURIComponent(paymentId)}`;
  const requireId = (id: unknown, operation: string): string => {
    if (typeof id === "string" && id.length > 0) return id;
    console.error(`Asaas ${operation}: resposta sem identificador`);
    throw respostaInvalida();
  };

  return {
    async createCustomer(customer, contexto) {
      const created = await request<{ id: string }>("POST", "/customers", { ...customer, notificationDisabled: true }, { timeoutMs: contexto?.timeoutMs, contexto: { ...contexto, etapa: "cliente" } });
      return requireId(created?.id, "POST /customers");
    },

    async createPixCharge(charge, contexto) {
      const created = await request<{ id: string }>("POST", "/payments", { ...charge, billingType: "PIX" }, { timeoutMs: contexto?.timeoutMs, contexto: { ...contexto, etapa: "cobranca" } });
      return requireId(created?.id, "POST /payments");
    },

    async getPixQrCode(paymentId, opcoes = {}) {
      const prazo = opcoes.prazo ?? Date.now() + PIX_QR_PRAZO_PADRAO_MS;
      const contexto = (etapa: string, tentativa: number) => ({ correlacao: opcoes.correlacao, etapa, tentativa });
      const situacaoDaCobranca = async (tentativa: number): Promise<"AGUARDANDO" | "ENCERRADA" | "INCONCLUSIVA"> => {
        const restanteMs = prazo - Date.now();
        if (restanteMs <= 0) return "INCONCLUSIVA";
        const cobranca = await request<RemotePayment>("GET", paymentPath(paymentId), undefined, {
          allowNotFound: true,
          timeoutMs: Math.min(VERIFICACAO_DO_QR_TEMPO_LIMITE_MS, restanteMs),
          contexto: contexto("verificacao_qr", tentativa),
        }).catch(() => undefined);
        if (cobranca === undefined) return "INCONCLUSIVA";
        if (cobranca === null || cobranca.deleted === true || !COBRANCA_AGUARDANDO_PAGAMENTO.includes(cobranca.status)) return "ENCERRADA";
        return "AGUARDANDO";
      };
      let ultimaFalha: unknown = null;
      for (let tentativa = 1; tentativa <= PIX_QR_TENTATIVAS_MAXIMAS; tentativa++) {
        if (tentativa > 1) {
          if (prazo - Date.now() - PIX_QR_INTERVALO_MS < PIX_QR_TEMPO_MINIMO_MS) break;
          await esperar(PIX_QR_INTERVALO_MS);
        }
        const restanteMs = prazo - Date.now();
        if (restanteMs < PIX_QR_TEMPO_MINIMO_MS) break;
        let qrCode: { payload: string; encodedImage: string } | null;
        try {
          qrCode = await request<{ payload: string; encodedImage: string }>("GET", `${paymentPath(paymentId)}/pixQrCode`, undefined, {
            timeoutMs: Math.min(PIX_QR_TEMPO_POR_TENTATIVA_MS, restanteMs),
            contexto: contexto("qr_code", tentativa),
          });
        } catch (error) {
          if (qrAindaIndisponivel(error)) {
            const situacao = await situacaoDaCobranca(tentativa);
            if (situacao === "ENCERRADA") throw new AppError(409, "PAGAMENTO_QR_RECUSADO", "Esta cobrança não pode mais ser paga. Gere uma nova cobrança.");
            if (situacao === "INCONCLUSIVA") throw new AppError(502, "PAGAMENTO_QR_INCONCLUSIVO", "Não foi possível confirmar a situação da cobrança. Tente novamente em instantes.");
            ultimaFalha = error;
            continue;
          }
          if (!falhaTransitoria(error)) throw error;
          ultimaFalha = error;
          continue;
        }
        if (!qrCode || typeof qrCode.payload !== "string" || !qrCode.payload || typeof qrCode.encodedImage !== "string" || !qrCode.encodedImage) {
          console.error(`Asaas ${JSON.stringify({ origem: "asaas", correlacao: opcoes.correlacao ?? null, etapa: "qr_code", tentativa, resultado: "qr_incompleto" })}`);
          throw respostaInvalida();
        }
        return { payload: qrCode.payload, encodedImage: qrCode.encodedImage };
      }
      throw ultimaFalha ?? new FalhaDaAsaas("tempo_esgotado", null);
    },

    async getPayment(paymentId, opcoes = {}) {
      const payment = await request<RemotePayment>("GET", paymentPath(paymentId), undefined, { allowNotFound: true, timeoutMs: opcoes.timeoutMs, contexto: { correlacao: opcoes.correlacao, etapa: opcoes.etapa ?? "consulta" } });
      if (!payment) return null;
      const removida = payment.deleted === true && COBRANCA_AGUARDANDO_PAGAMENTO.includes(payment.status);
      return { status: removida ? COBRANCA_REMOVIDA_NA_ASAAS : payment.status, value: payment.value, refunds: payment.refunds };
    },

    async cancelCharge(paymentId, opcoes = {}) {
      const resposta = await request<{ deleted?: unknown }>("DELETE", paymentPath(paymentId), undefined, { allowNotFound: true, timeoutMs: opcoes.timeoutMs, contexto: { correlacao: opcoes.correlacao, etapa: "remocao" } });
      return { removida: resposta === null || resposta.deleted === true };
    },

    async refundPayment(paymentId) {
      await request("POST", `${paymentPath(paymentId)}/refund`, { description: "Contratação cancelada no Muve" });
    },

    async transferPix(transfer) {
      const created = await request<{ id: string; status: string }>("POST", "/transfers", transfer);
      return { id: requireId(created?.id, "POST /transfers"), status: created?.status ?? "PENDING" };
    },

    async createSubscription(subscription) {
      const created = await request<{ id: string }>("POST", "/subscriptions", { ...subscription, billingType: "PIX", cycle: "MONTHLY" });
      return requireId(created?.id, "POST /subscriptions");
    },

    async listSubscriptionPayments(subscriptionId) {
      const page = await request<{ data: { id: string; status: string; dueDate: string }[] }>("GET", `/subscriptions/${encodeURIComponent(subscriptionId)}/payments`, undefined, { allowNotFound: true });
      return (page?.data ?? []).map((payment) => ({ id: payment.id, status: payment.status, dueDate: payment.dueDate }));
    },

    async cancelSubscription(subscriptionId) {
      await request("DELETE", `/subscriptions/${encodeURIComponent(subscriptionId)}`, undefined, { allowNotFound: true });
    },

    async getTransfer(transferId) {
      const transfer = await request<RemoteTransfer>("GET", `/transfers/${encodeURIComponent(transferId)}`, undefined, { allowNotFound: true });
      return transfer && toTransfer(transfer);
    },

    async findTransfersByReference(reference, createdSince, maxPages = TRANSFER_SEARCH_PAGES) {
      const iniciadaEm = new Date();
      const desde = new Date(createdSince.getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const vistas = new Set<string>();
      const encontradas: AsaasTransfer[] = [];
      let total: number | null = null;
      let offset = 0;
      for (let paginas = 1; paginas <= maxPages; paginas++) {
        const query = new URLSearchParams({ "dateCreated[ge]": desde, offset: String(offset), limit: String(TRANSFER_PAGE_SIZE) });
        const page = await request<RemoteTransferPage>("GET", `/transfers?${query}`);
        if (!page || !Array.isArray(page.data) || typeof page.hasMore !== "boolean") throw buscaIncompleta("página sem lista ou sem hasMore");
        if (page.offset !== offset || page.limit !== TRANSFER_PAGE_SIZE) throw buscaIncompleta("a Asaas não confirmou o offset e o limit pedidos");
        if (typeof page.totalCount !== "number" || !Number.isInteger(page.totalCount) || page.totalCount < 0) throw buscaIncompleta("página sem totalCount válido");
        if (total !== null && page.totalCount !== total) throw buscaIncompleta("o total de transferências mudou durante a busca");
        total = page.totalCount;
        if (page.data.length > TRANSFER_PAGE_SIZE || (page.hasMore && page.data.length !== TRANSFER_PAGE_SIZE)) throw buscaIncompleta("tamanho de página inconsistente");
        for (const item of page.data) {
          if (!isRemoteTransfer(item)) throw buscaIncompleta("transferência sem identificador ou situação");
          if (vistas.has(item.id)) throw buscaIncompleta("transferência repetida entre páginas");
          vistas.add(item.id);
          if (item.externalReference === reference) encontradas.push(toTransfer(item));
        }
        offset += page.data.length;
        if (!page.hasMore) {
          if (offset !== total || vistas.size !== total) throw buscaIncompleta("a quantidade lida não confere com o totalCount");
          return { encontradas, referencia: reference, desde, iniciadaEm, paginas, listadas: vistas.size };
        }
      }
      throw buscaIncompleta(`limite de ${maxPages} páginas atingido`);
    },
  };
}
