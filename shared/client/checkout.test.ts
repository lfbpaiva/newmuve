import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openCheckout, startCheckout, type Checkout } from "./events.ts";

vi.mock("./config.ts", () => ({
  clientConfig: () => ({ apiUrl: "/api" }),
  supabase: () => ({ auth: { getSession: async () => ({ data: { session: { access_token: "token" } } }) } }),
  appendFile: () => {},
}));

const cobranca = (mudancas: Partial<Checkout> = {}): Checkout => ({
  id: "p1",
  cache: 500,
  comissao: 50,
  valor: 550,
  status: "PENDENTE",
  candidateId: "c1",
  refundStatus: null,
  pixCopiaCola: "000201...",
  pixQrCode: "base64",
  expiraEm: "2030-01-01T12:15:00Z",
  ...mudancas,
});

const nova = cobranca({ id: "p2", pixCopiaCola: "000201-novo", pixQrCode: "base64-novo" });
const semCobranca = () => new Response(null, { status: 204 });
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function servidor(get: () => Response | Promise<Response>, post: () => Response | Promise<Response> = () => json(nova, 201)) {
  const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => ((init?.method ?? "GET") === "POST" ? post() : get()));
  vi.stubGlobal("fetch", fetchMock);
  const metodos = () => fetchMock.mock.calls.map(([url, init]) => `${init?.method ?? "GET"} ${url}`);
  return { metodos };
}

beforeEach(() => vi.unstubAllGlobals());
afterEach(() => vi.unstubAllGlobals());

describe("abertura da tela do Pix", () => {
  it("com cobrança pendente do mesmo candidato, devolve a cobrança e não faz POST", async () => {
    const { metodos } = servidor(() => json(cobranca()));

    await expect(openCheckout("e1", "c1")).resolves.toEqual(cobranca());
    expect(metodos()).toEqual(["GET /api/events/e1/checkout"]);
  });

  it("sem cobrança, consulta e depois faz um único POST", async () => {
    const { metodos } = servidor(() => semCobranca());

    await expect(openCheckout("e1", "c1")).resolves.toEqual(nova);
    expect(metodos()).toEqual(["GET /api/events/e1/checkout", "POST /api/events/e1/checkout"]);
  });

  it.each(["EXPIRADO", "CANCELADO", "ESTORNADO"] as const)("com a última cobrança %s, gera uma nova em vez de mostrar o QR antigo", async (status) => {
    const { metodos } = servidor(() => json(cobranca({ status, pixQrCode: "qr-invalido" })));

    const aberta = await openCheckout("e1", "c1");
    expect(aberta).toEqual(nova);
    expect(aberta.pixQrCode).not.toBe("qr-invalido");
    expect(metodos()).toEqual(["GET /api/events/e1/checkout", "POST /api/events/e1/checkout"]);
  });

  it("com o pagamento já concluído, devolve PAGO sem criar cobrança", async () => {
    const { metodos } = servidor(() => json(cobranca({ status: "PAGO" })));

    await expect(openCheckout("e1", "c1")).resolves.toMatchObject({ status: "PAGO" });
    expect(metodos()).toEqual(["GET /api/events/e1/checkout"]);
  });

  it("com cobrança pendente de outro candidato, faz o POST para este candidato", async () => {
    const { metodos } = servidor(() => json(cobranca({ candidateId: "c2" })));

    await expect(openCheckout("e1", "c1")).resolves.toEqual(nova);
    expect(metodos()).toEqual(["GET /api/events/e1/checkout", "POST /api/events/e1/checkout"]);
  });

  it("reabrir a tela com a cobrança ainda pendente não cria outra", async () => {
    const { metodos } = servidor(() => json(cobranca()));

    await openCheckout("e1", "c1");
    await openCheckout("e1", "c1");
    await openCheckout("e1", "c1");
    expect(metodos()).toEqual(Array(3).fill("GET /api/events/e1/checkout"));
  });

  it("aberturas simultâneas fazem uma única consulta e um único POST", async () => {
    let liberar: (resposta: Response) => void = () => {};
    const { metodos } = servidor(() => new Promise<Response>((resolve) => { liberar = resolve; }));

    const aberturas = [openCheckout("e1", "c1"), openCheckout("e1", "c1"), openCheckout("e1", "c1")];
    await vi.waitFor(() => expect(metodos()).toHaveLength(1));
    liberar(semCobranca());
    const resultados = await Promise.all(aberturas);

    expect(resultados).toEqual([nova, nova, nova]);
    expect(metodos()).toEqual(["GET /api/events/e1/checkout", "POST /api/events/e1/checkout"]);
  });

  it("falha na consulta não cria cobrança e repassa o erro", async () => {
    const { metodos } = servidor(() => json({ error: { code: "ERRO_INTERNO", message: "Falhou." } }, 500));

    await expect(openCheckout("e1", "c1")).rejects.toMatchObject({ status: 500, message: "Falhou." });
    expect(metodos()).toEqual(["GET /api/events/e1/checkout"]);
  });

  it("falha de rede na consulta também não cria cobrança", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(openCheckout("e1", "c1")).rejects.toMatchObject({ code: "SEM_CONEXAO" });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("depois de uma falha, a próxima abertura consulta de novo", async () => {
    let falhar = true;
    const { metodos } = servidor(() => (falhar ? json({ error: { code: "ERRO_INTERNO", message: "Falhou." } }, 500) : json(cobranca())));

    await openCheckout("e1", "c1").catch(() => {});
    falhar = false;
    await expect(openCheckout("e1", "c1")).resolves.toEqual(cobranca());
    expect(metodos()).toEqual(["GET /api/events/e1/checkout", "GET /api/events/e1/checkout"]);
  });
});

describe("botão Gerar nova cobrança", () => {
  it("faz o POST diretamente, sem depender da consulta", async () => {
    const { metodos } = servidor(() => json(cobranca({ status: "EXPIRADO" })));

    await expect(startCheckout("e1", "c1")).resolves.toEqual(nova);
    expect(metodos()).toEqual(["POST /api/events/e1/checkout"]);
  });

  it("cliques rápidos geram um único POST", async () => {
    let liberar: (resposta: Response) => void = () => {};
    const { metodos } = servidor(() => semCobranca(), () => new Promise<Response>((resolve) => { liberar = resolve; }));

    const cliques = [startCheckout("e1", "c1"), startCheckout("e1", "c1"), startCheckout("e1", "c1")];
    await vi.waitFor(() => expect(metodos()).toHaveLength(1));
    liberar(json(nova, 201));
    expect(await Promise.all(cliques)).toEqual([nova, nova, nova]);
    expect(metodos()).toEqual(["POST /api/events/e1/checkout"]);
  });
});
