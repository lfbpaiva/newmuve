import { useEffect, useMemo, useSyncExternalStore } from "react";
import { errorMessage } from "../../shared/client/api.ts";
import { fetchFavoriteIds, setFavorite } from "../../shared/client/events.ts";
import { criarControleDeFavoritos, estadoDoBotaoDeFavorito } from "./favoritos";

export function useFavoritos(contractorId: string, ativo: boolean) {
  const controle = useMemo(() => criarControleDeFavoritos({
    ler: () => (ativo ? fetchFavoriteIds(contractorId) : Promise.resolve([])),
    gravar: setFavorite,
    mensagemDeErro: errorMessage,
  }), [contractorId, ativo]);
  const estado = useSyncExternalStore(controle.inscrever, controle.estado, controle.estado);
  useEffect(() => {
    void controle.carregar();
  }, [controle]);
  return { erro: estado.erro, podeTentarDeNovo: estado.podeTentarDeNovo, tentarDeNovo: controle.tentarDeNovo, alternar: controle.alternar, botao: (musicianId: string) => estadoDoBotaoDeFavorito(estado, musicianId, ativo) };
}
