import { describe, expect, it, vi } from "vitest";
import type { AccountService } from "../services/accountService.ts";
import type { EventService } from "../services/eventService.ts";
import type { PaymentService } from "../services/paymentService.ts";
import { AppError } from "../domain/errors.ts";
import { createApp } from "./app.ts";

const ORIGIN = "http://localhost:8443";
const WEBHOOK_TOKEN = "token-do-webhook";
const CANDIDATE_ID = "7b0d3c0e-5f0a-4a52-9d5b-2f1f6c1f9a10";

function setup() {
  const accounts = {
    signup: vi.fn(async () => {}),
    completeProfile: vi.fn(async () => {}),
    getMe: vi.fn(async () => ({ id: "u1", role: "CONTRACTOR" as const, email: "bar@exemplo.com" })),
    updateProfile: vi.fn(async () => {}),
    deleteAccount: vi.fn(async () => {}),
  };
  const events = {
    createEvent: vi.fn(async () => ({ id: "e1" })),
    apply: vi.fn(async () => {}),
    reportNoShow: vi.fn(async () => {}),
    sendMessage: vi.fn(async () => ({})),
    inviteMusician: vi.fn(async () => {}),
    openDispute: vi.fn(async () => {}),
  };
  const payments = {
    startCheckout: vi.fn(async () => ({
      id: "p1",
      eventId: "e1",
      candidateId: CANDIDATE_ID,
      asaasPaymentId: "pay_interno",
      valor: 550,
      valorComissao: 50,
      valorCache: 500,
      repasseStatus: null,
      status: "PENDENTE" as const,
      pixCopiaCola: "000201...",
      pixQrCode: "base64",
      expiraEm: new Date("2030-01-01T12:15:00Z"),
    })),
    handleWebhook: vi.fn(async () => {}),
    cancelPendingCheckout: vi.fn(async () => {}),
  };
  const app = createApp({
    accounts: accounts as unknown as AccountService,
    events: events as unknown as EventService,
    payments: payments as unknown as PaymentService,
    asaasWebhookToken: WEBHOOK_TOKEN,
    verifyToken: async (token) => (token === "token-valido" ? { id: "u1", email: "bar@exemplo.com" } : null),
    allowedOrigins: [ORIGIN],
    allowedRedirects: ["muve://auth", "exp://*"],
  });
  return { app, accounts, events, payments };
}

const signupBody = (dados: object) => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(dados) });

const contratante = { role: "CONTRACTOR", nome: "Bar do Zé", email: "  Contato@BarDoZe.com.br ", password: "segredo1", aceiteTermos: true };

describe("DELETE /api/events/:id/checkout", () => {
  it("exige autenticação para cancelar uma cobrança pendente", async () => {
    const { app, payments } = setup();
    const anonymous = await app.request("/api/events/e1/checkout", { method: "DELETE" });
    const authorized = await app.request("/api/events/e1/checkout", { method: "DELETE", headers: { Authorization: "Bearer token-valido" } });

    expect([anonymous.status, authorized.status]).toEqual([401, 200]);
    expect(await authorized.json()).toEqual({ situacao: "COBRANCA_CANCELADA" });
    expect(payments.cancelPendingCheckout).toHaveBeenCalledWith({ id: "u1", email: "bar@exemplo.com" }, "e1");
  });
});

describe("POST /api/auth/signup", () => {
  it("normaliza os dados e repassa ao serviço", async () => {
    const { app, accounts } = setup();

    const response = await app.request("/api/auth/signup", { ...signupBody(contratante), headers: { ...signupBody(contratante).headers, Origin: ORIGIN } });

    expect(response.status).toBe(201);
    expect(accounts.signup).toHaveBeenCalledWith(expect.objectContaining({ email: "contato@bardoze.com.br", nome: "Bar do Zé", role: "CONTRACTOR" }), ORIGIN);
  });

  it.each([
    [{ email: "sem-arroba.com" }, "Informe um e-mail válido."],
    [{ password: "123" }, "A senha deve ter pelo menos 8 caracteres."],
    [{ nome: "" }, "Informe seu nome."],
    [{ role: "ADMIN" }, "Selecione o tipo de conta."],
    [{ aceiteTermos: false }, "Aceite os Termos de Uso para criar a conta."],
  ])("rejeita %j", async (override, message) => {
    const { app, accounts } = setup();

    const response = await app.request("/api/auth/signup", signupBody({ ...contratante, ...override }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: { code: "DADOS_INVALIDOS", message } });
    expect(accounts.signup).not.toHaveBeenCalled();
  });

  it("repassa o token do captcha para o cadastro", async () => {
    const { app, accounts } = setup();

    await app.request("/api/auth/signup", signupBody({ ...contratante, captchaToken: " token-captcha " }));

    expect(accounts.signup).toHaveBeenCalledWith(expect.objectContaining({ captchaToken: "token-captcha" }), undefined);
  });

  it("usa o destino do app quando autorizado e ignora destinos fora da lista", async () => {
    const { app, accounts } = setup();

    await app.request("/api/auth/signup", signupBody({ ...contratante, redirectTo: "muve://auth" }));
    await app.request("/api/auth/signup", signupBody({ ...contratante, redirectTo: "https://malicioso.example" }));
    await app.request("/api/auth/signup", signupBody({ ...contratante, redirectTo: `${ORIGIN}/auth` }));
    await app.request("/api/auth/signup", signupBody({ ...contratante, redirectTo: "exp://192.168.0.10:8081/--/auth" }));
    await app.request("/api/auth/signup", signupBody({ ...contratante, redirectTo: `${ORIGIN}/outra-pagina` }));

    expect(accounts.signup).toHaveBeenNthCalledWith(1, expect.anything(), "muve://auth");
    expect(accounts.signup).toHaveBeenNthCalledWith(2, expect.anything(), undefined);
    expect(accounts.signup).toHaveBeenNthCalledWith(3, expect.anything(), `${ORIGIN}/auth`);
    expect(accounts.signup).toHaveBeenNthCalledWith(4, expect.anything(), "exp://192.168.0.10:8081/--/auth");
    expect(accounts.signup).toHaveBeenNthCalledWith(5, expect.anything(), undefined);
  });

  it("não consome o limite com formulários inválidos", async () => {
    const { app, accounts } = setup();
    for (let i = 0; i < 11; i++) {
      expect((await app.request("/api/auth/signup", signupBody({ ...contratante, role: "ADMIN" }))).status).toBe(400);
    }
    expect((await app.request("/api/auth/signup", signupBody(contratante))).status).toBe(201);
    expect(accounts.signup).toHaveBeenCalledTimes(1);
  });

  it("propaga o 429 e o prazo informado pelo serviço de autenticação", async () => {
    const { app, accounts } = setup();
    accounts.signup.mockRejectedValueOnce(new AppError(429, "LIMITE_DE_ENVIO", "Limite temporário do provedor.", "60"));

    const response = await app.request("/api/auth/signup", signupBody(contratante));
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("60");
    expect(await response.json()).toEqual({ error: { code: "LIMITE_DE_ENVIO", message: "Limite temporário do provedor." } });
  });
});

describe("rotas autenticadas", () => {
  it("recusam requisições sem token ou com token inválido", async () => {
    const { app, accounts } = setup();

    const semToken = await app.request("/api/me");
    const tokenInvalido = await app.request("/api/me", { headers: { Authorization: "Bearer forjado" } });
    const exclusao = await app.request("/api/me", { method: "DELETE", body: "{}", headers: { "Content-Type": "application/json" } });

    expect([semToken.status, tokenInvalido.status, exclusao.status]).toEqual([401, 401, 401]);
    expect(accounts.getMe).not.toHaveBeenCalled();
    expect(accounts.deleteAccount).not.toHaveBeenCalled();
  });

  it("GET /api/me devolve a conta do dono do token", async () => {
    const { app, accounts } = setup();

    const response = await app.request("/api/me", { headers: { Authorization: "Bearer token-valido" } });

    expect(response.status).toBe(200);
    expect(accounts.getMe).toHaveBeenCalledWith({ id: "u1", email: "bar@exemplo.com" });
  });

  it("POST /api/me/perfil retorna 204 sem conteudo", async () => {
    const { app, accounts } = setup();

    const response = await app.request("/api/me/perfil", {
      method: "POST",
      headers: {
        Authorization: "Bearer token-valido",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        role: "MUSICIAN",
        nome: "Musico Teste",
        aceiteTermos: true,
      }),
    });

    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
    expect(accounts.completeProfile).toHaveBeenCalledWith(
      { id: "u1", email: "bar@exemplo.com" },
      { role: "MUSICIAN", nome: "Musico Teste", aceiteTermos: true },
    );
    expect(accounts.completeProfile).toHaveBeenCalledOnce();
  });

  it("DELETE /api/me exige e-mail e senha no corpo", async () => {
    const { app, accounts } = setup();
    const headers = { Authorization: "Bearer token-valido", "Content-Type": "application/json" };

    const incompleto = await app.request("/api/me", { method: "DELETE", headers, body: JSON.stringify({ email: "bar@exemplo.com" }) });
    const completo = await app.request("/api/me", { method: "DELETE", headers, body: JSON.stringify({ email: "bar@exemplo.com", password: "segredo1" }) });

    expect(incompleto.status).toBe(400);
    expect(completo.status).toBe(204);
    expect(accounts.deleteAccount).toHaveBeenCalledTimes(1);
  });
});

describe("erros e CORS", () => {
  it("não expõe detalhes de erros inesperados", async () => {
    const { app, accounts } = setup();
    accounts.getMe.mockRejectedValueOnce(new Error("connection refused at 10.0.0.5:5432"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await app.request("/api/me", { headers: { Authorization: "Bearer token-valido" } });

    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain("10.0.0.5");
  });

  it("só libera CORS para origens autorizadas", async () => {
    const { app } = setup();

    const permitida = await app.request("/api/health", { headers: { Origin: ORIGIN } });
    const negada = await app.request("/api/health", { headers: { Origin: "https://malicioso.example" } });

    expect(permitida.headers.get("Access-Control-Allow-Origin")).toBe(ORIGIN);
    expect(permitida.headers.get("Access-Control-Expose-Headers")).toBe("Retry-After");
    expect(negada.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });
});

describe("eventos e checkout", () => {
  const auth = { Authorization: "Bearer token-valido" };

  it("exigem autenticação", async () => {
    const { app, events, payments } = setup();

    const criar = await app.request("/api/events", { method: "POST", body: new FormData() });
    const inscrever = await app.request("/api/events/e1/candidatura", { method: "POST" });
    const checkout = await app.request("/api/events/e1/checkout", { method: "POST", body: "{}" });
    const mensagem = await app.request("/api/candidaturas/c1/mensagens", { method: "POST", body: JSON.stringify({ texto: "oi" }) });

    expect([criar.status, inscrever.status, checkout.status, mensagem.status]).toEqual([401, 401, 401, 401]);
    expect(events.createEvent).not.toHaveBeenCalled();
    expect(payments.startCheckout).not.toHaveBeenCalled();
  });

  it("candidatura aceita proposta de valor e recusa valor abaixo do mínimo", async () => {
    const { app, events } = setup();
    const inscrever = (body: object) => app.request("/api/events/e1/candidatura", { method: "POST", headers: { ...auth, "Content-Type": "application/json" }, body: JSON.stringify(body) });

    const semProposta = await inscrever({});
    const comProposta = await inscrever({ valorProposto: 800 });
    const abaixo = await inscrever({ valorProposto: 50 });

    expect([semProposta.status, comProposta.status, abaixo.status]).toEqual([204, 204, 400]);
    expect(events.apply).toHaveBeenNthCalledWith(1, expect.anything(), "e1", null);
    expect(events.apply).toHaveBeenNthCalledWith(2, expect.anything(), "e1", 800);
    expect(await abaixo.json()).toEqual({ error: { code: "DADOS_INVALIDOS", message: "O cachê mínimo é de R$ 100,00." } });
  });

  it("POST /api/events/:id/convites responde 204 sem corpo depois de gravar o convite", async () => {
    const { app, events } = setup();
    const musicianId = "0f2bbfb1-d9d1-4bc5-a89e-d8fe00a4fe5f";

    const response = await app.request("/api/events/e1/convites", { method: "POST", headers: { ...auth, "Content-Type": "application/json" }, body: JSON.stringify({ musicianId }) });

    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
    expect(events.inviteMusician).toHaveBeenCalledWith(expect.objectContaining({ id: "u1" }), "e1", musicianId);
  });

  it("POST /api/events/:id/convites devolve o erro do serviço com corpo JSON", async () => {
    const { app, events } = setup();
    events.inviteMusician.mockRejectedValueOnce(new AppError(409, "NAO_FAVORITO", "Salve o músico nos favoritos antes de convidar."));

    const response = await app.request("/api/events/e1/convites", { method: "POST", headers: { ...auth, "Content-Type": "application/json" }, body: JSON.stringify({ musicianId: "0f2bbfb1-d9d1-4bc5-a89e-d8fe00a4fe5f" }) });
    const invalido = await app.request("/api/events/e1/convites", { method: "POST", headers: { ...auth, "Content-Type": "application/json" }, body: JSON.stringify({ musicianId: "m1" }) });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: { code: "NAO_FAVORITO", message: "Salve o músico nos favoritos antes de convidar." } });
    expect(invalido.status).toBe(400);
    expect(events.inviteMusician).toHaveBeenCalledTimes(1);
  });

  it("POST /api/events/:id/contestacao responde 204 sem corpo depois de abrir a contestação", async () => {
    const { app, events } = setup();
    const motivo = "O músico não apareceu no bar.";

    const response = await app.request("/api/events/e1/contestacao", { method: "POST", headers: { ...auth, "Content-Type": "application/json" }, body: JSON.stringify({ motivo }) });

    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
    expect(events.openDispute).toHaveBeenCalledWith(expect.objectContaining({ id: "u1" }), "e1", motivo);
  });

  it("POST /api/events rejeita cachê abaixo do mínimo antes de chegar ao serviço", async () => {
    const { app, events } = setup();
    const form = new FormData();
    form.append("dados", JSON.stringify({
      titulo: "Noite de rock", tipoEvento: "Corporativo", inicio: "2030-01-01T20:00:00Z", duracaoMinutos: 120,
      uf: "PR", cidade: "Cascavel", endereco: "Av. Brasil, 1000", estilosMusicais: ["Rock"], cache: 99.99,
    }));

    const response = await app.request("/api/events", { method: "POST", body: form, headers: auth });

    expect(response.status).toBe(400);
    expect((await response.json()).error.message).toBe("O cachê mínimo é de R$ 100,00.");
    expect(events.createEvent).not.toHaveBeenCalled();
  });

  it("POST /api/events/:id/checkout ignora valores enviados pelo cliente e não expõe o ID da Asaas", async () => {
    const { app, payments } = setup();

    const response = await app.request("/api/events/e1/checkout", {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ candidateId: CANDIDATE_ID, valor: 1, amount: 1 }),
    });

    expect(response.status).toBe(201);
    expect(payments.startCheckout).toHaveBeenCalledWith({ id: "u1", email: "bar@exemplo.com" }, "e1", CANDIDATE_ID, expect.any(Date), undefined);
    const body = await response.json();
    expect(body).toMatchObject({ id: "p1", cache: 500, comissao: 50, valor: 550, status: "PENDENTE", pixCopiaCola: "000201..." });
    expect(JSON.stringify(body)).not.toContain("pay_interno");
  });
});

describe("POST /api/webhooks/asaas", () => {
  const notification = { id: "evt_1", event: "PAYMENT_RECEIVED", payment: { id: "pay_1" } };
  const send = (app: ReturnType<typeof setup>["app"], headers: Record<string, string>, body: unknown = notification) =>
    app.request("/api/webhooks/asaas", { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });

  it("recusa notificações sem o token ou com token errado", async () => {
    const { app, payments } = setup();

    const semToken = await send(app, {});
    const tokenErrado = await send(app, { "asaas-access-token": "outro-token" });

    expect([semToken.status, tokenErrado.status]).toEqual([401, 401]);
    expect(payments.handleWebhook).not.toHaveBeenCalled();
  });

  it("recusa tudo quando o token não está configurado no servidor", async () => {
    const { accounts, events, payments } = setup();
    const app = createApp({
      accounts: accounts as unknown as AccountService,
      events: events as unknown as EventService,
      payments: payments as unknown as PaymentService,
      verifyToken: async () => null,
      allowedOrigins: [],
      asaasWebhookToken: undefined,
    });

    const response = await send(app, { "asaas-access-token": "" });

    expect(response.status).toBe(401);
  });

  it("processa a notificação autenticada", async () => {
    const { app, payments } = setup();

    const response = await send(app, { "asaas-access-token": WEBHOOK_TOKEN });

    expect(response.status).toBe(200);
    expect(payments.handleWebhook).toHaveBeenCalledWith(notification);
  });

  it("rejeita corpo fora do formato esperado", async () => {
    const { app, payments } = setup();

    const response = await send(app, { "asaas-access-token": WEBHOOK_TOKEN }, { foo: "bar" });

    expect(response.status).toBe(400);
    expect(payments.handleWebhook).not.toHaveBeenCalled();
  });
});

describe("POST /api/events/:id/nao-comparecimento", () => {
  it("exige autenticação e repassa ao serviço", async () => {
    const { app, events } = setup();

    const anonimo = await app.request("/api/events/e1/nao-comparecimento", { method: "POST" });
    const autenticado = await app.request("/api/events/e1/nao-comparecimento", { method: "POST", headers: { Authorization: "Bearer token-valido" } });

    expect([anonimo.status, autenticado.status]).toEqual([401, 200]);
    expect(events.reportNoShow).toHaveBeenCalledWith({ id: "u1", email: "bar@exemplo.com" }, "e1");
  });
});

describe("limites por usuário nas rotas", () => {
  function setupLimites() {
    const usuarios: Record<string, { id: string; email: string }> = {
      "token-u1": { id: "u1", email: "u1@exemplo.com" },
      "token-u2": { id: "u2", email: "u2@exemplo.com" },
      "token-u3": { id: "u3", email: "u3@exemplo.com" },
    };
    const accounts = { deleteAccount: vi.fn(async () => {}) };
    const events = { getHiring: vi.fn(async () => ({})), sendMessage: vi.fn(async () => ({})) };
    const cobranca = {
      id: "p1", eventId: "e1", candidateId: CANDIDATE_ID, asaasPaymentId: "pay_interno", valor: 550, valorComissao: 50, valorCache: 500,
      repasseStatus: null, refundStatus: null, status: "PENDENTE" as const, pixCopiaCola: "000201...", pixQrCode: "base64", expiraEm: new Date("2030-01-01T12:15:00Z"),
    };
    const payments = {
      startCheckout: vi.fn(async () => cobranca),
      syncCheckout: vi.fn(async (): Promise<typeof cobranca | null> => cobranca),
      cancelPendingCheckout: vi.fn(async () => {}),
    };
    const app = createApp({
      accounts: accounts as unknown as AccountService,
      events: events as unknown as EventService,
      payments: payments as unknown as PaymentService,
      asaasWebhookToken: WEBHOOK_TOKEN,
      verifyToken: async (token) => usuarios[token] ?? null,
      allowedOrigins: [ORIGIN],
    });
    const req = (method: string, path: string, token?: string, body?: object) => app.request(path, {
      method,
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { req, accounts, events, payments };
  }

  const checkout = { candidateId: CANDIDATE_ID };

  it("checkout: soma eventos diferentes no mesmo contador, bloqueia sem chamar o serviço e mantém outros usuários livres", async () => {
    const { req, payments } = setupLimites();
    for (let i = 0; i < 10; i++) expect((await req("POST", `/api/events/e${i}/checkout`, "token-u1", checkout)).status).toBe(201);

    const bloqueada = await req("POST", "/api/events/e99/checkout", "token-u1", checkout);
    expect(bloqueada.status).toBe(429);
    expect(bloqueada.headers.get("Retry-After")).toBe("600");
    expect(await bloqueada.json()).toEqual({ error: { code: "MUITAS_TENTATIVAS", message: "Muitas tentativas de pagamento em pouco tempo." } });
    expect((await req("DELETE", "/api/events/e1/checkout", "token-u1")).status).toBe(429);
    expect(payments.startCheckout).toHaveBeenCalledTimes(10);
    expect(payments.cancelPendingCheckout).not.toHaveBeenCalled();

    expect((await req("POST", "/api/events/e1/checkout", "token-u2", checkout)).status).toBe(201);
  });

  it("sem token responde 401 antes do limitador e não consome o limite", async () => {
    const { req, payments } = setupLimites();
    for (let i = 0; i < 15; i++) expect((await req("POST", "/api/events/e1/checkout", undefined, checkout)).status).toBe(401);
    expect((await req("POST", "/api/events/e1/checkout", "token-invalido", checkout)).status).toBe(401);
    expect(payments.startCheckout).not.toHaveBeenCalled();
    expect((await req("POST", "/api/events/e1/checkout", "token-u1", checkout)).status).toBe(201);
  });

  it("GET do checkout responde a cobrança com 200 e, sem cobrança, 204 sem corpo", async () => {
    const { req, payments } = setupLimites();
    const comCobranca = await req("GET", "/api/events/e1/checkout", "token-u1");
    expect(comCobranca.status).toBe(200);
    expect(await comCobranca.json()).toMatchObject({ id: "p1", status: "PENDENTE", candidateId: CANDIDATE_ID, valor: 550 });

    payments.syncCheckout.mockResolvedValueOnce(null);
    const semCobranca = await req("GET", "/api/events/e1/checkout", "token-u1");
    expect(semCobranca.status).toBe(204);
    expect(await semCobranca.text()).toBe("");
  });

  it("a consulta do Pix a cada 5 segundos por 10 minutos não é bloqueada e não consome o limite do checkout", async () => {
    const { req, payments } = setupLimites();
    for (let i = 0; i < 120; i++) expect((await req("GET", "/api/events/e1/checkout", "token-u1")).status).toBe(200);
    expect(payments.syncCheckout).toHaveBeenCalledTimes(120);
    expect((await req("POST", "/api/events/e1/checkout", "token-u1", checkout)).status).toBe(201);
  });

  it("consulta da contratação: 30 por 10 minutos, sem executar o serviço quando bloqueada", async () => {
    const { req, events } = setupLimites();
    for (let i = 0; i < 30; i++) expect((await req("GET", `/api/events/e${i % 3}/contratacao`, "token-u1")).status).toBe(200);
    const bloqueada = await req("GET", "/api/events/e1/contratacao", "token-u1");
    expect(bloqueada.status).toBe(429);
    expect(bloqueada.headers.get("Retry-After")).toBe("600");
    expect(events.getHiring).toHaveBeenCalledTimes(30);
    expect((await req("GET", "/api/events/e1/contratacao", "token-u2")).status).toBe(200);
  });

  it("grupos diferentes não interferem: esgotar a consulta da contratação não bloqueia mensagens nem checkout", async () => {
    const { req, events } = setupLimites();
    for (let i = 0; i < 31; i++) await req("GET", "/api/events/e1/contratacao", "token-u1");
    expect((await req("POST", "/api/candidaturas/c1/mensagens", "token-u1", { texto: "Olá" })).status).toBe(201);
    expect((await req("POST", "/api/events/e1/checkout", "token-u1", checkout)).status).toBe(201);
    expect(events.sendMessage).toHaveBeenCalledOnce();
  });

  it("DELETE /me respeita ao mesmo tempo o limite por usuário e o limite por IP", async () => {
    const { req, accounts } = setupLimites();
    const corpo = (email: string) => ({ email, password: "senha" });

    for (let i = 0; i < 5; i++) expect((await req("DELETE", "/api/me", "token-u1", corpo("u1@exemplo.com"))).status).toBe(204);
    const porUsuario = await req("DELETE", "/api/me", "token-u1", corpo("u1@exemplo.com"));
    expect(porUsuario.status).toBe(429);
    expect(await porUsuario.json()).toEqual({ error: { code: "MUITAS_TENTATIVAS", message: "Muitas tentativas de excluir a conta em pouco tempo." } });

    for (let i = 0; i < 4; i++) expect((await req("DELETE", "/api/me", "token-u2", corpo("u2@exemplo.com"))).status).toBe(204);
    const porIp = await req("DELETE", "/api/me", "token-u3", corpo("u3@exemplo.com"));
    expect(porIp.status).toBe(429);
    expect(await porIp.json()).toEqual({ error: { code: "MUITAS_TENTATIVAS", message: "Limite temporário de tentativas atingido." } });

    expect(accounts.deleteAccount).toHaveBeenCalledTimes(9);
  });
});

describe("POST /api/admin/rotina-financeira", () => {
  const TOKEN_DA_ROTINA = "token-da-rotina-".repeat(3);

  function comRotina({ token = TOKEN_DA_ROTINA as string | null, permitida = true, iniciar = vi.fn(async () => ({ resultado: "INICIADA" as "INICIADA" | "EM_ANDAMENTO" })) } = {}) {
    const { accounts, events, payments } = setup();
    const app = createApp({
      accounts: accounts as unknown as AccountService,
      events: events as unknown as EventService,
      payments: payments as unknown as PaymentService,
      verifyToken: async () => ({ id: "u1", email: "bar@exemplo.com" }),
      allowedOrigins: [ORIGIN],
      asaasWebhookToken: WEBHOOK_TOKEN,
      adminToken: "token-do-suporte",
      rotinaFinanceira: { iniciar },
      financialRoutineToken: token,
      financialRoutineAllowed: permitida,
    });
    const disparar = async (headers: Record<string, string> = {}, body?: unknown): Promise<Response> =>
      app.request("/api/admin/rotina-financeira", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    return { app, iniciar, disparar };
  }

  it("sem token ou com token errado responde 401 e não inicia a rotina", async () => {
    const { disparar, iniciar } = comRotina();

    const respostas = await Promise.all([
      disparar(),
      disparar({ "x-rotina-token": "errado" }),
      disparar({ "x-rotina-token": TOKEN_DA_ROTINA.slice(0, -1) }),
      disparar({ "x-admin-token": "token-do-suporte" }),
      disparar({ Authorization: "Bearer sessao-de-usuario" }),
    ]);

    expect(respostas.map((r) => r.status)).toEqual([401, 401, 401, 401, 401]);
    expect(iniciar).not.toHaveBeenCalled();
  });

  it("com o token certo inicia a rotina e responde 202 sem esperar o processamento", async () => {
    const { disparar, iniciar } = comRotina();

    const response = await disparar({ "x-rotina-token": TOKEN_DA_ROTINA });

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toMatchObject({ resultado: "INICIADA" });
    expect(iniciar).toHaveBeenCalledTimes(1);
  });

  it("com uma execução em andamento responde 409 identificável e não inicia outra", async () => {
    const { disparar, iniciar } = comRotina({ iniciar: vi.fn(async () => ({ resultado: "EM_ANDAMENTO" as const })) });

    const response = await disparar({ "x-rotina-token": TOKEN_DA_ROTINA });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ resultado: "EM_ANDAMENTO" });
    expect(iniciar).toHaveBeenCalledTimes(1);
  });

  it("falha ao iniciar responde 503, diferente de uma execução em andamento", async () => {
    const { disparar } = comRotina({ iniciar: vi.fn(async () => Promise.reject(new Error("banco fora do ar"))) });
    vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await disparar({ "x-rotina-token": TOKEN_DA_ROTINA });

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "ROTINA_INDISPONIVEL" } });
  });

  it("sem segredo configurado, a rota recusa qualquer disparo", async () => {
    const { disparar, iniciar } = comRotina({ token: null });

    const respostas = await Promise.all([disparar({ "x-rotina-token": TOKEN_DA_ROTINA }), disparar({ "x-rotina-token": "" })]);

    expect(respostas.map((r) => r.status)).toEqual([403, 403]);
    expect(iniciar).not.toHaveBeenCalled();
  });

  it("em desenvolvimento com Supabase hospedado, recusa o disparo mesmo com o token certo", async () => {
    const { disparar, iniciar } = comRotina({ permitida: false });

    const response = await disparar({ "x-rotina-token": TOKEN_DA_ROTINA });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "ROTINA_BLOQUEADA_NO_AMBIENTE" } });
    expect(iniciar).not.toHaveBeenCalled();
  });

  it("parâmetros enviados não mudam a execução", async () => {
    const { disparar, iniciar } = comRotina();

    await disparar({ "x-rotina-token": TOKEN_DA_ROTINA }, { etapas: ["repasse"], valor: 1, now: "2020-01-01" });

    expect(iniciar).toHaveBeenCalledWith();
  });

  it("não expõe o segredo em respostas nem em logs", async () => {
    const erros = vi.spyOn(console, "error").mockImplementation(() => {});
    const avisos = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { disparar } = comRotina({ iniciar: vi.fn(async () => Promise.reject(new Error("falha"))) });

    const textos = await Promise.all([
      disparar({ "x-rotina-token": "errado" }).then((r) => r.text()),
      disparar({ "x-rotina-token": TOKEN_DA_ROTINA }).then((r) => r.text()),
    ]);

    const tudo = JSON.stringify([textos, erros.mock.calls, avisos.mock.calls]);
    expect(tudo).not.toContain(TOKEN_DA_ROTINA);
  });
});
