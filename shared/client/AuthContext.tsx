import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { fetchMe, signOut as endSession, type Me } from "./account.ts";
import { ApiError, errorMessage } from "./api.ts";
import { supabase } from "./config.ts";

type AuthState =
  | { status: "loading" }
  | { status: "signedOut"; notice?: string }
  | { status: "error"; notice: string }
<<<<<<< HEAD
  | { status: "signedIn"; me: Me };
=======
  | { status: "signedIn"; me: Me }
  | { status: "needsProfile"; email: string; nomeSugerido: string };
>>>>>>> upstream/main

interface AuthContextValue {
  state: AuthState;
  recoveringPassword: boolean;
  beginPasswordRecovery(): void;
  finishPasswordRecovery(): void;
  refreshMe(): Promise<void>;
  retrySession(): Promise<void>;
  signOut(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: "loading" });
  const [recoveringPassword, setRecoveringPassword] = useState(false);

  useEffect(() => {
    let active = true;
    let loadedUserId: string | null = null;

    const { data } = supabase().auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") setRecoveringPassword(true);

      if (!session) {
        loadedUserId = null;
        setState((current) => (current.status === "signedOut" ? current : { status: "signedOut" }));
        return;
      }
      if (session.user.id === loadedUserId) return;
      loadedUserId = session.user.id;

      fetchMe(session.access_token)
        .then((me) => {
          if (active && loadedUserId === me.id) setState({ status: "signedIn", me });
        })
        .catch(async (error: unknown) => {
          if (!active) return;
          loadedUserId = null;
          if (error instanceof ApiError && error.status === 404 && session.user.app_metadata?.provider !== "email") {
            const metadata = session.user.user_metadata ?? {};
            setState({ status: "needsProfile", email: session.user.email ?? "", nomeSugerido: String(metadata.full_name ?? metadata.name ?? "") });
            return;
          }
          const semPerfil = error instanceof ApiError && error.status === 404;
          const sessaoInvalida = error instanceof ApiError && error.status === 401;
          if (semPerfil || sessaoInvalida) {
            await endSession();
            setState({
              status: "signedOut",
              notice: semPerfil ? "Não encontramos um perfil para esta conta. Faça o cadastro novamente." : errorMessage(error),
            });
          } else {
            setState({ status: "error", notice: errorMessage(error) });
          }
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

  const retrySession = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const me = await fetchMe();
      setState({ status: "signedIn", me });
    } catch (error) {
      const semPerfil = error instanceof ApiError && error.status === 404;
      const sessaoInvalida = error instanceof ApiError && error.status === 401;
      if (semPerfil || sessaoInvalida) {
        await endSession();
        setState({
          status: "signedOut",
          notice: semPerfil ? "Não encontramos um perfil para esta conta. Faça o cadastro novamente." : errorMessage(error),
        });
      } else {
        setState({ status: "error", notice: errorMessage(error) });
      }
    }
  }, []);

  const signOut = useCallback(async () => {
    await endSession();
  }, []);

  const beginPasswordRecovery = useCallback(() => setRecoveringPassword(true), []);
  const finishPasswordRecovery = useCallback(() => setRecoveringPassword(false), []);

  const value = useMemo(
<<<<<<< HEAD
    () => ({ state, recoveringPassword, finishPasswordRecovery, refreshMe, retrySession, signOut }),
    [state, recoveringPassword, finishPasswordRecovery, refreshMe, retrySession, signOut],
=======
    () => ({ state, recoveringPassword, beginPasswordRecovery, finishPasswordRecovery, refreshMe, retrySession, signOut }),
    [state, recoveringPassword, beginPasswordRecovery, finishPasswordRecovery, refreshMe, retrySession, signOut],
>>>>>>> upstream/main
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth deve ser usado dentro de <AuthProvider>.");
  return context;
}
