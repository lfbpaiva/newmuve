import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { AppError } from "../domain/errors.ts";
import { rateLimit } from "./rateLimit.ts";

function setup() {
  let time = 0;
  const app = new Hono();
  app.onError((error, c) => c.json({}, error instanceof AppError ? error.status : 500));
  app.post("/login", rateLimit({ limit: 2, windowMs: 1000, now: () => time }), (c) => c.json({ ok: true }));
  const hit = (ip: string) => app.request("/login", { method: "POST", headers: { "x-forwarded-for": ip } });
  return { hit, advance: (ms: number) => (time += ms) };
}

describe("rateLimit", () => {
  it("bloqueia o cliente que excede o limite na janela e informa quando tentar de novo", async () => {
    const { hit } = setup();

    expect((await hit("1.1.1.1")).status).toBe(200);
    expect((await hit("1.1.1.1")).status).toBe(200);
    const blocked = await hit("1.1.1.1");

    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("Retry-After")).toBe("1");
  });

  it("conta cada cliente separadamente e libera após a janela", async () => {
    const { hit, advance } = setup();
    await hit("1.1.1.1");
    await hit("1.1.1.1");

    expect((await hit("2.2.2.2")).status).toBe(200);
    advance(1001);
    expect((await hit("1.1.1.1")).status).toBe(200);
  });
});
