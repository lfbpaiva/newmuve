export const ABERTURA_DESENHO_MS = 950;
export const ABERTURA_PAUSA_MS = 260;
export const ABERTURA_SAIDA_MS = 520;
export const ABERTURA_DURACAO_MS = ABERTURA_DESENHO_MS + ABERTURA_PAUSA_MS + ABERTURA_SAIDA_MS;
export const ABERTURA_LIMITE_MS = ABERTURA_DURACAO_MS + 1200;

export function encerrarUmaVez(aoEncerrar: () => void): () => void {
  let encerrada = false;
  return () => {
    if (encerrada) return;
    encerrada = true;
    aoEncerrar();
  };
}
