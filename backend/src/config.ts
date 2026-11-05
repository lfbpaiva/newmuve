export type AsaasEnvironment = "sandbox" | "production";

export interface ServerConfig {
  port: number;
  supabaseUrl: string;
  supabaseAnonKey: string;
  supabaseServiceRoleKey: string;
  asaasApiUrl: string;
  asaasApiKey: string | undefined;
  asaasWebhookToken: string | undefined;
  adminToken: string | undefined;
  allowedOrigins: string[];
  allowedRedirects: string[];
  smtp: { host: string; port: number; user: string; pass: string; from: string } | null;
}

const ASAAS_URLS: Record<AsaasEnvironment, string> = {
  sandbox: "https://api-sandbox.asaas.com/v3",
  production: "https://api.asaas.com/v3",
};

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`Variável de ambiente ${name} não definida. Consulte backend/.env.example.`);
  return value;
}

function validPort(value: string, name: string): number {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(`${name} deve ser um número inteiro entre 1 e 65535.`);
  return port;
}

function origin(value: string, name: string, production: boolean): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} deve conter uma origem HTTP válida.`);
  }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error(`${name} deve conter apenas uma origem HTTP, sem caminho ou credenciais.`);
  }
  if (production && url.protocol !== "https:") throw new Error(`${name} deve usar HTTPS em produção.`);
  return url.origin;
}

function asaasApiUrl(env: NodeJS.ProcessEnv, production: boolean): string {
  const environment = env.ASAAS_ENV?.trim() || (production ? "" : "sandbox");
  if (environment !== "sandbox" && environment !== "production") throw new Error("ASAAS_ENV deve ser sandbox ou production.");
  const url = (env.ASAAS_API_URL?.trim() || ASAAS_URLS[environment]).replace(/\/+$/, "");
  if (url.includes("sandbox") !== (environment === "sandbox")) throw new Error("ASAAS_API_URL não corresponde ao ambiente definido em ASAAS_ENV.");
  return url;
}

function redirects(env: NodeJS.ProcessEnv, production: boolean): string[] {
  const allowed = (env.ALLOWED_REDIRECTS?.trim() || (production ? "muve://auth" : "muve://auth,exp://*")).split(",").map((item) => item.trim()).filter(Boolean);
  for (const redirect of allowed) {
    if (redirect.startsWith("muve://")) continue;
    if (redirect.startsWith("exp://")) {
      if (production) throw new Error("ALLOWED_REDIRECTS não aceita exp:// em produção.");
      continue;
    }
    if (!production && redirect.startsWith("http://")) continue;
    if (!redirect.startsWith("https://")) throw new Error("ALLOWED_REDIRECTS aceita apenas HTTPS, muve:// ou, em desenvolvimento, exp://.");
  }
  return allowed;
}

export function readServerConfig(env: NodeJS.ProcessEnv, localHosts: string[] = []): ServerConfig {
  const production = env.NODE_ENV === "production";
  const rawOrigins = env.ALLOWED_ORIGINS?.trim() || (production ? "" : "http://localhost:8081");
  if (!rawOrigins) throw new Error("Variável de ambiente ALLOWED_ORIGINS não definida. Consulte backend/.env.example.");
  const configuredOrigins = rawOrigins.split(",").map((item) => item.trim()).filter(Boolean).map((item) => origin(item, "ALLOWED_ORIGINS", production));
  const devOrigins = production ? [] : ["127.0.0.1", ...localHosts].flatMap((host) => [8443, 8081].map((clientPort) => `http://${host}:${clientPort}`));

  const asaasApiKey = env.ASAAS_API_KEY?.trim() || undefined;
  const asaasWebhookToken = env.ASAAS_WEBHOOK_TOKEN?.trim() || undefined;
  if (production && !asaasApiKey) throw new Error("Variável de ambiente ASAAS_API_KEY não definida. Consulte backend/.env.example.");
  if (production && !asaasWebhookToken) throw new Error("Variável de ambiente ASAAS_WEBHOOK_TOKEN não definida. Consulte backend/.env.example.");

  return {
    port: validPort(env.PORT?.trim() || "3333", "PORT"),
    supabaseUrl: origin(required(env, "SUPABASE_URL"), "SUPABASE_URL", production),
    supabaseAnonKey: required(env, "SUPABASE_ANON_KEY"),
    supabaseServiceRoleKey: required(env, "SUPABASE_SERVICE_ROLE_KEY"),
    asaasApiUrl: asaasApiUrl(env, production),
    asaasApiKey,
    asaasWebhookToken,
    adminToken: env.ADMIN_TOKEN?.trim() || undefined,
    allowedOrigins: [...new Set([...configuredOrigins, ...devOrigins])],
    allowedRedirects: redirects(env, production),
    smtp: env.SMTP_HOST?.trim()
      ? {
          host: env.SMTP_HOST.trim(),
          port: validPort(env.SMTP_PORT?.trim() || "587", "SMTP_PORT"),
          user: required(env, "SMTP_USER"),
          pass: required(env, "SMTP_PASS"),
          from: required(env, "SMTP_FROM"),
        }
      : null,
  };
}
