import { useAuth } from "../../shared/client/AuthContext.tsx";
import type { Me } from "../../shared/client/account.ts";

/** Conta autenticada. As telas do grupo (app) só são montadas com sessão ativa. */
export function useMe(): Me {
  const { state } = useAuth();
  if (state.status !== "signedIn") throw new Error("useMe() fora de uma sessão autenticada.");
  return state.me;
}
