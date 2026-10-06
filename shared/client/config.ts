import type { SupabaseClient } from "@supabase/supabase-js";

// Configuração injetada por cada cliente (web ou mobile) na inicialização.
// O código compartilhado nunca lê variáveis de ambiente nem APIs do navegador.

export interface KeyValueStorage {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

export interface ClientConfig {
  supabase: SupabaseClient;
  /** URL base da API do Muve, ex.: http://localhost:3333/api */
  apiUrl: string;
  /** Para onde os links de confirmação de e-mail e redefinição de senha devem levar. */
  redirectUrl: string;
  /** Preferências locais (e-mail lembrado etc.). */
  storage: KeyValueStorage;
}

let current: ClientConfig | null = null;

export function configureClient(config: ClientConfig): void {
  current = { ...config, apiUrl: config.apiUrl.replace(/\/+$/, "") };
}

export function clientConfig(): ClientConfig {
  if (!current) throw new Error("configureClient() precisa ser chamado antes de usar os serviços.");
  return current;
}

export const supabase = () => clientConfig().supabase;

/** Arquivo de imagem enviado em formulários: File no navegador; { uri, name, type } no React Native. */
export type UploadFile = File | { uri: string; name: string; type: string };

export function appendFile(form: FormData, field: string, file: UploadFile | null): void {
  if (!file) return;
  // No React Native, FormData aceita o objeto { uri, name, type } diretamente.
  form.append(field, file as Blob);
}
