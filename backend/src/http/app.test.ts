import { describe, expect, it, vi } from "vitest";
import type { AccountService } from "../services/accountService.ts";
import type { EventService } from "../services/eventService.ts";
import type { PaymentService } from "../services/paymentService.ts";
import { createApp } from "./app.ts";

const ORIGIN = "http://localhost:8443";
const WEBHOOK_TOKEN = "token-do-webhook";
const CANDIDATE_ID = "7b0d3c0e-5f0a-4a52-9d5b-2f1f6c1f9a10";

function setup() {
  const accounts = {
    signup: vi.fn(async () => {}),
    getMe: vi.fn(async () => ({ id: "u1", role: "CONTRACTOR" as const, email: "bar@exemplo.com" })),
    updateProfile: vi.fn(async () => {}),
    deleteAccount: vi.fn(async () => {}),
  };
  const events = {
    createEvent: vi.fn(async () => ({ id: "e1" })),
    apply: vi.fn(async () => {}),
    reportNoShow: vi.fn(async () => {}),
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
  };
  const app = createApp({
    accounts: accounts as unknown as AccountService,
    events: events as unknown as EventService,
    payments: payments as unknown as PaymentService,
    asaasWebhookToken: WEBHOOK_TOKEN,
    verifyToken: async (token) => (token === "token-valido" ? { id: "u1", email: "bar@exemplo.com" } : null),
    allowedOrigins: [ORIGIN],
    allowedRedirects: ["muve://auth"],
  });
  return { app, accounts, events, payments };
}

const signupBody = (dados: object) => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(dados) });

const contratante = { role: "CONTRACTOR", nome: "Bar do Zé", email: "  Contato@BarDoZe.com.br ", password: "segredo1" };

describe("POST /api/auth/signup", () => {
  it("normaliza os dados e repassa ao serviço", async () => {
    const { app, accounts } = setup();

    const response = await app.request("/api/auth/signup", { ...signupBody(contratante), headers: { ...signupBody(contratante).headers, Origin: ORIGIN } });

    expect(response.status).toBe(201);
    expect(accounts.signup).toHaveBeenCalledWith(expect.objectContaining({ email: "contato@bardoze.com.br", nome: "Bar do Zé", role: "CONTRACTOR" }), ORIGIN);
  });

  it.each([
    [{ email: "sem-arroba.com" }, "Informe um e-mail válido."],
    [{ password: "123" }, "A senha deve ter pelo menos 6 caracteres."],
    [{ nome: "" }, "Informe seu nome."],
    [{ role: "ADMIN" }, "Selecione o tipo de conta."],
  ])("rejeita %j", async (override, message) => {
    const { app, accounts } = setup();

    const response = await app.request("/api/auth/signup", signupBody({ ...contratante, ...override }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: { code: "DADOS_INVALIDOS", message } });
    expect(accounts.signup).not.toHaveBeenCalled();
  });

  it("usa o destino do app quando autorizado e ignora destinos fora da lista", async () => {
    const { app, accounts } = setup();

    await app.request("/api/auth/signup", signupBody({ ...contratante, redirectTo: "muve://auth" }));
    await app.request("/api/auth/signup", signupBody({ ...contratante, redirectTo: "https://malicioso.example" }));

    expect(accounts.signup).toHaveBeenNthCalledWith(1, expect.anything(), "muve://auth");
    expect(accounts.signup).toHaveBeenNthCalledWith(2, expect.anything(), undefined);
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

    expect([criar.status, inscrever.status, checkout.status]).toEqual([401, 401, 401]);
    expect(events.createEvent).not.toHaveBeenCalled();
    expect(payments.startCheckout).not.toHaveBeenCalled();
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
    expect(payments.startCheckout).toHaveBeenCalledWith({ id: "u1", email: "bar@exemplo.com" }, "e1", CANDIDATE_ID);
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

    expect([anonimo.status, autenticado.status]).toEqual([401, 204]);
    expect(events.reportNoShow).toHaveBeenCalledWith({ id: "u1", email: "bar@exemplo.com" }, "e1");
  });
});
