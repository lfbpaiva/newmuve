import { z } from "zod";
import { CACHE_MINIMO, ESTILOS_EVENTO, FORMACOES, QUALQUER_ESTILO, TIPOS_EVENTO } from "../../../shared/dominio.ts";
import { cidade, texto, uf } from "./fields.ts";

export type EventStatus = "ABERTO" | "CONTRATADO" | "CANCELADO" | "CONCLUIDO";
export type CandidateStatus = "PENDENTE" | "APROVADO" | "RECUSADO";
export type PaymentStatus = "PENDENTE" | "PAGO" | "EXPIRADO" | "CANCELADO" | "ESTORNADO";
export type PayoutStatus = "RETIDO" | "PROCESSANDO" | "REPASSADO" | "FALHOU";
export type RefundStatus = "PROCESSANDO" | "NEGADO" | "CONFIRMADO";
export type RefundAction = "REABRIR" | "CANCELAR" | "NAO_COMPARECIMENTO" | "NENHUMA";

const isCentavos = (value: number) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-6;

const valorEmReais = z
  .number({ error: "O cachê mínimo é de R$ 100,00." })
  .min(CACHE_MINIMO, "O cachê mínimo é de R$ 100,00.")
  .max(1_000_000, "O cachê deve ser de no máximo R$ 1.000.000,00.")
  .refine(isCentavos, "O cachê deve ter no máximo duas casas decimais.");

export const eventSchema = z.object({
  titulo: texto("Informe o título do evento.").min(1, "Informe o título do evento.").max(120, "O título deve ter no máximo 120 caracteres."),
  tipoEvento: z.enum(TIPOS_EVENTO, { error: "Informe tipo, horário de início e duração do evento." }),
  inicio: z
    .string({ error: "Informe tipo, horário de início e duração do evento." })
    .refine((value) => !Number.isNaN(Date.parse(value)), "Data ou horário inválido.")
    .transform((value) => new Date(value)),
  duracaoMinutos: z
    .number({ error: "Informe tipo, horário de início e duração do evento." })
    .int("Duração inválida.")
    .min(1, "Informe a duração do evento.")
    .max(1440, "A duração deve ser de no máximo 24 horas."),
  uf,
  cidade,
  endereco: texto("Informe o endereço do evento.").min(5, "Informe o endereço do evento.").max(200, "O endereço deve ter no máximo 200 caracteres."),
  estilosMusicais: z
    .array(z.enum(ESTILOS_EVENTO, { error: "Estilo musical inválido." }), { error: "Selecione ao menos um estilo musical." })
    .min(1, "Selecione ao menos um estilo musical.")
    .transform((estilos) => (estilos.includes(QUALQUER_ESTILO) ? [QUALQUER_ESTILO] : [...new Set(estilos)])),
  formacao: z.enum(FORMACOES, { error: "Formação inválida." }).default("Indiferente"),
  somDisponivel: z.boolean().default(false),
  cache: valorEmReais,
  descricao: z.string().trim().max(2000, "A descrição deve ter no máximo 2000 caracteres.").optional(),
});
export type EventInput = z.infer<typeof eventSchema>;

export const cancelamentoSchema = z.object({
  esperado: z.enum(["COM_ESTORNO", "SEM_ESTORNO"]).optional(),
});

export const inscricoesSchema = z.object({
  encerradas: z.boolean({ error: "Informe se as inscrições estão encerradas." }),
});

export const candidaturaSchema = z.object({
  valorProposto: valorEmReais.nullable().default(null),
});

export const propostaSchema = z.object({
  valor: valorEmReais,
});

export const respostaPropostaSchema = z.object({
  aceitar: z.boolean({ error: "Informe se a proposta foi aceita." }),
});

export const mensagemSchema = z.object({
  texto: texto("Escreva uma mensagem.").min(1, "Escreva uma mensagem.").max(1000, "A mensagem deve ter no máximo 1000 caracteres."),
});

export type StatusProposta = "ABERTA" | "ACEITA" | "RECUSADA" | "SUBSTITUIDA";

export interface MessageRecord {
  id: string;
  candidateId: string;
  authorId: string;
  texto: string;
  tipo: "TEXTO" | "PROPOSTA";
  valor: number | null;
  statusProposta: StatusProposta | null;
  createdAt: Date;
}

export const checkoutSchema = z.object({
  candidateId: z.uuid({ error: "Candidatura inválida." }),
});

export const reviewSchema = z.object({
  rating: z.number({ error: "Escolha uma nota de 1 a 5." }).int("Escolha uma nota de 1 a 5.").min(1, "Escolha uma nota de 1 a 5.").max(5, "Escolha uma nota de 1 a 5."),
  comment: z.string().trim().max(1000, "O comentário deve ter no máximo 1000 caracteres.").optional(),
});
export type ReviewInput = z.infer<typeof reviewSchema>;

export const asaasWebhookSchema = z.object({
  id: z.string().min(1),
  event: z.string().min(1),
  payment: z.object({ id: z.string().min(1) }).optional(),
  transfer: z.object({ id: z.string().min(1) }).optional(),
});
export type AsaasWebhook = z.infer<typeof asaasWebhookSchema>;

export interface EventRecord {
  id: string;
  contractorId: string | null;
  musicoContratadoId: string | null;
  titulo: string;
  tipoEvento: string;
  inicio: Date;
  duracaoMinutos: number;
  uf: string;
  cidade: string;
  estilosMusicais: string[];
  formacao: string;
  somDisponivel: boolean;
  cache: number;
  imagemUrl: string;
  descricao: string | null;
  status: EventStatus;
  confirmacaoMusico: boolean;
  confirmacaoContratante: boolean;
  inscricoesEncerradas: boolean;
}

export interface CandidateRecord {
  id: string;
  eventId: string;
  musicianId: string;
  status: CandidateStatus;
  valorProposto: number | null;
  motivoRecusa: MotivoRecusa | null;
}

export type MotivoRecusa = "CONTRATANTE" | "OUTRO_CONTRATADO" | "EVENTO_ALTERADO";

export interface PaymentRecord {
  id: string;
  eventId: string | null;
  candidateId: string | null;
  asaasPaymentId: string;
  valor: number;
  valorComissao: number;
  valorCache: number;
  status: PaymentStatus;
  repasseStatus: PayoutStatus | null;
  asaasTransferId: string | null;
  refundStatus: RefundStatus | null;
  refundAction: RefundAction | null;
  refundRequestedAt: Date | null;
  pixCopiaCola: string | null;
  pixQrCode: string | null;
  expiraEm: Date;
}

export function toCheckoutView(payment: PaymentRecord) {
  return {
    id: payment.id,
    cache: payment.valorCache,
    comissao: payment.valorComissao,
    valor: payment.valor,
    status: payment.status,
    candidateId: payment.candidateId,
    refundStatus: payment.refundStatus,
    pixCopiaCola: payment.pixCopiaCola,
    pixQrCode: payment.pixQrCode,
    expiraEm: payment.expiraEm.toISOString(),
  };
}
