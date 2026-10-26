import { EMAIL_SUPORTE } from "../../../shared/dominio.ts";
import { AppError } from "../domain/errors.ts";
import type { AsaasGateway, AsaasPayment } from "../services/ports.ts";

const indisponivel = () =>
  new AppError(502, "PAGAMENTO_INDISPONIVEL", "Não foi possível falar com o serviço de pagamentos. Tente novamente em instantes.");
const respostaInvalida = () =>
  new AppError(502, "PAGAMENTO_RESPOSTA_INVALIDA", "O serviço de pagamentos respondeu de forma inesperada. Tente novamente.");

export function createAsaasGateway(config: { apiUrl: string; apiKey: string | undefined }): AsaasGateway {
  async function request<T>(method: string, path: string, body?: unknown, options: { allowNotFound?: boolean } = {}): Promise<T | null> {
    if (!config.apiKey) {
      throw new AppError(503, "PAGAMENTO_NAO_CONFIGURADO", "Os pagamentos ainda não foram configurados nesta instalação.");
    }
    let response: Response;
    try {
      response = await fetch(`${config.apiUrl}${path}`, {
        method,
        headers: { access_token: config.apiKey, "Content-Type": "application/json", "User-Agent": "muve-api" },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
      });
    } catch (error) {
      console.error(`Asaas ${method} ${path}: falha de rede`, error instanceof Error ? error.name : "erro desconhecido");
      throw indisponivel();
    }
    if (response.status === 404 && options.allowNotFound) return null;
    if (!response.ok) {
      const detail = await response.json().catch(() => null) as { errors?: Array<{ code?: string; description?: string }> } | null;
      console.error(`Asaas ${method} ${path}: HTTP ${response.status}`, detail?.errors?.map((item) => `${item.code}: ${item.description}`) ?? []);
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
      for (const delayMs of [0, 1_000, 2_000]) {
        if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
        try {
          const qrCode = await request<{ payload: string; encodedImage: string }>("GET", `${paymentPath(paymentId)}/pixQrCode`);
          if (!qrCode || typeof qrCode.payload !== "string" || !qrCode.payload || typeof qrCode.encodedImage !== "string" || !qrCode.encodedImage) {
            console.error("Asaas GET /payments/:id/pixQrCode: QR Code incompleto");
            throw respostaInvalida();
          }
          return { payload: qrCode.payload, encodedImage: qrCode.encodedImage };
        } catch (error) {
          if (!(error instanceof AppError) || error.code !== "PAGAMENTO_QR_INDISPONIVEL" || delayMs === 2_000) throw error;
        }
      }
      throw respostaInvalida();
    },

    async getPayment(paymentId) {
      const payment = await request<AsaasPayment>("GET", paymentPath(paymentId), undefined, { allowNotFound: true });
      return payment && { status: payment.status, value: payment.value, refunds: payment.refunds };
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

    async getTransferStatus(transferId) {
      const transfer = await request<{ status: string }>("GET", `/transfers/${encodeURIComponent(transferId)}`, undefined, { allowNotFound: true });
      return transfer?.status ?? null;
    },
  };
}
