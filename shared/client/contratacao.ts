import { formatCurrency, formatEventDateTime } from "./format.ts";
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
  const { evento, pagamento } = hiring;
  const titulo = "Confirmação do show";
  if (evento.status === "CONCLUIDO") return { titulo, detalhe: "Show concluído", situacao: "feita" };
  if (pagamento?.refundStatus === "PROCESSANDO") return { titulo, detalhe: "Suspensa até a resolução do estorno", situacao: "problema" };
  if (!comecou) return { titulo, detalhe: "Cada parte confirma depois do show", situacao: "pendente" };
  const contratante = evento.confirmacaoContratante ? "confirmou" : "aguardando";
  const musico = evento.confirmacaoMusico ? "confirmou" : "aguardando";
  return { titulo, detalhe: `Contratante ${contratante} · músico ${musico}. Sem resposta, conclui em 7 dias`, situacao: "atual" };
}

function etapaRepasse(hiring: Hiring): EtapaContratacao {
  const { pagamento, contestacao } = hiring;
  const titulo = "Cachê repassado";
  if (contestacao) return { titulo, detalhe: "Suspenso enquanto o suporte analisa a contestação", situacao: "problema" };
  switch (pagamento?.repasseStatus) {
    case "REPASSADO":
      return { titulo, detalhe: "Pix enviado ao músico", situacao: "feita" };
    case "PROCESSANDO":
      return { titulo, detalhe: "Pix ao músico em processamento", situacao: "atual" };
    case "FALHOU":
      return { titulo, detalhe: "O Pix falhou. A Muve tenta de novo automaticamente", situacao: "problema" };
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
