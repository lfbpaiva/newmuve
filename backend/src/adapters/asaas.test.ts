import { afterEach, describe, expect, it, vi } from "vitest";
import { createAsaasGateway } from "./asaas.ts";

const gateway = () => createAsaasGateway({ apiUrl: "https://api-sandbox.asaas.com/v3", apiKey: "$aact_test" });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Asaas Sandbox gateway", () => {
  it("reconhece cliente salvo inexistente e busca outro pelo documento e referência", async () => {
    const fetchMock = vi.fn(async (input: string) => {
      const url = new URL(input);
      if (url.pathname === "/v3/customers/cus_antigo") return Response.json({}, { status: 404 });
      expect(url.searchParams.get("externalReference")).toBe("u1");
      expect(url.searchParams.get("cpfCnpj")).toBe("24971563792");
      return Response.json({ data: [{ id: "cus_atual", cpfCnpj: "24971563792", externalReference: "u1" }] });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(gateway().getCustomer("cus_antigo")).resolves.toBeNull();
    await expect(gateway().findCustomerByReference("u1", "24971563792")).resolves.toEqual({
      id: "cus_atual", cpfCnpj: "24971563792", externalReference: "u1",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("identifica a resposta invalid_customer sem culpar os dados do perfil", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ errors: [{ code: "invalid_customer" }] }, { status: 400 })));
    await expect(gateway().createPixCharge({
      customer: "cus_antigo", value: 220, dueDate: "2030-06-10", description: "Teste", externalReference: "e1",
    })).rejects.toMatchObject({ code: "PAGAMENTO_CLIENTE_INVALIDO", status: 502 });
  });

  it("reaproveita somente cobrança Pix pendente da mesma referência, cliente e valor", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: string) => {
      const url = new URL(input);
      expect(url.pathname).toBe("/v3/payments");
      expect(url.searchParams.get("externalReference")).toBe("e1:c1");
      expect(url.searchParams.get("customer")).toBe("cus_test");
      expect(url.searchParams.get("status")).toBe("PENDING");
      return Response.json({ data: [{
        id: "pay_existing", externalReference: "e1:c1", customer: "cus_test", value: 220,
        status: "PENDING", billingType: "PIX",
      }], hasMore: false });
    }));
    await expect(gateway().findPendingPixCharge("e1:c1", "cus_test", 220)).resolves.toBe("pay_existing");
    await expect(gateway().findPendingPixCharge("e1:c1", "cus_test", 200)).rejects.toMatchObject({ code: "COBRANCA_CONCILIACAO" });
  });

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
  it("envia a referência única e consulta dados atuais da transferência", async () => {
    const calls: Array<{ method: string; url: URL; body: Record<string, unknown> | null }> = [];
    vi.stubGlobal("fetch", vi.fn(async (input: string, init: RequestInit) => {
      const url = new URL(input);
      calls.push({ method: init.method!, url, body: init.body ? JSON.parse(String(init.body)) : null });
      if (init.method === "POST") return Response.json({ id: "tra_test", status: "PENDING" });
      if (url.pathname.endsWith("/tra_test")) return Response.json({
        id: "tra_test", status: "DONE", externalReference: "intent-1", value: 500,
        operationType: "PIX", bankAccount: { pixAddressKey: "m1@example.com" },
      });
      return Response.json({ data: [
        { id: "tra_test", externalReference: "intent-1" },
        { id: "tra_other", externalReference: "other" },
      ], hasMore: false });
    }));

    const asaas = gateway();
    const created = await asaas.transferPix({
      value: 500, pixAddressKey: "m1@example.com", pixAddressKeyType: "EMAIL",
      description: "Cachê", externalReference: "intent-1",
    });
    const transfer = await asaas.getTransfer(created.id);
    const search = await asaas.findTransfersByReference("intent-1", new Date("2030-06-10T12:00:00Z"));

    expect(calls[0]?.body).toMatchObject({ value: 500, externalReference: "intent-1", pixAddressKey: "m1@example.com" });
    expect(transfer).toMatchObject({ id: "tra_test", status: "DONE", externalReference: "intent-1", pixAddressKey: "m1@example.com" });
    expect(search).toEqual({ matches: ["tra_test"], complete: true });
    expect(calls[2]?.url.searchParams.get("dateCreated[ge]")).toBe("2030-06-09");
  });

  it("busca inconclusiva é limitada e nunca prova ausência da transferência", async () => {
    const fetchMock = vi.fn(async () => Response.json({ data: [], hasMore: true }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await gateway().findTransfersByReference("intent-1", new Date("2030-06-10T12:00:00Z"));

    expect(result).toEqual({ matches: [], complete: false });
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });
});
