// Processo independente da API web; destinado a um Render Cron Job.
import { existsSync } from "node:fs";
import { createAsaasGateway } from "../adapters/asaas.ts";
import { createLogMailer, createSmtpMailer } from "../adapters/mailer.ts";
import { createAccountStore, createAdminClient } from "../adapters/supabase.ts";
import { createSupabaseFinanceStore } from "../adapters/supabaseFinance.ts";
import { createEventStore, createPaymentStore } from "../adapters/supabaseMarket.ts";
import { readFinanceConfig } from "../config.ts";
import { createFinanceWorker } from "../services/financeWorker.ts";
import { createNotifier } from "../services/notifications.ts";
import { createPaymentService } from "../services/paymentService.ts";

async function main(): Promise<void> {
  const envFile = new URL("../../.env", import.meta.url);
  if (process.env.NODE_ENV !== "production" && existsSync(envFile)) process.loadEnvFile(envFile);
  const config = readFinanceConfig(process.env);

  const admin = createAdminClient(config.supabaseUrl, config.supabaseServiceRoleKey);
  const accounts = createAccountStore(admin);
  const events = createEventStore(admin);
  const payments = createPaymentStore(admin);
  const asaas = createAsaasGateway({ apiUrl: config.asaasApiUrl, apiKey: config.asaasApiKey });
  const mailer = config.smtp ? createSmtpMailer(config.smtp) : createLogMailer();
  const notifier = createNotifier({ accounts, events, mailer, appUrl: config.appUrl });
  const paymentService = createPaymentService({ events, payments, accounts, asaas, notifier });
  const worker = createFinanceWorker({
    finance: createSupabaseFinanceStore(admin), payments, events, asaas, paymentService,
  });
  const mode = process.argv[2];
  if (mode !== "expire" && mode !== "reconcile") throw new Error("Modo esperado: expire ou reconcile.");
  const kinds = mode === "expire"
    ? (["EXPIRACAO"] as const)
    : (["TARDIO", "REPASSE", "ESTORNO", "EVENTO"] as const);
  const settled = await Promise.allSettled(kinds.map((kind) => worker.runKind(kind)));
  const result: Record<string, unknown> = {};
  for (const [index, outcome] of settled.entries()) {
    const kind = kinds[index]!;
    if (outcome.status === "fulfilled") result[kind] = outcome.value;
    else {
      result[kind] = { failed: 1 };
      process.exitCode = 1;
    }
  }
  // Apenas contagens e tipos de processo; sem credenciais, chaves Pix ou valores.
  console.log(JSON.stringify(result));
  if (settled.some((outcome) => outcome.status === "fulfilled" &&
      outcome.value && outcome.value.failed > 0)) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error("Falha no processamento financeiro:", error instanceof Error ? error.message : "erro desconhecido");
  process.exitCode = 1;
});