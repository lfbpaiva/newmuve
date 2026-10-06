import { useEffect, useState } from "react";
import { Back, Field, Icon, Logo } from "../../components/ui";
import { rememberedEmail, requestPasswordReset } from "../../services/account";
import { errorMessage } from "../../services/api";
import { isValidEmail, sanitizeEmail } from "../../utils/validators";

export default function RecoverScreen({ onBack }: { onBack: () => void }) {
  const [email, setEmail] = useState("");

  useEffect(() => {
    rememberedEmail().then((saved) => saved && setEmail(saved));
  }, []);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

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

  return <div className="secondary-page auth-secondary">
    <header><Back onClick={onBack}/><Logo/></header>
    <main className="secondary-main"><div className="recover-card">
      <h2>Recupere seu acesso</h2>
      <p>Enviaremos as instruções de redefinição para o e-mail cadastrado.</p>
      {sent
        // A mesma mensagem para qualquer e-mail: não revela quais endereços têm conta.
        ? <div className="recovery-success" role="status"><Icon name="check"/><span>Se este e-mail estiver cadastrado, você receberá as instruções em instantes.</span></div>
        : <>
          <Field label="E-mail da conta" type="email" value={email} onChange={(value) => { setEmail(sanitizeEmail(value)); setError(""); }} error={email && !isValidEmail(email) ? "Informe um e-mail válido." : ""}/>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="primary wide" disabled={submitting || !isValidEmail(email)} onClick={submit}>{submitting ? "Enviando..." : "Enviar link de recuperação"}</button>
        </>}
    </div></main>
  </div>;
}
