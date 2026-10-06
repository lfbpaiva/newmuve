// Ponto de entrada da API do Muve (Node.js).
// Apenas lê a configuração e monta as dependências reais; rotas, regras e
// acesso a dados ficam em http/, services/ e adapters/.
import { existsSync } from "node:fs";
import { serve } from "@hono/node-server";
import { createAsaasGateway } from "./adapters/asaas.ts";
import { createLogMailer, createSmtpMailer } from "./adapters/mailer.ts";
import {
  createAccountStore,
  createAdminClient,
  createAuthGateway,
  createImageStore,
  createTokenVerifier,
} from "./adapters/supabase.ts";
import { createEventStore, createPaymentStore } from "./adapters/supabaseMarket.ts";
import { createApp } from "./http/app.ts";
import { createAccountService } from "./services/accountService.ts";
import { createEventService } from "./services/eventService.ts";
import { createNotifier } from "./services/notifications.ts";
import { createPaymentService } from "./services/paymentService.ts";

// Em desenvolvimento, as variáveis vêm de backend/.env; em produção, do provedor de hospedagem.
const envFile = new URL("../.env", import.meta.url);
if (existsSync(envFile)) process.loadEnvFile(envFile);

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Variável de ambiente ${name} não definida. Consulte backend/.env.example.`);
  return value;
}

const supabaseUrl = requiredEnv("SUPABASE_URL");
// service_role: ignora o RLS. Existe apenas neste servidor, nunca no frontend.
const admin = createAdminClient(supabaseUrl, requiredEnv("SUPABASE_SERVICE_ROLE_KEY"));

const accountStore = createAccountStore(admin);
const eventStore = createEventStore(admin);
const images = createImageStore(admin);

const allowedOrigins = (process.env.ALLOWED_ORIGINS || "http://localhost:8443")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

// E-mails transacionais: com SMTP configurado são enviados; sem, só aparecem no log.
const smtp = process.env.SMTP_HOST
  ? createSmtpMailer({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      user: requiredEnv("SMTP_USER"),
      pass: requiredEnv("SMTP_PASS"),
      from: requiredEnv("SMTP_FROM"),
    })
  : createLogMailer();
const notifier = createNotifier({ accounts: accountStore, events: eventStore, mailer: smtp, appUrl: allowedOrigins[0] });

const payments = createPaymentService({
  events: eventStore,
  payments: createPaymentStore(admin),
  accounts: accountStore,
  notifier,
  asaas: createAsaasGateway({
    // Sandbox por padrão; em produção, ASAAS_API_URL=https://api.asaas.com/v3
    apiUrl: process.env.ASAAS_API_URL || "https://api-sandbox.asaas.com/v3",
    apiKey: process.env.ASAAS_API_KEY || undefined,
  }),
});

const app = createApp({
  accounts: createAccountService({
    store: accountStore,
    auth: createAuthGateway(admin, supabaseUrl, requiredEnv("SUPABASE_ANON_KEY")),
    images,
    hasOngoingHiring: eventStore.hasOngoingHiring,
  }),
  events: createEventService({ events: eventStore, accounts: accountStore, images, payments, notifier }),
  payments,
  verifyToken: createTokenVerifier(admin),
  asaasWebhookToken: process.env.ASAAS_WEBHOOK_TOKEN || undefined,
  // Origens do frontend autorizadas a chamar a API, separadas por vírgula.
  allowedOrigins,
  // Esquema do app mobile para os links de e-mail (precisa estar também na lista de redirecionamento do Supabase).
  allowedRedirects: (process.env.ALLOWED_REDIRECTS || "muve://auth").split(",").map((u) => u.trim()).filter(Boolean),
});

const port = Number(process.env.PORT || 3333);
serve({ fetch: app.fetch, port }, () => console.log(`API do Muve em http://localhost:${port}/api`));
