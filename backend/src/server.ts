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
import { createExpoPush } from "./adapters/expoPush.ts";
import { createPlanStore } from "./adapters/supabasePlans.ts";
import { createCnpjLookup } from "./adapters/receita.ts";
import { createEventStore, createInbox, createPaymentStore } from "./adapters/supabaseMarket.ts";
import { readServerConfig } from "./config.ts";
import { createApp } from "./http/app.ts";
import { createAccountService } from "./services/accountService.ts";
import { createEventService } from "./services/eventService.ts";
import { createNotifier } from "./services/notifications.ts";
import { createPlanService } from "./services/planService.ts";
import { createPaymentService } from "./services/paymentService.ts";
import { createRotinaFinanceira } from "./services/rotinaFinanceira.ts";

const ROTINA_FINANCEIRA_INTERVALO_MS = 5 * 60 * 1000;

const envFile = new URL("../.env", import.meta.url);
if (process.env.NODE_ENV !== "production" && existsSync(envFile)) process.loadEnvFile(envFile);

const config = readServerConfig(
  process.env,
  Object.values(networkInterfaces()).flatMap((addresses) =>
    (addresses ?? []).filter((address) => address.family === "IPv4" && !address.internal).map((address) => address.address),
  ),
);

const admin = createAdminClient(config.supabaseUrl, config.supabaseServiceRoleKey);

const accountStore = createAccountStore(admin);
const eventStore = createEventStore(admin);
const images = createImageStore(admin);

const smtp = config.smtp ? createSmtpMailer(config.smtp) : createLogMailer();
const inbox = createInbox(admin);
const push = createExpoPush(admin);
const notifier = createNotifier({ accounts: accountStore, events: eventStore, inbox, mailer: smtp, appUrl: config.allowedOrigins[0], push });

const asaas = createAsaasGateway({ apiUrl: config.asaasApiUrl, apiKey: config.asaasApiKey });

const paymentStore = createPaymentStore(admin);
const payments = createPaymentService({
  events: eventStore,
  payments: paymentStore,
  accounts: accountStore,
  notifier,
  asaas,
});

const plans = createPlanService({ accounts: accountStore, store: createPlanStore(admin), asaas, notifier });
const events = createEventService({ events: eventStore, accounts: accountStore, images, payments, notifier });

const app = createApp({
  accounts: createAccountService({
    store: accountStore,
    auth: createAuthGateway(admin, config.supabaseUrl, config.supabaseAnonKey),
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
  asaasWebhookToken: config.asaasWebhookToken,
  adminToken: config.adminToken,
  plans,
  allowedOrigins: config.allowedOrigins,
  allowedRedirects: config.allowedRedirects,
});

const rotina = createRotinaFinanceira({ paymentStore, eventStore, payments, events });
const executarRotina = () => void rotina.run().catch((error: unknown) => console.error("Falha na rotina financeira", error));

serve(
  {
    fetch: app.fetch,
    port: config.port,
    hostname: "0.0.0.0",
  },
  (info) => {
    console.log(`API do Muve rodando na porta ${info.port} (escutando em 0.0.0.0)`);
    executarRotina();
    setInterval(executarRotina, ROTINA_FINANCEIRA_INTERVALO_MS);
  }
);