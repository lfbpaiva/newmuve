import { AppError } from "../domain/errors.ts";
import type { AsaasGateway } from "../services/ports.ts";

const indisponivel = () =>
  new AppError(502, "PAGAMENTO_INDISPONIVEL", "Não foi possível falar com o serviço de pagamentos. Tente novamente em instantes.");

// Cliente da API v3 da Asaas. A chave fica apenas nas variáveis de ambiente do servidor.
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
      });
    } catch (error) {
      console.error(`Asaas ${method} ${path}: falha de rede`, error);
      throw indisponivel();
    }
    if (response.status === 404 && options.allowNotFound) return null;
    if (!response.ok) {
      // O detalhe do erro fica no log do servidor; o cliente recebe uma mensagem genérica.
      console.error(`Asaas ${method} ${path}: HTTP ${response.status}`, await response.text().catch(() => ""));
      throw indisponivel();
    }
    return (await response.json()) as T;
  }

  const paymentPath = (paymentId: string) => `/payments/${encodeURIComponent(paymentId)}`;

  return {
    async createCustomer(customer) {
      const created = await request<{ id: string }>("POST", "/customers", { ...customer, notificationDisabled: true });
      return created!.id;
    },

    async createPixCharge(charge) {
      const created = await request<{ id: string }>("POST", "/payments", { ...charge, billingType: "PIX" });
      return created!.id;
    },

    async getPixQrCode(paymentId) {
      const qrCode = await request<{ payload: string; encodedImage: string }>("GET", `${paymentPath(paymentId)}/pixQrCode`);
      return { payload: qrCode!.payload, encodedImage: qrCode!.encodedImage };
    },

    async getPayment(paymentId) {
      const payment = await request<{ status: string; value: number }>("GET", paymentPath(paymentId), undefined, { allowNotFound: true });
      return payment && { status: payment.status, value: payment.value };
    },

    async cancelCharge(paymentId) {
      await request("DELETE", paymentPath(paymentId), undefined, { allowNotFound: true });
    },

    // Sem "value": estorno integral.
    async refundPayment(paymentId) {
      await request("POST", `${paymentPath(paymentId)}/refund`, { description: "Contratação cancelada no Muve" });
    },

    async transferPix(transfer) {
      const created = await request<{ id: string; status: string }>("POST", "/transfers", transfer);
      return { id: created!.id, status: created!.status };
    },
  };
}
