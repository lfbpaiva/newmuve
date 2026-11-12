import { LinearGradient } from "expo-linear-gradient";
import { Link } from "expo-router";
import { useEffect, useState } from "react";
import { Text, useWindowDimensions, View } from "react-native";
import { forgetEmail, rememberedEmail, rememberEmail, signIn } from "../../../shared/client/account.ts";
import { errorMessage } from "../../../shared/client/api.ts";
import { useAuth } from "../../../shared/client/AuthContext.tsx";
import { isValidEmail, sanitizeEmail } from "../../../shared/client/validators.ts";
import { GoogleButton } from "../../components/GoogleButton";
import { Turnstile } from "../../components/Turnstile";
import { CAPTCHA_ATIVO } from "../../lib/turnstile";
import { Alert, Button, Checkbox, Field, PasswordField, Screen } from "../../components/ui";
import { colors, space, type } from "../../lib/theme";

export default function LoginScreen() {
  const { width } = useWindowDimensions();
  const compact = width < 380;
  const { state } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaKey, setCaptchaKey] = useState(0);
  const faltaCaptcha = CAPTCHA_ATIVO && !captchaToken;
  const notice = state.status === "signedOut" ? state.notice : undefined;
  const emailError = error === "Informe um e-mail válido." ? error : undefined;
  const alertMessage = emailError ? notice : error || notice;
  const secondaryText = [type.bodySmall, { fontSize: 14, lineHeight: 21, color: colors.ink2 }] as const;

  useEffect(() => {
    rememberedEmail().then((saved) => {
      if (saved) {
        setEmail(saved);
        setRememberMe(true);
      }
    });
  }, []);

  async function login() {
    if (!isValidEmail(email)) return setError("Informe um e-mail válido.");
    if (!password) return setError("Informe sua senha.");
    if (faltaCaptcha) return setError("Confirme que você não é um robô.");
    setError("");
    setSubmitting(true);
    try {
      await signIn(email, password, captchaToken ?? undefined);
      if (rememberMe) await rememberEmail(email);
      else await forgetEmail();
    } catch (e) {
      setError(errorMessage(e));
      setCaptchaToken(null);
      setCaptchaKey((key) => key + 1);
      setSubmitting(false);
    }
  }

  return <Screen padded={false}>
    <LinearGradient colors={["#241943", colors.bg]} style={{ paddingTop: compact ? space.xl : space.xxl, paddingHorizontal: compact ? space.lg : space.xl, paddingBottom: space.xl }}>
      <View style={{ width: "100%", maxWidth: 420, alignSelf: "center", gap: space.lg }}>
        <Text style={{ fontFamily: "Archivo_900Black", fontSize: 28, lineHeight: 34, letterSpacing: 1, color: colors.ink }} accessibilityLabel="Muve">MUVE</Text>
        <View style={{ gap: space.md }}>
          <Text style={[type.display, { fontSize: compact ? 34 : 40, lineHeight: compact ? 39 : 45, letterSpacing: -0.8, textTransform: "none" }]} accessibilityRole="header">A música nos <Text style={{ color: colors.accentText }}>conecta.</Text></Text>
          <Text style={[type.body, { color: colors.ink2 }]}>Encontre seu próximo show ou o talento certo para o seu evento.</Text>
        </View>
      </View>
    </LinearGradient>
    <View style={{ width: "100%", maxWidth: 420, alignSelf: "center", paddingHorizontal: compact ? space.lg : space.xl, paddingBottom: space.xxl, gap: space.lg }}>
      <View style={{ borderTopWidth: 1, borderTopColor: colors.line, paddingTop: space.xl, gap: space.xs }}>
        <Text style={[type.titleSmall, { fontSize: 20, lineHeight: 27 }]} accessibilityRole="header">Entre na sua conta</Text>
        <Text style={secondaryText}>Acesse seus eventos, inscrições e conversas.</Text>
      </View>
      <Field label="E-mail" error={emailError} value={email} onChangeText={(v) => { setEmail(sanitizeEmail(v)); setError(""); }} autoCapitalize="none" autoComplete="email" keyboardType="email-address" placeholder="voce@exemplo.com"/>
      <PasswordField value={password} onChangeText={(v) => { setPassword(v); setError(""); }}/>
      <View style={{ gap: space.xs }}>
        <Checkbox label="Lembrar de mim" checked={rememberMe} onChange={setRememberMe}/>
        <Link href="/(auth)/recover" style={[type.bodySmall, { fontSize: 14, lineHeight: 21, color: colors.accentText, alignSelf: "flex-end", paddingVertical: space.sm }]}>Esqueci minha senha</Link>
      </View>
      <Turnstile key={captchaKey} onToken={setCaptchaToken} onError={setError}/>
      {alertMessage ? <Alert tone="error">{alertMessage}</Alert> : null}
      {faltaCaptcha && !error && !submitting ? <Text style={[secondaryText, { textAlign: "center" }]}>Conclua a verificação de segurança para entrar.</Text> : null}
      <Button title="Entrar na Muve" icon="arrow-forward" onPress={login} loading={submitting} disabled={faltaCaptcha}/>
      <GoogleButton onError={setError}/>
      <View style={{ borderTopWidth: 1, borderTopColor: colors.line, paddingTop: space.lg }}>
        <Text style={[secondaryText, { textAlign: "center" }]}>Ainda não tem uma conta? <Link href="/(auth)/signup" style={[type.bodySmall, { fontSize: 14, lineHeight: 21, color: colors.accentText, fontFamily: "Manrope_800ExtraBold" }]}>Criar conta</Link></Text>
      </View>
    </View>
  </Screen>;
}
