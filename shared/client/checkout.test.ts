import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { consultarCobrancaAproveitavel, startCheckout, type Checkout } from "./events.ts";

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

describe("abertura da tela do Pix: só consulta, nunca cria cobrança", () => {
  it("com cobrança pendente do mesmo candidato, devolve a cobrança e não faz POST", async () => {
    const { metodos } = servidor(() => json(cobranca()));

    await expect(consultarCobrancaAproveitavel("e1", "c1")).resolves.toEqual(cobranca());
    expect(metodos()).toEqual(["GET /api/events/e1/checkout"]);
  });

  it("sem cobrança, não cria nada: a tela pede confirmação antes de gerar", async () => {
    const { metodos } = servidor(() => semCobranca());

    await expect(consultarCobrancaAproveitavel("e1", "c1")).resolves.toBeNull();
    expect(metodos()).toEqual(["GET /api/events/e1/checkout"]);
  });

  it.each(["EXPIRADO", "CANCELADO", "ESTORNADO"] as const)("com a última cobrança %s, não mostra o QR antigo nem gera outra sozinha", async (status) => {
    const { metodos } = servidor(() => json(cobranca({ status, pixQrCode: "qr-invalido" })));

    await expect(consultarCobrancaAproveitavel("e1", "c1")).resolves.toBeNull();
    expect(metodos()).toEqual(["GET /api/events/e1/checkout"]);
  });

  it("com o pagamento já concluído, devolve PAGO sem criar cobrança", async () => {
    const { metodos } = servidor(() => json(cobranca({ status: "PAGO" })));

    await expect(consultarCobrancaAproveitavel("e1", "c1")).resolves.toMatchObject({ status: "PAGO" });
    expect(metodos()).toEqual(["GET /api/events/e1/checkout"]);
  });

  it("com cobrança pendente de outro candidato, não cancela nem cria nada sem confirmação", async () => {
    const { metodos } = servidor(() => json(cobranca({ candidateId: "c2" })));

    await expect(consultarCobrancaAproveitavel("e1", "c1")).resolves.toBeNull();
    expect(metodos()).toEqual(["GET /api/events/e1/checkout"]);
  });

  it("reabrir a tela com a cobrança ainda pendente não cria outra", async () => {
    const { metodos } = servidor(() => json(cobranca()));

    await consultarCobrancaAproveitavel("e1", "c1");
    await consultarCobrancaAproveitavel("e1", "c1");
    await consultarCobrancaAproveitavel("e1", "c1");
    expect(metodos()).toEqual(Array(3).fill("GET /api/events/e1/checkout"));
  });

  it("aberturas simultâneas fazem uma única consulta e nenhum POST", async () => {
    let liberar: (resposta: Response) => void = () => {};
    const { metodos } = servidor(() => new Promise<Response>((resolve) => { liberar = resolve; }));

    const aberturas = [consultarCobrancaAproveitavel("e1", "c1"), consultarCobrancaAproveitavel("e1", "c1"), consultarCobrancaAproveitavel("e1", "c1")];
    await vi.waitFor(() => expect(metodos()).toHaveLength(1));
    liberar(semCobranca());
    const resultados = await Promise.all(aberturas);

    expect(resultados).toEqual([null, null, null]);
    expect(metodos()).toEqual(["GET /api/events/e1/checkout"]);
  });

  it("falha na consulta não cria cobrança e repassa o erro", async () => {
    const { metodos } = servidor(() => json({ error: { code: "ERRO_INTERNO", message: "Falhou." } }, 500));

    await expect(consultarCobrancaAproveitavel("e1", "c1")).rejects.toMatchObject({ status: 500, message: "Falhou." });
    expect(metodos()).toEqual(["GET /api/events/e1/checkout"]);
  });

  it("falha de rede na consulta também não cria cobrança", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(consultarCobrancaAproveitavel("e1", "c1")).rejects.toMatchObject({ code: "SEM_CONEXAO" });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("depois de uma falha, a próxima abertura consulta de novo", async () => {
    let falhar = true;
    const { metodos } = servidor(() => (falhar ? json({ error: { code: "ERRO_INTERNO", message: "Falhou." } }, 500) : json(cobranca())));

    await consultarCobrancaAproveitavel("e1", "c1").catch(() => {});
    falhar = false;
    await expect(consultarCobrancaAproveitavel("e1", "c1")).resolves.toEqual(cobranca());
    expect(metodos()).toEqual(["GET /api/events/e1/checkout", "GET /api/events/e1/checkout"]);
  });
});

describe("botões Gerar cobrança Pix e Gerar nova cobrança (ação explícita)", () => {
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
