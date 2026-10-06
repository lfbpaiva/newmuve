import { useState } from "react";
import { updatePassword } from "../../../shared/client/account.ts";
import { errorMessage } from "../../../shared/client/api.ts";
import { useAuth } from "../../../shared/client/AuthContext.tsx";
import { SENHA_TAMANHO_MINIMO } from "../../../shared/dominio.ts";
import { Alert, Button, Heading, PasswordField, Screen } from "../../components/ui";

// Exibida quando o usuário chega pelo link de redefinição enviado por e-mail.
export default function ResetPasswordScreen() {
  const { finishPasswordRecovery } = useAuth();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (password.length < SENHA_TAMANHO_MINIMO) return setError(`A senha deve ter pelo menos ${SENHA_TAMANHO_MINIMO} caracteres.`);
    if (password !== confirmation) return setError("As senhas não coincidem.");
    setSubmitting(true);
    try {
      await updatePassword(password);
      finishPasswordRecovery();
    } catch (e) {
      setError(errorMessage(e));
      setSubmitting(false);
    }
  }

  return <Screen>
    <Heading title="Defina uma nova senha" subtitle="É a senha que você usará para entrar na Muve a partir de agora."/>
    <PasswordField label="Nova senha" value={password} onChangeText={(v) => { setPassword(v); setError(""); }}/>
    <PasswordField label="Confirme a nova senha" value={confirmation} onChangeText={(v) => { setConfirmation(v); setError(""); }}/>
    {error ? <Alert tone="error">{error}</Alert> : null}
    <Button title="Salvar nova senha" onPress={submit} loading={submitting}/>
  </Screen>;
}
