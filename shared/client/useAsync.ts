import { useCallback, useEffect, useState } from "react";
import { errorMessage } from "./api.ts";

interface AsyncState<T> {
  /** Chave da requisição que produziu este resultado. */
  key: string;
  request: string;
  data?: T;
  error?: string;
}

/**
 * Carrega dados assíncronos para uma tela. `key` identifica o que está sendo
 * carregado (ex.: `event:${id}`): quando muda, os dados são buscados de novo.
 * Durante um `reload`, os dados anteriores continuam visíveis.
 */
export function useAsync<T>(key: string, load: () => Promise<T>) {
  const [version, setVersion] = useState(0);
  const [state, setState] = useState<AsyncState<T>>({ key: "", request: "" });
  const request = `${key}#${version}`;

  useEffect(() => {
    let active = true;
    load().then(
      (data) => active && setState({ key, request, data }),
      (error: unknown) => active && setState({ key, request, error: errorMessage(error) }),
    );
    return () => {
      active = false;
    };
    // `load` é recriada a cada render; a identidade da busca é dada por `key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, request]);

  const reload = useCallback(() => setVersion((current) => current + 1), []);
  const current = state.key === key;

  return {
    data: current ? state.data : undefined,
    error: state.request === request ? state.error : undefined,
    loading: state.request !== request,
    reload,
  };
}
