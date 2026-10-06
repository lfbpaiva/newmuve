import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { fetchMe, signOut as endSession, type Me } from "./account.ts";
import { ApiError, errorMessage } from "./api.ts";
import { supabase } from "./config.ts";

type AuthState =
  | { status: "loading" }
  | { status: "signedOut"; notice?: string }
  | { status: "signedIn"; me: Me };

interface AuthContextValue {
  state: AuthState;
  /** Verdadeiro quando o usuário chegou pelo link de redefinição de senha. */
  recoveringPassword: boolean;
  finishPasswordRecovery(): void;
  refreshMe(): Promise<void>;
  signOut(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: "loading" });
  const [recoveringPassword, setRecoveringPassword] = useState(false);

  useEffect(() => {
    let active = true;
    let loadedUserId: string | null = null;

    // Dispara INITIAL_SESSION ao assinar: cobre tanto a sessão salva quanto os
    // links de confirmação de e-mail e de redefinição de senha.
    const { data } = supabase().auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") setRecoveringPassword(true);

      if (!session) {
        loadedUserId = null;
        setState((current) => (current.status === "signedOut" ? current : { status: "signedOut" }));
        return;
      }
      // Renovação de token e afins não exigem recarregar o perfil.
      if (session.user.id === loadedUserId) return;
      loadedUserId = session.user.id;

      fetchMe(session.access_token)
        .then((me) => {
          if (active && loadedUserId === me.id) setState({ status: "signedIn", me });
        })
        .catch(async (error: unknown) => {
          if (!active) return;
          loadedUserId = null;
          const semPerfil = error instanceof ApiError && error.status === 404;
          await endSession();
          setState({
            status: "signedOut",
            notice: semPerfil ? "Não encontramos um perfil para esta conta. Faça o cadastro novamente." : errorMessage(error),
          });
        });
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const refreshMe = useCallback(async () => {
    const me = await fetchMe();
    setState({ status: "signedIn", me });
  }, []);

  const signOut = useCallback(async () => {
    await endSession();
  }, []);

  const finishPasswordRecovery = useCallback(() => setRecoveringPassword(false), []);

  const value = useMemo(
    () => ({ state, recoveringPassword, finishPasswordRecovery, refreshMe, signOut }),
    [state, recoveringPassword, finishPasswordRecovery, refreshMe, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth deve ser usado dentro de <AuthProvider>.");
  return context;
}
