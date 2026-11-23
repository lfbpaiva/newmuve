export const HISTORICO_RESUMIDO = 5;

export function separarPorAndamento<T>(itens: T[], inicioDe: (item: T) => string, emAndamento: (item: T) => boolean) {
  const momento = (item: T) => new Date(inicioDe(item)).getTime();
  return {
    andamento: itens.filter(emAndamento).sort((a, b) => momento(a) - momento(b)),
    historico: itens.filter((item) => !emAndamento(item)).sort((a, b) => momento(b) - momento(a)),
  };
}

export const eventoEmAndamento = (evento: { status: string; inicio: string }, agora = Date.now()) =>
  evento.status === "CONTRATADO" || (evento.status === "ABERTO" && new Date(evento.inicio).getTime() > agora);

export const inscricaoEmAndamento = (inscricao: { status: string; event: { status: string; inicio: string } }, agora = Date.now()) =>
  inscricao.status !== "RECUSADO"
  && ((inscricao.event.status === "CONTRATADO" && inscricao.status === "APROVADO")
    || (inscricao.event.status === "ABERTO" && new Date(inscricao.event.inicio).getTime() > agora));
