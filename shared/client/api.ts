import { clientConfig, supabase } from "./config.ts";

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, status: number, code: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  /** FormData é enviado como multipart; qualquer outro valor, como JSON. */
  body?: FormData | object;
  /** Token a usar; por padrão, o da sessão atual (se houver). */
  accessToken?: string;
}

export async function apiRequest<T = void>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body } = options;
  const token = options.accessToken ?? (await supabase().auth.getSession()).data.session?.access_token;

  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body && !(body instanceof FormData)) headers["Content-Type"] = "application/json";

  let response: Response;
  try {
    response = await fetch(`${clientConfig().apiUrl}${path}`, {
      method,
      headers,
      body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError("Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.", 0, "SEM_CONEXAO");
  }

  if (response.status === 204) return undefined as T;

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(
      payload?.error?.message ?? "Não foi possível concluir a operação. Tente novamente.",
      response.status,
      payload?.error?.code ?? "ERRO_DESCONHECIDO",
    );
  }
  return payload as T;
}

export function errorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : "Não foi possível concluir a operação. Tente novamente.";
}
