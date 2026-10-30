export type AsaasEnvironment = "sandbox" | "production";

export interface ServerConfig {
  port: number;
  supabaseUrl: string;
  supabaseAnonKey: string;
  supabaseServiceRoleKey: string;
  asaasEnvironment: AsaasEnvironment;
  asaasApiUrl: string;
  asaasApiKey: string | undefined;
  asaasWebhookToken: string | undefined;
  allowedOrigins: string[];
  allowedRedirects: string[];
  smtp: { host: string; port: number; user: string; pass: string; from: string } | null;
}

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error("Variável de ambiente obrigatória: " + name);
  return value;
}

function validPort(value: string, name: string): number {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(name + " deve ser um número inteiro entre 1 e 65535.");
  }
  return port;
}

function origin(value: string, name: string, production: boolean): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(name + " deve conter uma origem HTTP válida.");
  }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password ||
      url.pathname !== "/" || url.search || url.hash) {
    throw new Error(name + " deve conter apenas uma origem HTTP, sem caminho ou credenciais.");
  }
  if (production && url.protocol !== "https:") {
    throw new Error(name + " deve usar HTTPS em produção.");
  }
  return url.origin;
}

export function readServerConfig(env: NodeJS.ProcessEnv, localHosts: string[] = []): ServerConfig {
  const production = env.NODE_ENV === "production";
  const port = validPort(env.PORT?.trim() || (production ? "10000" : "3333"), "PORT");
  const supabaseUrl = origin(required(env, "SUPABASE_URL"), "SUPABASE_URL", production);
  const supabaseAnonKey = required(env, "SUPABASE_ANON_KEY");
  const supabaseServiceRoleKey = required(env, "SUPABASE_SERVICE_ROLE_KEY");

  const rawOrigins = env.ALLOWED_ORIGINS?.trim() || (production ? "" : "http://localhost:8443,http://localhost:8081");
  if (!rawOrigins) throw new Error("Variável de ambiente obrigatória: ALLOWED_ORIGINS");
  const configuredOrigins = rawOrigins.split(",").map((item) => origin(item.trim(), "ALLOWED_ORIGINS", production));
  const devOrigins = production ? [] : ["127.0.0.1", ...localHosts].flatMap(
    (host) => [8443, 8081].map((clientPort) => "http://" + host + ":" + clientPort),
  );
  const allowedOrigins = [...new Set([...configuredOrigins, ...devOrigins])];

  const allowedRedirects = (env.ALLOWED_REDIRECTS?.trim() || "muve://auth").split(",").map((item) => item.trim());
  for (const redirect of allowedRedirects) {
    if (redirect === "muve://auth") continue;
    let url: URL;
    try {
      url = new URL(redirect);
    } catch {
      throw new Error("ALLOWED_REDIRECTS contém um destino inválido.");
    }
    if (url.protocol !== "https:" || url.username || url.password) {
      throw new Error("ALLOWED_REDIRECTS aceita apenas HTTPS ou muve://auth.");
    }
  }

  const rawAsaasEnvironment = env.ASAAS_ENV?.trim();
  if (production && !rawAsaasEnvironment) throw new Error("Variável de ambiente obrigatória: ASAAS_ENV");
  const asaasEnvironment = rawAsaasEnvironment || "sandbox";
  if (asaasEnvironment !== "sandbox" && asaasEnvironment !== "production") {
    throw new Error("ASAAS_ENV deve ser sandbox ou production.");
  }
  const expectedAsaasUrl = asaasEnvironment === "production"
    ? "https://api.asaas.com/v3"
    : "https://api-sandbox.asaas.com/v3";
  const asaasApiUrl = (env.ASAAS_API_URL?.trim() || expectedAsaasUrl).replace(/\/+$/, "");
  if (asaasApiUrl !== expectedAsaasUrl) {
    throw new Error("ASAAS_API_URL não corresponde ao ambiente definido em ASAAS_ENV.");
  }
  const asaasApiKey = env.ASAAS_API_KEY?.trim() || undefined;
  const asaasWebhookToken = env.ASAAS_WEBHOOK_TOKEN?.trim() || undefined;
  if (production && !asaasApiKey) throw new Error("Variável de ambiente obrigatória: ASAAS_API_KEY");
  if (production && !asaasWebhookToken) throw new Error("Variável de ambiente obrigatória: ASAAS_WEBHOOK_TOKEN");

  const smtp = env.SMTP_HOST?.trim()
    ? {
        host: env.SMTP_HOST.trim(),
        port: validPort(env.SMTP_PORT?.trim() || "587", "SMTP_PORT"),
        user: required(env, "SMTP_USER"),
        pass: required(env, "SMTP_PASS"),
        from: required(env, "SMTP_FROM"),
      }
    : null;

  return {
    port, supabaseUrl, supabaseAnonKey, supabaseServiceRoleKey,
    asaasEnvironment, asaasApiUrl, asaasApiKey, asaasWebhookToken,
    allowedOrigins, allowedRedirects, smtp,
  };
}

export interface FinanceConfig {
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  asaasApiUrl: string;
  asaasApiKey: string;
  appUrl: string;
  smtp: ServerConfig["smtp"];
}

/** Credenciais mínimas do processo cron; ele não recebe token de webhook nem chave pública. */
export function readFinanceConfig(env: NodeJS.ProcessEnv): FinanceConfig {
  const production = env.NODE_ENV === "production";
  const supabaseUrl = origin(required(env, "SUPABASE_URL"), "SUPABASE_URL", production);
  const supabaseServiceRoleKey = required(env, "SUPABASE_SERVICE_ROLE_KEY");
  const asaasEnvironment = env.ASAAS_ENV?.trim() || (production ? "" : "sandbox");
  if (asaasEnvironment !== "sandbox" && asaasEnvironment !== "production") {
    throw new Error("ASAAS_ENV deve ser sandbox ou production.");
  }
  const expectedAsaasUrl = asaasEnvironment === "production"
    ? "https://api.asaas.com/v3"
    : "https://api-sandbox.asaas.com/v3";
  const asaasApiUrl = (env.ASAAS_API_URL?.trim() || expectedAsaasUrl).replace(/\/+$/, "");
  if (asaasApiUrl !== expectedAsaasUrl) {
    throw new Error("ASAAS_API_URL não corresponde ao ambiente definido em ASAAS_ENV.");
  }
  const asaasApiKey = required(env, "ASAAS_API_KEY");
  const appUrl = origin(required(env, "APP_URL"), "APP_URL", production);
  const smtp = env.SMTP_HOST?.trim()
    ? {
        host: env.SMTP_HOST.trim(),
        port: validPort(env.SMTP_PORT?.trim() || "587", "SMTP_PORT"),
        user: required(env, "SMTP_USER"),
        pass: required(env, "SMTP_PASS"),
        from: required(env, "SMTP_FROM"),
      }
    : null;
  return { supabaseUrl, supabaseServiceRoleKey, asaasApiUrl, asaasApiKey, appUrl, smtp };
}