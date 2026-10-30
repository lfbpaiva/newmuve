<<<<<<< HEAD
// Ponto de entrada da API do Muve. O Node executa TypeScript com remoção nativa de tipos.
=======
>>>>>>> upstream/main
import { existsSync } from "node:fs";
import { networkInterfaces } from "node:os";
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
<<<<<<< HEAD
import { createEventStore, createPaymentStore } from "./adapters/supabaseMarket.ts";
import { readServerConfig } from "./config.ts";
=======
import { createExpoPush } from "./adapters/expoPush.ts";
import { createPlanStore } from "./adapters/supabasePlans.ts";
import { createCnpjLookup } from "./adapters/receita.ts";
import { createEventStore, createInbox, createPaymentStore } from "./adapters/supabaseMarket.ts";
>>>>>>> upstream/main
import { createApp } from "./http/app.ts";
import { createAccountService } from "./services/accountService.ts";
import { createEventService } from "./services/eventService.ts";
import { createNotifier } from "./services/notifications.ts";
import { createPlanService } from "./services/planService.ts";
import { createPaymentService } from "./services/paymentService.ts";

<<<<<<< HEAD
function fail(error: unknown): never {
  console.error("Falha ao iniciar a API:", error instanceof Error ? error.message : "erro desconhecido");
  process.exit(1);
}

try {
  // Em produção, apenas as variáveis fornecidas pelo provedor são utilizadas.
  const envFile = new URL("../.env", import.meta.url);
  if (process.env.NODE_ENV !== "production" && existsSync(envFile)) process.loadEnvFile(envFile);
=======
const envFile = new URL("../.env", import.meta.url);
if (existsSync(envFile)) process.loadEnvFile(envFile);

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Variável de ambiente ${name} não definida. Consulte backend/.env.example.`);
  return value;
}

const supabaseUrl = requiredEnv("SUPABASE_URL");
const admin = createAdminClient(supabaseUrl, requiredEnv("SUPABASE_SERVICE_ROLE_KEY"));
>>>>>>> upstream/main

  const localHosts = Object.values(networkInterfaces()).flatMap((addresses) =>
    (addresses ?? []).filter((address) => address.family === "IPv4" && !address.internal).map((address) => address.address),
  );
  const config = readServerConfig(process.env, localHosts);
  const admin = createAdminClient(config.supabaseUrl, config.supabaseServiceRoleKey);
  const accountStore = createAccountStore(admin);
  const eventStore = createEventStore(admin);
  const images = createImageStore(admin);

<<<<<<< HEAD
  const mailer = config.smtp ? createSmtpMailer(config.smtp) : createLogMailer();
  const notifier = createNotifier({ accounts: accountStore, events: eventStore, mailer, appUrl: config.allowedOrigins[0] });

  const payments = createPaymentService({
    events: eventStore,
    payments: createPaymentStore(admin),
    accounts: accountStore,
    notifier,
    asaas: createAsaasGateway({ apiUrl: config.asaasApiUrl, apiKey: config.asaasApiKey }),
  });

  const app = createApp({
    accounts: createAccountService({
      store: accountStore,
      auth: createAuthGateway(admin, config.supabaseUrl, config.supabaseAnonKey),
      images,
      hasOngoingHiring: eventStore.hasOngoingHiring,
    }),
    events: createEventService({ events: eventStore, accounts: accountStore, images, payments, notifier }),
    payments,
    verifyToken: createTokenVerifier(admin),
    asaasWebhookToken: config.asaasWebhookToken,
    allowedOrigins: config.allowedOrigins,
    allowedRedirects: config.allowedRedirects,
  });

  // Render encaminha tráfego ao PORT no endereço 0.0.0.0.
  const server = serve({ fetch: app.fetch, port: config.port, hostname: "0.0.0.0" }, () => {
    console.log("API do Muve escutando na porta " + config.port + ".");
  });
  server.on("error", fail);
} catch (error) {
  fail(error);
}
=======
const configuredOrigins = (process.env.ALLOWED_ORIGINS || "http://localhost:8081")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const localOrigins = process.env.NODE_ENV === "production"
  ? []
  : [...new Set([
      "127.0.0.1",
      ...Object.values(networkInterfaces()).flatMap((addresses) =>
        (addresses ?? []).filter((address) => address.family === "IPv4" && !address.internal).map((address) => address.address),
      ),
    ])].flatMap((host) => [8443, 8081].map((clientPort) => `http://${host}:${clientPort}`));
const allowedOrigins = [...new Set([...configuredOrigins, ...localOrigins])];

const smtp = process.env.SMTP_HOST
  ? createSmtpMailer({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      user: requiredEnv("SMTP_USER"),
      pass: requiredEnv("SMTP_PASS"),
      from: requiredEnv("SMTP_FROM"),
    })
  : createLogMailer();
const inbox = createInbox(admin);
const push = createExpoPush(admin);
const notifier = createNotifier({ accounts: accountStore, events: eventStore, inbox, mailer: smtp, appUrl: allowedOrigins[0], push });

const asaas = createAsaasGateway({
  apiUrl: process.env.ASAAS_API_URL || "https://api-sandbox.asaas.com/v3",
  apiKey: process.env.ASAAS_API_KEY || undefined,
});

const payments = createPaymentService({
  events: eventStore,
  payments: createPaymentStore(admin),
  accounts: accountStore,
  notifier,
  asaas,
});

const plans = createPlanService({ accounts: accountStore, store: createPlanStore(admin), asaas, notifier });
const events = createEventService({ events: eventStore, accounts: accountStore, images, payments, notifier });

const app = createApp({
  accounts: createAccountService({
    store: accountStore,
    auth: createAuthGateway(admin, supabaseUrl, requiredEnv("SUPABASE_ANON_KEY")),
    images,
    hasOngoingHiring: eventStore.hasOngoingHiring,
    inbox,
    releaseAccount: (user, role) => events.releaseAccount(user, role),
    cnpj: createCnpjLookup(),
    devices: push,
  }),
  events,
  payments,
  verifyToken: createTokenVerifier(admin),
  asaasWebhookToken: process.env.ASAAS_WEBHOOK_TOKEN || undefined,
  adminToken: process.env.ADMIN_TOKEN || undefined,
  plans,
  allowedOrigins,
  allowedRedirects: (process.env.ALLOWED_REDIRECTS || "muve://auth,exp://*").split(",").map((u) => u.trim()).filter(Boolean),
});

const port = Number(process.env.PORT || 3333);
serve({ fetch: app.fetch, port }, () => console.log(`API do Muve em http://localhost:${port}/api`));
>>>>>>> upstream/main
