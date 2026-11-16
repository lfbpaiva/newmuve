import { createHash, timingSafeEqual } from "node:crypto";
import { Hono, type Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { ZodError } from "zod";
import { completarPerfilSchema, deleteAccountSchema, dispositivoSchema, signupSchema, updateProfileSchemas, type SignupInput } from "../domain/account.ts";
import { AppError } from "../domain/errors.ts";
import { asaasWebhookSchema, cancelamentoSchema, confirmacaoAusenciaSchema, conviteSchema, candidaturaSchema, contestacaoSchema, inscricoesSchema, liberacaoRepasseSchema, propostaSchema, resolucaoSchema, respostaPropostaSchema, checkoutSchema, eventSchema, mensagemSchema, reviewSchema, toCheckoutView } from "../domain/event.ts";
import type { AccountService, AuthUser } from "../services/accountService.ts";
import type { EventService } from "../services/eventService.ts";
import type { PaymentService } from "../services/paymentService.ts";
import type { PlanService } from "../services/planService.ts";
import type { InicioDaRotina } from "../services/rotinaFinanceira.ts";
import { rateLimit } from "./rateLimit.ts";

export interface AppDeps {
  accounts: AccountService;
  events: EventService;
  payments: PaymentService;
  verifyToken(token: string): Promise<AuthUser | null>;
  allowedOrigins: string[];
  allowedRedirects?: string[];
  asaasWebhookToken: string | undefined;
  adminToken?: string;
  plans?: PlanService;
  rotinaFinanceira?: { iniciar(): Promise<{ resultado: InicioDaRotina }> };
  financialRoutineToken?: string | null;
  financialRoutineAllowed?: boolean;
}

type Env = { Variables: { user: AuthUser; signupInput: SignupInput } };

const requisicaoInvalida = () => new AppError(400, "REQUISICAO_INVALIDA", "Requisição inválida.");

async function readMultipart(c: Context, fileField: string): Promise<{ dados: unknown; file: File | null }> {
  const form = await c.req.formData().catch(() => null);
  if (!form) throw requisicaoInvalida();
  let dados: unknown;
  try {
    dados = JSON.parse(String(form.get("dados") ?? ""));
  } catch {
    throw requisicaoInvalida();
  }
  const file = form.get(fileField);
  return { dados, file: file instanceof File && file.size > 0 ? file : null };
}

async function readJson(c: Context): Promise<unknown> {
  return await c.req.json().catch(() => {
    throw requisicaoInvalida();
  });
}

function sameToken(received: string | undefined, expected: string | undefined): boolean {
  if (!received || !expected) return false;
  const a = new TextEncoder().encode(received);
  const b = new TextEncoder().encode(expected);
  let diff = a.length ^ b.length;
  for (let i = 0; i < b.length; i++) diff |= (a[i] ?? 0) ^ b[i];
  return diff === 0;
}

const resumo = (valor: string) => createHash("sha256").update(valor, "utf8").digest();

function tokenDaRotinaConfere(recebido: string | undefined, esperado: string): boolean {
  if (!recebido) return false;
  return timingSafeEqual(resumo(recebido), resumo(esperado));
}

export function createApp({ accounts, events, payments, verifyToken, allowedOrigins, allowedRedirects = [], asaasWebhookToken, adminToken, plans, rotinaFinanceira, financialRoutineToken, financialRoutineAllowed = false }: AppDeps) {
  const requirePlans = () => {
    if (!plans) throw new AppError(503, "PLANOS_INDISPONIVEIS", "As assinaturas não estão disponíveis agora.");
    return plans;
  };
  const redirectAllowed = (url: string | undefined) => Boolean(url && (
    allowedOrigins.some((origin) => url === origin || url === `${origin}/auth`)
    || allowedRedirects.some((allowed) => (allowed.endsWith("*") ? url.startsWith(allowed.slice(0, -1)) : url === allowed))
  ));
  const app = new Hono<Env>().basePath("/api");

  app.use(
    "*",
    cors({
      origin: (origin) => (allowedOrigins.includes(origin) ? origin : null),
      allowHeaders: ["Authorization", "Content-Type", "apikey", "x-client-info"],
      allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
      exposeHeaders: ["Retry-After"],
      maxAge: 600,
    }),
  );
  app.use("*", secureHeaders());
  app.use(
    "*",
    bodyLimit({
      maxSize: 6 * 1024 * 1024,
      onError: () => {
        throw new AppError(400, "REQUISICAO_MUITO_GRANDE", "A imagem deve ter no máximo 5 MB.");
      },
    }),
  );

  const sensitive = rateLimit({ limit: 10, windowMs: 10 * 60 * 1000 });

  const MINUTO = 60 * 1000;
  const porUsuario = (grupo: string, limit: number, windowMs: number, mensagem: string) =>
    rateLimit({ grupo, limit, windowMs, mensagem, identificar: (c) => (c.get("user") as AuthUser | undefined)?.id });
  const limites = {
    checkout: porUsuario("checkout", 10, 10 * MINUTO, "Muitas tentativas de pagamento em pouco tempo."),
    consultaPagamento: porUsuario("consulta-pagamento", 300, 10 * MINUTO, "Muitas consultas de pagamento em pouco tempo."),
    consultaContratacao: porUsuario("consulta-contratacao", 30, 10 * MINUTO, "Muitas consultas da contratação em pouco tempo."),
    assinatura: porUsuario("assinatura", 5, 60 * MINUTO, "Muitas alterações de assinatura em pouco tempo."),
    estorno: porUsuario("estorno", 10, 60 * MINUTO, "Muitos pedidos de cancelamento em pouco tempo."),
    mensagens: porUsuario("mensagens", 60, 5 * MINUTO, "Muitas mensagens em pouco tempo."),
    propostas: porUsuario("propostas", 20, 10 * MINUTO, "Muitas propostas em pouco tempo."),
    convites: porUsuario("convites", 20, 60 * MINUTO, "Muitos convites em pouco tempo."),
    inscricoes: porUsuario("inscricoes", 30, 10 * MINUTO, "Muitas alterações de inscrição em pouco tempo."),
    eventos: porUsuario("eventos", 20, 60 * MINUTO, "Muitas alterações de eventos em pouco tempo."),
    perfil: porUsuario("perfil", 20, 60 * MINUTO, "Muitas alterações de perfil em pouco tempo."),
    contestacao: porUsuario("contestacao", 5, 60 * MINUTO, "Muitas contestações em pouco tempo."),
    exclusao: porUsuario("exclusao-de-conta", 5, 60 * MINUTO, "Muitas tentativas de excluir a conta em pouco tempo."),
  };

  app.onError((error, c) => {
    if (error instanceof AppError) {
      if (error.retryAfter) c.header("Retry-After", error.retryAfter);
      return c.json({ error: { code: error.code, message: error.message } }, error.status);
    }
    if (error instanceof ZodError) {
      return c.json({ error: { code: "DADOS_INVALIDOS", message: error.issues[0]?.message ?? "Dados inválidos." } }, 400);
    }
    console.error(`${c.req.method} ${c.req.path}`, error);
    return c.json({ error: { code: "ERRO_INTERNO", message: "Não foi possível concluir a operação. Tente novamente." } }, 500);
  });

  app.notFound((c) => c.json({ error: { code: "NAO_ENCONTRADO", message: "Recurso não encontrado." } }, 404));

  app.get("/health", (c) => c.json({ status: "ok" }));

  app.post("/auth/signup", async (c, next) => {
    const input = signupSchema.parse(await readJson(c));
    c.set("signupInput", input);
    await next();
  }, sensitive, async (c) => {
    const input = c.get("signupInput");
    const origin = c.req.header("Origin");
    const redirectTo = redirectAllowed(input.redirectTo) ? input.redirectTo : redirectAllowed(origin) ? origin : undefined;
    await accounts.signup(input, redirectTo);
    return c.json({ needsEmailConfirmation: true }, 201);
  });

  app.post("/webhooks/asaas", async (c) => {
    if (!sameToken(c.req.header("asaas-access-token"), asaasWebhookToken)) {
      throw new AppError(401, "NAO_AUTENTICADO", "Token do webhook inválido.");
    }
    const notification = asaasWebhookSchema.parse(await readJson(c));
    const subscription = notification.payment?.subscription;
    if (subscription && plans) await plans.handleWebhook(subscription);
    else await payments.handleWebhook(notification);
    return c.json({ received: true });
  });

  async function requireUser(c: Context<Env>, next: () => Promise<void>) {
    const token = c.req.header("Authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
    const user = token ? await verifyToken(token) : null;
    if (!user) throw new AppError(401, "NAO_AUTENTICADO", "Sessão inválida ou expirada. Entre novamente.");
    c.set("user", user);
    await next();
  }
  app.use("/me", requireUser);
  app.use("/me/*", requireUser);
  app.use("/events", requireUser);
  app.use("/events/*", requireUser);
  app.use("/candidaturas/*", requireUser);

  app.get("/me", async (c) => c.json(await accounts.getMe(c.get("user"))));

  app.post("/me/perfil", async (c) => {
    await accounts.completeProfile(c.get("user"), completarPerfilSchema.parse(await readJson(c)));
    return c.body(null, 204);
  });

  app.get("/me/plano", limites.consultaPagamento, async (c) => c.json(await requirePlans().status(c.get("user"))));

  app.post("/me/plano", limites.assinatura, async (c) => c.json(await requirePlans().subscribe(c.get("user")), 201));

  app.delete("/me/plano", limites.assinatura, async (c) => c.json(await requirePlans().cancel(c.get("user"))));

  app.post("/me/favoritos/:musicianId", async (c) => {
    await events.setFavorite(c.get("user"), c.req.param("musicianId"), true);
    return c.body(null, 204);
  });

  app.delete("/me/favoritos/:musicianId", async (c) => {
    await events.setFavorite(c.get("user"), c.req.param("musicianId"), false);
    return c.body(null, 204);
  });

  app.post("/me/dispositivos", async (c) => {
    const { token } = dispositivoSchema.parse(await readJson(c));
    await accounts.registerDevice(c.get("user"), token);
    return c.body(null, 204);
  });

  app.post("/me/dispositivos/remover", async (c) => {
    const { token } = dispositivoSchema.parse(await readJson(c));
    await accounts.unregisterDevice(c.get("user"), token);
    return c.body(null, 204);
  });

  app.post("/me/notificacoes/lidas", async (c) => {
    await accounts.markNotificationsRead(c.get("user"));
    return c.body(null, 204);
  });

  app.patch("/me", limites.perfil, async (c) => {
    const user = c.get("user");
    const { dados, file } = await readMultipart(c, "avatar");
    const { role } = await accounts.getMe(user);
    const changes = updateProfileSchemas[role].parse(dados);
    await accounts.updateProfile(user, role, changes, file);
    return c.json(await accounts.getMe(user));
  });

  app.delete("/me", sensitive, limites.exclusao, async (c) => {
    const input = deleteAccountSchema.parse(await readJson(c));
    await accounts.deleteAccount(c.get("user"), input);
    return c.body(null, 204);
  });

  app.post("/events", limites.eventos, async (c) => {
    const { dados, file } = await readMultipart(c, "imagem");
    const event = await events.createEvent(c.get("user"), eventSchema.parse(dados), file);
    return c.json({ id: event.id }, 201);
  });

  app.patch("/events/:id", limites.eventos, async (c) => {
    const { dados, file } = await readMultipart(c, "imagem");
    const event = await events.updateEvent(c.get("user"), c.req.param("id"), eventSchema.parse(dados), file);
    return c.json({ id: event.id });
  });

  app.delete("/events/:id", limites.eventos, async (c) => {
    await events.deleteEvent(c.get("user"), c.req.param("id"));
    return c.body(null, 204);
  });

  app.post("/events/:id/candidatura", limites.inscricoes, async (c) => {
    const { valorProposto } = candidaturaSchema.parse(await readJson(c));
    await events.apply(c.get("user"), c.req.param("id"), valorProposto);
    return c.body(null, 204);
  });

  app.patch("/events/:id/inscricoes", async (c) => {
    const { encerradas } = inscricoesSchema.parse(await readJson(c));
    await events.setApplicationsClosed(c.get("user"), c.req.param("id"), encerradas);
    return c.body(null, 204);
  });

  app.post("/events/:id/candidatos/:candidateId/recusa", limites.inscricoes, async (c) => {
    await events.declineCandidate(c.get("user"), c.req.param("id"), c.req.param("candidateId"));
    return c.body(null, 204);
  });

  app.patch("/events/:id/candidatura", limites.inscricoes, async (c) => {
    const { valorProposto } = candidaturaSchema.parse(await readJson(c));
    await events.updateProposal(c.get("user"), c.req.param("id"), valorProposto);
    return c.body(null, 204);
  });

  app.post("/candidaturas/:id/propostas", limites.propostas, async (c) => {
    const { valor } = propostaSchema.parse(await readJson(c));
    return c.json(await events.proposeValue(c.get("user"), c.req.param("id"), valor), 201);
  });

  app.post("/candidaturas/:id/propostas/:messageId/resposta", limites.propostas, async (c) => {
    const { aceitar } = respostaPropostaSchema.parse(await readJson(c));
    return c.json(await events.answerProposal(c.get("user"), c.req.param("id"), c.req.param("messageId"), aceitar), 201);
  });

  app.post("/candidaturas/:id/mensagens", limites.mensagens, async (c) => {
    const { texto } = mensagemSchema.parse(await readJson(c));
    const message = await events.sendMessage(c.get("user"), c.req.param("id"), texto);
    return c.json(message, 201);
  });

  app.delete("/events/:id/candidatura", limites.inscricoes, async (c) => {
    await events.cancelApplication(c.get("user"), c.req.param("id"));
    return c.body(null, 204);
  });

  app.post("/events/:id/checkout", limites.checkout, async (c) => {
    const { candidateId } = checkoutSchema.parse(await readJson(c));
    const payment = await payments.startCheckout(c.get("user"), c.req.param("id"), candidateId);
    return c.json(toCheckoutView(payment), 201);
  });

  app.get("/events/:id/checkout", limites.consultaPagamento, async (c) => {
    const payment = await payments.syncCheckout(c.get("user"), c.req.param("id"));
    return payment ? c.json(toCheckoutView(payment)) : c.body(null, 204);
  });

  app.delete("/events/:id/checkout", limites.checkout, async (c) => {
    await payments.cancelPendingCheckout(c.get("user"), c.req.param("id"));
    return c.json({ situacao: "COBRANCA_CANCELADA" });
  });

  app.get("/events/:id/contratacao", limites.consultaContratacao, async (c) => c.json(await events.getHiring(c.get("user"), c.req.param("id"))));

  app.delete("/events/:id/contratacao", limites.estorno, async (c) => {
    const { esperado } = cancelamentoSchema.parse({ esperado: c.req.query("esperado") });
    return c.json(await events.cancelHiring(c.get("user"), c.req.param("id"), esperado));
  });

  app.post("/events/:id/convites", limites.convites, async (c) => {
    const { musicianId } = conviteSchema.parse(await readJson(c));
    await events.inviteMusician(c.get("user"), c.req.param("id"), musicianId);
    return c.body(null, 201);
  });

  app.post("/events/:id/contestacao", limites.contestacao, async (c) => {
    const { motivo } = contestacaoSchema.parse(await readJson(c));
    await events.openDispute(c.get("user"), c.req.param("id"), motivo);
    return c.body(null, 201);
  });

  app.post("/admin/contestacoes/:id/resolucao", async (c) => {
    if (!sameToken(c.req.header("x-admin-token"), adminToken)) throw new AppError(401, "NAO_AUTORIZADO", "Acesso restrito ao suporte.");
    const { decisao, observacao } = resolucaoSchema.parse(await readJson(c));
    await events.resolveDispute(c.req.param("id"), decisao, observacao || null);
    return c.body(null, 204);
  });

  const requireAdmin = (c: Context) => {
    if (!sameToken(c.req.header("x-admin-token"), adminToken)) throw new AppError(401, "NAO_AUTORIZADO", "Acesso restrito ao suporte.");
  };

  app.post("/admin/repasses/tentativas/:id/verificacao", async (c) => {
    requireAdmin(c);
    const { operador } = liberacaoRepasseSchema.parse(await readJson(c));
    return c.json(await payments.verifyPayoutAbsence(c.req.param("id"), operador));
  });

  app.post("/admin/repasses/tentativas/:id/confirmacao", async (c) => {
    requireAdmin(c);
    const { operador, declaracao } = confirmacaoAusenciaSchema.parse(await readJson(c));
    return c.json(await payments.confirmPayoutAbsence(c.req.param("id"), operador, declaracao));
  });

  app.post("/admin/rotina-financeira", async (c) => {
    if (!financialRoutineAllowed) throw new AppError(403, "ROTINA_BLOQUEADA_NO_AMBIENTE", "A rotina financeira só roda em produção ou com um Supabase local de testes.");
    if (!rotinaFinanceira || !financialRoutineToken) throw new AppError(403, "ROTINA_NAO_CONFIGURADA", "O disparo externo da rotina financeira não está configurado nesta API.");
    if (!tokenDaRotinaConfere(c.req.header("x-rotina-token"), financialRoutineToken)) throw new AppError(401, "NAO_AUTORIZADO", "Token de disparo da rotina inválido.");
    const { resultado } = await rotinaFinanceira.iniciar().catch((error: unknown) => {
      console.error("Falha ao iniciar a rotina financeira", error instanceof Error ? error.message : "falha inesperada");
      throw new AppError(503, "ROTINA_INDISPONIVEL", "Não foi possível iniciar a rotina financeira agora.");
    });
    if (resultado === "EM_ANDAMENTO") return c.json({ resultado, mensagem: "Já existe uma execução da rotina em andamento; nenhuma outra foi iniciada." }, 409);
    return c.json({ resultado, mensagem: "Rotina financeira iniciada." }, 202);
  });

  app.post("/admin/repasses/tentativas/:id/conferencia", async (c) => {
    requireAdmin(c);
    return c.json({ resultado: await payments.checkPayoutTransfer(c.req.param("id")) });
  });

  app.post("/events/:id/nao-comparecimento", limites.estorno, async (c) => {
    return c.json(await events.reportNoShow(c.get("user"), c.req.param("id")));
  });

  app.post("/events/:id/confirmacao", async (c) => {
    const event = await events.confirmCompletion(c.get("user"), c.req.param("id"));
    return c.json({ status: event.status });
  });

  app.post("/events/:id/avaliacao", async (c) => {
    await events.review(c.get("user"), c.req.param("id"), reviewSchema.parse(await readJson(c)));
    return c.body(null, 204);
  });

  return app;
}
