import { useCallback, useEffect, useEffectEvent, useState } from "react";
import { errorMessage } from "./api.ts";

interface AsyncState<T> {
  key: string;
  request: string;
  data?: T;
  error?: string;
}

export function useAsync<T>(key: string, load: () => Promise<T>) {
  const [version, setVersion] = useState(0);
  const [state, setState] = useState<AsyncState<T>>({ key: "", request: "" });
  const request = `${key}#${version}`;
  const loadData = useEffectEvent(load);

  useEffect(() => {
    let active = true;
    loadData().then(
      (data) => active && setState({ key, request, data }),
      (error: unknown) => active && setState({ key, request, error: errorMessage(error) }),
    );
    return () => {
      active = false;
    };
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
