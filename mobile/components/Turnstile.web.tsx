import { useEffect, useRef } from "react";
import { View } from "react-native";
import { CAPTCHA_ATIVO, TURNSTILE_ERRO, TURNSTILE_SCRIPT_URL, TURNSTILE_SITE_KEY, type TurnstileProps } from "../lib/turnstile";

interface TurnstileApi {
  render(element: HTMLElement, options: Record<string, unknown>): string;
  remove(widgetId: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let carregamento: Promise<TurnstileApi> | null = null;

function carregarTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  carregamento ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = TURNSTILE_SCRIPT_URL;
    script.async = true;
    script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error("Turnstile indisponível")));
    script.onerror = () => {
      carregamento = null;
      script.remove();
      reject(new Error("Turnstile indisponível"));
    };
    document.head.appendChild(script);
  });
  return carregamento;
}

export function Turnstile({ onToken, onError }: TurnstileProps) {
  const container = useRef<HTMLDivElement>(null);
  const callbacks = useRef({ onToken, onError });

  useEffect(() => {
    callbacks.current = { onToken, onError };
  });

  useEffect(() => {
    if (!CAPTCHA_ATIVO) return;
    let widgetId: string | null = null;
    let ativo = true;
    carregarTurnstile()
      .then((turnstile) => {
        if (!ativo || !container.current) return;
        widgetId = turnstile.render(container.current, {
          sitekey: TURNSTILE_SITE_KEY,
          theme: "dark",
          language: "pt-br",
          callback: (token: string) => callbacks.current.onToken(token),
          "expired-callback": () => callbacks.current.onToken(null),
          "error-callback": () => {
            callbacks.current.onToken(null);
            callbacks.current.onError(TURNSTILE_ERRO);
          },
        });
      })
      .catch(() => {
        if (ativo) callbacks.current.onError(TURNSTILE_ERRO);
      });
    return () => {
      ativo = false;
      if (widgetId) window.turnstile?.remove(widgetId);
    };
  }, []);

  if (!CAPTCHA_ATIVO) return null;
  return <View style={{ minHeight: 70, alignItems: "center" }}>
    <div ref={container}/>
  </View>;
}
