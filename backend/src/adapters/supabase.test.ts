import { afterEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAuthGateway } from "./supabase.ts";

const auth = vi.hoisted(() => ({ signUp: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({
  createClient: (_url: string, _key: string, options: { global?: { fetch?: typeof fetch } }) => ({
    auth: {
      signUp: async () => {
        if (options.global?.fetch) await options.global.fetch("https://example.test/auth/v1/signup");
        return auth.signUp();
      },
    },
  }),
}));

afterEach(() => {
  auth.signUp.mockReset();
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
