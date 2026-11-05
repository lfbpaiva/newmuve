import { describe, expect, it } from "vitest";
import { readServerConfig } from "./config.ts";

const dev = { SUPABASE_URL: "https://x.supabase.co", SUPABASE_ANON_KEY: "anon", SUPABASE_SERVICE_ROLE_KEY: "service" };
const prod = {
  ...dev,
  NODE_ENV: "production",
  ASAAS_ENV: "sandbox",
  ASAAS_API_KEY: "chave",
  ASAAS_WEBHOOK_TOKEN: "token",
  ALLOWED_ORIGINS: "https://app.muve.com.br",
};

describe("configuração da API", () => {
  it("em desenvolvimento, usa o sandbox e libera as origens locais", () => {
    const config = readServerConfig(dev, ["192.168.0.10"]);

    expect(config.port).toBe(3333);
    expect(config.asaasApiUrl).toBe("https://api-sandbox.asaas.com/v3");
    expect(config.allowedOrigins).toEqual(expect.arrayContaining(["http://localhost:8081", "http://192.168.0.10:8081"]));
    expect(config.allowedRedirects).toEqual(["muve://auth", "exp://*"]);
    expect(config.smtp).toBeNull();
  });

  it("aponta a variável obrigatória que falta", () => {
    expect(() => readServerConfig({ ...dev, SUPABASE_SERVICE_ROLE_KEY: " " })).toThrow("SUPABASE_SERVICE_ROLE_KEY");
  });

  it("recusa URL da Asaas de um ambiente com a configuração de outro", () => {
    expect(() => readServerConfig({ ...dev, ASAAS_ENV: "sandbox", ASAAS_API_URL: "https://api.asaas.com/v3" })).toThrow("ASAAS_API_URL");
    expect(() => readServerConfig({ ...dev, ASAAS_ENV: "production", ASAAS_API_URL: "https://api-sandbox.asaas.com/v3" })).toThrow("ASAAS_API_URL");
    expect(() => readServerConfig({ ...dev, ASAAS_ENV: "homologacao" })).toThrow("ASAAS_ENV");
  });

  it("em produção, exige Asaas e origem HTTPS, e não abre origens locais", () => {
    expect(readServerConfig(prod, ["192.168.0.10"]).allowedOrigins).toEqual(["https://app.muve.com.br"]);
    expect(() => readServerConfig({ ...prod, ASAAS_ENV: "" })).toThrow("ASAAS_ENV");
    expect(() => readServerConfig({ ...prod, ASAAS_API_KEY: "" })).toThrow("ASAAS_API_KEY");
    expect(() => readServerConfig({ ...prod, ASAAS_WEBHOOK_TOKEN: "" })).toThrow("ASAAS_WEBHOOK_TOKEN");
    expect(() => readServerConfig({ ...prod, ALLOWED_ORIGINS: "http://app.muve.com.br" })).toThrow("HTTPS");
    expect(() => readServerConfig({ ...prod, ALLOWED_ORIGINS: "" })).toThrow("ALLOWED_ORIGINS");
  });

  it("recusa redirecionamento inseguro e porta inválida", () => {
    expect(() => readServerConfig({ ...prod, ALLOWED_REDIRECTS: "exp://*" })).toThrow("ALLOWED_REDIRECTS");
    expect(() => readServerConfig({ ...dev, ALLOWED_REDIRECTS: "javascript:alert(1)" })).toThrow("ALLOWED_REDIRECTS");
    expect(() => readServerConfig({ ...dev, PORT: "abc" })).toThrow("PORT");
  });

  it("SMTP informado precisa estar completo", () => {
    expect(() => readServerConfig({ ...dev, SMTP_HOST: "smtp.exemplo.com" })).toThrow("SMTP_USER");
    expect(readServerConfig({ ...dev, SMTP_HOST: "smtp.exemplo.com", SMTP_USER: "u", SMTP_PASS: "p", SMTP_FROM: "Muve <a@b.com>" }).smtp?.port).toBe(587);
  });
});
