import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { signUp, type Role } from "../../../shared/client/account.ts";
import { errorMessage } from "../../../shared/client/api.ts";
import { sanitizeEmail } from "../../../shared/client/validators.ts";
import { isValidEmail, SENHA_TAMANHO_MINIMO } from "../../../shared/dominio.ts";
import { Alert, Button, Field, Heading, Icon, PasswordField, Screen, type IconName } from "../../components/ui";
import { colors, radius, space, type } from "../../lib/theme";

const roles: { value: Role; icon: IconName; title: string; sub: string }[] = [
  { value: "MUSICIAN", icon: "musical-notes-outline", title: "Sou músico", sub: "Quero encontrar shows" },
  { value: "CONTRACTOR", icon: "storefront-outline", title: "Sou contratante", sub: "Quero contratar talentos" },
];

// Cadastro mínimo: o resto do perfil é pedido quando fizer falta (feed, candidatura, evento).
export default function SignupScreen() {
  const router = useRouter();
  const [role, setRole] = useState<Role>("MUSICIAN");
  const [form, setForm] = useState({ nome: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sentTo, setSentTo] = useState("");
  const set = (changes: Partial<typeof form>) => { setForm((c) => ({ ...c, ...changes })); setError(""); };

  async function submit() {
    if (!form.nome.trim()) return setError("Informe seu nome.");
    if (!isValidEmail(form.email)) return setError("Informe um e-mail válido.");
    if (form.password.length < SENHA_TAMANHO_MINIMO) return setError(`A senha deve ter pelo menos ${SENHA_TAMANHO_MINIMO} caracteres.`);
    setSubmitting(true);
    try {
      await signUp({ role, ...form });
      setSentTo(form.email);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSubmitting(false);
    }
  }

  if (sentTo) return <Screen>
    <View style={{ gap: space.md, paddingTop: space.xl }}>
      <Icon name="mail-unread-outline" size={36} color={colors.accent}/>
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
        return <Pressable key={option.value} accessibilityRole="radio" accessibilityState={{ checked: on }} onPress={() => setRole(option.value)} style={({ pressed }) => ({ flex: 1, borderRadius: radius.md, padding: space.lg, gap: 10, borderWidth: 1, borderColor: on ? colors.accent : colors.line, backgroundColor: pressed ? colors.surface2 : on ? colors.surface : "transparent" })}>
          <Icon name={option.icon} size={24} color={on ? colors.accent : colors.ink2}/>
          <Text style={type.titleSmall}>{option.title}</Text>
          <Text style={type.bodySmall}>{option.sub}</Text>
        </Pressable>;
      })}
    </View>
    <Field label={role === "MUSICIAN" ? "Nome ou nome da banda" : "Nome ou nome fantasia"} value={form.nome} onChangeText={(nome) => set({ nome })} autoComplete="name"/>
    <Field label="E-mail" value={form.email} onChangeText={(v) => set({ email: sanitizeEmail(v) })} autoCapitalize="none" autoComplete="email" keyboardType="email-address" placeholder="voce@exemplo.com"/>
    <PasswordField value={form.password} onChangeText={(password) => set({ password })}/>
    {error ? <Alert tone="error">{error}</Alert> : null}
    <Button title="Criar minha conta" icon="arrow-forward" onPress={submit} loading={submitting}/>
  </Screen>;
}
