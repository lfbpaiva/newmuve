import type { SupabaseClient } from "@supabase/supabase-js";

export interface KeyValueStorage {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

export interface ClientConfig {
  supabase: SupabaseClient;
  apiUrl: string;
  redirectUrl: string;
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

export type UploadFile = File | { uri: string; name: string; type: string };

export function appendFile(form: FormData, field: string, file: UploadFile | null): void {
  if (!file) return;
  form.append(field, file as Blob);
}
