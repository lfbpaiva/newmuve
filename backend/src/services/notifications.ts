import { formatCurrency, formatDateTime } from "../../../shared/formato.ts";
import type { EventRecord } from "../domain/event.ts";
import type { AccountStore } from "./accountService.ts";
import type { EventStore } from "./ports.ts";

export interface Mailer {
  send(message: { to: string; subject: string; text: string }): Promise<void>;
}

// Avisos por e-mail nos três momentos que mudam a situação de alguém:
// aprovação/pagamento, desistência da outra parte e não comparecimento.
// Nunca lançam: uma falha de envio não pode desfazer a operação que a disparou.
export function createNotifier(deps: { accounts: AccountStore; events: EventStore; mailer: Mailer; appUrl: string }) {
  const { accounts, events, mailer, appUrl } = deps;

  async function notify(userId: string | null, subject: string, body: string): Promise<void> {
    if (!userId) return;
    try {
      const email = await accounts.findEmail(userId);
      if (!email) return;
      await mailer.send({ to: email, subject: `Muve — ${subject}`, text: `${body}\n\nAcesse: ${appUrl}` });
    } catch (error) {
      console.error("Falha ao enviar e-mail", subject, error);
    }
  }

  const when = (event: EventRecord) => `${formatDateTime(event.inicio)} em ${event.cidade}, ${event.uf}`;

  return {
    /** Pagamento confirmado: o músico foi aprovado e o contratante tem o show garantido. */
    async hiringConfirmed(eventId: string): Promise<void> {
      const event = await events.findEvent(eventId).catch(() => null);
      if (!event) return;
      await Promise.all([
        notify(
          event.musicoContratadoId,
          `Você foi contratado para "${event.titulo}"`,
          `Boa notícia! O contratante aprovou sua candidatura e pagou o cachê de ${formatCurrency(event.cache)}, que fica retido até a conclusão do show (${when(event)}).\n\nO endereço e o telefone do contratante já estão disponíveis no comprovante da contratação.`,
        ),
        notify(
          event.contractorId,
          `Pagamento confirmado — "${event.titulo}"`,
          `Recebemos seu pagamento e o músico já foi avisado. O show está marcado para ${when(event)}. O cachê fica retido e só é repassado após as duas partes confirmarem a realização.`,
        ),
      ]);
    },

    /** A outra parte cancelou a contratação. */
    async hiringCancelled(event: EventRecord, cancelledBy: "contratante" | "musico", refunded: boolean): Promise<void> {
      if (cancelledBy === "musico") {
        await notify(
          event.contractorId,
          `O músico desistiu de "${event.titulo}"`,
          `O músico contratado cancelou a participação no show de ${when(event)}. O valor pago foi estornado integralmente e o evento voltou a receber candidaturas.`,
        );
        return;
      }
      await notify(
        event.musicoContratadoId,
        `Contratação cancelada — "${event.titulo}"`,
        refunded
          ? `O contratante cancelou o show de ${when(event)} com mais de 24 horas de antecedência. O valor foi devolvido a ele.`
          : `O contratante cancelou o show de ${when(event)} com menos de 24 horas de antecedência. Como compensação, o cachê de ${formatCurrency(event.cache)} será repassado para a sua chave Pix.`,
      );
    },

    /** O contratante registrou que o músico não compareceu. */
    async noShowReported(event: EventRecord): Promise<void> {
      await notify(
        event.musicoContratadoId,
        `Não comparecimento registrado — "${event.titulo}"`,
        `O contratante registrou que você não compareceu ao show de ${when(event)}. O valor foi devolvido a ele. Se isso estiver errado, responda a este e-mail.`,
      );
    },
  };
}

export type Notifier = ReturnType<typeof createNotifier>;
