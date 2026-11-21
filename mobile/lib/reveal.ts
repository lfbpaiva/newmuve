export const REVEAL_FAIXA_DE_ENTRADA = 140;
export const EMPILHAR_DESLOCAMENTO = 0.55;
const PROGRESSO_MINIMO_PARA_TOQUE = 0.5;

interface CaixaDoReveal {
  y: number;
  altura: number;
}

export const revelaAoRolar = (caixa: CaixaDoReveal, alturaDaJanela: number) => caixa.y > alturaDaJanela;

export function revealRecebeToques({ posicao, caixa, alturaDaJanela, empilhar }: { posicao: number; caixa: CaixaDoReveal; alturaDaJanela: number; empilhar: boolean }): boolean {
  if (!empilhar) return true;
  if (revelaAoRolar(caixa, alturaDaJanela)) {
    const entrada = (posicao - (caixa.y - alturaDaJanela)) / REVEAL_FAIXA_DE_ENTRADA;
    if (entrada < PROGRESSO_MINIMO_PARA_TOQUE) return false;
  }
  if (caixa.altura > 0) {
    const empilhado = (posicao - caixa.y) / caixa.altura;
    if (empilhado >= PROGRESSO_MINIMO_PARA_TOQUE) return false;
  }
  return true;
}

export const precisaAcompanharRolagem = (_caixa: CaixaDoReveal, _alturaDaJanela: number, empilhar: boolean) => empilhar;

export interface AvisoDeFimDaRolagem {
  posicao(): number;
  publicar(posicao: number): void;
  inscrever(ouvinte: (posicao: number) => void): () => void;
}

export function criarAvisoDeFimDaRolagem(): AvisoDeFimDaRolagem {
  let ultima = 0;
  const ouvintes = new Set<(posicao: number) => void>();
  return {
    posicao: () => ultima,
    publicar(posicao) {
      if (posicao === ultima) return;
      ultima = posicao;
      for (const ouvinte of [...ouvintes]) ouvinte(posicao);
    },
    inscrever(ouvinte) {
      ouvintes.add(ouvinte);
      return () => {
        ouvintes.delete(ouvinte);
      };
    },
  };
}

export const medidaDoReveal = (y: number, altura: number): CaixaDoReveal => ({ y: Math.round(y), altura: Math.round(altura) });

export const posicaoNaRolagem = (caixa: CaixaDoReveal, deslocamentoDoContainer: number): CaixaDoReveal => ({ y: caixa.y + deslocamentoDoContainer, altura: caixa.altura });

export const somarDeslocamento = (deslocamentoDoPai: number, yNoPai: number) => deslocamentoDoPai + Math.round(yNoPai);

export function deveMostrarAtualizacao(puxou: boolean, carregando: boolean | undefined): boolean {
  return puxou && carregando === true;
}
