import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAsaasGateway, DESCRICAO_TAMANHO_MAXIMO, DESCRICOES_MAXIMAS, sanitizarDescricao, PIX_QR_INTERVALO_MS, PIX_QR_PRAZO_PADRAO_MS, PIX_QR_TEMPO_MINIMO_MS, PIX_QR_TEMPO_POR_TENTATIVA_MS, PIX_QR_TENTATIVAS_MAXIMAS, type RegistroDaAsaas } from "./asaas.ts";

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
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("falha simulada"); }));
    const semRede = gateway().getPixQrCode("pay_test");
    semRede.catch(() => {});
    await vi.runAllTimersAsync();
    await expect(semRede).rejects.toMatchObject({ code: "PAGAMENTO_INDISPONIVEL" });
    vi.useRealTimers();

    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ payload: "000201..." })));
    await expect(gateway().getPixQrCode("pay_test")).rejects.toMatchObject({ code: "PAGAMENTO_RESPOSTA_INVALIDA" });
  });

  it("repete brevemente a leitura do QR quando a Asaas responde invalid_action", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ errors: [{ code: "invalid_action" }] }, { status: 400 }))
      .mockResolvedValueOnce(Response.json({ id: "pay_test", status: "PENDING", value: 165, deleted: false }))
      .mockResolvedValueOnce(Response.json({ payload: "000201...", encodedImage: "base64" }));
    vi.stubGlobal("fetch", fetchMock);
    vi.useFakeTimers();

    const leitura = gateway().getPixQrCode("pay_test");
    await vi.runAllTimersAsync();
    await expect(leitura).resolves.toEqual({ payload: "000201...", encodedImage: "base64" });
    expect(fetchMock.mock.calls.map(([url]) => new URL(url).pathname)).toEqual(["/v3/payments/pay_test/pixQrCode", "/v3/payments/pay_test", "/v3/payments/pay_test/pixQrCode"]);
    vi.useRealTimers();
  });

  it("conta sem chave Pix ativa: encerra na primeira resposta, sem repetir, com erro próprio", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchMock = vi.fn(async () => Response.json({ errors: [{ code: "invalid_action", description: "Chave Pix não encontrada." }] }, { status: 400 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(gateway().getPixQrCode("pay_test")).rejects.toMatchObject({ code: "PAGAMENTO_PIX_NAO_HABILITADO", status: 503 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
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

  it("não repete quando a Asaas recusa as credenciais", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ errors: [] }, { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(lerQr()).rejects.toMatchObject({ code: "PAGAMENTO_CREDENCIAIS_INVALIDAS" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("cada tentativa tem tempo limite próprio de 20 s, aborta a requisição e o total fica dentro do prazo", async () => {
    const sinais: AbortSignal[] = [];
    const inicios: number[] = [];
    vi.stubGlobal("fetch", vi.fn((_url: string, init: RequestInit) => {
      sinais.push(init.signal!);
      inicios.push(Date.now());
      return new Promise(() => {});
    }));
    const inicio = Date.now();

    await expect(lerQr()).rejects.toMatchObject({ code: "PAGAMENTO_INDISPONIVEL" });

    expect(inicios.map((momento) => momento - inicio)).toEqual([0, PIX_QR_TEMPO_POR_TENTATIVA_MS + PIX_QR_INTERVALO_MS]);
    expect(sinais.every((sinal) => sinal.aborted && (sinal.reason as Error).name === "TimeoutError")).toBe(true);
    expect(Date.now() - inicio).toBeLessThanOrEqual(PIX_QR_PRAZO_PADRAO_MS);
  });
});

describe("leitura do QR Code Pix: orçamento, respostas tardias e registros", () => {
  const registros: RegistroDaAsaas[] = [];
  const comRegistro = () => createAsaasGateway({ apiUrl: "https://api-sandbox.asaas.com/v3", apiKey: "$aact_segredo_de_teste", registrar: (registro) => registros.push(registro) });
  const qrValido = (payload = "000201...") => Response.json({ payload, encodedImage: "base64" });
  const pendurada = () => new Promise<Response>(() => {});
  const ler = async (opcoes?: { prazo?: number; correlacao?: string }) => {
    const resultado = comRegistro().getPixQrCode("pay_test", opcoes);
    resultado.catch(() => {});
    await vi.runAllTimersAsync();
    return resultado;
  };

  beforeEach(() => {
    registros.length = 0;
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => vi.useRealTimers());

  it("primeira consulta com QR: uma chamada, registrada com etapa, tentativa, duração e correlação", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => qrValido()));

    await expect(ler({ correlacao: "corr-1" })).resolves.toEqual({ payload: "000201...", encodedImage: "base64" });

    expect(registros).toEqual([expect.objectContaining({ origem: "asaas", correlacao: "corr-1", etapa: "qr_code", tentativa: 1, metodo: "GET", rota: "/payments/pay_test/pixQrCode", resultado: "ok", httpStatus: 200, duracaoMs: expect.any(Number) })]);
  });

  it("QR que chega pouco antes do tempo limite da tentativa é aceito", async () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((resolve) => setTimeout(() => resolve(qrValido()), PIX_QR_TEMPO_POR_TENTATIVA_MS - 100))));

    await expect(ler()).resolves.toEqual({ payload: "000201...", encodedImage: "base64" });
    expect(registros).toEqual([expect.objectContaining({ resultado: "ok", duracaoMs: PIX_QR_TEMPO_POR_TENTATIVA_MS - 100 })]);
  });

  it("resposta tardia de uma tentativa encerrada é ignorada e não substitui a da tentativa seguinte", async () => {
    const fetchMock = vi.fn()
      .mockImplementationOnce(() => new Promise<Response>((resolve) => setTimeout(() => resolve(qrValido("tardio")), PIX_QR_TEMPO_POR_TENTATIVA_MS + 3_000)))
      .mockImplementationOnce(async () => qrValido("atual"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(ler()).resolves.toEqual({ payload: "atual", encodedImage: "base64" });
    await vi.advanceTimersByTimeAsync(60_000);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(registros.map((registro) => [registro.tentativa, registro.resultado])).toEqual([[1, "tempo_esgotado"], [2, "ok"]]);
  });

  it("depois de encerrar sem QR não faz mais nenhuma chamada", async () => {
    const fetchMock = vi.fn(pendurada);
    vi.stubGlobal("fetch", fetchMock);

    await expect(ler()).rejects.toMatchObject({ code: "PAGAMENTO_INDISPONIVEL" });
    await vi.advanceTimersByTimeAsync(120_000);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(registros.every((registro) => registro.resultado === "tempo_esgotado" && registro.httpStatus === null)).toBe(true);
  });

  it("respeita o prazo recebido: a última tentativa só usa o tempo que sobra, e não começa tentativa com menos de 5 s", async () => {
    const fetchMock = vi.fn(pendurada);
    vi.stubGlobal("fetch", fetchMock);
    const inicio = Date.now();

    await expect(ler({ prazo: inicio + 12_000 })).rejects.toMatchObject({ code: "PAGAMENTO_INDISPONIVEL" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(Date.now() - inicio).toBeLessThanOrEqual(12_000);

    fetchMock.mockClear();
    await expect(ler({ prazo: Date.now() + PIX_QR_TEMPO_MINIMO_MS - 1 })).rejects.toMatchObject({ code: "PAGAMENTO_INDISPONIVEL" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  const asaasCom = (cobranca: () => Promise<Response>, qr: () => Promise<Response> = async () => Response.json({ errors: [{ code: "invalid_action", description: "qualquer texto" }] }, { status: 400 })) => {
    const chamadas: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      const caminho = new URL(url).pathname;
      chamadas.push(caminho.endsWith("/pixQrCode") ? "qr" : "consulta");
      return caminho.endsWith("/pixQrCode") ? qr() : cobranca();
    }));
    return chamadas;
  };

  it("invalid_action com a cobrança ainda aguardando pagamento: confere a situação e repete, no máximo três vezes, com intervalo", async () => {
    const momentos: number[] = [];
    const chamadas = asaasCom(async () => Response.json({ id: "pay_test", status: "PENDING", value: 165, deleted: false }), async () => {
      momentos.push(Date.now());
      return Response.json({ errors: [{ code: "invalid_action", description: "QR Code ainda não disponível" }] }, { status: 400 });
    });

    await expect(ler()).rejects.toMatchObject({ code: "PAGAMENTO_QR_INDISPONIVEL" });

    expect(chamadas).toEqual(["qr", "consulta", "qr", "consulta", "qr", "consulta"]);
    expect(momentos).toHaveLength(PIX_QR_TENTATIVAS_MAXIMAS);
    expect(momentos[1]! - momentos[0]!).toBe(PIX_QR_INTERVALO_MS);
    expect(registros.filter((registro) => registro.etapa === "verificacao_qr")).toHaveLength(3);
  });

  it.each([
    ["removida na Asaas", { id: "pay_test", status: "PENDING", value: 165, deleted: true }],
    ["já recebida", { id: "pay_test", status: "RECEIVED", value: 165, deleted: false }],
    ["confirmada", { id: "pay_test", status: "CONFIRMED", value: 165, deleted: false }],
    ["com situação desconhecida", { id: "pay_test", status: "SITUACAO_NOVA", value: 165, deleted: false }],
  ])("invalid_action com a cobrança %s: encerra sem repetir, qualquer que seja o texto da Asaas", async (_caso, cobranca) => {
    const chamadas = asaasCom(async () => Response.json(cobranca));

    await expect(ler()).rejects.toMatchObject({ code: "PAGAMENTO_QR_RECUSADO" });
    expect(chamadas).toEqual(["qr", "consulta"]);
  });

  it("invalid_action com a cobrança inexistente na Asaas: encerra sem repetir", async () => {
    const chamadas = asaasCom(async () => Response.json({ errors: [] }, { status: 404 }));

    await expect(ler()).rejects.toMatchObject({ code: "PAGAMENTO_QR_RECUSADO" });
    expect(chamadas).toEqual(["qr", "consulta"]);
  });

  it("invalid_action e consulta da cobrança sem resposta: situação inconclusiva, sem repetição às cegas", async () => {
    const chamadas = asaasCom(() => new Promise<Response>(() => {}));

    await expect(ler()).rejects.toMatchObject({ code: "PAGAMENTO_QR_INCONCLUSIVO" });
    expect(chamadas).toEqual(["qr", "consulta"]);
    expect(registros.find((registro) => registro.etapa === "verificacao_qr")).toMatchObject({ resultado: "tempo_esgotado", duracaoMs: 5_000 });
  });

  it("invalid_action perto do fim do prazo: a consulta usa só o tempo que sobra", async () => {
    const chamadas = asaasCom(() => new Promise<Response>(() => {}), () => new Promise<Response>((resolve) => setTimeout(() => resolve(Response.json({ errors: [{ code: "invalid_action" }] }, { status: 400 })), 9_000)));

    await expect(ler({ prazo: Date.now() + 11_000 })).rejects.toMatchObject({ code: "PAGAMENTO_QR_INCONCLUSIVO" });
    expect(chamadas).toEqual(["qr", "consulta"]);
    expect(registros.find((registro) => registro.etapa === "verificacao_qr")).toMatchObject({ duracaoMs: 2_000 });
  });

  it.each([
    ["400 sem invalid_action", Response.json({ errors: [{ code: "invalid_value" }] }, { status: 400 }), "PAGAMENTO_CONSULTA_RECUSADA"],
    ["422", Response.json({ errors: [{ code: "invalid_value" }] }, { status: 422 }), "PAGAMENTO_CONSULTA_RECUSADA"],
    ["404", Response.json({ errors: [] }, { status: 404 }), "PAGAMENTO_INDISPONIVEL"],
    ["409, status desconhecido", Response.json({ errors: [] }, { status: 409 }), "PAGAMENTO_INDISPONIVEL"],
    ["429, limite de requisições", Response.json({ errors: [] }, { status: 429 }), "PAGAMENTO_LIMITE"],
  ])("erro definitivo (%s) não é repetido", async (_caso, resposta, codigo) => {
    const fetchMock = vi.fn(async () => resposta);
    vi.stubGlobal("fetch", fetchMock);

    await expect(ler()).rejects.toMatchObject({ code: codigo });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("distingue tempo esgotado, falha de rede, erro da Asaas e resposta inválida nos registros, sem expor a chave", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockImplementationOnce(pendurada)
      .mockRejectedValueOnce(new TypeError("conexão recusada"))
      .mockResolvedValueOnce(Response.json({ errors: [{ code: "server_error" }] }, { status: 503 })));

    await expect(ler({ prazo: Date.now() + 60_000 })).rejects.toMatchObject({ code: "PAGAMENTO_INDISPONIVEL" });

    expect(registros.map((registro) => [registro.resultado, registro.httpStatus])).toEqual([["tempo_esgotado", null], ["rede", null], ["http", 503]]);
    expect(JSON.stringify(registros)).not.toContain("segredo");

    registros.length = 0;
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>erro</html>", { status: 200 })));
    await expect(ler()).rejects.toMatchObject({ code: "PAGAMENTO_RESPOSTA_INVALIDA" });
    expect(registros).toEqual([expect.objectContaining({ resultado: "resposta_invalida", httpStatus: 200 })]);
  });
});

describe("remoção de cobrança", () => {
  const remover = async (resposta: () => Promise<Response>, timeoutMs?: number) => {
    vi.stubGlobal("fetch", vi.fn(resposta));
    const resultado = gateway().cancelCharge("pay_test", { timeoutMs, correlacao: "corr-2" });
    resultado.catch(() => {});
    await vi.runAllTimersAsync();
    return resultado;
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "info").mockImplementation(() => {});
  });
  afterEach(() => vi.useRealTimers());

  it("confirma a remoção só quando a Asaas responde deleted: true ou que a cobrança não existe", async () => {
    await expect(remover(async () => Response.json({ deleted: true, id: "pay_test" }))).resolves.toEqual({ removida: true });
    await expect(remover(async () => Response.json({ errors: [] }, { status: 404 }))).resolves.toEqual({ removida: true });
    await expect(remover(async () => Response.json({ deleted: false, id: "pay_test" }))).resolves.toEqual({ removida: false });
  });

  it("recusa e tempo esgotado na remoção viram erro, sem presumir que a cobrança saiu", async () => {
    await expect(remover(async () => Response.json({ errors: [{ code: "invalid_action" }] }, { status: 400 }))).rejects.toMatchObject({ code: "CANCELAMENTO_COBRANCA_RECUSADO" });
    await expect(remover(() => new Promise<Response>(() => {}), 6_000)).rejects.toMatchObject({ code: "PAGAMENTO_INDISPONIVEL" });
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('"etapa":"remocao"'));
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('"resultado":"tempo_esgotado"'));
  });
});

describe("descrição dos erros da Asaas nos registros", () => {
  const registros: RegistroDaAsaas[] = [];
  const consultar = async (corpo: unknown, status = 422) => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(corpo, { status })));
    registros.length = 0;
    const gateway = createAsaasGateway({ apiUrl: "https://api-sandbox.asaas.com/v3", apiKey: "$aact_segredo_de_teste", registrar: (registro) => registros.push(registro) });
    await gateway.getPayment("pay_test").catch(() => {});
    return registros[0]!;
  };

  it("registra status, código e descrição original, sem mudar a classificação do erro", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ errors: [{ code: "invalid_value", description: "O campo value deve ser informado." }] }, { status: 422 })));
    const gateway = createAsaasGateway({ apiUrl: "https://api-sandbox.asaas.com/v3", apiKey: "$aact_segredo_de_teste", registrar: (registro) => registros.push(registro) });
    registros.length = 0;

    await expect(gateway.getPayment("pay_test")).rejects.toMatchObject({ code: "PAGAMENTO_CONSULTA_RECUSADA", status: 502 });

    expect(registros).toEqual([expect.objectContaining({ resultado: "http", httpStatus: 422, codigos: ["invalid_value"], descricoes: ["O campo value deve ser informado."] })]);
  });

  it.each([
    ["mensagem no topo", { message: "Requisição inválida." }, ["Requisição inválida."]],
    ["erro no topo", { error: "Recurso indisponível." }, ["Recurso indisponível."]],
    ["lista de textos", { errors: ["Primeiro erro.", "Segundo erro."] }, ["Primeiro erro.", "Segundo erro."]],
    ["lista com message", { errors: [{ code: "x", message: "Mensagem alternativa." }] }, ["Mensagem alternativa."]],
    ["sem texto", { errors: [{ code: "invalid_action" }] }, []],
    ["campos não textuais", { errors: [{ description: 42 }, null, { description: "" }], message: { aninhado: true } }, []],
    ["corpo que não é objeto", "texto solto", []],
  ])("formato alternativo (%s): registra só os textos relevantes", async (_caso, corpo, esperado) => {
    await expect(consultar(corpo)).resolves.toMatchObject({ descricoes: esperado });
  });

  it("não serializa a resposta completa e limita a quantidade de descrições", async () => {
    const registro = await consultar({ errors: ["a1", "a2", "a3", "a4"], customer: { name: "Fulano", cpfCnpj: "52998224725" }, value: 165 });

    expect(registro.descricoes).toEqual(["a1", "a2", "a3"]);
    expect(registro.descricoes).toHaveLength(DESCRICOES_MAXIMAS);
    expect(JSON.stringify(registro)).not.toContain("Fulano");
    expect(JSON.stringify(registro)).not.toContain("52998224725");
  });

  it("não expõe chaves, tokens, credenciais nem dados pessoais da descrição", async () => {
    const registro = await consultar({ errors: [{ description: "Chave $aact_YTU5YTE0M2M2N2I4MTliNzk0YTI5N2U5MzdjNWZmNDQ6OjAwMDAwMDAwMDAwMDAwMDAwMDA6OiRhYWNoXzRlNTU= inválida para fulano@exemplo.com, CPF 529.982.247-25, token=abc123, Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.assinatura e cliente 3f2504e0-4f89-11d3-9a0c-0305e82c3301" }] }, 400);
    const texto = registro.descricoes.join(" ");

    expect(texto).not.toMatch(/aact_|fulano@exemplo\.com|529\.982\.247-25|abc123|eyJ|3f2504e0-4f89/);
    expect(texto).toContain("[chave]");
    expect(texto).toContain("[email]");
    expect(texto).toContain("[numero]");
    expect(texto).toContain("[credencial]");
    expect(JSON.stringify(registros)).not.toContain("segredo");
  });

  it("limita o tamanho e remove caracteres de controle", () => {
    expect(sanitizarDescricao(`linha\nquebrada\tcom\u0000controle`)).toBe("linha quebrada com controle");
    const longo = sanitizarDescricao("palavra ".repeat(100));
    expect(longo.length).toBe(DESCRICAO_TAMANHO_MAXIMO + 1);
    expect(longo.endsWith("…")).toBe(true);
  });

  it("valores longos sem espaço, como chaves desconhecidas, são mascarados", () => {
    expect(sanitizarDescricao("valor ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef0123456789 recusado")).toBe("valor [valor] recusado");
    expect(sanitizarDescricao("Esta cobrança foi removida e não pode ser paga.")).toBe("Esta cobrança foi removida e não pode ser paga.");
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
