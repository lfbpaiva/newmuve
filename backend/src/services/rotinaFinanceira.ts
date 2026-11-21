import { randomUUID } from "node:crypto";
import type { FinancialRoutineSetting } from "../config.ts";
import { AppError } from "../domain/errors.ts";
import type { EventService } from "./eventService.ts";
import type { PaymentService } from "./paymentService.ts";
import type { EventStore, PaymentStore, TravaDaRotina } from "./ports.ts";
import { AUSENCIA_PRAZO_RESPOSTA_MS, CONCLUSAO_AUTOMATICA_MS } from "../../../shared/dominio.ts";

const VALIDADE_DA_TRAVA_S = 600;
const RENOVACAO_DA_TRAVA_MS = 2 * 60 * 1000;
const MARGEM_DA_TRAVA_MS = 60 * 1000;

export type InicioDaRotina = "INICIADA" | "EM_ANDAMENTO";

class TravaDaRotinaPerdida extends Error {}

type Renovacao = { parar(): void };

const agendarRenovacaoPadrao = (tarefa: () => void, intervaloMs: number): Renovacao => {
  const timer = setInterval(tarefa, intervaloMs);
  timer.unref();
  return { parar: () => clearInterval(timer) };
};

const descreverFalha = (error: unknown) =>
  error instanceof TravaDaRotinaPerdida ? "A trava da rotina foi perdida durante a execução."
    : error instanceof AppError ? `Falha na rotina financeira: ${error.code}.`
      : "Falha inesperada na rotina financeira.";

export function createRotinaFinanceira(deps: {
  paymentStore: Pick<PaymentStore, "findFinanceFollowUps">;
  eventStore: Pick<EventStore, "findDueHirings" | "findExpiredAbsences">;
  payments: Pick<PaymentService, "syncPending" | "refreshRefund" | "payout" | "markStalePayoutRequests" | "reconcileOutsidePayout">;
  events: Pick<EventService, "settleDueHiring">;
  trava: TravaDaRotina;
  relogio?: () => number;
  agendarRenovacao?: (tarefa: () => void, intervaloMs: number) => Renovacao;
  gerarDono?: () => string;
}) {
  const { paymentStore, eventStore, payments, events, trava, relogio = Date.now, agendarRenovacao = agendarRenovacaoPadrao, gerarDono = randomUUID } = deps;
  let running = false;

  function manterTrava(dono: string, geracao: number, adquiridaEm: number) {
    let validaAte = adquiridaEm + VALIDADE_DA_TRAVA_S * 1000;
    let perdida = false;
    let renovando: Promise<void> | null = null;

    const renovar = (): Promise<void> => {
      if (perdida) return Promise.resolve();
      if (renovando) return renovando;
      const pedidaEm = relogio();
      renovando = trava.renovar(dono, geracao, VALIDADE_DA_TRAVA_S)
        .then((renovada) => {
          if (renovada) validaAte = pedidaEm + VALIDADE_DA_TRAVA_S * 1000;
          else perdida = true;
        })
        .catch((error: unknown) => {
          perdida = true;
          console.error("Rotina financeira: falha ao renovar a trava", error instanceof Error ? error.message : "falha inesperada");
        })
        .finally(() => {
          renovando = null;
        });
      return renovando;
    };

    const renovacao = agendarRenovacao(() => void renovar(), RENOVACAO_DA_TRAVA_MS);
    return {
      exigir(): void {
        if (perdida || relogio() >= validaAte - MARGEM_DA_TRAVA_MS) throw new TravaDaRotinaPerdida();
      },
      parar(): void {
        renovacao.parar();
      },
    };
  }

  type Autorizacao = ReturnType<typeof manterTrava>;

  async function each(eventIds: string[], etapa: string, autorizacao: Autorizacao, step: (eventId: string) => Promise<unknown>): Promise<void> {
    for (const eventId of new Set(eventIds)) {
      autorizacao.exigir();
      await step(eventId).catch((error: unknown) => {
        console.error(`Rotina financeira (${etapa})`, eventId, error instanceof AppError ? error.code : "falha inesperada");
      });
    }
  }

  async function executarEtapas(now: Date, autorizacao: Autorizacao): Promise<void> {
    autorizacao.exigir();
    const { expiredCharges, refunds, payouts } = await paymentStore.findFinanceFollowUps(now);
    await each(expiredCharges, "cobrança vencida", autorizacao, (eventId) => payments.syncPending(eventId, now));
    await each(refunds, "estorno", autorizacao, (eventId) => payments.refreshRefund(eventId));
    autorizacao.exigir();
    await payments.markStalePayoutRequests().catch((error: unknown) => {
      console.error("Rotina financeira (solicitações de repasse sem resposta)", error instanceof AppError ? error.code : "falha inesperada");
    });
    autorizacao.exigir();
    await payments.reconcileOutsidePayout().catch((error: unknown) => {
      console.error("Rotina financeira (tentativas de repasse fora do pagamento atual)", error instanceof AppError ? error.code : "falha inesperada");
    });
    await each(payouts, "repasse", autorizacao, (eventId) => payments.payout(eventId));
    autorizacao.exigir();
    const vencidos = [
      ...(await eventStore.findExpiredAbsences(new Date(now.getTime() - AUSENCIA_PRAZO_RESPOSTA_MS))),
      ...(await eventStore.findDueHirings(new Date(now.getTime() - CONCLUSAO_AUTOMATICA_MS))),
    ];
    await each(vencidos, "conclusão", autorizacao, (eventId) => events.settleDueHiring(eventId, now));
  }

  async function processar(dono: string, geracao: number, adquiridaEm: number, now: Date): Promise<void> {
    const autorizacao = manterTrava(dono, geracao, adquiridaEm);
    let falha: unknown = null;
    try {
      await executarEtapas(now, autorizacao);
    } catch (error) {
      falha = error;
      console.error("Rotina financeira interrompida", descreverFalha(error));
    } finally {
      autorizacao.parar();
    }
    const encerrada = await trava.encerrar(dono, geracao, falha === null ? "SUCESSO" : "FALHA", falha === null ? null : descreverFalha(falha)).catch((error: unknown) => {
      console.error("Rotina financeira: falha ao encerrar a trava", error instanceof Error ? error.message : "falha inesperada");
      return false;
    });
    if (!encerrada) console.error("Rotina financeira terminou sem conseguir encerrar a própria trava; ela vence sozinha", dono);
  }

  return {
    async iniciar(now = new Date()): Promise<{ resultado: InicioDaRotina; conclusao: Promise<void> }> {
      if (running) return { resultado: "EM_ANDAMENTO", conclusao: Promise.resolve() };
      running = true;
      try {
        const dono = gerarDono();
        const adquiridaEm = relogio();
        const geracao = await trava.adquirir(dono, VALIDADE_DA_TRAVA_S);
        if (geracao === null) {
          running = false;
          return { resultado: "EM_ANDAMENTO", conclusao: Promise.resolve() };
        }
        const conclusao = processar(dono, geracao, adquiridaEm, now).finally(() => {
          running = false;
        });
        return { resultado: "INICIADA", conclusao };
      } catch (error) {
        running = false;
        throw error;
      }
    },

    async run(now = new Date()): Promise<void> {
      const { conclusao } = await this.iniciar(now);
      await conclusao;
    },
  };
}


export function createAgendaFinanceira(deps: {
  rotina: { run(): Promise<void> };
  configuracao: FinancialRoutineSetting;
  permitida: boolean;
  intervaloMs: number;
  agendar?: (tarefa: () => void, intervaloMs: number) => unknown;
  log?: (mensagem: string) => void;
  aviso?: (mensagem: string) => void;
}) {
  const { rotina, configuracao, permitida, intervaloMs, agendar = setInterval, log = console.log, aviso = console.warn } = deps;
  let agendada = false;
  const executar = () => void rotina.run().catch((error: unknown) => console.error("Falha na rotina financeira", error));

  return {
    iniciar(): boolean {
      if (configuracao === "invalid") {
        aviso("Rotina financeira desabilitada: ENABLE_FINANCIAL_ROUTINE tem um valor não reconhecido. Use true ou false.");
        return false;
      }
      if (configuracao === "disabled") {
        log("Rotina financeira desabilitada nesta instância. Para executá-la, defina ENABLE_FINANCIAL_ROUTINE=true.");
        return false;
      }
      if (!permitida) {
        aviso("Rotina financeira bloqueada: em desenvolvimento ela só roda com um Supabase local, nunca com o banco hospedado.");
        return false;
      }
      if (agendada) return false;
      agendada = true;
      log(`Rotina financeira habilitada: executa agora e a cada ${Math.round(intervaloMs / 60_000)} minutos.`);
      executar();
      agendar(executar, intervaloMs);
      return true;
    },
  };
}
