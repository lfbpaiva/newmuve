import { useRouter } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";
import { deleteAccount, hasPasswordLogin } from "../../../shared/client/account.ts";
import { errorMessage } from "../../../shared/client/api.ts";
import { useAsync } from "../../../shared/client/useAsync.ts";
import { sanitizeEmail } from "../../../shared/client/validators.ts";
import { Turnstile } from "../../components/Turnstile";
import { CAPTCHA_ATIVO } from "../../lib/turnstile";
import { Alert, Button, Field, Heading, Icon, PasswordField, Screen } from "../../components/ui";
import { colors, space, styles, type } from "../../lib/theme";
import { useMe } from "../../lib/useMe";

export default function DeleteAccountScreen() {
  const me = useMe();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaKey, setCaptchaKey] = useState(0);
  const login = useAsync("login-com-senha", hasPasswordLogin);
  const pedeSenha = login.data !== false;
  const faltaCaptcha = pedeSenha && CAPTCHA_ATIVO && !captchaToken;

  async function confirm() {
    if (email !== me.email || (pedeSenha && !password)) return setError("E-mail ou senha não correspondem à conta atual.");
    if (faltaCaptcha) return setError("Confirme que você não é um robô.");
    setSubmitting(true);
    try {
      await deleteAccount(email, password, pedeSenha ? captchaToken ?? undefined : undefined);
    } catch (e) {
      setError(errorMessage(e));
      setCaptchaToken(null);
      setCaptchaKey((key) => key + 1);
      setSubmitting(false);
    }
  }

  return <Screen>
    <Heading title="Excluir conta" subtitle="Esta ação é permanente."/>
    <View style={[styles.card, { gap: space.md }]}>
      {[
        "Seu perfil, suas inscrições e seus eventos ainda abertos serão apagados, e os inscritos serão avisados. Shows já realizados continuam no histórico da outra parte, e as avaliações que você deixou ficam sem o seu nome.",
        "Registros de pagamentos já realizados são mantidos, sem vínculo com você, por obrigação fiscal.",
        "Você poderá criar uma nova conta com o mesmo CPF/CNPJ no futuro.",
      ].map((text) => <View key={text} style={[styles.row, { alignItems: "flex-start", gap: 10 }]}><Icon name="remove-circle-outline" size={18} color={colors.error}/><Text style={[type.bodySmall, { flex: 1 }]}>{text}</Text></View>)}
    </View>
    <Text style={type.body}>{pedeSenha ? "Para confirmar, digite o e-mail e a senha da conta." : "Para confirmar, digite o e-mail da conta."}</Text>
    <Field label="E-mail da conta" value={email} onChangeText={(v) => { setEmail(sanitizeEmail(v)); setError(""); }} autoCapitalize="none" keyboardType="email-address"/>
    {pedeSenha && <PasswordField label="Senha" value={password} onChangeText={(v) => { setPassword(v); setError(""); }}/>}
    {pedeSenha && <Turnstile key={captchaKey} onToken={setCaptchaToken} onError={setError}/>}
    {error ? <Alert tone="error">{error}</Alert> : null}
    <Button variant="danger" title="Excluir minha conta definitivamente" icon="trash-outline" onPress={confirm} loading={submitting} disabled={!email || (pedeSenha && !password) || faltaCaptcha}/>
    <Button variant="text" title="Manter minha conta" onPress={() => router.back()} disabled={submitting}/>
  </Screen>;
}
