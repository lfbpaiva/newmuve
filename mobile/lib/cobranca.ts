type SituacaoDaCobranca = "aguardando" | "confirmando-prazo" | "encerrada";

export function situacaoDaCobranca(status: string, segundosRestantes: number): SituacaoDaCobranca {
  if (status !== "PENDENTE") return "encerrada";
  return segundosRestantes > 0 ? "aguardando" : "confirmando-prazo";
}

export const segundosAte = (iso: string, agora = Date.now()) => Math.max(0, Math.ceil((new Date(iso).getTime() - agora) / 1000));
