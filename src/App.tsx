import { useCallback, useState } from "react";
import { AuthProvider, useAuth } from "./auth/AuthContext";
import AppShell, { type Tab } from "./components/AppShell";
import { Logo } from "./components/ui";
import DeleteAccountScreen from "./screens/account/DeleteAccountScreen";
import EditProfileScreen from "./screens/account/EditProfileScreen";
import LoginScreen from "./screens/auth/LoginScreen";
import RecoverScreen from "./screens/auth/RecoverScreen";
import ResetPasswordScreen from "./screens/auth/ResetPasswordScreen";
import SignupScreen from "./screens/auth/SignupScreen";
import CheckoutScreen from "./screens/contractor/CheckoutScreen";
import DashboardScreen from "./screens/contractor/DashboardScreen";
import EventFormScreen from "./screens/contractor/EventFormScreen";
import EventManageScreen from "./screens/contractor/EventManageScreen";
import FeedScreen from "./screens/musician/FeedScreen";
import MyApplicationsScreen from "./screens/musician/MyApplicationsScreen";
import OpportunityScreen from "./screens/musician/OpportunityScreen";
import HiringScreen from "./screens/shared/HiringScreen";
import ProfileScreen from "./screens/shared/ProfileScreen";
import SettingsScreen from "./screens/shared/SettingsScreen";
import type { Me } from "./services/account";
import type { AcaoPerfil } from "../shared/dominio.ts";

export default function App() {
  return <AuthProvider><AuthGate/></AuthProvider>;
}

function AuthGate() {
  const { state, recoveringPassword } = useAuth();
  const [screen, setScreen] = useState<"login" | "signup" | "recover">("login");

  if (state.status === "loading") return <div className="splash" role="status"><Logo/><p>Carregando...</p></div>;
  if (recoveringPassword) return <ResetPasswordScreen/>;
  // key: trocar de conta descarta todo o estado de navegação da conta anterior.
  if (state.status === "signedIn") return <AuthenticatedApp key={state.me.id} me={state.me}/>;
  if (screen === "signup") return <SignupScreen onBack={() => setScreen("login")}/>;
  if (screen === "recover") return <RecoverScreen onBack={() => setScreen("login")}/>;
  return <LoginScreen onSignup={() => setScreen("signup")} onRecover={() => setScreen("recover")}/>;
}

type Route =
  | { name: "home" }
  | { name: "events" }
  | { name: "profile" }
  | { name: "settings" }
  | { name: "editProfile"; acao?: AcaoPerfil; voltar?: Route }
  | { name: "deleteAccount" }
  | { name: "opportunity"; eventId: string }
  | { name: "eventForm"; eventId?: string }
  | { name: "manage"; eventId: string }
  | { name: "checkout"; eventId: string; candidateId: string }
  | { name: "hiring"; eventId: string };

// Navegação das telas autenticadas. O que cada perfil pode ver e fazer é
// garantido pelo banco (RLS) e pela API; aqui só se escolhe a tela.
function AuthenticatedApp({ me }: { me: Me }) {
  const { signOut } = useAuth();
  const [route, setRoute] = useState<Route>({ name: "home" });
  const isMusician = me.role === "MUSICIAN";

  const home = () => setRoute({ name: "home" });
  const events = () => setRoute({ name: "events" });
  const manage = (eventId: string) => setRoute({ name: "manage", eventId });
  const hiring = useCallback((eventId: string) => setRoute({ name: "hiring", eventId }), []);
  // Abre a edição do perfil só com o que falta para a ação, e volta para onde o usuário estava.
  const complete = (acao: AcaoPerfil) => setRoute({ name: "editProfile", acao, voltar: route });

  switch (route.name) {
    case "home":
    case "events": {
      const shell = {
        role: me.role,
        active: route.name as Tab,
        onNavigate: (tab: Tab) => setRoute({ name: tab } as Route),
        onCreateEvent: () => setRoute({ name: "eventForm" }),
        onLogout: signOut,
      };
      const open = (eventId: string) => setRoute(isMusician ? { name: "opportunity", eventId } : { name: "manage", eventId });
      if (isMusician) {
        return <AppShell {...shell}>{route.name === "home"
          ? <FeedScreen me={me} onOpen={open} onProfile={() => setRoute({ name: "profile" })} onComplete={() => complete("feed")}/>
          : <MyApplicationsScreen me={me} onOpen={open}/>}</AppShell>;
      }
      return <AppShell {...shell}><DashboardScreen me={me} showAll={route.name === "events"} onCreate={shell.onCreateEvent} onOpen={open} onComplete={() => complete("criarEvento")}/></AppShell>;
    }
    case "opportunity":
      return <OpportunityScreen me={me} eventId={route.eventId} onBack={home} onHiring={hiring} onComplete={() => complete("candidatar")}/>;
    case "eventForm":
      return <EventFormScreen eventId={route.eventId} onBack={() => (route.eventId ? manage(route.eventId) : home())} onSaved={manage}/>;
    case "manage":
      return <EventManageScreen
        eventId={route.eventId}
        onBack={home}
        onEdit={(eventId) => setRoute({ name: "eventForm", eventId })}
        onCheckout={(eventId, candidateId) => setRoute({ name: "checkout", eventId, candidateId })}
        onHiring={hiring}
      />;
    case "checkout":
      return <CheckoutScreen eventId={route.eventId} candidateId={route.candidateId} onBack={() => manage(route.eventId)} onPaid={hiring}/>;
    case "hiring":
      return <HiringScreen eventId={route.eventId} onBack={isMusician ? events : () => manage(route.eventId)}/>;
    case "profile":
      return <ProfileScreen me={me} onBack={home}/>;
    case "settings":
      return <SettingsScreen
        me={me}
        onBack={home}
        onEditProfile={() => setRoute({ name: "editProfile" })}
        onDeleteAccount={() => setRoute({ name: "deleteAccount" })}
        onLogout={signOut}
      />;
    case "editProfile":
      return <EditProfileScreen me={me} acao={route.acao} onDone={() => setRoute(route.voltar ?? { name: "settings" })}/>;
    case "deleteAccount":
      return <DeleteAccountScreen me={me} onBack={() => setRoute({ name: "settings" })}/>;
  }
}
