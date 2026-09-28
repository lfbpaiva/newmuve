import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import {
  isValidCache,
  isValidGmail,
  maskCNPJ,
  maskCPF,
  maskPhone,
  sanitizeEmail,
} from "./utils/validators";
import LocationSelector from "./components/LocationSelector";

type Screen =
  | "login"
  | "signup"
  | "recover"
  | "musician"
  | "opportunity"
  | "contractor"
  | "create"
  | "event"
  | "profile"
  | "checkout"
  | "confirmation"
  | "settings"
  | "editProfile"
  | "deleteAccount";

type Role = "musician" | "contractor";

const styles = ["MPB", "Pop", "Rock", "Sertanejo", "Jazz", "Pagode"];

function normalizeLocation(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase("pt-BR");
}

function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const paths: Record<string, ReactNode> = {
    home: <><path d="m3 11 9-8 9 8"/><path d="M5 10v10h14V10M9 20v-6h6v6"/></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></>,
    user: <><circle cx="12" cy="8" r="4"/><path d="M4 21c.6-4.4 3.2-7 8-7s7.4 2.6 8 7"/></>,
    plus: <path d="M12 5v14M5 12h14"/>,
    pin: <><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    arrow: <path d="m15 18-6-6 6-6"/>,
    chevron: <path d="m9 18 6-6-6-6"/>,
    star: <path d="m12 2.8 2.8 5.8 6.4.9-4.6 4.5 1.1 6.4-5.7-3-5.7 3 1.1-6.4-4.6-4.5 6.4-.9Z"/>,
    check: <path d="m5 12 4 4L19 6"/>,
    music: <><path d="M9 18V5l10-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="16" cy="16" r="3"/></>,
    search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"/></>,
    logout: <><path d="M10 5H5v14h5M14 8l4 4-4 4M8 12h10"/></>,
    eye: <><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="2.5"/></>,
    eyeOff: <><path d="m3 3 18 18"/><path d="M10.5 6.2A11 11 0 0 1 12 6c6.5 0 10 6 10 6a16 16 0 0 1-2.1 2.8M6.2 6.2C3.5 8 2 12 2 12s3.5 6 10 6a10 10 0 0 0 3-.4"/></>,
    upload: <><path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 15v5h16v-5"/></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

function Logo({ light = false }: { light?: boolean }) {
  return <div className={`logo ${light ? "logo-light" : ""}`}><span className="logo-mark"><Icon name="music" size={18}/></span>muve</div>;
}

function Back({ onClick }: { onClick: () => void }) {
  return <button className="back" onClick={onClick}><Icon name="arrow" size={18}/> Voltar</button>;
}

function Field({ label, placeholder, type = "text", value, onChange, onBlur, min, error }: { label: string; placeholder?: string; type?: string; value?: string; onChange?: (v: string) => void; onBlur?: () => void; min?: string; error?: string }) {
  const [internalValue, setInternalValue] = useState("");
  const currentValue = value ?? internalValue;

  return <label className={`field ${error ? "invalid" : ""}`}><span>{label}</span><input type={type} placeholder={placeholder} value={currentValue} min={min} onBlur={onBlur} onChange={(e) => {
    if (onChange) onChange(e.target.value);
    else setInternalValue(e.target.value);
  }}/>{error && <small className="error">{error}</small>}</label>;
}

function PasswordField({ label = "Senha", value, onChange }: { label?: string; value: string; onChange: (value: string) => void }) {
  const [visible, setVisible] = useState(false);
  return <label className="field"><span>{label}</span><div className="password-wrap"><input type={visible ? "text" : "password"} placeholder="Mínimo de 6 caracteres" value={value} onChange={(e) => onChange(e.target.value)}/><button type="button" onClick={() => setVisible(!visible)} aria-label={visible ? "Ocultar senha" : "Visualizar senha"}><Icon name={visible ? "eyeOff" : "eye"}/></button></div></label>;
}

function UploadField({ label, preview, onFile }: { label: string; preview: string; onFile: (file: File) => void }) {
  return <label className="upload-field"><span className="upload-preview">{preview ? <img src={preview} alt="Prévia do arquivo selecionado"/> : <Icon name="upload" size={24}/>}</span><span><b>{label}</b><small>PNG, JPEG ou WebP</small></span><input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}/></label>;
}

function Nav({ role, active, go }: { role: Role; active: string; go: (s: Screen) => void }) {
  const home = role === "musician" ? "musician" : "contractor";
  return <nav className="nav">
    <button className={active === "home" ? "active" : ""} onClick={() => go(home)}><Icon name="home"/><span>Início</span></button>
    <button className={active === "events" ? "active" : ""} onClick={() => go(role === "musician" ? "musician" : "event")}><Icon name="calendar"/><span>Eventos</span></button>
    {role === "contractor" && <button className="create-fab" onClick={() => go("create")}><Icon name="plus" size={24}/></button>}
    <button onClick={() => go("profile")}><Icon name="user"/><span>Perfil</span></button>
    <button onClick={() => go("settings")}><Icon name="settings"/><span>Ajustes</span></button>
  </nav>;
}

function AppShell({ role, active, go, children }: { role: Role; active: string; go: (s: Screen) => void; children: ReactNode }) {
  return <div className="app-shell">
    <aside className="sidebar">
      <Logo/>
      <div className="side-nav">
        <button className={active === "home" ? "active" : ""} onClick={() => go(role === "musician" ? "musician" : "contractor")}><Icon name="home"/>Início</button>
        <button className={active === "events" ? "active" : ""} onClick={() => go(role === "contractor" ? "event" : "musician")}><Icon name="calendar"/>Eventos</button>
        <button onClick={() => go("profile")}><Icon name="user"/>Meu perfil</button>
        <button onClick={() => go("settings")}><Icon name="settings"/>Configurações</button>
      </div>
      <button className="logout" onClick={() => go("login")}><Icon name="logout"/>Sair</button>
    </aside>
    <main className="main">{children}</main>
    <Nav role={role} active={active} go={go}/>
  </div>;
}

export default function App() {
  const [screen, setScreen] = useState<Screen>("login");
  const [role, setRole] = useState<Role>("musician");
  const [signupRole, setSignupRole] = useState<Role>("musician");
  const [selectedStyles, setSelectedStyles] = useState<string[]>([]);
  const [applied, setApplied] = useState(false);
  const [approved, setApproved] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [musicianConfirmed, setMusicianConfirmed] = useState(false);
  const [email, setEmail] = useState("");
  const [authError, setAuthError] = useState("");
  const [signup, setSignup] = useState({ name: "", email: "", password: "", document: "", phone: "", uf: "", city: "", avatar: "", bio: "" });
  const [signupError, setSignupError] = useState("");
  const [eventForm, setEventForm] = useState({ title: "", type: "", date: "", start: "", duration: "", cache: "", uf: "", city: "", style: "", description: "", image: "" });
  const [eventError, setEventError] = useState("");
  const [rating, setRating] = useState(0);
  const [ratingComment, setRatingComment] = useState("");
  const [password, setPassword] = useState("");
  const [account, setAccount] = useState<{ email: string; password: string; role: Role; name: string; document: string; phone: string; uf: string; city: string; avatar: string; bio: string } | null>(null);
  const [seconds, setSeconds] = useState(900);
  const [toast, setToast] = useState("");
  const [recoverySent, setRecoverySent] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState({ email: "", password: "" });
  const [deleteError, setDeleteError] = useState("");
  const [blockedDocuments, setBlockedDocuments] = useState<string[]>([]);

  useEffect(() => {
    if (screen !== "checkout" || seconds <= 0) return;
    const timer = window.setInterval(() => setSeconds((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [screen, seconds]);

  function demo(nextRole: Role) {
    setRole(nextRole);
    setScreen(nextRole === "musician" ? "musician" : "contractor");
  }

  function login(e: FormEvent) {
    e.preventDefault();
    if (!isValidGmail(email)) {
      setAuthError("Use um endereço válido terminado em @gmail.com.");
      return;
    }
    if (!password || !account || email !== account.email || password !== account.password) {
      setAuthError("E-mail não cadastrado ou senha incorreta.");
      return;
    }
    setAuthError("");
    demo(account.role);
  }

  function createAccount() {
    if (!isValidGmail(signup.email)) return setSignupError("Informe um e-mail válido @gmail.com.");
    if (signup.password.length < 6) return setSignupError("A senha deve ter pelo menos 6 caracteres.");
    if (signup.document.replace(/\D/g, "").length !== (signupRole === "musician" ? 11 : 14)) return setSignupError(`Informe um ${signupRole === "musician" ? "CPF" : "CNPJ"} válido.`);
    if (![10, 11].includes(signup.phone.replace(/\D/g, "").length)) return setSignupError("Informe um telefone completo.");
    if (!signup.uf || !signup.city) return setSignupError("Selecione primeiro o estado e depois a cidade.");
    if (signupRole === "musician" && selectedStyles.length === 0) return setSignupError("Selecione ao menos um estilo musical.");
    setSignupError("");
    if (!signup.name.trim()) return setSignupError("Informe seu nome.");
    if (!signup.avatar) return setSignupError("Selecione uma foto de perfil.");
    if (blockedDocuments.includes(signup.document.replace(/\D/g, "")) || account?.document.replace(/\D/g, "") === signup.document.replace(/\D/g, "")) return setSignupError("Documento impossibilitado de criar nova conta na plataforma.");
    if (account?.email === signup.email.trim().toLowerCase()) return setSignupError("Este e-mail já está vinculado a uma conta.");
    setAccount({ ...signup, email: signup.email.trim().toLowerCase(), role: signupRole });
    demo(signupRole);
  }

  function publishEvent() {
    const now = new Date();
    const minimumDate = now.toISOString().slice(0, 10);
    if (!eventForm.title.trim()) return setEventError("Informe o título do evento.");
    if (!eventForm.type || !eventForm.start || !eventForm.duration) return setEventError("Informe tipo, horário de início e duração do evento.");
    if (!eventForm.date || eventForm.date < minimumDate) return setEventError("Escolha a data de hoje ou uma data futura.");
    if (eventForm.date === minimumDate) {
      const [h, m] = eventForm.start.split(":").map(Number);
      const startMinutes = h * 60 + m;
      const nowMinutes = now.getHours() * 60 + now.getMinutes();
      if (startMinutes <= nowMinutes) return setEventError("O horário de início não pode ser inferior ao horário atual.");
    }
    if (!isValidCache(Number(eventForm.cache.replace(",", ".")))) return setEventError("O cachê mínimo é de R$ 100,00.");
    if (!eventForm.uf || !eventForm.city) return setEventError("Selecione o estado e a cidade do evento.");
    if (!eventForm.style) return setEventError("Selecione o estilo musical do evento.");
    if (!eventForm.image) return setEventError("Adicione uma foto ilustrativa do evento.");
    setEventError("");
    setScreen("event");
  }

  function resetSignup(nextRole: Role = "musician") {
    setSignupRole(nextRole);
    setSignup({ name: "", email: "", password: "", document: "", phone: "", uf: "", city: "", avatar: "", bio: "" });
    setSelectedStyles([]);
    setSignupError("");
  }

  function logout(forceClear = false) {
    const rememberedEmail = !forceClear && rememberMe ? account?.email ?? "" : "";
    setScreen("login");
    setRole("musician");
    setPassword("");
    setAuthError("");
    setEmail(rememberedEmail);
    setApplied(false);
    setApproved(false);
    setConfirmed(false);
    setMusicianConfirmed(false);
    setRating(0);
    setRatingComment("");
    setEventForm({ title: "", type: "", date: "", start: "", duration: "", cache: "", uf: "", city: "", style: "", description: "", image: "" });
    resetSignup();
  }

  function navigate(next: Screen) {
    if (next === "login") logout();
    else setScreen(next);
  }

  function deleteAccount() {
    if (!account || deleteConfirmation.email.trim().toLowerCase() !== account.email || deleteConfirmation.password !== account.password) {
      setDeleteError("E-mail ou senha não correspondem à conta atual.");
      return;
    }
    setBlockedDocuments((documents) => [...documents, account.document.replace(/\D/g, "")]);
    setAccount(null);
    setDeleteConfirmation({ email: "", password: "" });
    setRememberMe(false);
    setEmail("");
    logout(true);
  }

  if (screen === "login") return <div className="auth">
    <section className="auth-visual auth-art">
      <Logo light/>
      <div><span className="eyebrow light">Onde a música acontece</span><h1>Seu próximo palco<br/>começa aqui.</h1><p>Conectamos músicos incríveis a eventos inesquecíveis.</p></div>
      <small>Talentos e oportunidades no mesmo ritmo.</small>
    </section>
    <section className="auth-form">
      <div className="mobile-logo"><Logo/></div>
      <div className="form-wrap">
        <span className="eyebrow">Bem-vindo de volta</span>
        <h2>Entre na sua conta</h2>
        <p className="muted">Use seu e-mail Gmail para continuar.</p>
        <form onSubmit={login}>
          <Field label="E-mail" type="email" placeholder="seunome@gmail.com" value={email} onChange={(value) => { const clean = sanitizeEmail(value); setEmail(clean); setAuthError(clean && !isValidGmail(clean) ? "O e-mail deve terminar em @gmail.com." : ""); }} onBlur={() => email && !isValidGmail(email) && setAuthError("Informe um endereço @gmail.com válido.")} error={authError}/>
          <PasswordField value={password} onChange={(value) => { setPassword(value); setAuthError(""); }}/>
          <div className="form-line"><label className="check"><input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)}/> Lembrar de mim</label><button type="button" className="text-btn" onClick={() => { setRecoverySent(false); setScreen("recover"); }}>Esqueci minha senha</button></div>
          <button className="primary wide">Entrar</button>
        </form>
        <p className="auth-switch">Ainda não tem uma conta? <button onClick={() => { resetSignup(); setScreen("signup"); }}>Criar conta</button></p>
      </div>
    </section>
  </div>;

  if (screen === "recover") return <div className="secondary-page auth-secondary"><header><Back onClick={() => setScreen("login")}/><Logo/></header><main className="secondary-main"><div className="recover-card"><span className="logo-mark"><Icon name="user"/></span><h2>Recupere seu acesso</h2><p>Enviaremos as instruções de redefinição para o e-mail cadastrado.</p>{recoverySent ? <div className="recovery-success"><Icon name="check"/><span>Se este e-mail estiver cadastrado, você receberá as instruções em instantes.</span></div> : <><Field label="E-mail da conta" type="email" value={email} onChange={(value) => setEmail(sanitizeEmail(value))} error={email && !isValidGmail(email) ? "Use um endereço @gmail.com válido." : ""}/><button className="primary wide" disabled={!isValidGmail(email)} onClick={() => setRecoverySent(true)}>Enviar link de recuperação</button></>}</div></main></div>;

  if (screen === "signup") return <div className="secondary-page auth-secondary">
    <header><Back onClick={() => setScreen("login")}/><Logo/></header>
    <div className="signup-card">
      <span className="eyebrow">Crie sua conta</span><h2>Vamos fazer música?</h2><p className="muted">Primeiro, conte como você quer usar a Muve.</p>
      <div className="role-picker">
        <button className={signupRole === "musician" ? "selected" : ""} onClick={() => resetSignup("musician")}><Icon name="music" size={26}/><b>Sou músico</b><span>Quero encontrar eventos</span></button>
        <button className={signupRole === "contractor" ? "selected" : ""} onClick={() => resetSignup("contractor")}><Icon name="calendar" size={26}/><b>Sou contratante</b><span>Quero contratar talentos</span></button>
      </div>
      <UploadField label="Foto de perfil obrigatória" preview={signup.avatar} onFile={(file) => { setSignup({ ...signup, avatar: URL.createObjectURL(file) }); setSignupError(""); }}/>
      <div className="grid-2"><Field label={signupRole === "musician" ? "Nome completo" : "Nome fantasia"} placeholder="Como devemos chamar você?" value={signup.name} onChange={(v) => setSignup({ ...signup, name: v })}/><Field label="E-mail" type="email" placeholder="seunome@gmail.com" value={signup.email} onChange={(v) => { const clean = sanitizeEmail(v); setSignup({ ...signup, email: clean }); setSignupError(clean && !isValidGmail(clean) ? "O e-mail deve terminar em @gmail.com." : ""); }}/><PasswordField value={signup.password} onChange={(v) => { setSignup({ ...signup, password: v }); setSignupError(""); }}/><Field label={signupRole === "musician" ? "CPF" : "CNPJ"} placeholder={signupRole === "musician" ? "000.000.000-00" : "00.000.000/0000-00"} value={signup.document} onChange={(v) => { setSignup({ ...signup, document: signupRole === "musician" ? maskCPF(v) : maskCNPJ(v) }); setSignupError(""); }}/><Field label="Telefone" placeholder="(00) 00000-0000" value={signup.phone} onChange={(v) => { setSignup({ ...signup, phone: maskPhone(v) }); setSignupError(""); }}/><LocationSelector uf={signup.uf} city={signup.city} onUfChange={(uf) => { setSignup({ ...signup, uf, city: "" }); setSignupError(""); }} onCityChange={(city) => { setSignup({ ...signup, city }); setSignupError(""); }} onError={setSignupError}/></div>
      {signupRole === "musician" && <><label className="field"><span>Bio</span><textarea value={signup.bio} onChange={(e) => setSignup({ ...signup, bio: e.target.value })} placeholder="Conte um pouco sobre sua trajetória musical..."/></label><div className="styles"><span>Estilos musicais</span><div>{styles.map((s) => <button key={s} className={selectedStyles.includes(s) ? "selected" : ""} onClick={() => { setSelectedStyles((old) => old.includes(s) ? old.filter((x) => x !== s) : [...old, s]); setSignupError(""); }}>{s}{selectedStyles.includes(s) && " ×"}</button>)}</div></div></>}
      {signupError && <p className="form-error">{signupError}</p>}
      <button className="primary wide" disabled={signupRole === "musician" && selectedStyles.length === 0} onClick={createAccount}>Criar minha conta</button>
    </div>
  </div>;

  if (screen === "musician") {
    const hasMatchingEvent = Boolean(
      account &&
      eventForm.title &&
      !approved &&
      eventForm.uf === account.uf &&
      normalizeLocation(eventForm.city) === normalizeLocation(account.city) &&
      selectedStyles.includes(eventForm.style),
    );

    return <AppShell role="musician" active="home" go={navigate}>
      <header className="topbar"><div><span className="eyebrow">{account?.city}, {account?.uf} · {selectedStyles[0]}</span><h1>Olá, {account?.name}</h1></div>{account?.avatar && <button className="avatar image-avatar" onClick={() => setScreen("profile")}><img src={account.avatar} alt="Foto do perfil"/></button>}</header>
      <section className="welcome"><div><span className="status-pill">Perfil ativo</span><h2>Encontre o palco<br/>que combina com você.</h2><p>As oportunidades são filtradas pela sua cidade e estilos cadastrados.</p></div></section>
      <div className="section-title"><div><span className="eyebrow">Seu feed</span><h2>Próximos eventos</h2></div></div>
      {hasMatchingEvent ? <div className="event-grid"><article className="event-card">
        <div className="event-image"><img src={eventForm.image} alt=""/><span>{eventForm.type}</span></div>
        <div className="event-body"><div className="tag-list"><span>{eventForm.style}</span></div><h3>{eventForm.title}</h3><p><Icon name="pin" size={15}/> {eventForm.city}, {eventForm.uf}</p><p><Icon name="calendar" size={15}/> {eventForm.date} às {eventForm.start}</p><div><span className="price"><small>Cachê</small>R$ {Number(eventForm.cache).toFixed(2).replace(".", ",")}</span><button className="primary" onClick={() => setScreen("opportunity")}>Ver oportunidade</button></div></div>
      </article></div> : <div className="empty-state"><span><Icon name="music" size={34}/></span><h3>Nenhum evento disponível na sua região para o seu estilo no momento.</h3><p>Novos eventos compatíveis aparecerão aqui automaticamente.</p></div>}
    </AppShell>;
  }

  if (screen === "opportunity") return <Secondary title={eventForm.title} subtitle="Detalhes da oportunidade" onBack={() => setScreen("musician")}>
    <div className="opportunity-hero">{eventForm.image && <img src={eventForm.image} alt={eventForm.title}/>}<div><div className="tag-list"><span>{eventForm.style}</span></div><h2>{eventForm.title}</h2><p><Icon name="pin" size={17}/> {eventForm.city}, {eventForm.uf}</p><p><Icon name="calendar" size={17}/> {eventForm.date}</p></div></div>
    <div className="opportunity-content"><section><h3>Sobre o evento</h3><p>{eventForm.description}</p></section><aside><span>Cachê oferecido</span><b>R$ {Number(eventForm.cache).toFixed(2).replace(".",",")}</b><small>Sem taxa de candidatura</small><button className={applied ? "secondary wide" : "primary wide"} onClick={() => setApplied(true)}>{applied ? "Inscrição enviada" : "Inscrever-se"}</button></aside></div>
  </Secondary>;

  if (screen === "contractor") return <AppShell role="contractor" active="home" go={navigate}>
    <header className="topbar"><div><span className="eyebrow">Visão geral</span><h1>Olá, {account?.name}</h1></div><button className="primary new-event" onClick={() => setScreen("create")}><Icon name="plus"/> Criar novo evento</button></header>
    <div className="stats"><div><span>Eventos ativos</span><b>{eventForm.title ? "01" : "00"}</b><small>Eventos publicados</small></div><div><span>Novos candidatos</span><b>00</b><small>Sem candidaturas</small></div><div><span>Shows realizados</span><b>00</b><small>Novo na plataforma</small></div></div>
    <div className="section-title"><div><span className="eyebrow">Gerencie seus shows</span><h2>Seus eventos</h2></div><button className="text-btn">Ver todos</button></div>
    <div className="manager-list">{eventForm.title ? <button className="manager-card" onClick={() => setScreen("event")}><div className="date-box"><b>{eventForm.date.slice(8,10)}</b><span>{new Date(`${eventForm.date}T12:00`).toLocaleDateString("pt-BR",{month:"short"}).toUpperCase()}</span></div><div className="manager-info"><h3>{eventForm.title}</h3><p><Icon name="pin" size={15}/> {eventForm.city}, {eventForm.uf}</p><div className="candidate-faces"><b>0 candidatos</b></div></div><span className="open">Inscrições abertas</span><Icon name="chevron"/></button> : <div className="empty-state"><span><Icon name="calendar" size={34}/></span><h3>Você ainda não criou eventos</h3><p>Publique seu primeiro evento para receber candidaturas.</p><button className="primary" onClick={() => setScreen("create")}>Criar evento</button></div>}</div>
  </AppShell>;

  if (screen === "create") return <Secondary title="Criar novo evento" subtitle="Preencha os detalhes para encontrar o músico ideal." onBack={() => setScreen("contractor")}>
    <div className="form-card">
      <div className="form-section"><b>01</b><div><h3>Sobre o evento</h3><p>Informações principais da oportunidade.</p></div></div>
      <div className="grid-2"><div className="span-2"><Field label="Título do evento" placeholder="Ex: Noite acústica no terraço" value={eventForm.title} onChange={(v) => { setEventForm({ ...eventForm, title: v }); setEventError(""); }}/></div><label className="field"><span>Tipo de evento</span><select value={eventForm.type} onChange={(e) => setEventForm({ ...eventForm, type: e.target.value })}><option value="">Selecione</option><option>Bar e restaurante</option><option>Festa particular</option><option>Corporativo</option></select></label><Field label="Data" type="date" value={eventForm.date} onChange={(v) => { setEventForm({ ...eventForm, date: v }); setEventError(""); }} min={new Date().toISOString().slice(0, 10)}/><Field label="Horário de início" type="time" value={eventForm.start} onChange={(v) => setEventForm({ ...eventForm, start: v })}/><Field label="Duração estimada (HH:mm)" type="time" value={eventForm.duration} onChange={(v) => setEventForm({ ...eventForm, duration: v })}/></div>
      <div className="form-section"><b>02</b><div><h3>Local e cachê</h3><p>Onde será o show e qual o investimento.</p></div></div>
      <div className="grid-2"><LocationSelector uf={eventForm.uf} city={eventForm.city} onUfChange={(uf) => { setEventForm({ ...eventForm, uf, city: "" }); setEventError(""); }} onCityChange={(city) => { setEventForm({ ...eventForm, city }); setEventError(""); }} onError={setEventError}/><label className="field"><span>Estilo musical</span><select value={eventForm.style} onChange={(e) => setEventForm({ ...eventForm, style: e.target.value })}><option value="">Selecione</option>{styles.map((style) => <option key={style}>{style}</option>)}</select></label><Field label="Cachê oferecido" type="number" placeholder="R$ 100,00 ou mais" value={eventForm.cache} onChange={(v) => { setEventForm({ ...eventForm, cache: v }); setEventError(""); }} min="100"/></div>
      <UploadField label="Foto ilustrativa obrigatória" preview={eventForm.image} onFile={(file) => { setEventForm({ ...eventForm, image: URL.createObjectURL(file) }); setEventError(""); }}/>
      <label className="field"><span>Descrição e observações</span><textarea value={eventForm.description} onChange={(e) => setEventForm({ ...eventForm, description: e.target.value })} placeholder="Conte um pouco sobre o evento, repertório esperado e estrutura disponível..."/></label>
      {eventError && <p className="form-error">{eventError}</p>}
      <div className="form-actions"><button className="secondary" onClick={() => setScreen("contractor")}>Cancelar</button><button className="primary" onClick={publishEvent}>Publicar evento</button></div>
    </div>
  </Secondary>;

  if (screen === "event") {
    const isContracted = approved;
    return <Secondary title={eventForm.title || "Meus eventos"} subtitle={eventForm.title ? `${eventForm.date} · ${eventForm.city}, ${eventForm.uf}` : "Gerencie seus eventos publicados"} onBack={() => setScreen("contractor")}>
      {eventForm.title ? <>
        {isContracted && <div className="contracted-lock"><Icon name="check" size={16}/> Evento com músico contratado. Não é mais possível alterar os dados ou excluir esta oportunidade.</div>}
        <div className="event-summary">
          <div>
            <span className={isContracted ? "contracted" : "open"}>{isContracted ? "Músico contratado" : "Inscrições abertas"}</span>
            <h3>0 músicos se inscreveram</h3>
            <p>Os candidatos aparecerão aqui quando se inscreverem.</p>
          </div>
          <div className="summary-meta">
            <span>Cachê oferecido<b>R$ {Number(eventForm.cache).toFixed(2).replace(".",",")}</b></span>
            <span>Estilo<b>{eventForm.style}</b></span>
          </div>
        </div>
        <div className="event-actions">
          <button className="secondary" disabled={isContracted} onClick={() => !isContracted && setScreen("create")}>Editar evento</button>
          <button className="danger-btn" disabled={isContracted} onClick={() => { if (!isContracted) { setEventForm({ title: "", type: "", date: "", start: "", duration: "", cache: "", uf: "", city: "", style: "", description: "", image: "" }); setScreen("contractor"); } }}>Excluir evento</button>
        </div>
        <div className="section-title"><div><span className="eyebrow">Candidatos</span><h2>Talentos interessados</h2></div><button className="filter">Melhor avaliação</button></div>
        <div className="empty-state compact"><span><Icon name="user" size={30}/></span><h3>Nenhuma candidatura recebida</h3><p>A contagem será atualizada conforme as inscrições vinculadas ao evento.</p></div>
      </> : <div className="empty-state"><span><Icon name="calendar" size={34}/></span><h3>Nenhum evento selecionado</h3><p>Crie um evento antes de gerenciar candidatos.</p><button className="primary" onClick={() => setScreen("create")}>Criar evento</button></div>}
    </Secondary>;
  }

  if (screen === "profile") return <Secondary title="Meu perfil" subtitle="Dados da conta autenticada." onBack={() => setScreen(role === "contractor" ? "contractor" : "musician")}>
    <div className="profile-hero">{account?.avatar && <img src={account.avatar} alt={`Foto de ${account.name}`}/>}<div><span className="available">{role === "musician" ? "Perfil de músico" : "Perfil de contratante"}</span><h1>{account?.name}</h1><p>{account?.city}, {account?.uf}</p><div className="big-rating"><b>Novo na plataforma</b><span>0 avaliações</span></div></div></div>
    <div className="profile-grid"><section><h3>Dados do perfil</h3><p><b>{role === "musician" ? "CPF" : "CNPJ"}:</b> {account?.document}</p><p><b>Telefone:</b> {account?.phone}</p><p><b>E-mail:</b> {account?.email}</p>{role === "musician" && <><h3>Estilos musicais</h3><div className="tag-list">{selectedStyles.map((style) => <span key={style}>{style}</span>)}</div></>}</section><section><h3>Histórico</h3><div className="empty-inline"><Icon name="calendar"/><p>{role === "contractor" ? "Nenhum evento criado até o momento." : "Nenhuma avaliação recebida."}</p></div></section></div>
  </Secondary>;

  if (screen === "checkout") return <Secondary title="Pagamento via Pix" subtitle="Garanta a contratação do músico selecionado." onBack={() => setScreen("event")}>
    {toast && <div className="toast"><Icon name="check"/>{toast}</div>}<div className="checkout-grid"><section className={`payment-card ${seconds === 0 ? "expired" : ""}`}><span className="secure"><Icon name="check" size={16}/> Ambiente de pagamento seguro</span><h2>{seconds ? "Escaneie o QR Code" : "Cobrança expirada"}</h2><p>{seconds ? "Abra o app do seu banco e escolha pagar com Pix." : "Solicite uma nova cobrança para continuar."}</p><div className="qr" aria-label="QR Code Pix"><div className="qr-pattern"/></div><div className="timer"><Icon name="clock" size={18}/> Este código expira em <b>{String(Math.floor(seconds / 60)).padStart(2,"0")}:{String(seconds % 60).padStart(2,"0")}</b></div>{seconds ? <button className="secondary wide" onClick={async () => { await navigator.clipboard.writeText("PIX_PAYLOAD_ASAAS"); setToast("Código Pix copiado."); window.setTimeout(() => setToast(""), 2500); }}>Copiar código Pix</button> : <button className="primary wide" onClick={() => setSeconds(900)}>Gerar nova cobrança</button>}<small>Pagamento processado com segurança pelo Asaas</small></section>
      <aside className="order"><span className="eyebrow">Resumo da contratação</span><h3>{eventForm.title}</h3><hr/><p><span>Data</span><b>{eventForm.date}</b></p><p><span>Local</span><b>{eventForm.city}, {eventForm.uf}</b></p><p><span>Cachê</span><b>R$ {Number(eventForm.cache).toFixed(2).replace(".",",")}</b></p><hr/><p className="total"><span>Total</span><b>R$ {Number(eventForm.cache).toFixed(2).replace(".",",")}</b></p><span className="payment-wait"><Icon name="clock"/>Aguardando confirmação do Asaas</span></aside>
    </div>
  </Secondary>;

  if (screen === "confirmation") return <Secondary title="Confirmação do show" subtitle="As duas partes confirmam de forma independente." onBack={() => setScreen(role === "contractor" ? "contractor" : "musician")}>
    <div className="confirm-card"><div className="success-icon"><Icon name="check" size={36}/></div><span className="eyebrow">Pagamento confirmado</span><h2>Agora é só preparar o palco.</h2><p>Após o evento, cada parte deve confirmar que o show aconteceu. Nenhum status é marcado automaticamente.</p>
      <div className="ok-grid"><div className={confirmed ? "done" : ""}><Icon name="user" size={28}/><h3>Confirmação do contratante</h3><p>O contratante confirma pelo próprio acesso.</p><button className={confirmed ? "secondary" : "primary"} onClick={() => setConfirmed(true)}>{confirmed ? "Confirmado" : "Confirmar conclusão"}</button></div><div className={musicianConfirmed ? "done" : ""}><Icon name="music" size={28}/><h3>Confirmação do músico</h3><p>O músico confirma de forma independente.</p><button className={musicianConfirmed ? "secondary" : "primary"} onClick={() => setMusicianConfirmed(true)}>{musicianConfirmed ? "Confirmado" : "Confirmar conclusão"}</button></div></div>
      {confirmed && musicianConfirmed && <div className="rating-form"><span className="eyebrow">Avaliação liberada</span><h3>Como foi a experiência?</h3><div className="rating-picker">{[1,2,3,4,5].map((star) => <button key={star} className={star <= rating ? "selected" : ""} onClick={() => setRating(star)}><Icon name="star" size={28}/></button>)}</div><label className="field"><span>Comentário</span><textarea value={ratingComment} onChange={(event) => setRatingComment(event.target.value)} placeholder="Conte como foi trabalhar com este profissional..."/></label><button className="primary" disabled={!rating}>Enviar avaliação</button></div>}
    </div>
  </Secondary>;

  if (screen === "settings") return <Secondary title="Configurações" subtitle="Gerencie sua conta e preferências." onBack={() => setScreen(role === "musician" ? "musician" : "contractor")}>
    <div className="settings-list"><button onClick={() => setScreen("editProfile")}><span><Icon name="user"/><i><b>Editar perfil</b><small>Nome, foto, telefone e localização</small></i></span><Icon name="chevron"/></button><button><span><Icon name="pin"/><i><b>Localização</b><small>{account?.city}, {account?.uf}</small></i></span><Icon name="chevron"/></button>{role === "musician" && <button onClick={() => setScreen("editProfile")}><span><Icon name="music"/><i><b>Preferências musicais</b><small>{selectedStyles.join(", ")}</small></i></span><Icon name="chevron"/></button>}<button className="danger-row" onClick={() => setScreen("deleteAccount")}><span><Icon name="logout"/><i><b>Excluir conta</b><small>Ação permanente</small></i></span><Icon name="chevron"/></button><button onClick={() => logout()}><span><Icon name="logout"/><i><b>Sair da conta</b><small>Encerrar esta sessão</small></i></span><Icon name="chevron"/></button></div>
  </Secondary>;

  if (screen === "editProfile") return <Secondary title="Editar perfil" subtitle="Atualize os dados públicos da sua conta." onBack={() => setScreen("settings")}>
    <div className="form-card"><UploadField label="Alterar foto do perfil" preview={account?.avatar ?? ""} onFile={(file) => account && setAccount({ ...account, avatar: URL.createObjectURL(file) })}/><div className="grid-2"><Field label={role === "musician" ? "Nome completo" : "Nome / Razão Social"} value={account?.name ?? ""} onChange={(name) => account && setAccount({ ...account, name })}/><Field label="Telefone" value={account?.phone ?? ""} onChange={(phone) => account && setAccount({ ...account, phone: maskPhone(phone) })}/><label className="field locked"><span>{role === "musician" ? "CPF" : "CNPJ"} (não editável)</span><input value={account?.document ?? ""} disabled readOnly/></label><LocationSelector uf={account?.uf ?? ""} city={account?.city ?? ""} onUfChange={(uf) => account && setAccount({ ...account, uf, city: "" })} onCityChange={(city) => account && setAccount({ ...account, city })}/></div>{role === "musician" && <><label className="field"><span>Bio</span><textarea value={account?.bio ?? ""} onChange={(e) => account && setAccount({ ...account, bio: e.target.value })}/></label><div className="styles"><span>Estilos musicais</span><div>{styles.map((style) => <button key={style} className={selectedStyles.includes(style) ? "selected" : ""} onClick={() => setSelectedStyles((current) => current.includes(style) ? current.filter((item) => item !== style) : [...current, style])}>{style}{selectedStyles.includes(style) && " ×"}</button>)}</div></div></>}<div className="form-actions"><button className="secondary" onClick={() => setScreen("settings")}>Cancelar</button><button className="primary" disabled={role === "musician" && selectedStyles.length === 0} onClick={() => setScreen("settings")}>Salvar alterações</button></div></div>
  </Secondary>;

  if (screen === "deleteAccount") return <Secondary title="Excluir conta" subtitle="Confirme sua identidade para continuar." onBack={() => setScreen("settings")}>
    <div className="delete-card"><strong>ATENÇÃO: A EXCLUSÃO DA CONTA É PERMANENTE. SEU CPF/CNPJ SERÁ BLOQUEADO E VOCÊ NÃO PODERÁ VOLTAR A SE CADASTRAR NA PLATAFORMA.</strong><p>Seus dados de acesso serão desativados e o documento será registrado na lista de bloqueio.</p><Field label="Digite o e-mail da conta" type="email" value={deleteConfirmation.email} onChange={(emailValue) => { setDeleteConfirmation({ ...deleteConfirmation, email: sanitizeEmail(emailValue) }); setDeleteError(""); }}/><PasswordField label="Confirme sua senha" value={deleteConfirmation.password} onChange={(passwordValue) => { setDeleteConfirmation({ ...deleteConfirmation, password: passwordValue }); setDeleteError(""); }}/>{deleteError && <p className="form-error">{deleteError}</p>}<button className="delete-button" onClick={deleteAccount}>Excluir minha conta definitivamente</button></div>
  </Secondary>;

  return null;
}

function Secondary({ title, subtitle, onBack, children }: { title: string; subtitle: string; onBack: () => void; children: ReactNode }) {
  return <div className="secondary-page"><header><Back onClick={onBack}/><Logo/></header><main className="secondary-main"><div className="page-heading"><h1>{title}</h1><p>{subtitle}</p></div>{children}</main></div>;
}
