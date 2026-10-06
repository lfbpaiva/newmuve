import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "../../auth/AuthContext";
import { Field, Logo, PasswordField } from "../../components/ui";
import { forgetEmail, rememberedEmail, rememberEmail, signIn } from "../../services/account";
import { errorMessage } from "../../services/api";
import { isValidEmail, sanitizeEmail } from "../../utils/validators";

export default function LoginScreen({ onSignup, onRecover }: { onSignup: () => void; onRecover: () => void }) {
  const { state } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);

  useEffect(() => {
    rememberedEmail().then((saved) => {
      if (saved) {
        setEmail(saved);
        setRememberMe(true);
      }
    });
  }, []);
  const [emailError, setEmailError] = useState("");
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const notice = state.status === "signedOut" ? state.notice : undefined;

  async function login(e: FormEvent) {
    e.preventDefault();
    if (!isValidEmail(email)) return setEmailError("Informe um e-mail válido.");
    if (!password) return setFormError("Informe sua senha.");

    setFormError("");
    setSubmitting(true);
    try {
      await signIn(email, password);
      if (rememberMe) await rememberEmail(email);
      else await forgetEmail();
      // A troca de tela acontece pelo AuthContext, ao detectar a sessão.
    } catch (error) {
      setFormError(errorMessage(error));
      setSubmitting(false);
    }
  }

  return <div className="auth">
    <section className="auth-visual auth-art">
      <Logo size={44}/>
      <div><h1>Seu próximo<br/>palco <em>começa aqui.</em></h1><p>Shows da sua região, candidatura sem custo e cachê garantido antes de subir no palco.</p></div>
      <small>Músicos × contratantes</small>
    </section>
    <section className="auth-form">
      <div className="mobile-logo"><Logo/></div>
      <div className="form-wrap">
        <h2>Entre na sua conta</h2>
        <p className="muted">Use o e-mail cadastrado para continuar.</p>
        <form onSubmit={login} noValidate>
          <Field
            label="E-mail"
            type="email"
            placeholder="voce@exemplo.com"
            value={email}
            onChange={(value) => {
              const clean = sanitizeEmail(value);
              setEmail(clean);
              setEmailError(clean && !isValidEmail(clean) ? "Informe um e-mail válido." : "");
              setFormError("");
            }}
            onBlur={() => email && !isValidEmail(email) && setEmailError("Informe um e-mail válido.")}
            error={emailError}
          />
          <PasswordField value={password} onChange={(value) => { setPassword(value); setFormError(""); }}/>
          <div className="form-line">
            <label className="check"><input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)}/> Lembrar de mim</label>
            <button type="button" className="text-btn" onClick={onRecover}>Esqueci minha senha</button>
          </div>
          {(formError || notice) && <p className="form-error" role="alert">{formError || notice}</p>}
          <button className="primary wide" disabled={submitting}>{submitting ? "Entrando..." : "Entrar"}</button>
        </form>
        <p className="auth-switch">Ainda não tem uma conta? <button type="button" onClick={onSignup}>Criar conta</button></p>
      </div>
    </section>
  </div>;
}
