import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { completeProfile, type Role } from "../../../shared/client/account.ts";
import { errorMessage } from "../../../shared/client/api.ts";
import { useAuth } from "../../../shared/client/AuthContext.tsx";
import { Alert, Button, Checkbox, Field, Heading, Icon, Screen } from "../../components/ui";
import { colors, radius, space, type } from "../../lib/theme";
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
    <Heading size="display" title="Quase lá" subtitle={`Você entrou com ${email || "o Google"}. Falta só dizer como vai usar a Muve.`}/>
    <View style={{ flexDirection: "row", gap: space.md }}>
      {roles.map((option) => {
        const on = role === option.value;
        return <Pressable key={option.value} accessibilityRole="radio" accessibilityState={{ checked: on }} onPress={() => setRole(option.value)} style={({ pressed }) => ({ flex: 1, borderRadius: radius.md, padding: space.lg, gap: 10, borderWidth: 1, borderColor: on ? colors.accentText : colors.line, backgroundColor: pressed ? colors.surface2 : on ? colors.surface : "transparent" })}>
          <Icon name={option.icon} size={24} color={on ? colors.accentText : colors.ink2}/>
          <Text style={type.titleSmall}>{option.title}</Text>
          <Text style={type.bodySmall}>{option.sub}</Text>
        </Pressable>;
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
