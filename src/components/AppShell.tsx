import type { ReactNode } from "react";
import type { Role } from "../services/account";
import { Icon, Logo } from "./ui";

export type Tab = "home" | "events" | "profile" | "settings";

interface Props {
  role: Role;
  active: Tab;
  onNavigate: (tab: Tab) => void;
  onCreateEvent: () => void;
  onLogout: () => void;
  children: ReactNode;
}

const tabs: { id: Tab; icon: string; label: string; longLabel: string }[] = [
  { id: "home", icon: "home", label: "Início", longLabel: "Início" },
  { id: "events", icon: "calendar", label: "Eventos", longLabel: "Meus eventos" },
  { id: "profile", icon: "user", label: "Perfil", longLabel: "Meu perfil" },
  { id: "settings", icon: "settings", label: "Ajustes", longLabel: "Configurações" },
];

// Estrutura das telas principais: barra lateral no desktop, barra inferior no celular.
export default function AppShell({ role, active, onNavigate, onCreateEvent, onLogout, children }: Props) {
  const current = (tab: Tab) => (active === tab ? { className: "active", "aria-current": "page" as const } : {});

  return <div className="app-shell">
    <aside className="sidebar">
      <Logo/>
      <nav className="side-nav" aria-label="Principal">
        {tabs.map((tab) => <button key={tab.id} {...current(tab.id)} onClick={() => onNavigate(tab.id)}><Icon name={tab.icon}/>{tab.longLabel}</button>)}
      </nav>
      <button className="logout" onClick={onLogout}><Icon name="logout"/>Sair</button>
    </aside>
    <main className="main">{children}</main>
    <nav className="nav" aria-label="Principal">
      {tabs.slice(0, 2).map((tab) => <button key={tab.id} {...current(tab.id)} onClick={() => onNavigate(tab.id)}><Icon name={tab.icon}/><span>{tab.label}</span></button>)}
      {role === "CONTRACTOR" && <button className="create-fab" aria-label="Criar novo evento" onClick={onCreateEvent}><Icon name="plus" size={24}/></button>}
      {tabs.slice(2).map((tab) => <button key={tab.id} {...current(tab.id)} onClick={() => onNavigate(tab.id)}><Icon name={tab.icon}/><span>{tab.label}</span></button>)}
    </nav>
  </div>;
}
