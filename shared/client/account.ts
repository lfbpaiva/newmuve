import type { AuthError } from "@supabase/supabase-js";
import { ApiError, apiRequest } from "./api.ts";
import { appendFile, clientConfig, supabase, type UploadFile } from "./config.ts";

export type Role = "MUSICIAN" | "CONTRACTOR";

export interface Me {
  id: string;
  email: string;
  role: Role;
  nome: string;
  documento: string | null;
  telefone: string | null;
  uf: string | null;
  cidade: string | null;
  fotoPerfilUrl: string | null;
  avaliacaoMedia: number;
  totalAvaliacoes: number;
  bio?: string | null;
  estilosMusicais?: string[] | null;
  chavePixTipo?: string | null;
  chavePix?: string | null;
  portfolioUrl?: string | null;
  visibilidadeReduzidaAte?: string | null;
}

export interface ProfileData {
  nome: string;
  documento?: string;
  telefone?: string;
  uf?: string;
  cidade?: string;
  bio?: string;
  estilosMusicais?: string[];
  chavePixTipo?: string;
  chavePix?: string;
  portfolioUrl?: string;
}

export interface SignupData {
  role: Role;
  nome: string;
  email: string;
  password: string;
  aceiteTermos: boolean;
}

const REMEMBERED_EMAIL_KEY = "muve.rememberedEmail";

function withFile(dados: object, avatar: UploadFile | null): FormData {
  const form = new FormData();
  form.append("dados", JSON.stringify(dados));
  appendFile(form, "avatar", avatar);
  return form;
}

function authError(error: AuthError): ApiError {
  const messages: Record<string, string> = {
    invalid_credentials: "E-mail não cadastrado ou senha incorreta.",
    email_not_confirmed: "Confirme seu e-mail pelo link que enviamos antes de entrar.",
    email_address_invalid: "Informe um e-mail válido.",
    over_request_rate_limit: "Muitas tentativas. Aguarde alguns minutos e tente novamente.",
    over_email_send_rate_limit: "Muitos e-mails solicitados. Aguarde alguns minutos e tente novamente.",
    weak_password: "Escolha uma senha mais forte.",
    same_password: "A nova senha deve ser diferente da atual.",
  };
  const message = (error.code && messages[error.code]) || "Não foi possível concluir a operação. Tente novamente.";
  return new ApiError(message, error.status ?? 0, error.code ?? "ERRO_DE_AUTENTICACAO");
}

export async function signUp(dados: SignupData): Promise<void> {
  await apiRequest("/auth/signup", { method: "POST", body: { ...dados, redirectTo: clientConfig().redirectUrl } });
}

export async function signIn(email: string, password: string): Promise<void> {
  const { error } = await supabase().auth.signInWithPassword({ email, password });
  if (error) throw authError(error);
}

export const registerDevice = (token: string) => apiRequest("/me/dispositivos", { method: "POST", body: { token } });
export const unregisterDevice = (token: string) => apiRequest("/me/dispositivos/remover", { method: "POST", body: { token } });

export const completeProfile = (dados: { role: Role; nome: string; aceiteTermos: boolean }) =>
  apiRequest("/me/perfil", { method: "POST", body: dados });

export async function signOut(): Promise<void> {
  await supabase().auth.signOut({ scope: "local" });
}

export async function requestPasswordReset(email: string): Promise<void> {
  const { error } = await supabase().auth.resetPasswordForEmail(email, { redirectTo: clientConfig().redirectUrl });
  if (error) throw authError(error);
}

export async function updatePassword(password: string): Promise<void> {
  const { error } = await supabase().auth.updateUser({ password });
  if (error) throw authError(error);
}

export function fetchMe(accessToken?: string): Promise<Me> {
  return apiRequest<Me>("/me", { accessToken });
}

export function updateProfile(dados: ProfileData, avatar: UploadFile | null): Promise<Me> {
  return apiRequest<Me>("/me", { method: "PATCH", body: withFile(dados, avatar) });
}

export async function deleteAccount(email: string, password: string): Promise<void> {
  await apiRequest("/me", { method: "DELETE", body: { email, password } });
  await forgetEmail();
  await signOut();
}

export async function rememberedEmail(): Promise<string> {
  return (await clientConfig().storage.get(REMEMBERED_EMAIL_KEY).catch(() => null)) ?? "";
}

export async function rememberEmail(email: string): Promise<void> {
  await clientConfig().storage.set(REMEMBERED_EMAIL_KEY, email).catch(() => {});
}

export async function forgetEmail(): Promise<void> {
  await clientConfig().storage.remove(REMEMBERED_EMAIL_KEY).catch(() => {});
}
