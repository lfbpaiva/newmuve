import { useState } from "react";
import { Field, PasswordField, Secondary } from "../../components/ui";
import { deleteAccount, type Me } from "../../services/account";
import { errorMessage } from "../../services/api";
import { sanitizeEmail } from "../../utils/validators";

export default function DeleteAccountScreen({ me, onBack }: { me: Me; onBack: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function confirm() {
    if (email !== me.email || !password) return setError("E-mail ou senha não correspondem à conta atual.");

    setSubmitting(true);
    try {
      // A API confere a senha novamente antes de excluir. Ao concluir, a sessão
      // é encerrada e o AuthContext leva de volta ao login.
      await deleteAccount(email, password);
    } catch (e) {
      setError(errorMessage(e));
      setSubmitting(false);
    }
  }

  return <Secondary title="Excluir conta" subtitle="Confirme sua identidade para continuar." onBack={onBack}>
    <div className="delete-card">
      <strong>ATENÇÃO: A EXCLUSÃO DA CONTA É PERMANENTE. SEUS DADOS, EVENTOS E CANDIDATURAS SERÃO REMOVIDOS.</strong>
      <p>Contas com um show contratado em andamento não podem ser excluídas: conclua ou cancele a contratação antes.</p>
      <Field label="Digite o e-mail da conta" type="email" value={email} onChange={(value) => { setEmail(sanitizeEmail(value)); setError(""); }}/>
      <PasswordField label="Confirme sua senha" value={password} onChange={(value) => { setPassword(value); setError(""); }}/>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="delete-button" disabled={submitting} onClick={confirm}>{submitting ? "Excluindo..." : "Excluir minha conta definitivamente"}</button>
    </div>
  </Secondary>;
}
