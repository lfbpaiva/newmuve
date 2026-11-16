import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

describe("leitura do QR Code Pix com falhas transitórias", () => {
  const qrValido = () => Response.json({ payload: "000201...", encodedImage: "base64" });
  const tempoEsgotado = () => Promise.reject(new DOMException("tempo esgotado", "TimeoutError"));
  const lerQr = async () => {
    const resultado = gateway().getPixQrCode("pay_test");
    resultado.catch(() => {});
    await vi.runAllTimersAsync();
    return resultado;
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => vi.useRealTimers());

  it("repete a consulta depois de um tempo esgotado e devolve o QR da mesma cobrança", async () => {
    const fetchMock = vi.fn().mockImplementationOnce(tempoEsgotado).mockResolvedValueOnce(qrValido());
    vi.stubGlobal("fetch", fetchMock);

    await expect(lerQr()).resolves.toEqual({ payload: "000201...", encodedImage: "base64" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.map(([url, init]) => [new URL(url).pathname, init.method])).toEqual([
      ["/v3/payments/pay_test/pixQrCode", "GET"],
      ["/v3/payments/pay_test/pixQrCode", "GET"],
    ]);
  });

  it("repete a consulta depois de uma falha transitória de rede ou da Asaas", async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new TypeError("conexão interrompida"))
      .mockResolvedValueOnce(Response.json({ errors: [] }, { status: 503 }))
      .mockResolvedValueOnce(qrValido());
    vi.stubGlobal("fetch", fetchMock);

    await expect(lerQr()).resolves.toEqual({ payload: "000201...", encodedImage: "base64" });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("esgotadas as tentativas, mantém o erro de indisponibilidade sem criar outra cobrança", async () => {
    const fetchMock = vi.fn().mockImplementation(tempoEsgotado);
    vi.stubGlobal("fetch", fetchMock);

    await expect(lerQr()).rejects.toMatchObject({ code: "PAGAMENTO_INDISPONIVEL", status: 502 });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls.every(([url, init]) => new URL(url).pathname === "/v3/payments/pay_test/pixQrCode" && init.method === "GET")).toBe(true);
  });

  it("cada tentativa tem tempo limite próprio e o total fica dentro do prazo da consulta", async () => {
    const limites: number[] = [];
    vi.spyOn(AbortSignal, "timeout").mockImplementation((ms: number) => {
      limites.push(ms);
      const controle = new AbortController();
      setTimeout(() => controle.abort(new DOMException("tempo esgotado", "TimeoutError")), ms);
      return controle.signal;
    });
    vi.stubGlobal("fetch", vi.fn((_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) => init.signal!.addEventListener("abort", () => reject(init.signal!.reason)))));
    const inicio = Date.now();

    await expect(lerQr()).rejects.toMatchObject({ code: "PAGAMENTO_INDISPONIVEL" });
    expect(limites).toEqual([10_000, 9_000]);
    expect(Date.now() - inicio).toBeLessThanOrEqual(20_000);
  });

  it("não repete quando a Asaas recusa as credenciais", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ errors: [] }, { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(lerQr()).rejects.toMatchObject({ code: "PAGAMENTO_CREDENCIAIS_INVALIDAS" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("consulta de cobrança", () => {
  const consultar = (cobranca: Record<string, unknown>) => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(cobranca)));
    return gateway().getPayment("pay_test");
  };

  it("cobrança paga mantém a situação da Asaas", async () => {
    await expect(consultar({ id: "pay_test", status: "RECEIVED", value: 550, deleted: false })).resolves.toEqual({ status: "RECEIVED", value: 550, refunds: undefined });
  });

  it("cobrança pendente continua pendente", async () => {
    await expect(consultar({ id: "pay_test", status: "PENDING", value: 550, deleted: false })).resolves.toMatchObject({ status: "PENDING" });
  });

  it.each(["PENDING", "OVERDUE"])("cobrança %s removida na Asaas (deleted: true) é tratada como cancelada, não como pendente", async (status) => {
    await expect(consultar({ id: "pay_test", status, value: 550, deleted: true })).resolves.toMatchObject({ status: "DELETED", value: 550 });
  });

  it("cobrança paga nunca é tratada como removida, mesmo com deleted: true", async () => {
    await expect(consultar({ id: "pay_test", status: "RECEIVED", value: 550, deleted: true })).resolves.toMatchObject({ status: "RECEIVED" });
  });
});

describe("busca de transferências pela referência", () => {
  const transferencia = (n: number, referencia = "outro") => ({ id: `tra_${n}`, status: "PENDING", externalReference: referencia, value: 100 });
  const pagina = (offset: number, quantidade: number, totalCount: number, alvo?: number) => ({
    object: "list",
    hasMore: offset + quantidade < totalCount,
    totalCount,
    limit: 100,
    offset,
    data: Array.from({ length: quantidade }, (_, i) => transferencia(offset + i, offset + i === alvo ? "tentativa-1" : "outro")),
  });
  const buscar = (maxPages?: number) => gateway().findTransfersByReference("tentativa-1", new Date("2030-01-10T12:00:00Z"), maxPages);
  const respondendo = (...paginas: unknown[]) => {
    const fetchMock = vi.fn();
    for (const corpo of paginas) fetchMock.mockResolvedValueOnce(Response.json(corpo));
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  };
  const incompleta = { code: "PAGAMENTO_BUSCA_INCOMPLETA", status: 502 };

  it("percorre todas as páginas confirmadas e devolve a evidência da busca", async () => {
    const fetchMock = respondendo(pagina(0, 100, 250, 150), pagina(100, 100, 250, 150), pagina(200, 50, 250, 150));

    const busca = await buscar();

    expect(busca).toMatchObject({ referencia: "tentativa-1", desde: "2030-01-09", paginas: 3, listadas: 250 });
    expect(busca.encontradas).toEqual([{ id: "tra_150", status: "PENDING", externalReference: "tentativa-1", value: 100 }]);
    expect(busca.iniciadaEm).toBeInstanceOf(Date);
    const pedidos = fetchMock.mock.calls.map(([url]) => new URL(String(url)).searchParams);
    expect(pedidos.map((q) => [q.get("dateCreated[ge]"), q.get("offset"), q.get("limit")])).toEqual([
      ["2030-01-09", "0", "100"], ["2030-01-09", "100", "100"], ["2030-01-09", "200", "100"],
    ]);
  });

  it("busca vazia só é completa quando a própria Asaas confirma o total zero", async () => {
    respondendo(pagina(0, 0, 0));
    await expect(buscar()).resolves.toMatchObject({ encontradas: [], paginas: 1, listadas: 0 });
  });

  it("acusa busca incompleta quando o limite de páginas acaba", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    respondendo(pagina(0, 100, 300), pagina(100, 100, 300));
    await expect(buscar(2)).rejects.toMatchObject(incompleta);
  });

  it.each([
    ["sem confirmar o offset pedido", [{ ...pagina(0, 100, 150), offset: 50 }]],
    ["sem confirmar o limit pedido", [{ ...pagina(0, 10, 150), limit: 10, hasMore: true }]],
    ["sem totalCount", [{ ...pagina(0, 5, 5), totalCount: undefined }]],
    ["sem hasMore", [{ ...pagina(0, 5, 5), hasMore: undefined }]],
    ["com o total mudando entre páginas", [pagina(0, 100, 150), pagina(100, 50, 151)]],
    ["com página curta que diz ter mais", [{ ...pagina(0, 60, 150), hasMore: true }]],
    ["com menos itens que o total ao terminar", [{ ...pagina(0, 40, 50), hasMore: false }]],
    ["com transferência repetida entre páginas", [pagina(0, 100, 101), { ...pagina(100, 1, 101), data: [transferencia(0)] }]],
    ["com item sem identificador", [{ ...pagina(0, 1, 1), data: [{ status: "PENDING", externalReference: "tentativa-1" }] }]],
    ["sem lista", [{ hasMore: false, totalCount: 0, offset: 0, limit: 100 }]],
  ])("não trata como ausência a busca %s", async (_caso, paginas) => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    respondendo(...paginas);
    await expect(buscar()).rejects.toMatchObject(incompleta);
  });

  it("falha da Asaas no meio da busca interrompe sem devolver resultado parcial", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(Response.json(pagina(0, 100, 150)))
      .mockResolvedValueOnce(Response.json({ errors: [] }, { status: 500 })));
    await expect(buscar()).rejects.toMatchObject({ code: "PAGAMENTO_INDISPONIVEL", status: 502 });
  });
});
