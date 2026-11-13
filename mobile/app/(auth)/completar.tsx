import { useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { completeProfile, type Role } from "../../../shared/client/account.ts";
import { errorMessage } from "../../../shared/client/api.ts";
import { useAuth } from "../../../shared/client/AuthContext.tsx";
import { AuthHeader } from "../../components/AuthHeader";
import { Alert, Button, Checkbox, Field, OpcaoDePapel, Screen } from "../../components/ui";
import { space } from "../../lib/theme";
import { roles } from "./signup";

export default function CompleteSignupScreen() {
  const { state, refreshMe, signOut } = useAuth();
  const router = useRouter();
  const sugestao = state.status === "needsProfile" ? state.nomeSugerido : "";
  const email = state.status === "needsProfile" ? state.email : "";
  const [role, setRole] = useState<Role>("MUSICIAN");
  const [nome, setNome] = useState(sugestao);
  const [aceite, setAceite] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (!nome.trim()) return setError("Informe seu nome.");
    if (!aceite) return setError("Aceite os Termos de Uso para criar a conta.");
    setSubmitting(true);
    setError("");
    try {
      await completeProfile({ role, nome: nome.trim(), aceiteTermos: true });
      await refreshMe();
      router.replace("/");
    } catch (e) {
      setError(errorMessage(e));
      setSubmitting(false);
    }
  }

  return <Screen>
    <AuthHeader titulo="Quase lá" subtitulo={`Você entrou com ${email || "o Google"}. Falta só dizer como vai usar a Muve.`}/>
    <View style={{ flexDirection: "row", gap: space.md }}>
      {roles.map((option) => {
        const on = role === option.value;
        return <OpcaoDePapel key={option.value} ativa={on} icone={option.icon} titulo={option.title} detalhe={option.sub} onPress={() => setRole(option.value)}/>;
      })}
    </View>
    <Field label={role === "MUSICIAN" ? "Nome ou nome da banda" : "Nome ou nome fantasia"} value={nome} onChangeText={(v) => { setNome(v); setError(""); }} autoComplete="name"/>
    <View>
      <Checkbox label="Li e aceito os Termos de Uso" checked={aceite} onChange={(v) => { setAceite(v); setError(""); }}/>
      <Button title="Ler os Termos de Uso" variant="text" block={false} onPress={() => router.push("/terms")}/>
    </View>
    {error ? <Alert tone="error">{error}</Alert> : null}
    <Button title="Começar" icon="arrow-forward" onPress={() => void submit()} loading={submitting}/>
    <Button title="Usar outra conta" variant="text" onPress={() => void signOut()}/>
  </Screen>;
}
