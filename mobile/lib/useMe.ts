import { useAuth } from "../../shared/client/AuthContext.tsx";
import type { Me } from "../../shared/client/account.ts";

export function useMe(): Me {
  const { state } = useAuth();
  if (state.status !== "signedIn") throw new Error("useMe() fora de uma sessão autenticada.");
  return state.me;
}
