import { useState } from "react";
import { isValidEmail, SENHA_TAMANHO_MINIMO } from "../../../shared/dominio.ts";
import { Back, Field, Icon, Logo, PasswordField } from "../../components/ui";
import { signUp, type Role } from "../../services/account";
import { errorMessage } from "../../services/api";
import { sanitizeEmail } from "../../utils/validators";

// Cadastro mínimo: o resto do perfil é pedido quando fizer falta (feed, candidatura, evento).
export default function SignupScreen({ onBack }: { onBack: () => void }) {
  const [role, setRole] = useState<Role>("MUSICIAN");
  const [form, setForm] = useState({ nome: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sentTo, setSentTo] = useState("");
  const isMusician = role === "MUSICIAN";

  function set(changes: Partial<typeof form>) {
    setForm((current) => ({ ...current, ...changes }));
    setError("");
  }

  async function submit() {
    if (!form.nome.trim()) return setError("Informe seu nome.");
    if (!isValidEmail(form.email)) return setError("Informe um e-mail válido.");
    if (form.password.length < SENHA_TAMANHO_MINIMO) return setError(`A senha deve ter pelo menos ${SENHA_TAMANHO_MINIMO} caracteres.`);

    setSubmitting(true);
    try {
      await signUp({ role, ...form });
      setSentTo(form.email);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSubmitting(false);
    }
  }

  if (sentTo) return <div className="secondary-page auth-secondary">
    <header><Back onClick={onBack}/><Logo/></header>
    <main className="secondary-main"><div className="recover-card">
      <h2>Confirme seu e-mail</h2>
      <p>Enviamos um link de confirmação para <b>{sentTo}</b>. Abra a mensagem e clique no link para ativar sua conta.</p>
      <button className="primary wide" onClick={onBack}>Voltar para o login</button>
    </div></main>
  </div>;

  return <div className="secondary-page auth-secondary">
    <header><Back onClick={onBack}/><Logo/></header>
    <div className="signup-card">
      <h2>Vamos fazer música?</h2><p className="muted">Leva um minuto. Foto, cidade e os demais dados do perfil podem ser preenchidos depois.</p>
      <div className="role-picker">
        <button type="button" className={isMusician ? "selected" : ""} onClick={() => setRole("MUSICIAN")}><Icon name="music" size={26}/><b>Sou músico</b><span>Quero encontrar eventos</span></button>
        <button type="button" className={!isMusician ? "selected" : ""} onClick={() => setRole("CONTRACTOR")}><Icon name="calendar" size={26}/><b>Sou contratante</b><span>Quero contratar talentos</span></button>
      </div>
      <Field label={isMusician ? "Nome completo ou nome da banda" : "Nome ou nome fantasia"} placeholder="Como devemos chamar você?" value={form.nome} onChange={(nome) => set({ nome })}/>
      <Field label="E-mail" type="email" placeholder="voce@exemplo.com" value={form.email} onChange={(value) => set({ email: sanitizeEmail(value) })} error={form.email && !isValidEmail(form.email) ? "Informe um e-mail válido." : ""}/>
      <PasswordField value={form.password} onChange={(password) => set({ password })}/>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="primary wide" disabled={submitting} onClick={submit}>{submitting ? "Criando conta..." : "Criar minha conta"}</button>
    </div>
  </div>;
}
