import { describe, expect, it } from "vitest";
import { readServerConfig, shouldLoadEnvFile } from "./config.ts";

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

  it("rotina financeira fica desabilitada sem a variável, em qualquer ambiente", () => {
    expect(readServerConfig(dev).financialRoutine).toBe("disabled");
    expect(readServerConfig(prod).financialRoutine).toBe("disabled");
    expect(readServerConfig({ ...dev, ENABLE_FINANCIAL_ROUTINE: " " }).financialRoutine).toBe("disabled");
  });

  it("rotina financeira só é habilitada com true explícito", () => {
    expect(readServerConfig({ ...dev, ENABLE_FINANCIAL_ROUTINE: "false" }).financialRoutine).toBe("disabled");
    expect(readServerConfig({ ...dev, ENABLE_FINANCIAL_ROUTINE: "FALSE" }).financialRoutine).toBe("disabled");
    expect(readServerConfig({ ...dev, ENABLE_FINANCIAL_ROUTINE: "true" }).financialRoutine).toBe("enabled");
    expect(readServerConfig({ ...prod, ENABLE_FINANCIAL_ROUTINE: " True " }).financialRoutine).toBe("enabled");
  });

  it("valor não reconhecido para a rotina financeira não a habilita e não impede a API de subir", () => {
    for (const valor of ["1", "yes", "sim", "on", "verdadeiro", "true1"]) {
      expect(readServerConfig({ ...dev, ENABLE_FINANCIAL_ROUTINE: valor }).financialRoutine).toBe("invalid");
    }
  });

  it("o disparo externo da rotina só fica disponível com um token próprio e forte", () => {
    const forte = "a".repeat(20) + "B-9_".repeat(4);
    expect(readServerConfig(dev).financialRoutineTrigger).toEqual({ token: null, problema: "ausente" });
    expect(readServerConfig({ ...prod, FINANCIAL_ROUTINE_TOKEN: ` ${forte} ` }).financialRoutineTrigger).toEqual({ token: forte, problema: null });
    expect(readServerConfig({ ...prod, FINANCIAL_ROUTINE_TOKEN: "curto" }).financialRoutineTrigger).toEqual({ token: null, problema: "invalido" });
    expect(readServerConfig({ ...prod, FINANCIAL_ROUTINE_TOKEN: "x".repeat(40) + " espaço" }).financialRoutineTrigger).toEqual({ token: null, problema: "invalido" });
    expect(readServerConfig({ ...prod, ADMIN_TOKEN: forte, FINANCIAL_ROUTINE_TOKEN: forte }).financialRoutineTrigger).toEqual({ token: null, problema: "invalido" });
    expect(readServerConfig({ ...prod, FINANCIAL_ROUTINE_TOKEN: forte }).financialRoutine).toBe("disabled");
  });

  it("a rotina financeira só é permitida em produção ou com Supabase local", () => {
    expect(readServerConfig(prod).financialRoutineAllowed).toBe(true);
    expect(readServerConfig(dev).financialRoutineAllowed).toBe(false);
    expect(readServerConfig({ ...dev, ENABLE_FINANCIAL_ROUTINE: "true", FINANCIAL_ROUTINE_TOKEN: "a".repeat(40) }).financialRoutineAllowed).toBe(false);
    for (const url of ["http://127.0.0.1:54321", "http://localhost:54321", "http://[::1]:54321"]) {
      expect(readServerConfig({ ...dev, SUPABASE_URL: url }).financialRoutineAllowed).toBe(true);
    }
    for (const url of ["http://127.0.0.1.exemplo.com", "http://localhost.exemplo.com", "http://192.168.0.10:54321"]) {
      expect(readServerConfig({ ...dev, SUPABASE_URL: url }).financialRoutineAllowed).toBe(false);
    }
  });

  it("token do suporte curto desliga as rotas do suporte", () => {
    expect(readServerConfig({ ...dev, ADMIN_TOKEN: "curto" }).adminToken).toBeUndefined();
    expect(readServerConfig({ ...dev, ADMIN_TOKEN: ` ${"s".repeat(40)} ` }).adminToken).toBe("s".repeat(40));
  });

  it("SMTP informado precisa estar completo", () => {
    expect(() => readServerConfig({ ...dev, SMTP_HOST: "smtp.exemplo.com" })).toThrow("SMTP_USER");
    expect(readServerConfig({ ...dev, SMTP_HOST: "smtp.exemplo.com", SMTP_USER: "u", SMTP_PASS: "p", SMTP_FROM: "Muve <a@b.com>" }).smtp?.port).toBe(587);
  });

  it("a API escuta em todas as interfaces por padrão e aceita um endereço restrito", () => {
    expect(readServerConfig(dev).host).toBe("0.0.0.0");
    expect(readServerConfig({ ...dev, HOST: " 127.0.0.1 " }).host).toBe("127.0.0.1");
  });

  it("backend/.env só é carregado em desenvolvimento e pode ser ignorado pelo E2E", () => {
    expect(shouldLoadEnvFile({})).toBe(true);
    expect(shouldLoadEnvFile({ NODE_ENV: "production" })).toBe(false);
    expect(shouldLoadEnvFile({ MUVE_IGNORAR_ARQUIVO_ENV: "true" })).toBe(false);
    expect(shouldLoadEnvFile({ MUVE_IGNORAR_ARQUIVO_ENV: "false" })).toBe(true);
  });
});
