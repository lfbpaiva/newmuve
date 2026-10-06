import type { Context } from "hono";
import { AppError } from "../domain/errors.ts";

// Limite de requisições por cliente em janela fixa, mantido em memória.
// Suficiente para uma única instância do servidor; com várias instâncias, o
// contador precisaria ir para um armazenamento compartilhado (ex.: Redis).
export function rateLimit(options: { limit: number; windowMs: number; now?: () => number }) {
  const { limit, windowMs, now = Date.now } = options;
  const hits = new Map<string, { count: number; resetAt: number }>();

  return async (c: Context, next: () => Promise<void>) => {
    const time = now();
    // Atrás de um proxy (Render, Railway...), o IP real vem em x-forwarded-for.
    const client = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || "desconhecido";
    const key = `${client}:${c.req.method}:${c.req.path}`;

    if (hits.size > 10_000) {
      for (const [k, entry] of hits) if (entry.resetAt <= time) hits.delete(k);
    }

    const entry = hits.get(key);
    if (!entry || entry.resetAt <= time) {
      hits.set(key, { count: 1, resetAt: time + windowMs });
    } else if (++entry.count > limit) {
      c.header("Retry-After", String(Math.ceil((entry.resetAt - time) / 1000)));
      throw new AppError(429, "MUITAS_TENTATIVAS", "Muitas tentativas. Aguarde alguns minutos e tente novamente.");
    }
    await next();
  };
}
