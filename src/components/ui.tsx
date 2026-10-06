import { useState, type ReactNode } from "react";

export function Icon({ name, size = 20 }: { name: string; size?: number }) {
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

/** Logomarca. "light": versão branca, para fundos coloridos. "size": altura em px. */
export function Logo({ light = false, size = 26 }: { light?: boolean; size?: number }) {
  return <img className={`logo ${light ? "logo-light" : ""}`} src="/logo.webp" alt="Muve" style={{ height: size }} draggable={false}/>;
}

export function Back({ onClick }: { onClick: () => void }) {
  return <button className="back" onClick={onClick}><Icon name="arrow" size={18}/> Voltar</button>;
}

export function Field({ label, placeholder, type = "text", value, onChange, onBlur, min, error }: { label: string; placeholder?: string; type?: string; value?: string; onChange?: (v: string) => void; onBlur?: () => void; min?: string; error?: string }) {
  const [internalValue, setInternalValue] = useState("");
  const currentValue = value ?? internalValue;

  return <label className={`field ${error ? "invalid" : ""}`}><span>{label}</span><input type={type} placeholder={placeholder} value={currentValue} min={min} onBlur={onBlur} onChange={(e) => {
    if (onChange) onChange(e.target.value);
    else setInternalValue(e.target.value);
  }}/>{error && <small className="error">{error}</small>}</label>;
}

export function PasswordField({ label = "Senha", value, onChange }: { label?: string; value: string; onChange: (value: string) => void }) {
  const [visible, setVisible] = useState(false);
  return <label className="field"><span>{label}</span><div className="password-wrap"><input type={visible ? "text" : "password"} placeholder="Mínimo de 6 caracteres" value={value} onChange={(e) => onChange(e.target.value)}/><button type="button" onClick={() => setVisible(!visible)} aria-label={visible ? "Ocultar senha" : "Visualizar senha"}><Icon name={visible ? "eyeOff" : "eye"}/></button></div></label>;
}

export function UploadField({ label, preview, onFile }: { label: string; preview: string; onFile: (file: File) => void }) {
  return <label className="upload-field"><span className="upload-preview">{preview ? <img src={preview} alt="Prévia do arquivo selecionado"/> : <Icon name="upload" size={24}/>}</span><span><b>{label}</b><small>PNG, JPEG ou WebP</small></span><input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}/></label>;
}

export function Secondary({ title, subtitle, onBack, children }: { title: string; subtitle: string; onBack: () => void; children: ReactNode }) {
  return <div className="secondary-page"><header><Back onClick={onBack}/><Logo/></header><main className="secondary-main"><div className="page-heading"><h1>{title}</h1><p>{subtitle}</p></div>{children}</main></div>;
}
