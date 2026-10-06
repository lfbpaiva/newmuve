import { LinearGradient } from "expo-linear-gradient";
import { Link } from "expo-router";
import { useEffect, useState } from "react";
import { Image, Text, View } from "react-native";
import { forgetEmail, rememberedEmail, rememberEmail, signIn } from "../../../shared/client/account.ts";
import { errorMessage } from "../../../shared/client/api.ts";
import { useAuth } from "../../../shared/client/AuthContext.tsx";
import { isValidEmail, sanitizeEmail } from "../../../shared/client/validators.ts";
import { Alert, Button, Checkbox, Field, PasswordField, Screen } from "../../components/ui";
import { colors, space, styles, type } from "../../lib/theme";

export default function LoginScreen() {
  const { state } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const notice = state.status === "signedOut" ? state.notice : undefined;

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
    setError("");
    setSubmitting(true);
    try {
      await signIn(email, password);
      if (rememberMe) await rememberEmail(email);
      else await forgetEmail();
      // A troca de tela acontece pelo AuthGate, ao detectar a sessão.
    } catch (e) {
      setError(errorMessage(e));
      setSubmitting(false);
    }
  }

  return <Screen padded={false}>
    <LinearGradient colors={["#17171c", colors.bg]} style={{ paddingTop: 64, paddingHorizontal: space.lg, paddingBottom: space.xl, gap: space.lg }}>
      <Image source={require("../../assets/logo-branca.png")} style={{ width: 112, height: 64, resizeMode: "contain" }} accessibilityLabel="Muve"/>
      <View style={{ gap: 4 }}>
        <Text style={[type.display, { fontSize: 46, lineHeight: 44 }]}>Seu próximo{"\n"}palco <Text style={{ color: colors.accent }}>começa aqui.</Text></Text>
      </View>
      <Text style={type.bodySmall}>Shows da sua região, candidatura sem custo e cachê garantido antes de subir no palco.</Text>
    </LinearGradient>
    <View style={{ paddingHorizontal: space.lg, gap: space.lg }}>
      <Field label="E-mail" value={email} onChangeText={(v) => { setEmail(sanitizeEmail(v)); setError(""); }} autoCapitalize="none" autoComplete="email" keyboardType="email-address" placeholder="voce@exemplo.com"/>
      <PasswordField value={password} onChangeText={(v) => { setPassword(v); setError(""); }}/>
      <View style={styles.between}>
        <Checkbox label="Lembrar de mim" checked={rememberMe} onChange={setRememberMe}/>
        <Link href="/(auth)/recover" style={[type.label, { color: colors.accent, paddingVertical: 12 }]}>Esqueci minha senha</Link>
      </View>
      {(error || notice) ? <Alert tone="error">{error || notice}</Alert> : null}
      <Button title="Entrar" icon="log-in-outline" onPress={login} loading={submitting}/>
      <Text style={[type.bodySmall, { textAlign: "center" }]}>Ainda não tem uma conta? <Link href="/(auth)/signup" style={[type.label, { color: colors.accent }]}>Criar conta</Link></Text>
    </View>
  </Screen>;
}
