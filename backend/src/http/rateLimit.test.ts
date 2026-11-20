import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { AppError } from "../domain/errors.ts";
import { rateLimit } from "./rateLimit.ts";

function setup() {
  let time = 0;
  const app = new Hono();
  const limiter = rateLimit({ limit: 2, windowMs: 1000, now: () => time, remoteAddress: (c) => c.req.header("x-test-peer") });
  app.onError((error, c) => {
    if (error instanceof AppError && error.retryAfter) c.header("Retry-After", error.retryAfter);
    return c.json({}, error instanceof AppError ? error.status : 500);
  });
  app.post("/signup", limiter, (c) => c.json({ ok: true }));
  app.post("/account-delete", limiter, (c) => c.json({ ok: true }));
  const hit = (peer: string, path = "/signup", forwarded?: string) => app.request(path, {
    method: "POST",
    headers: { "x-test-peer": peer, ...(forwarded ? { "x-forwarded-for": forwarded } : {}) },
  });
  return { hit, advance: (ms: number) => (time += ms) };
}

describe("rateLimit", () => {
  it("permite as tentativas normais, bloqueia as repetidas e libera após a janela", async () => {
    const { hit, advance } = setup();

    expect((await hit("198.51.100.1")).status).toBe(200);
    expect((await hit("198.51.100.1")).status).toBe(200);
    const blocked = await hit("198.51.100.1");
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("Retry-After")).toBe("1");

    advance(1001);
    expect((await hit("198.51.100.1")).status).toBe(200);
  });

  it("isola os IPs diretos mesmo sem X-Forwarded-For e ignora cabeçalhos falsos", async () => {
    const { hit } = setup();
    await hit("198.51.100.1", "/signup", "203.0.113.10");
    await hit("198.51.100.1", "/signup", "203.0.113.11");

    expect((await hit("198.51.100.1", "/signup", "203.0.113.12")).status).toBe(429);
    expect((await hit("198.51.100.2")).status).toBe(200);
  });

  it("usa o IP real encaminhado por proxy confiável sem aceitar o início falso da lista", async () => {
    const { hit } = setup();
    await hit("127.0.0.1", "/signup", "203.0.113.99, 198.51.100.1");
    await hit("127.0.0.1", "/signup", "203.0.113.98, 198.51.100.1");

    expect((await hit("127.0.0.1", "/signup", "203.0.113.97, 198.51.100.1")).status).toBe(429);
    expect((await hit("127.0.0.1", "/signup", "198.51.100.2")).status).toBe(200);
  });

  it("não compartilha o limite entre rotas sensíveis", async () => {
    const { hit } = setup();
    await hit("198.51.100.1");
    await hit("198.51.100.1");

    expect((await hit("198.51.100.1")).status).toBe(429);
    expect((await hit("198.51.100.1", "/account-delete")).status).toBe(200);
  });
});

describe("rateLimit por usuário e grupo", () => {
  function setupGrupo() {
    let time = 0;
    const app = new Hono<{ Variables: { user?: string } }>();
    app.onError((error, c) => {
      if (error instanceof AppError && error.retryAfter) c.header("Retry-After", error.retryAfter);
      return c.json({ error: { code: error instanceof AppError ? error.code : "ERRO", message: error.message } }, error instanceof AppError ? error.status : 500);
    });
    app.use("*", async (c, next) => {
      const user = c.req.header("x-test-user");
      if (user) c.set("user", user);
      await next();
    });
    const limite = (grupo: string) => rateLimit({ grupo, limit: 2, windowMs: 60_000, now: () => time, remoteAddress: (c) => c.req.header("x-test-peer"), identificar: (c) => c.get("user"), mensagem: `Limite de ${grupo}.` });
    const checkout = limite("checkout");
    const mensagens = limite("mensagens");
    app.post("/events/:id/checkout", checkout, (c) => c.json({ ok: true }));
    app.delete("/events/:id/checkout", checkout, (c) => c.json({ ok: true }));
    app.post("/candidaturas/:id/mensagens", mensagens, (c) => c.json({ ok: true }));
    const hit = (path: string, user?: string, method = "POST", peer = "198.51.100.1") => app.request(path, { method, headers: { "x-test-peer": peer, ...(user ? { "x-test-user": user } : {}) } });
    return { hit, advance: (ms: number) => (time += ms) };
  }

  it("usuários diferentes têm contadores independentes, mesmo no mesmo IP", async () => {
    const { hit } = setupGrupo();
    await hit("/events/e1/checkout", "u1");
    await hit("/events/e1/checkout", "u1");
    expect((await hit("/events/e1/checkout", "u1")).status).toBe(429);
    expect((await hit("/events/e1/checkout", "u2")).status).toBe(200);
  });

  it("ids diferentes na URL e rotas do mesmo grupo somam no mesmo contador", async () => {
    const { hit } = setupGrupo();
    await hit("/events/e1/checkout", "u1");
    await hit("/events/e2/checkout", "u1", "DELETE");
    expect((await hit("/events/e3/checkout", "u1")).status).toBe(429);
  });

  it("grupos diferentes não interferem entre si", async () => {
    const { hit } = setupGrupo();
    await hit("/events/e1/checkout", "u1");
    await hit("/events/e1/checkout", "u1");
    expect((await hit("/events/e1/checkout", "u1")).status).toBe(429);
    expect((await hit("/candidaturas/c1/mensagens", "u1")).status).toBe(200);
  });

  it("responde 429 com a mensagem do grupo e o Retry-After restante da janela", async () => {
    const { hit, advance } = setupGrupo();
    await hit("/events/e1/checkout", "u1");
    await hit("/events/e1/checkout", "u1");
    advance(15_000);
    const bloqueada = await hit("/events/e1/checkout", "u1");
    expect(bloqueada.status).toBe(429);
    expect(bloqueada.headers.get("Retry-After")).toBe("45");
    expect(await bloqueada.json()).toEqual({ error: { code: "MUITAS_TENTATIVAS", message: "Limite de checkout." } });
    advance(45_000);
    expect((await hit("/events/e1/checkout", "u1")).status).toBe(200);
  });

  it("sem usuário identificado, conta pelo IP e não se mistura com o contador de um usuário", async () => {
    const { hit } = setupGrupo();
    await hit("/events/e1/checkout");
    await hit("/events/e1/checkout");
    expect((await hit("/events/e1/checkout")).status).toBe(429);
    expect((await hit("/events/e1/checkout", undefined, "POST", "198.51.100.2")).status).toBe(200);
    expect((await hit("/events/e1/checkout", "u1")).status).toBe(200);
  });
});
