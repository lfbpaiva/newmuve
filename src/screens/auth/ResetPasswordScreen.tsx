import { useState, type FormEvent } from "react";
import { SENHA_TAMANHO_MINIMO } from "../../../shared/dominio.ts";
import { useAuth } from "../../auth/AuthContext";
import { Logo, PasswordField } from "../../components/ui";
import { updatePassword } from "../../services/account";
import { errorMessage } from "../../services/api";

// Exibida quando o usuário chega pelo link de redefinição enviado por e-mail.
export default function ResetPasswordScreen() {
  const { finishPasswordRecovery } = useAuth();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
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

  return <div className="secondary-page auth-secondary">
    <header><span/><Logo/></header>
    <main className="secondary-main"><form className="recover-card" onSubmit={submit} noValidate>
      <h2>Defina uma nova senha</h2>
      <p>Escolha a senha que você usará para entrar na Muve a partir de agora.</p>
      <PasswordField label="Nova senha" value={password} onChange={(value) => { setPassword(value); setError(""); }}/>
      <PasswordField label="Confirme a nova senha" value={confirmation} onChange={(value) => { setConfirmation(value); setError(""); }}/>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="primary wide" disabled={submitting}>{submitting ? "Salvando..." : "Salvar nova senha"}</button>
    </form></main>
  </div>;
}
