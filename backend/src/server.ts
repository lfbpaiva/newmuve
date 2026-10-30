// Ponto de entrada da API do Muve. O Node executa TypeScript com remoção nativa de tipos.
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
import { createEventStore, createPaymentStore } from "./adapters/supabaseMarket.ts";
import { readServerConfig } from "./config.ts";
import { createApp } from "./http/app.ts";
import { createAccountService } from "./services/accountService.ts";
import { createEventService } from "./services/eventService.ts";
import { createNotifier } from "./services/notifications.ts";
import { createPaymentService } from "./services/paymentService.ts";

function fail(error: unknown): never {
  console.error("Falha ao iniciar a API:", error instanceof Error ? error.message : "erro desconhecido");
  process.exit(1);
}

try {
  // Em produção, apenas as variáveis fornecidas pelo provedor são utilizadas.
  const envFile = new URL("../.env", import.meta.url);
  if (process.env.NODE_ENV !== "production" && existsSync(envFile)) process.loadEnvFile(envFile);

  const localHosts = Object.values(networkInterfaces()).flatMap((addresses) =>
    (addresses ?? []).filter((address) => address.family === "IPv4" && !address.internal).map((address) => address.address),
  );
  const config = readServerConfig(process.env, localHosts);
  const admin = createAdminClient(config.supabaseUrl, config.supabaseServiceRoleKey);
  const accountStore = createAccountStore(admin);
  const eventStore = createEventStore(admin);
  const images = createImageStore(admin);

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
