import { describe, expect, it } from "vitest";
import { readFinanceConfig, readServerConfig } from "./config.ts";

const base = {
  SUPABASE_URL: "https://project.supabase.co",
  SUPABASE_ANON_KEY: "public-key",
  SUPABASE_SERVICE_ROLE_KEY: "private-key",
};

describe("configuração da API", () => {
  it("usa PORT local, origens locais e Asaas Sandbox no desenvolvimento", () => {
    const config = readServerConfig(base, ["192.168.1.10"]);
    expect(config.port).toBe(3333);
    expect(config.allowedOrigins).toContain("http://192.168.1.10:8081");
    expect(config.asaasApiUrl).toBe("https://api-sandbox.asaas.com/v3");
  });

  it("exige configuração explícita e HTTPS no Render", () => {
    const config = readServerConfig({
      ...base,
      NODE_ENV: "production",
      PORT: "10000",
      ALLOWED_ORIGINS: "https://muve.example",
      ASAAS_ENV: "sandbox",
      ASAAS_API_KEY: "sandbox-key",
      ASAAS_WEBHOOK_TOKEN: "webhook-token",
    });
    expect(config.port).toBe(10000);
    expect(config.allowedOrigins).toEqual(["https://muve.example"]);
    expect(config.allowedRedirects).toEqual(["muve://auth"]);
  });

  it.each([
    [{ PORT: "abc" }, "PORT"],
    [{ PORT: "0" }, "PORT"],
    [{ SUPABASE_SERVICE_ROLE_KEY: "" }, "SUPABASE_SERVICE_ROLE_KEY"],
    [{ ASAAS_ENV: "production", ASAAS_API_URL: "https://api-sandbox.asaas.com/v3" }, "ASAAS_API_URL"],
    [{ ALLOWED_ORIGINS: "https://muve.example/path" }, "ALLOWED_ORIGINS"],
  ])("rejeita configuração inválida", (overrides, message) => {
    expect(() => readServerConfig({ ...base, ...overrides })).toThrow(message);
  });

  it("recusa origem HTTP e credenciais Asaas ausentes em produção", () => {
    const production = { ...base, NODE_ENV: "production", ASAAS_ENV: "sandbox" };
    expect(() => readServerConfig({ ...production, ALLOWED_ORIGINS: "http://muve.example" })).toThrow("ALLOWED_ORIGINS");
    expect(() => readServerConfig({ ...production, ALLOWED_ORIGINS: "https://muve.example" })).toThrow("ASAAS_API_KEY");
  });
});

describe("configuração do processo financeiro", () => {
  it("exige apenas credenciais do Supabase e Asaas e a URL do aplicativo", () => {
    const config = readFinanceConfig({
      NODE_ENV: "production",
      SUPABASE_URL: "https://project.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "private-key",
      ASAAS_ENV: "sandbox",
      ASAAS_API_KEY: "sandbox-key",
      APP_URL: "https://muve.example",
    });
    expect(config.asaasApiUrl).toBe("https://api-sandbox.asaas.com/v3");
    expect(config.appUrl).toBe("https://muve.example");
  });

  it("recusa URL pública sem HTTPS e chave Asaas ausente", () => {
    const env = {
      NODE_ENV: "production",
      SUPABASE_URL: "https://project.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "private-key",
      ASAAS_ENV: "sandbox",
      APP_URL: "https://muve.example",
    };
    expect(() => readFinanceConfig(env)).toThrow("ASAAS_API_KEY");
    expect(() => readFinanceConfig({ ...env, ASAAS_API_KEY: "key", APP_URL: "http://muve.example" })).toThrow("APP_URL");
  });
});