import { afterEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAuthGateway } from "./supabase.ts";

const auth = vi.hoisted(() => ({ signUp: vi.fn(), signInWithPassword: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({
  createClient: (_url: string, _key: string, options: { global?: { fetch?: typeof fetch } }) => ({
    auth: {
      signUp: async (credentials: unknown) => {
        if (options.global?.fetch) await options.global.fetch("https://example.test/auth/v1/signup");
        return auth.signUp(credentials);
      },
      signInWithPassword: (credentials: unknown) => auth.signInWithPassword(credentials),
    },
  }),
}));

afterEach(() => {
  auth.signUp.mockReset();
  auth.signInWithPassword.mockReset();
  vi.unstubAllGlobals();
});

describe("createAuthGateway.signUp", () => {
  it("aceita um cadastro normal", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 200 })));
    auth.signUp.mockResolvedValue({ data: { user: { id: "u1", identities: [{}] } }, error: null });

    const gateway = createAuthGateway({} as SupabaseClient, "https://example.test", "anon");
    await expect(gateway.signUp("novo@example.test", "senha-forte", "2026-10-25")).resolves.toEqual({ userId: "u1" });
  });

  it("mantém o 429 do provedor e o Retry-After quando fornecido", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 429, headers: { "Retry-After": "120" } })));
    auth.signUp.mockResolvedValue({ data: { user: null }, error: { status: 429, code: "over_email_send_rate_limit" } });

    const gateway = createAuthGateway({} as SupabaseClient, "https://example.test", "anon");
    await expect(gateway.signUp("novo@example.test", "senha-forte", "2026-10-25")).rejects.toMatchObject({
      status: 429, code: "LIMITE_DE_ENVIO", retryAfter: "120",
    });
  });

  it("não transforma em 500 um 429 sem código específico", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 429 })));
    auth.signUp.mockResolvedValue({ data: { user: null }, error: { status: 429, code: "outro_limite" } });

    const gateway = createAuthGateway({} as SupabaseClient, "https://example.test", "anon");
    await expect(gateway.signUp("novo@example.test", "senha-forte", "2026-10-25")).rejects.toMatchObject({
      status: 429, code: "LIMITE_DE_ENVIO", retryAfter: undefined,
    });
  });
});

describe("captcha do Supabase Auth", () => {
  it("repassa o token do captcha no cadastro e traduz a recusa", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 400 })));
    auth.signUp.mockResolvedValue({ data: { user: null }, error: { status: 400, code: "captcha_failed" } });

    const gateway = createAuthGateway({} as SupabaseClient, "https://example.test", "anon");
    await expect(gateway.signUp("novo@example.test", "senha-forte", "2026-10-25", undefined, "token-captcha")).rejects.toMatchObject({
      status: 400, code: "CAPTCHA_INVALIDO",
    });
    expect(auth.signUp).toHaveBeenCalledWith(expect.objectContaining({ options: expect.objectContaining({ captchaToken: "token-captcha" }) }));
  });

  it("repassa o token do captcha ao conferir a senha e traduz a recusa", async () => {
    auth.signInWithPassword.mockResolvedValueOnce({ error: null }).mockResolvedValueOnce({ error: { status: 400, code: "captcha_failed" } });

    const gateway = createAuthGateway({} as SupabaseClient, "https://example.test", "anon");
    await expect(gateway.verifyPassword("a@example.test", "senha", "token-1")).resolves.toBe(true);
    await expect(gateway.verifyPassword("a@example.test", "senha", "token-2")).rejects.toMatchObject({ code: "CAPTCHA_INVALIDO" });
    expect(auth.signInWithPassword).toHaveBeenCalledWith({ email: "a@example.test", password: "senha", options: { captchaToken: "token-1" } });
  });
});
