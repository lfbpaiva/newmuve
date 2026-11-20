import { formatCurrency, formatDateTime, formatEventDateTime } from "./format.ts";
import type { Hiring } from "./events.ts";

export type SituacaoEtapa = "feita" | "atual" | "pendente" | "problema";

export interface EtapaContratacao {
  titulo: string;
  detalhe: string;
  situacao: SituacaoEtapa;
}

const HORA_MS = 60 * 60 * 1000;
const DIA_MS = 24 * HORA_MS;

export function tempoAteOShow(inicio: Date, agora: Date): string {
  const restante = inicio.getTime() - agora.getTime();
  if (restante <= 0) return "O show já começou";
  if (restante < HORA_MS) return "Começa em instantes";
  if (restante < DIA_MS) {
    const horas = Math.floor(restante / HORA_MS);
    return horas === 1 ? "Começa em 1 hora" : `Começa em ${horas} horas`;
  }
  const dias = Math.floor(restante / DIA_MS);
  return dias === 1 ? "Falta 1 dia" : `Faltam ${dias} dias`;
}

function etapaPagamento(hiring: Hiring): EtapaContratacao {
  const { pagamento, papel } = hiring;
  if (!pagamento || pagamento.status === "PENDENTE") return { titulo: "Pagamento", detalhe: "Aguardando o Pix do contratante", situacao: "atual" };
  if (pagamento.status === "ESTORNADO") return { titulo: "Pagamento estornado", detalhe: "O valor voltou ao contratante", situacao: "problema" };
  if (pagamento.status !== "PAGO") return { titulo: "Pagamento", detalhe: "Cobrança encerrada sem pagamento", situacao: "problema" };
  const valor = papel === "contratante" ? pagamento.total : pagamento.cache;
  return { titulo: "Cachê garantido", detalhe: `${formatCurrency(valor)} guardado na Muve até o show`, situacao: "feita" };
}

function etapaConfirmacao(hiring: Hiring, comecou: boolean): EtapaContratacao {
  const { evento, pagamento, contestacao } = hiring;
  const titulo = "Confirmação do show";
  if (evento.status === "CONCLUIDO") return { titulo, detalhe: "Show concluído", situacao: "feita" };
  if (pagamento?.refundStatus === "PROCESSANDO") return { titulo, detalhe: "Suspensa até a resolução do estorno", situacao: "problema" };
  if (contestacao) return { titulo, detalhe: "Suspensa enquanto a contestação estiver com o suporte", situacao: "problema" };
  if (!comecou) return { titulo, detalhe: "Cada parte confirma depois do show", situacao: "pendente" };
  const contratante = evento.confirmacaoContratante ? "confirmou" : "aguardando";
  const musico = evento.confirmacaoMusico ? "confirmou" : "aguardando";
  return { titulo, detalhe: `Contratante ${contratante} · músico ${musico}. Sem resposta, conclui em 7 dias`, situacao: "atual" };
}

function etapaRepasse(hiring: Hiring): EtapaContratacao {
  const { pagamento, contestacao } = hiring;
  const titulo = "Cachê repassado";
  if (contestacao?.status === "AGUARDANDO_ESTORNO") return { titulo, detalhe: "Suspenso: o suporte decidiu devolver o valor, e o estorno aguarda confirmação", situacao: "problema" };
  if (contestacao) return { titulo, detalhe: "Suspenso enquanto o suporte analisa a contestação", situacao: "problema" };
  switch (pagamento?.repasseStatus) {
    case "REPASSADO":
      return { titulo, detalhe: "Pix enviado ao músico", situacao: "feita" };
    case "PROCESSANDO":
      return { titulo, detalhe: "Pix ao músico em processamento", situacao: "atual" };
    case "FALHOU":
      return { titulo, detalhe: "O Pix falhou. Fale com o suporte da Muve", situacao: "problema" };
    default:
      return { titulo, detalhe: "Liberado depois da confirmação do show", situacao: "pendente" };
  }
}

export function etapasDaContratacao(hiring: Hiring, agora = new Date()): EtapaContratacao[] {
  const { evento, pagamento } = hiring;
  const pagamentoEtapa = etapaPagamento(hiring);
  if (evento.status === "CANCELADO" || pagamento?.status === "ESTORNADO") {
    return [pagamentoEtapa, { titulo: "Contratação encerrada", detalhe: "O show foi cancelado", situacao: "problema" }];
  }

  const inicio = new Date(evento.inicio);
  const comecou = inicio <= agora;
  const showEtapa: EtapaContratacao = comecou || evento.status === "CONCLUIDO"
    ? { titulo: "Show", detalhe: formatEventDateTime(evento.inicio, evento.uf), situacao: "feita" }
    : { titulo: "Show marcado", detalhe: `${formatEventDateTime(evento.inicio, evento.uf)} · ${tempoAteOShow(inicio, agora)}`, situacao: pagamentoEtapa.situacao === "feita" ? "atual" : "pendente" };

  return [pagamentoEtapa, showEtapa, etapaConfirmacao(hiring, comecou), etapaRepasse(hiring)];
}

export function situacaoDoCache(hiring: Hiring): string {
  const { pagamento } = hiring;
  if (!pagamento || pagamento.status === "PENDENTE") return "O cachê fica com a Muve assim que o contratante pagar o Pix.";
  if (pagamento.status === "ESTORNADO") return "O valor foi devolvido ao contratante.";
  if (pagamento.status !== "PAGO") return "A cobrança foi encerrada sem pagamento.";
  switch (pagamento.repasseStatus) {
    case "REPASSADO":
      return "A Muve repassou o cachê ao músico.";
    case "PROCESSANDO":
      return "A Muve está repassando o cachê ao músico.";
    case "FALHOU":
      return "O repasse falhou. Fale com o suporte da Muve.";
    default:
      return "A Muve guarda o cachê e libera ao músico depois do show.";
  }
}

export type ConfirmacaoDaParte =
  | { situacao: "confirmada"; texto: string }
  | { situacao: "aguardando-outra-parte"; texto: string }
  | { situacao: "disponivel"; texto: string }
  | { situacao: "indisponivel"; texto: string };

export function confirmacaoDaParte(hiring: Hiring, parte: "contratante" | "musico", agora = new Date()): ConfirmacaoDaParte {
  const { evento, pagamento, contestacao, papel } = hiring;
  const confirmou = parte === "contratante" ? evento.confirmacaoContratante : evento.confirmacaoMusico;
  if (confirmou) return { situacao: "confirmada", texto: "Confirmado" };
  if (parte !== papel) return { situacao: "aguardando-outra-parte", texto: "Aguardando" };
  if (pagamento?.refundStatus === "PROCESSANDO") return { situacao: "indisponivel", texto: "Suspensa" };
  if (contestacao) return { situacao: "indisponivel", texto: "Suspensa" };
  if (new Date(evento.inicio) > agora) return { situacao: "indisponivel", texto: "Após o início" };
  return { situacao: "disponivel", texto: "Confirmar" };
}

export function motivoDaConfirmacaoSuspensa(hiring: Hiring): string | null {
  if (hiring.pagamento?.refundStatus === "PROCESSANDO") return "A confirmação fica suspensa até a resolução do estorno.";
  if (hiring.contestacao) return "A confirmação fica suspensa enquanto a contestação estiver com o suporte. As duas partes serão avisadas da decisão.";
  return null;
}

export function avisoDaAusencia(hiring: Hiring): { tom: "info" | "error"; texto: string } | null {
  const { ausencia, papel, contestacao } = hiring;
  if (!ausencia || contestacao) return null;
  const prazo = formatDateTime(ausencia.prazo);
  if (papel === "musico") {
    return {
      tom: "error",
      texto: `O contratante informou que você não compareceu. Até ${prazo}, confirme que fez o show ou abra uma contestação: o suporte vai analisar as duas versões. Sem resposta, o valor volta ao contratante e a multa por ausência é aplicada.`,
    };
  }
  return {
    tom: "info",
    texto: `Você informou o não comparecimento. O músico tem até ${prazo} para responder. Sem resposta, o estorno integral é pedido automaticamente. Se o show aconteceu, confirme abaixo para retirar o aviso.`,
  };
}

export function avisoDoEstorno(hiring: Hiring): { tom: "info" | "error"; texto: string } | null {
  const { pagamento, contestacao } = hiring;
  if (pagamento?.refundStatus === "PROCESSANDO") {
    return {
      tom: "info",
      texto: contestacao?.status === "AGUARDANDO_ESTORNO"
        ? "O estorno decidido pelo suporte está em processamento no Asaas. A devolução ainda não foi confirmada."
        : "Estorno em processamento no Asaas. A devolução ainda não foi confirmada.",
    };
  }
  if (pagamento?.refundStatus === "NEGADO") {
    return {
      tom: "error",
      texto: contestacao
        ? "O Asaas não concluiu o estorno. A contestação continua com o suporte, e o show não pode ser confirmado nem o cachê repassado até a nova decisão."
        : "O estorno solicitado não foi concluído pelo Asaas. A contratação continua ativa e pode ser confirmada ou cancelada normalmente.",
    };
  }
  return null;
}

export interface HistoricoDaContestacao {
  titulo: string;
  resultado: string;
  data: string | null;
  aviso: string;
}

export function historicoDaContestacao(hiring: Hiring): HistoricoDaContestacao | null {
  const resolvida = hiring.contestacaoResolvida;
  if (hiring.contestacao || !resolvida) return null;
  return {
    titulo: "Contestação encerrada",
    resultado: resolvida.decisao === "PAGAR_MUSICO" ? "Decisão do suporte: o cachê vai para o músico." : "Resultado: o valor foi devolvido ao contratante.",
    data: resolvida.resolvidaEm && `Encerrada em ${formatDateTime(resolvida.resolvidaEm)}`,
    aviso: "Este é o registro de uma decisão já tomada. Não há nada pendente sobre esta contestação.",
  };
}

export interface AcaoDeContestacao {
  botao: string;
  explicacao: string | null;
}

export function acaoDeContestacao(hiring: Hiring): AcaoDeContestacao | null {
  if (!hiring.podeContestar) return null;
  if (!historicoDaContestacao(hiring)) return { botao: "Contestar o que aconteceu", explicacao: null };
  return {
    botao: "Abrir nova contestação",
    explicacao: "A decisão anterior continua registrada e não muda. Se houver um problema novo, você pode abrir outra contestação, independente da anterior, para o suporte analisar.",
  };
}
