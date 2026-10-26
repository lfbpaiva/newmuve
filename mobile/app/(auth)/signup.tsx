import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { signUp, type Role } from "../../../shared/client/account.ts";
import { ApiError, errorMessage } from "../../../shared/client/api.ts";
import { sanitizeEmail } from "../../../shared/client/validators.ts";
import { isValidEmail, SENHA_TAMANHO_MINIMO } from "../../../shared/dominio.ts";
import { Alert, Button, Checkbox, Field, Heading, Icon, PasswordField, Screen, type IconName } from "../../components/ui";
import { colors, radius, space, type } from "../../lib/theme";

const roles: { value: Role; icon: IconName; title: string; sub: string }[] = [
  { value: "MUSICIAN", icon: "musical-notes-outline", title: "Sou músico", sub: "Quero encontrar shows" },
  { value: "CONTRACTOR", icon: "storefront-outline", title: "Sou contratante", sub: "Quero contratar talentos" },
];

export default function SignupScreen() {
  const router = useRouter();
  const [role, setRole] = useState<Role>("MUSICIAN");
  const [form, setForm] = useState({ nome: "", email: "", password: "", aceiteTermos: false });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const inFlight = useRef(false);
  const [retryUntil, setRetryUntil] = useState<number | null>(null);
  const [sentTo, setSentTo] = useState("");
  const waiting = retryUntil !== null;
  useEffect(() => {
    if (retryUntil === null) return;
    const timer = setTimeout(() => {
      setRetryUntil(null);
      setError("");
    }, Math.max(0, retryUntil - Date.now()));
    return () => clearTimeout(timer);
  }, [retryUntil]);
  const set = (changes: Partial<typeof form>) => { setForm((c) => ({ ...c, ...changes })); setError(""); };

  async function submit() {
    if (inFlight.current || (retryUntil !== null && Date.now() < retryUntil)) return;
    if (!form.nome.trim()) return setError("Informe seu nome.");
    if (!isValidEmail(form.email)) return setError("Informe um e-mail válido.");
    if (form.password.length < SENHA_TAMANHO_MINIMO) return setError(`A senha deve ter pelo menos ${SENHA_TAMANHO_MINIMO} caracteres.`);
    if (!form.aceiteTermos) return setError("Aceite os Termos de Uso para criar a conta.");
    inFlight.current = true;
    setSubmitting(true);
    try {
      await signUp({ role, ...form });
      setSentTo(form.email);
    } catch (e) {
      if (e instanceof ApiError && e.status === 429 && e.retryAfterSeconds) {
        setRetryUntil(Date.now() + e.retryAfterSeconds * 1000);
      }
      setError(errorMessage(e));
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  }

  if (sentTo) return <Screen>
    <View style={{ gap: space.md, paddingTop: space.xl }}>
      <Icon name="mail-unread-outline" size={36} color={colors.accentText}/>
      <Text style={type.display}>Confira{"\n"}seu e-mail</Text>
      <Text style={type.body}>Enviamos um link para <Text style={type.label}>{sentTo}</Text>. Abra a mensagem no celular e toque no link para ativar sua conta.</Text>
      <Button title="Voltar para o login" variant="outlined" onPress={() => router.replace("/(auth)/login")}/>
    </View>
  </Screen>;

  return <Screen>
    <Heading size="display" title="Vamos fazer música" subtitle="Leva um minuto. Foto, cidade e os demais dados podem ser preenchidos depois."/>
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
    <Field label={role === "MUSICIAN" ? "Nome ou nome da banda" : "Nome ou nome fantasia"} value={form.nome} onChangeText={(nome) => set({ nome })} autoComplete="name"/>
    <Field label="E-mail" value={form.email} onChangeText={(v) => set({ email: sanitizeEmail(v) })} autoCapitalize="none" autoComplete="email" keyboardType="email-address" placeholder="voce@exemplo.com"/>
    <PasswordField value={form.password} onChangeText={(password) => set({ password })}/>
    <View>
      <Checkbox label="Li e aceito os Termos de Uso" checked={form.aceiteTermos} onChange={(aceiteTermos) => set({ aceiteTermos })}/>
      <Button title="Ler os Termos de Uso" variant="text" block={false} onPress={() => router.push("/terms")}/>
    </View>
    {error ? <Alert tone="error">{error}</Alert> : null}
    {waiting && !error ? <Alert tone="info">Muitas tentativas de cadastro em pouco tempo. Aguarde alguns instantes; o botão volta a funcionar sozinho.</Alert> : null}
    <Button title={waiting ? "Aguarde para tentar novamente" : "Criar minha conta"} icon="arrow-forward" onPress={submit} loading={submitting} disabled={waiting}/>
  </Screen>;
}
