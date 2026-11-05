import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AccountService } from "../services/accountService.ts";
import { createEventService } from "../services/eventService.ts";
import { createNotifier } from "../services/notifications.ts";
import { createPaymentService } from "../services/paymentService.ts";
import { contratante, memoryWorld, musico, outroContratante, outroMusico, payAtAsaas } from "../services/testing.ts";
import { createApp } from "./app.ts";

const usuarios = { contratante, outroContratante, musico, outroMusico };
const ORIGEM_PERMITIDA = "http://localhost:8081";

function setup() {
  const world = memoryWorld();
  const notifier = createNotifier({ ...world.stores, appUrl: ORIGEM_PERMITIDA });
  const payments = createPaymentService({ ...world.stores, notifier });
  const events = createEventService({ ...world.stores, payments, notifier });
  const accounts = { signup: vi.fn(async () => {}) };
  const app = createApp({
    accounts: accounts as unknown as AccountService,
    events,
    payments,
    asaasWebhookToken: "token-do-webhook",
    adminToken: "token-do-suporte",
    verifyToken: async (token) => usuarios[token as keyof typeof usuarios] ?? null,
    allowedOrigins: [ORIGEM_PERMITIDA],
    allowedRedirects: ["muve://auth"],
  });
  return { world, app, payments, accounts };
}

let t: ReturnType<typeof setup>;
beforeEach(() => {
  t = setup();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

const como = (usuario: keyof typeof usuarios, method: string, body?: object) => ({
  method,
  headers: { Authorization: `Bearer ${usuario}`, "Content-Type": "application/json" },
  body: body && JSON.stringify(body),
});

describe("acesso a dados de outra pessoa (IDOR)", () => {
  it("contratante não exclui nem cobra por evento de outro contratante", async () => {
    const event = t.world.seedEvent({ contractorId: "c1" });
    const candidate = t.world.seedCandidate(event.id, "m1");

    const exclusao = await t.app.request(`/api/events/${event.id}`, como("outroContratante", "DELETE"));
    const cobranca = await t.app.request(`/api/events/${event.id}/checkout`, como("outroContratante", "POST", { candidateId: "7b0d3c0e-5f0a-4a52-9d5b-2f1f6c1f9a10" }));

    expect(exclusao.status).toBe(404);
    expect(cobranca.status).toBe(404);
    expect(t.world.events.has(event.id)).toBe(true);
    expect(t.world.asaasCalls.createPixCharge).toHaveLength(0);
    expect(candidate.eventId).toBe(event.id);
  });

  it("só as partes veem a contratação, com endereço e contatos", async () => {
    const event = t.world.seedEvent({ contractorId: "c1" });
    const candidate = t.world.seedCandidate(event.id, "m1");
    const payment = await t.payments.startCheckout(contratante, event.id, candidate.id);
    payAtAsaas(t.world, payment.asaasPaymentId);
    await t.payments.syncCheckout(contratante, event.id);

    const parte = await t.app.request(`/api/events/${event.id}/contratacao`, como("musico", "GET"));
    const estranho = await t.app.request(`/api/events/${event.id}/contratacao`, como("outroMusico", "GET"));

    expect(parte.status).toBe(200);
    expect(estranho.status).toBe(404);
    expect(await estranho.text()).not.toContain("Cascavel");
  });
});

describe("autenticação", () => {
  it.each([
    ["GET", "/api/me"],
    ["POST", "/api/events"],
    ["DELETE", "/api/events/e1"],
    ["GET", "/api/events/e1/contratacao"],
    ["POST", "/api/candidaturas/c1/mensagens"],
  ])("%s %s recusa pedido sem token ou com token inválido", async (method, path) => {
    const semToken = await t.app.request(path, { method });
    const tokenInvalido = await t.app.request(path, { method, headers: { Authorization: "Bearer inventado" } });

    expect([semToken.status, tokenInvalido.status]).toEqual([401, 401]);
  });

  it("webhook da Asaas e rotas do suporte exigem o token certo", async () => {
    const body = JSON.stringify({ id: "evt_1", event: "PAYMENT_RECEIVED" });
    const webhook = await t.app.request("/api/webhooks/asaas", { method: "POST", headers: { "asaas-access-token": "errado", "Content-Type": "application/json" }, body });
    const repasse = await t.app.request("/api/admin/repasses/p1/liberacao", { method: "POST", headers: { "x-admin-token": "errado" } });
    const contestacao = await t.app.request("/api/admin/contestacoes/d1/resolucao", { method: "POST", headers: { "x-admin-token": "" } });

    expect([webhook.status, repasse.status, contestacao.status]).toEqual([401, 401, 401]);
  });
});

describe("abuso de cadastro", () => {
  const cadastro = (dados: object) => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(dados) });
  const valido = { role: "MUSICIAN", nome: "Ana", email: "ana@exemplo.com", password: "segredo1", aceiteTermos: true };

  it("recusa senha fraca antes de chegar à conta", async () => {
    const response = await t.app.request("/api/auth/signup", cadastro({ ...valido, password: "123" }));

    expect(response.status).toBe(400);
    expect(t.accounts.signup).not.toHaveBeenCalled();
  });

  it("limita tentativas em massa e informa quando tentar de novo", async () => {
    const respostas = [];
    for (let i = 0; i < 30; i++) respostas.push(await t.app.request("/api/auth/signup", cadastro(valido)));
    const bloqueada = respostas.find((response) => response.status === 429);

    expect(bloqueada).toBeDefined();
    expect(Number(bloqueada!.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect(t.accounts.signup.mock.calls.length).toBeLessThan(30);
  });
});

describe("origem das requisições", () => {
  it("só libera CORS para a origem configurada", async () => {
    const permitida = await t.app.request("/api/health", { headers: { Origin: ORIGEM_PERMITIDA } });
    const outra = await t.app.request("/api/health", { headers: { Origin: "https://site-malicioso.com" } });

    expect(permitida.headers.get("Access-Control-Allow-Origin")).toBe(ORIGEM_PERMITIDA);
    expect(outra.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });
});
