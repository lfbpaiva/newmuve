import { clientConfig, supabase } from "./config.ts";

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly retryAfterSeconds: number | null;

  constructor(message: string, status: number, code: string, retryAfterSeconds: number | null = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  /** FormData é enviado como multipart; qualquer outro valor, como JSON. */
  body?: FormData | object;
  /** Token a usar; por padrão, o da sessão atual (se houver). */
  accessToken?: string;
  /** Tempo máximo para concluir a resposta da API. */
  timeoutMs?: number;
}

function httpErrorMessage(status: number): string {
  if (status === 401) return "Sessão inválida ou expirada. Entre novamente.";
  if (status === 403) return "Você não tem permissão para esta operação.";
  if (status === 429) return "Muitas tentativas. Aguarde um pouco e tente novamente.";
  if (status >= 500) return `Erro no servidor (HTTP ${status}). Tente novamente.`;
  return `A solicitação falhou (HTTP ${status}). Tente novamente.`;
}

function retryAfterSeconds(value: string | null): number | null {
  if (!value) return null;
  const seconds = /^\d+$/.test(value.trim()) ? Number(value) : (Date.parse(value) - Date.now()) / 1000;
  return Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds) : null;
}

function waitDescription(seconds: number): string {
  if (seconds < 60) return `${seconds} segundo${seconds === 1 ? "" : "s"}`;
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return `${minutes} minuto${minutes === 1 ? "" : "s"}`;
  const hours = Math.ceil(minutes / 60);
  return `${hours} hora${hours === 1 ? "" : "s"}`;
}

export async function apiRequest<T = void>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body } = options;
  const token = options.accessToken ?? (await supabase().auth.getSession()).data.session?.access_token;

  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body && !(body instanceof FormData)) headers["Content-Type"] = "application/json";

  let response: Response;
  let payload: { error?: { message?: string; code?: string } } | null = null;
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, options.timeoutMs ?? (body instanceof FormData ? 120_000 : 30_000));
  try {
    response = await fetch(`${clientConfig().apiUrl}${path}`, {
      method,
      headers,
      body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    if (response.status !== 204) {
      try {
        payload = await response.json();
      } catch (error) {
        if (!(error instanceof SyntaxError) || timedOut) throw error;
      }
    }
  } catch {
    if (timedOut) throw new ApiError("O servidor demorou para responder. Tente novamente.", 0, "TEMPO_ESGOTADO");
    throw new ApiError("Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.", 0, "SEM_CONEXAO");
  } finally {
    clearTimeout(timeout);
  }

  if (response.status === 204) return undefined as T;

  if (!response.ok) {
    throw new ApiError(
      payload?.error?.message ?? httpErrorMessage(response.status),
      response.status,
      payload?.error?.code ?? "ERRO_DESCONHECIDO",
      response.status === 429 ? retryAfterSeconds(response.headers.get("Retry-After")) : null,
    );
  }
  if (payload === null) {
    throw new ApiError("O servidor respondeu em um formato inesperado.", response.status, "RESPOSTA_INVALIDA");
  }
  return payload as T;
}

export function errorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return "Não foi possível concluir a operação. Tente novamente.";
  return error.status === 429 && error.retryAfterSeconds
    ? `${error.message} Tente novamente em ${waitDescription(error.retryAfterSeconds)}.`
    : error.message;
}
