import { useEffect, useState } from "react";
import { rememberedEmail, requestPasswordReset } from "../../../shared/client/account.ts";
import { errorMessage } from "../../../shared/client/api.ts";
import { isValidEmail, sanitizeEmail } from "../../../shared/client/validators.ts";
import { Alert, Button, Field, Heading, Screen } from "../../components/ui";

export default function RecoverScreen() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    rememberedEmail().then((saved) => saved && setEmail(saved));
  }, []);

  async function submit() {
    setSubmitting(true);
    setError("");
    try {
      await requestPasswordReset(email);
      setSent(true);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSubmitting(false);
    }
  }

  return <Screen>
    <Heading title="Recupere seu acesso" subtitle="Enviaremos um link de redefinição para o e-mail cadastrado. O link abre o app."/>
    {sent
      // A mesma mensagem para qualquer e-mail: não revela quais endereços têm conta.
      ? <Alert tone="success">Se este e-mail estiver cadastrado, você receberá as instruções em instantes.</Alert>
      : <>
        <Field label="E-mail da conta" value={email} onChangeText={(v) => { setEmail(sanitizeEmail(v)); setError(""); }} autoCapitalize="none" autoComplete="email" keyboardType="email-address"/>
        {error ? <Alert tone="error">{error}</Alert> : null}
        <Button title="Enviar link de recuperação" icon="mail-outline" onPress={submit} loading={submitting} disabled={!isValidEmail(email)}/>
      </>}
  </Screen>;
}
