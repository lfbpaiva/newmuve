import { View } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import { CAPTCHA_ATIVO, TURNSTILE_BASE_URL, TURNSTILE_ERRO, TURNSTILE_SCRIPT_URL, TURNSTILE_SITE_KEY, type TurnstileProps } from "../lib/turnstile";

function pagina(siteKey: string): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<style>html,body{margin:0;padding:0;background:transparent;display:flex;justify-content:center}</style>
<script src="${TURNSTILE_SCRIPT_URL}" async defer onload="iniciar()" onerror="enviar({ tipo: 'erro' })"></script>
</head>
<body>
<div id="widget"></div>
<script>
function enviar(mensagem) { window.ReactNativeWebView.postMessage(JSON.stringify(mensagem)); }
function iniciar() {
  turnstile.render("#widget", {
    sitekey: ${JSON.stringify(siteKey)},
    theme: "dark",
    language: "pt-br",
    callback: function (token) { enviar({ tipo: "token", token: token }); },
    "expired-callback": function () { enviar({ tipo: "expirado" }); },
    "error-callback": function () { enviar({ tipo: "erro" }); }
  });
}
</script>
</body>
</html>`;
}

export function Turnstile({ onToken, onError }: TurnstileProps) {
  function receber(event: WebViewMessageEvent) {
    let mensagem: { tipo?: string; token?: string };
    try {
      mensagem = JSON.parse(event.nativeEvent.data);
    } catch {
      return;
    }
    if (mensagem.tipo === "token" && mensagem.token) return onToken(mensagem.token);
    onToken(null);
    if (mensagem.tipo === "erro") onError(TURNSTILE_ERRO);
  }

  if (!CAPTCHA_ATIVO) return null;
  return <View style={{ height: 70, alignItems: "center" }}>
    <WebView
      source={{ html: pagina(TURNSTILE_SITE_KEY), baseUrl: TURNSTILE_BASE_URL }}
      originWhitelist={["*"]}
      onMessage={receber}
      onError={() => onError(TURNSTILE_ERRO)}
      javaScriptEnabled
      scrollEnabled={false}
      style={{ width: 310, height: 70, backgroundColor: "transparent" }}
    />
  </View>;
}
