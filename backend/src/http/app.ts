import { Hono, type Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { ZodError } from "zod";
import { deleteAccountSchema, signupSchema, updateProfileSchemas } from "../domain/account.ts";
import { AppError } from "../domain/errors.ts";
import { asaasWebhookSchema, checkoutSchema, eventSchema, reviewSchema, toCheckoutView } from "../domain/event.ts";
import type { AccountService, AuthUser } from "../services/accountService.ts";
import type { EventService } from "../services/eventService.ts";
import type { PaymentService } from "../services/paymentService.ts";
import { rateLimit } from "./rateLimit.ts";

export interface AppDeps {
  accounts: AccountService;
  events: EventService;
  payments: PaymentService;
  verifyToken(token: string): Promise<AuthUser | null>;
  allowedOrigins: string[];
  /** Destinos autorizados para os links de e-mail além das origens web (ex.: esquema do app: muve://auth). */
  allowedRedirects?: string[];
  /** Token configurado no webhook da Asaas; sem ele, toda notificação é recusada. */
  asaasWebhookToken: string | undefined;
}

type Env = { Variables: { user: AuthUser } };

const requisicaoInvalida = () => new AppError(400, "REQUISICAO_INVALIDA", "Requisição inválida.");

// Formulários com imagem chegam como multipart: os campos em "dados" (JSON) e o arquivo à parte.
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

// Comparação em tempo constante, para não revelar o token pelo tempo de resposta.
function sameToken(received: string | undefined, expected: string | undefined): boolean {
  if (!received || !expected) return false;
  const a = new TextEncoder().encode(received);
  const b = new TextEncoder().encode(expected);
  let diff = a.length ^ b.length;
  for (let i = 0; i < b.length; i++) diff |= (a[i] ?? 0) ^ b[i];
  return diff === 0;
}

export function createApp({ accounts, events, payments, verifyToken, allowedOrigins, allowedRedirects = [], asaasWebhookToken }: AppDeps) {
  const redirectAllowed = (url: string | undefined) => Boolean(url && (allowedOrigins.includes(url) || allowedRedirects.includes(url)));
  const app = new Hono<Env>().basePath("/api");

  app.use(
    "*",
    cors({
      origin: (origin) => (allowedOrigins.includes(origin) ? origin : null),
      allowHeaders: ["Authorization", "Content-Type", "apikey", "x-client-info"],
      allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
      maxAge: 600,
    }),
  );
  app.use("*", secureHeaders());
  // Um pouco acima do limite de 5 MB das imagens, para acomodar os demais campos.
  app.use(
    "*",
    bodyLimit({
      maxSize: 6 * 1024 * 1024,
      onError: () => {
        throw new AppError(400, "REQUISICAO_MUITO_GRANDE", "A imagem deve ter no máximo 5 MB.");
      },
    }),
  );

  // Rotas que criam contas ou conferem senha: limite por IP contra abuso e força bruta.
  const sensitive = rateLimit({ limit: 10, windowMs: 10 * 60 * 1000 });

  app.onError((error, c) => {
    if (error instanceof AppError) {
      return c.json({ error: { code: error.code, message: error.message } }, error.status);
    }
    if (error instanceof ZodError) {
      return c.json({ error: { code: "DADOS_INVALIDOS", message: error.issues[0]?.message ?? "Dados inválidos." } }, 400);
    }
    // Detalhes internos ficam apenas no log do servidor.
    console.error(`${c.req.method} ${c.req.path}`, error);
    return c.json({ error: { code: "ERRO_INTERNO", message: "Não foi possível concluir a operação. Tente novamente." } }, 500);
  });

  app.notFound((c) => c.json({ error: { code: "NAO_ENCONTRADO", message: "Recurso não encontrado." } }, 404));

  // -------------------------------------------------------------------------
  // Rotas públicas
  // -------------------------------------------------------------------------

  app.get("/health", (c) => c.json({ status: "ok" }));

  app.post("/auth/signup", sensitive, async (c) => {
    const input = signupSchema.parse(await readJson(c));
    // Destino do link: o informado pelo cliente (site ou app), se autorizado; senão a origem da requisição.
    const origin = c.req.header("Origin");
    const redirectTo = redirectAllowed(input.redirectTo) ? input.redirectTo : redirectAllowed(origin) ? origin : undefined;
    await accounts.signup(input, redirectTo);
    return c.json({ needsEmailConfirmation: true }, 201);
  });

  // Chamado pela Asaas, que se identifica pelo token cadastrado no webhook.
  app.post("/webhooks/asaas", async (c) => {
    if (!sameToken(c.req.header("asaas-access-token"), asaasWebhookToken)) {
      throw new AppError(401, "NAO_AUTENTICADO", "Token do webhook inválido.");
    }
    await payments.handleWebhook(asaasWebhookSchema.parse(await readJson(c)));
    return c.json({ received: true });
  });

  // -------------------------------------------------------------------------
  // Rotas autenticadas
  // -------------------------------------------------------------------------

  async function requireUser(c: Context<Env>, next: () => Promise<void>) {
    const token = c.req.header("Authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
    const user = token ? await verifyToken(token) : null;
    if (!user) throw new AppError(401, "NAO_AUTENTICADO", "Sessão inválida ou expirada. Entre novamente.");
    c.set("user", user);
    await next();
  }
  app.use("/me", requireUser);
  app.use("/events", requireUser);
  app.use("/events/*", requireUser);

  app.get("/me", async (c) => c.json(await accounts.getMe(c.get("user"))));

  app.patch("/me", async (c) => {
    const user = c.get("user");
    const { dados, file } = await readMultipart(c, "avatar");
    const { role } = await accounts.getMe(user);
    const changes = updateProfileSchemas[role].parse(dados);
    await accounts.updateProfile(user, role, changes, file);
    return c.json(await accounts.getMe(user));
  });

  app.delete("/me", sensitive, async (c) => {
    const input = deleteAccountSchema.parse(await readJson(c));
    await accounts.deleteAccount(c.get("user"), input);
    return c.body(null, 204);
  });

  app.post("/events", async (c) => {
    const { dados, file } = await readMultipart(c, "imagem");
    const event = await events.createEvent(c.get("user"), eventSchema.parse(dados), file);
    return c.json({ id: event.id }, 201);
  });

  app.patch("/events/:id", async (c) => {
    const { dados, file } = await readMultipart(c, "imagem");
    const event = await events.updateEvent(c.get("user"), c.req.param("id"), eventSchema.parse(dados), file);
    return c.json({ id: event.id });
  });

  app.delete("/events/:id", async (c) => {
    await events.deleteEvent(c.get("user"), c.req.param("id"));
    return c.body(null, 204);
  });

  app.post("/events/:id/candidatura", async (c) => {
    await events.apply(c.get("user"), c.req.param("id"));
    return c.body(null, 204);
  });

  app.delete("/events/:id/candidatura", async (c) => {
    await events.cancelApplication(c.get("user"), c.req.param("id"));
    return c.body(null, 204);
  });

  // Aprovar um candidato = gerar a cobrança Pix (cachê + comissão).
  app.post("/events/:id/checkout", async (c) => {
    const { candidateId } = checkoutSchema.parse(await readJson(c));
    const payment = await payments.startCheckout(c.get("user"), c.req.param("id"), candidateId);
    return c.json(toCheckoutView(payment), 201);
  });

  // Situação da cobrança, conferida na Asaas (a tela de checkout consulta periodicamente).
  app.get("/events/:id/checkout", async (c) => {
    const payment = await payments.syncCheckout(c.get("user"), c.req.param("id"));
    return c.json(payment && toCheckoutView(payment));
  });

  // Comprovante da contratação: endereço, contatos, valores e situação do repasse.
  app.get("/events/:id/contratacao", async (c) => c.json(await events.getHiring(c.get("user"), c.req.param("id"))));

  app.delete("/events/:id/contratacao", async (c) => c.json(await events.cancelHiring(c.get("user"), c.req.param("id"))));

  // Garantia do contratante: músico não compareceu → estorno integral.
  app.post("/events/:id/nao-comparecimento", async (c) => {
    await events.reportNoShow(c.get("user"), c.req.param("id"));
    return c.body(null, 204);
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
