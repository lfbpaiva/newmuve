import { afterEach, describe, expect, it, vi } from "vitest";
import { createAsaasGateway } from "./asaas.ts";

const gateway = () => createAsaasGateway({ apiUrl: "https://api-sandbox.asaas.com/v3", apiKey: "$aact_test" });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Asaas Sandbox gateway", () => {
  it("distingue recusa de estorno de dados de cobrança", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ errors: [{ code: "invalid_action", description: "Saldo insuficiente" }] }, { status: 400 })));
    await expect(gateway().refundPayment("pay_test")).rejects.toMatchObject({ code: "ESTORNO_SALDO_INSUFICIENTE", status: 409 });
  });

  it("não atribui erros de cancelamento ou consulta ao cadastro do cliente", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ errors: [{ code: "invalid_action" }] }, { status: 400 })));
    await expect(gateway().cancelCharge("pay_test")).rejects.toMatchObject({ code: "CANCELAMENTO_COBRANCA_RECUSADO", status: 409 });
    await expect(gateway().getPayment("pay_test")).rejects.toMatchObject({ code: "PAGAMENTO_CONSULTA_RECUSADA", status: 502 });
  });
  it("autentica, cria cobrança Pix com valor do servidor e recupera QR Code", async () => {
    const calls: Array<{ path: string; method: string; body: Record<string, unknown> | null; token: string | null }> = [];
    vi.stubGlobal("fetch", vi.fn(async (input: string, init: RequestInit) => {
      const path = new URL(input).pathname;
      calls.push({ path, method: init.method!, body: init.body ? JSON.parse(String(init.body)) : null, token: new Headers(init.headers).get("access_token") });
      if (path === "/v3/customers") return Response.json({ id: "cus_test" });
      if (path === "/v3/payments") return Response.json({ id: "pay_test" });
      if (path === "/v3/payments/pay_test/pixQrCode") return Response.json({ payload: "000201...", encodedImage: "base64" });
      throw new Error("rota inesperada");
    }));

    const asaas = gateway();
    const customer = await asaas.createCustomer({ name: "Teste", cpfCnpj: "24971563792", email: "teste@example.com", externalReference: "u1" });
    const payment = await asaas.createPixCharge({ customer, value: 550, dueDate: "2030-01-01", description: "Teste", externalReference: "e1" });
    const qrCode = await asaas.getPixQrCode(payment);

    expect(calls.map((call) => [call.path, call.method])).toEqual([
      ["/v3/customers", "POST"], ["/v3/payments", "POST"], ["/v3/payments/pay_test/pixQrCode", "GET"],
    ]);
    expect(calls.every((call) => call.token === "$aact_test")).toBe(true);
    expect(calls[1]?.body).toMatchObject({ customer: "cus_test", value: 550, dueDate: "2030-01-01", billingType: "PIX" });
    expect(qrCode).toEqual({ payload: "000201...", encodedImage: "base64" });
  });

  it.each([
    [400, "PAGAMENTO_DADOS_INVALIDOS", 422],
    [401, "PAGAMENTO_CREDENCIAIS_INVALIDAS", 503],
    [429, "PAGAMENTO_LIMITE", 503],
    [500, "PAGAMENTO_INDISPONIVEL", 502],
  ])("distingue HTTP %i da Asaas", async (httpStatus, code, status) => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ errors: [{ code: "invalid_mobilePhone" }] }, { status: httpStatus })));

    await expect(gateway().createCustomer({ name: "Teste", cpfCnpj: "24971563792", email: "teste@example.com", externalReference: "u1" }))
      .rejects.toMatchObject({ code, status });
  });

  it("distingue indisponibilidade de rede e QR Code incompleto", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("falha simulada"); }));
    await expect(gateway().getPixQrCode("pay_test")).rejects.toMatchObject({ code: "PAGAMENTO_INDISPONIVEL" });

    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ payload: "000201..." })));
    await expect(gateway().getPixQrCode("pay_test")).rejects.toMatchObject({ code: "PAGAMENTO_RESPOSTA_INVALIDA" });
  });

  it("repete brevemente a leitura do QR quando a Asaas responde invalid_action", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ errors: [{ code: "invalid_action" }] }, { status: 400 }))
      .mockResolvedValueOnce(Response.json({ payload: "000201...", encodedImage: "base64" }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(gateway().getPixQrCode("pay_test")).resolves.toEqual({ payload: "000201...", encodedImage: "base64" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
