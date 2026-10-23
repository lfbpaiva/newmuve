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
