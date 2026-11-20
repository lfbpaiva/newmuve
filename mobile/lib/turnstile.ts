export const TURNSTILE_SITE_KEY = process.env.EXPO_PUBLIC_TURNSTILE_SITE_KEY?.trim() ?? "";
export const CAPTCHA_ATIVO = TURNSTILE_SITE_KEY !== "";
export const TURNSTILE_BASE_URL = process.env.EXPO_PUBLIC_TURNSTILE_BASE_URL?.trim() || "https://app.muve.com.br";
export const TURNSTILE_SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
export const TURNSTILE_ERRO = "Não foi possível carregar a verificação de segurança. Pode ser a conexão, um bloqueador de anúncios ou uma extensão do navegador.";

export interface TurnstileProps {
  onToken(token: string | null): void;
  onError(message: string): void;
}
