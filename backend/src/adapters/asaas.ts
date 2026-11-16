import { EMAIL_SUPORTE } from "../../../shared/dominio.ts";
import { AppError } from "../domain/errors.ts";
import { COBRANCA_REMOVIDA_NA_ASAAS, type AsaasGateway, type AsaasPayment, type AsaasTransfer } from "../services/ports.ts";

const TRANSFER_PAGE_SIZE = 100;
const TRANSFER_SEARCH_PAGES = 5;
const REQUEST_TIMEOUT_MS = 15_000;
const PIX_QR_ESPERAS_MS = [0, 1_000, 2_000];
const PIX_QR_TEMPO_POR_TENTATIVA_MS = 10_000;
const PIX_QR_PRAZO_TOTAL_MS = 20_000;
const COBRANCA_AGUARDANDO_PAGAMENTO = ["PENDING", "OVERDUE"];

type RemoteTransfer = { id: string; status: string; externalReference?: string | null; value: number };
type RemotePayment = AsaasPayment & { deleted?: boolean };
type RemoteTransferPage = { data?: unknown; hasMore?: unknown; totalCount?: unknown; offset?: unknown; limit?: unknown };

const toTransfer = (transfer: RemoteTransfer): AsaasTransfer => ({
  id: transfer.id,
  status: transfer.status,
  externalReference: transfer.externalReference ?? null,
  value: transfer.value,
});

const indisponivel = () =>
  new AppError(502, "PAGAMENTO_INDISPONIVEL", "Não foi possível falar com o serviço de pagamentos. Tente novamente em instantes.");
const respostaInvalida = () =>
  new AppError(502, "PAGAMENTO_RESPOSTA_INVALIDA", "O serviço de pagamentos respondeu de forma inesperada. Tente novamente.");
const buscaIncompleta = (motivo: string) => {
  console.error("Busca de transferências na Asaas incompleta:", motivo);
  return new AppError(502, "PAGAMENTO_BUSCA_INCOMPLETA", "Não foi possível comprovar que a busca de transferências na Asaas percorreu todas as páginas; a conferência precisa ser refeita.");
};
const falhaTransitoriaDoQr = (error: unknown) => error instanceof AppError && (error.code === "PAGAMENTO_QR_INDISPONIVEL" || error.code === "PAGAMENTO_INDISPONIVEL");
const esperar = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const isRemoteTransfer = (item: unknown): item is RemoteTransfer =>
  typeof item === "object" && item !== null
  && typeof (item as RemoteTransfer).id === "string" && (item as RemoteTransfer).id.length > 0
  && typeof (item as RemoteTransfer).status === "string";

export function createAsaasGateway(config: { apiUrl: string; apiKey: string | undefined }): AsaasGateway {
  async function request<T>(method: string, path: string, body?: unknown, options: { allowNotFound?: boolean; timeoutMs?: number } = {}): Promise<T | null> {
    if (!config.apiKey) {
      throw new AppError(503, "PAGAMENTO_NAO_CONFIGURADO", "Os pagamentos ainda não foram configurados nesta instalação.");
    }
    let response: Response;
    try {
      response = await fetch(`${config.apiUrl}${path}`, {
        method,
        headers: { access_token: config.apiKey, "Content-Type": "application/json", "User-Agent": "muve-api" },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(options.timeoutMs ?? REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      console.error(`Asaas ${method} ${path}: falha de rede`, error instanceof Error ? error.name : "erro desconhecido");
      throw indisponivel();
    }
    if (response.status === 404 && options.allowNotFound) return null;
    if (!response.ok) {
      const detail = await response.json().catch(() => null) as { errors?: Array<{ code?: string; description?: string }> } | null;
      console.error(`Asaas ${method} ${path}: HTTP ${response.status}`, detail?.errors?.map((item) => item.code) ?? []);
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
      throw indisponivel();
    }
    if (response.status === 204) return null;
    try {
      return (await response.json()) as T;
    } catch {
      console.error(`Asaas ${method} ${path}: resposta sem JSON válido`);
      throw respostaInvalida();
    }
  }

  const paymentPath = (paymentId: string) => `/payments/${encodeURIComponent(paymentId)}`;
  const requireId = (id: unknown, operation: string): string => {
    if (typeof id === "string" && id.length > 0) return id;
    console.error(`Asaas ${operation}: resposta sem identificador`);
    throw respostaInvalida();
  };

  return {
    async createCustomer(customer) {
      const created = await request<{ id: string }>("POST", "/customers", { ...customer, notificationDisabled: true });
      return requireId(created?.id, "POST /customers");
    },

    async createPixCharge(charge) {
      const created = await request<{ id: string }>("POST", "/payments", { ...charge, billingType: "PIX" });
      return requireId(created?.id, "POST /payments");
    },

    async getPixQrCode(paymentId) {
      const prazo = Date.now() + PIX_QR_PRAZO_TOTAL_MS;
      let ultimaFalha: unknown = null;
      for (const esperaMs of PIX_QR_ESPERAS_MS) {
        if (esperaMs && prazo - Date.now() <= esperaMs) break;
        if (esperaMs) await esperar(esperaMs);
        const restanteMs = prazo - Date.now();
        if (restanteMs <= 0) break;
        let qrCode: { payload: string; encodedImage: string } | null;
        try {
          qrCode = await request<{ payload: string; encodedImage: string }>("GET", `${paymentPath(paymentId)}/pixQrCode`, undefined, { timeoutMs: Math.min(PIX_QR_TEMPO_POR_TENTATIVA_MS, restanteMs) });
        } catch (error) {
          if (!falhaTransitoriaDoQr(error)) throw error;
          ultimaFalha = error;
          continue;
        }
        if (!qrCode || typeof qrCode.payload !== "string" || !qrCode.payload || typeof qrCode.encodedImage !== "string" || !qrCode.encodedImage) {
          console.error("Asaas GET /payments/:id/pixQrCode: QR Code incompleto");
          throw respostaInvalida();
        }
        return { payload: qrCode.payload, encodedImage: qrCode.encodedImage };
      }
      throw ultimaFalha ?? indisponivel();
    },

    async getPayment(paymentId) {
      const payment = await request<RemotePayment>("GET", paymentPath(paymentId), undefined, { allowNotFound: true });
      if (!payment) return null;
      const removida = payment.deleted === true && COBRANCA_AGUARDANDO_PAGAMENTO.includes(payment.status);
      return { status: removida ? COBRANCA_REMOVIDA_NA_ASAAS : payment.status, value: payment.value, refunds: payment.refunds };
    },

    async cancelCharge(paymentId) {
      await request("DELETE", paymentPath(paymentId), undefined, { allowNotFound: true });
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
