import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiRequest, errorMessage } from "./api.ts";

vi.mock("./config.ts", () => ({
  clientConfig: () => ({ apiUrl: "/api" }),
  supabase: () => ({ auth: { getSession: async () => ({ data: { session: null } }) } }),
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("apiRequest", () => {
  it("preserva o status e a mensagem de uma resposta HTTP de erro", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code: "LIMITE", message: "Aguarde um minuto." } }), { status: 429 })));

    await expect(apiRequest("/me")).rejects.toMatchObject({ status: 429, code: "LIMITE", message: "Aguarde um minuto." });
  });

  it("lê Retry-After e apresenta o prazo sem confundir 429 com falha de rede", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code: "MUITAS_TENTATIVAS", message: "Limite temporário de tentativas atingido." } }), {
      status: 429,
      headers: { "Retry-After": "90" },
    })));

    const error = await apiRequest("/auth/signup").catch((caught: unknown) => caught);
    expect(error).toMatchObject({ status: 429, code: "MUITAS_TENTATIVAS", retryAfterSeconds: 90 });
    expect(errorMessage(error)).toBe("Limite temporário de tentativas atingido. Tente novamente em 2 minutos.");
  });

  it.each([401, 403, 429, 500])("distingue HTTP %i sem corpo JSON de falha de rede", async (status) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("erro", { status })));

    await expect(apiRequest("/me")).rejects.toMatchObject({ status, code: "ERRO_DESCONHECIDO" });
  });

  it("identifica falha de rede e resposta HTML inesperada", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    await expect(apiRequest("/health")).rejects.toMatchObject({ status: 0, code: "SEM_CONEXAO" });

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html></html>", { status: 200 })));
    await expect(apiRequest("/health")).rejects.toMatchObject({ status: 200, code: "RESPOSTA_INVALIDA" });
  });

  it("distingue timeout de outras falhas de rede", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn((_url: string, options: RequestInit) => new Promise((_resolve, reject) => {
      options.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    })));

    const request = apiRequest("/health", { timeoutMs: 10 });
    const result = expect(request).rejects.toMatchObject({ status: 0, code: "TEMPO_ESGOTADO" } satisfies Partial<ApiError>);
    await vi.advanceTimersByTimeAsync(10);
    await result;
  });

  it("aplica o timeout também à leitura do corpo da resposta", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn((_url: string, options: RequestInit) => Promise.resolve({
      status: 200,
      ok: true,
      json: () => new Promise((_resolve, reject) => {
        options.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
      }),
    })));

    const request = apiRequest("/health", { timeoutMs: 10 });
    const result = expect(request).rejects.toMatchObject({ status: 0, code: "TEMPO_ESGOTADO" } satisfies Partial<ApiError>);
    await vi.advanceTimersByTimeAsync(10);
    await result;
  });
});
