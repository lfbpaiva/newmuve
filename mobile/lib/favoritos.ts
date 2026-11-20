export const FALHA_AO_ATUALIZAR_FAVORITOS = "Não foi possível atualizar a lista de favoritos. Os dados mostrados podem estar desatualizados.";

export interface EstadoDosFavoritos {
  ids: string[] | undefined;
  pendentes: string[];
  erro: string;
  podeTentarDeNovo: boolean;
}

export interface EstadoDoBotaoDeFavorito {
  visivel: boolean;
  favorito: boolean;
  salvando: boolean;
}

export function estadoDoBotaoDeFavorito(estado: EstadoDosFavoritos, musicianId: string, ativo: boolean): EstadoDoBotaoDeFavorito {
  if (!ativo || !estado.ids) return { visivel: false, favorito: false, salvando: false };
  return { visivel: true, favorito: estado.ids.includes(musicianId), salvando: estado.pendentes.includes(musicianId) };
}

export interface AparenciaDoCoracao {
  preenchido: boolean;
  opacidade: number;
}

export const aparenciaDoCoracao = ({ favorito }: { favorito: boolean }): AparenciaDoCoracao => ({
  preenchido: favorito,
  opacidade: 1,
});

export interface ControleDeFavoritos {
  estado(): EstadoDosFavoritos;
  inscrever(ouvinte: () => void): () => void;
  carregar(): Promise<void>;
  alternar(musicianId: string, favorito: boolean): void;
  tentarDeNovo(): void;
}

export function criarControleDeFavoritos({ ler, gravar, mensagemDeErro }: {
  ler: () => Promise<string[]>;
  gravar: (musicianId: string, favorito: boolean) => Promise<unknown>;
  mensagemDeErro: (erro: unknown) => string;
}): ControleDeFavoritos {
  let base: string[] | undefined;
  const confirmados = new Map<string, boolean>();
  const desejados = new Map<string, boolean>();
  const emAndamento = new Set<string>();
  const gravacoes = new Map<string, number>();
  const falhas = new Map<string, boolean>();
  let leituraAtual = 0;
  let erroDeGravacao = "";
  let erroDeLeitura = "";
  const ouvintes = new Set<() => void>();

  const montar = (): EstadoDosFavoritos => {
    const podeTentarDeNovo = falhas.size > 0 || erroDeLeitura !== "";
    if (!base) return { ids: undefined, pendentes: [...emAndamento], erro: erroDeGravacao || erroDeLeitura, podeTentarDeNovo };
    const ids = new Set(base);
    for (const mudancas of [confirmados, desejados]) {
      for (const [musicianId, favorito] of mudancas) {
        if (favorito) ids.add(musicianId);
        else ids.delete(musicianId);
      }
    }
    return { ids: [...ids], pendentes: [...emAndamento], erro: erroDeGravacao || erroDeLeitura, podeTentarDeNovo };
  };
  let atual = montar();

  const notificar = () => {
    atual = montar();
    for (const ouvinte of [...ouvintes]) ouvinte();
  };

  const confirmado = (musicianId: string) => confirmados.get(musicianId) ?? Boolean(base?.includes(musicianId));

  async function reler(): Promise<void> {
    const geracao = ++leituraAtual;
    const gravacoesNoInicio = new Map(gravacoes);
    try {
      const ids = await ler();
      if (geracao !== leituraAtual) return;
      base = ids;
      for (const musicianId of [...confirmados.keys()]) {
        if (gravacoes.get(musicianId) === gravacoesNoInicio.get(musicianId)) confirmados.delete(musicianId);
      }
      erroDeLeitura = "";
    } catch {
      if (geracao !== leituraAtual) return;
      erroDeLeitura = FALHA_AO_ATUALIZAR_FAVORITOS;
    }
    notificar();
  }

  function alternar(musicianId: string, favorito: boolean): void {
    desejados.set(musicianId, favorito);
    falhas.delete(musicianId);
    if (falhas.size === 0) erroDeGravacao = "";
    if (emAndamento.has(musicianId)) return notificar();
    void processar(musicianId);
  }

  async function processar(musicianId: string): Promise<void> {
    emAndamento.add(musicianId);
    notificar();
    try {
      for (let alvo = desejados.get(musicianId); alvo !== undefined && alvo !== confirmado(musicianId); alvo = desejados.get(musicianId)) {
        await gravar(musicianId, alvo);
        confirmados.set(musicianId, alvo);
        gravacoes.set(musicianId, (gravacoes.get(musicianId) ?? 0) + 1);
      }
    } catch (erro) {
      const intencao = desejados.get(musicianId);
      if (intencao !== undefined) falhas.set(musicianId, intencao);
      erroDeGravacao = mensagemDeErro(erro);
    } finally {
      desejados.delete(musicianId);
      emAndamento.delete(musicianId);
      notificar();
    }
    if (emAndamento.size === 0) await reler();
  }

  return {
    estado: () => atual,
    inscrever(ouvinte) {
      ouvintes.add(ouvinte);
      return () => {
        ouvintes.delete(ouvinte);
      };
    },
    carregar: reler,
    alternar,
    tentarDeNovo() {
      const repetir = [...falhas];
      falhas.clear();
      erroDeGravacao = "";
      for (const [musicianId, favorito] of repetir) alternar(musicianId, favorito);
      if (repetir.length === 0 && erroDeLeitura) void reler();
      notificar();
    },
  };
}
