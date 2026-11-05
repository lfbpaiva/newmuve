import { isIP } from "node:net";
import { getConnInfo } from "@hono/node-server/conninfo";
import type { Context } from "hono";
import { AppError } from "../domain/errors.ts";

function validIp(value: string | undefined): string | undefined {
  const address = value?.trim();
  if (!address) return undefined;
  const normalized = address.startsWith("::ffff:") && isIP(address.slice(7)) === 4 ? address.slice(7) : address;
  return isIP(normalized) ? normalized : undefined;
}

function socketIp(c: Context): string | undefined {
  try {
    return getConnInfo(c).remote.address;
  } catch {
    return undefined;
  }
}

export function rateLimit(options: {
  limit: number;
  windowMs: number;
  now?: () => number;
  remoteAddress?: (c: Context) => string | undefined;
  trustedProxyIps?: string[];
}) {
  const { limit, windowMs, now = Date.now } = options;
  const hits = new Map<string, { count: number; resetAt: number }>();
  const remoteAddress = options.remoteAddress ?? socketIp;
  const trusted = new Set([
    "127.0.0.1", "::1",
    ...(options.trustedProxyIps ?? (process.env.TRUSTED_PROXY_IPS ?? "").split(",")),
  ].map(validIp).filter((ip): ip is string => Boolean(ip)));

  return async (c: Context, next: () => Promise<void>) => {
    const time = now();
    const peer = validIp(remoteAddress(c));
    let client = peer ?? "desconhecido";
    if (peer && trusted.has(peer)) {
      for (const address of (c.req.header("x-forwarded-for") ?? "").split(",").reverse()) {
        const forwarded = validIp(address);
        if (!forwarded) break;
        client = forwarded;
        if (!trusted.has(forwarded)) break;
      }
    }
    const key = `${client}:${c.req.method}:${c.req.path}`;

    if (hits.size > 10_000) {
      for (const [k, entry] of hits) if (entry.resetAt <= time) hits.delete(k);
    }

    const entry = hits.get(key);
    if (!entry || entry.resetAt <= time) {
      hits.set(key, { count: 1, resetAt: time + windowMs });
    } else if (entry.count >= limit) {
      throw new AppError(429, "MUITAS_TENTATIVAS", "Limite temporário de tentativas atingido.", String(Math.ceil((entry.resetAt - time) / 1000)));
    } else {
      entry.count++;
    }
    await next();
  };
}
