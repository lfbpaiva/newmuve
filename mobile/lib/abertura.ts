export const ABERTURA_DESENHO_MS = 950;
export const ABERTURA_PAUSA_MS = 260;
export const ABERTURA_SAIDA_MS = 520;
export const ABERTURA_DURACAO_MS = ABERTURA_DESENHO_MS + ABERTURA_PAUSA_MS + ABERTURA_SAIDA_MS;
export const ABERTURA_ESPERA_DA_LOGO_MS = 600;
export const ABERTURA_LIMITE_MS = ABERTURA_ESPERA_DA_LOGO_MS + ABERTURA_DURACAO_MS + 1200;

export const telasLiberadas = ({ abrindo, desenhoConcluido }: { abrindo: boolean; desenhoConcluido: boolean }) => !abrindo || desenhoConcluido;

export function criarLargada(aoLargar: (reduzirMovimento: boolean) => void) {
  let logoPronta = false;
  let reduzirMovimento: boolean | null = null;
  let largou = false;
  const tentar = () => {
    if (largou || reduzirMovimento === null || (!reduzirMovimento && !logoPronta)) return;
    largou = true;
    aoLargar(reduzirMovimento);
  };
  return {
    logoPronta() {
      logoPronta = true;
      tentar();
    },
    preferenciaLida(valor: boolean) {
      reduzirMovimento = valor;
      tentar();
    },
  };
}

export function encerrarUmaVez(aoEncerrar: () => void): () => void {
  let encerrada = false;
  return () => {
    if (encerrada) return;
    encerrada = true;
    aoEncerrar();
  };
}
