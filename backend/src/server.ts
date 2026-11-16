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
import { createEventStore, createInbox, createPaymentStore, createTravaDaRotina } from "./adapters/supabaseMarket.ts";
import { readServerConfig, shouldLoadEnvFile } from "./config.ts";
import { createApp } from "./http/app.ts";
import { createAccountService } from "./services/accountService.ts";
import { createEventService } from "./services/eventService.ts";
import { createNotifier } from "./services/notifications.ts";
import { createPlanService } from "./services/planService.ts";
import { createPaymentService } from "./services/paymentService.ts";
import { createAgendaFinanceira, createRotinaFinanceira } from "./services/rotinaFinanceira.ts";

const ROTINA_FINANCEIRA_INTERVALO_MS = 5 * 60 * 1000;

const envFile = new URL("../.env", import.meta.url);
if (shouldLoadEnvFile(process.env) && existsSync(envFile)) process.loadEnvFile(envFile);

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

const rotinaFinanceira = createRotinaFinanceira({ paymentStore, eventStore, payments, events, trava: createTravaDaRotina(admin) });
if (config.financialRoutineTrigger.problema === "invalido") {
  console.warn("Disparo externo da rotina financeira desabilitado: FINANCIAL_ROUTINE_TOKEN precisa ter pelo menos 32 caracteres (letras, números, - ou _) e ser diferente de ADMIN_TOKEN.");
}

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
  rotinaFinanceira,
  financialRoutineToken: config.financialRoutineTrigger.token,
  financialRoutineAllowed: config.financialRoutineAllowed,
});

const agendaFinanceira = createAgendaFinanceira({
  rotina: rotinaFinanceira,
  configuracao: config.financialRoutine,
  permitida: config.financialRoutineAllowed,
  intervaloMs: ROTINA_FINANCEIRA_INTERVALO_MS,
});

serve({ fetch: app.fetch, port: config.port, hostname: config.host }, () => {
  console.log(`API do Muve em http://localhost:${config.port}/api`);
  agendaFinanceira.iniciar();
});
