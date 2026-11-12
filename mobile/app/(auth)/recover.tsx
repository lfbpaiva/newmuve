import { useEffect, useState } from "react";
import { rememberedEmail, requestPasswordReset } from "../../../shared/client/account.ts";
import { errorMessage } from "../../../shared/client/api.ts";
import { isValidEmail, sanitizeEmail } from "../../../shared/client/validators.ts";
import { Turnstile } from "../../components/Turnstile";
import { CAPTCHA_ATIVO } from "../../lib/turnstile";
import { Alert, Button, Field, Heading, Screen } from "../../components/ui";

export default function RecoverScreen() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaKey, setCaptchaKey] = useState(0);
  const faltaCaptcha = CAPTCHA_ATIVO && !captchaToken;

  useEffect(() => {
    rememberedEmail().then((saved) => saved && setEmail(saved));
  }, []);

  async function submit() {
    if (faltaCaptcha) return setError("Confirme que você não é um robô.");
    setSubmitting(true);
    setError("");
    try {
      await requestPasswordReset(email, captchaToken ?? undefined);
      setSent(true);
    } catch (e) {
      setError(errorMessage(e));
      setCaptchaToken(null);
      setCaptchaKey((key) => key + 1);
    } finally {
      setSubmitting(false);
    }
  }

  return <Screen>
    <Heading title="Recupere seu acesso" subtitle="Enviaremos um link de redefinição para o e-mail cadastrado. O link abre o app."/>
    {sent
      ? <Alert tone="success">Se este e-mail estiver cadastrado, você receberá as instruções em instantes.</Alert>
      : <>
        <Field label="E-mail da conta" value={email} onChangeText={(v) => { setEmail(sanitizeEmail(v)); setError(""); }} autoCapitalize="none" autoComplete="email" keyboardType="email-address"/>
        <Turnstile key={captchaKey} onToken={setCaptchaToken} onError={setError}/>
        {error ? <Alert tone="error">{error}</Alert> : null}
        <Button title="Enviar link de recuperação" icon="mail-outline" onPress={submit} loading={submitting} disabled={!isValidEmail(email) || faltaCaptcha}/>
      </>}
  </Screen>;
}
