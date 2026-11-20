import { useState } from "react";
import { Text, View } from "react-native";
import { CAPTCHA_ATIVO } from "../lib/turnstile";
import { colors, space, type } from "../lib/theme";
import { Turnstile } from "./Turnstile";
import { Alert, Button } from "./ui";

export function VerificacaoDeSeguranca({ onToken, aviso = "Conclua a verificação de segurança para continuar." }: { onToken(token: string | null): void; aviso?: string }) {
  const [tentativa, setTentativa] = useState(0);
  const [erro, setErro] = useState("");
  const [concluida, setConcluida] = useState(false);

  if (!CAPTCHA_ATIVO) return null;

  function receber(token: string | null) {
    setConcluida(Boolean(token));
    if (token) setErro("");
    onToken(token);
  }

  function tentarDeNovo() {
    setErro("");
    setConcluida(false);
    onToken(null);
    setTentativa((atual) => atual + 1);
  }

  return <View style={{ gap: space.sm }}>
    <Turnstile key={tentativa} onToken={receber} onError={setErro}/>
    {erro ? <>
      <Alert tone="error">{erro}</Alert>
      <Button title="Tentar de novo" variant="tonal" icon="refresh" onPress={tentarDeNovo}/>
    </> : null}
    {!erro && !concluida ? <Text style={[type.bodySmall, { fontSize: 14, lineHeight: 21, color: colors.ink2, textAlign: "center" }]}>{aviso}</Text> : null}
  </View>;
}
