import { formatCurrency, formatDateTime } from "../../../shared/formato.ts";
import type { CandidateRecord, EventRecord } from "../domain/event.ts";
import type { AccountStore } from "./accountService.ts";
import type { EventStore } from "./ports.ts";

export interface Mailer {
  send(message: { to: string; subject: string; text: string }): Promise<void>;
}

export interface NotificationInput {
  userId: string;
  titulo: string;
  texto: string;
  link: string | null;
}

export interface Inbox {
  add(notification: NotificationInput): Promise<void>;
  markAllRead(userId: string): Promise<void>;
}

export function createNotifier(deps: { accounts: AccountStore; events: EventStore; inbox: Inbox; mailer: Mailer; appUrl: string }) {
  const { accounts, events, inbox, mailer, appUrl } = deps;

  async function notify(userId: string | null, titulo: string, texto: string, link: string | null, { email = true } = {}): Promise<void> {
    if (!userId) return;
    try {
      await inbox.add({ userId, titulo, texto, link });
    } catch (error) {
      console.error("Falha ao registrar notificação", titulo, error);
    }
    if (!email) return;
    try {
      const address = await accounts.findEmail(userId);
      if (!address) return;
      await mailer.send({ to: address, subject: `Muve — ${titulo}`, text: `${texto}\n\nAcesse: ${appUrl}` });
    } catch (error) {
      console.error("Falha ao enviar e-mail", titulo, error);
    }
  }

  const when = (event: EventRecord) => `${formatDateTime(event.inicio)} em ${event.cidade}, ${event.uf}`;
  const eventLink = (event: EventRecord) => `/event/${event.id}`;
  const hiringLink = (event: EventRecord) => `/event/${event.id}/hiring`;

  return {
    async hiringConfirmed(eventId: string, cache: number): Promise<void> {
      const event = await events.findEvent(eventId).catch(() => null);
      if (!event) return;
      const others = (await events.listCandidates(eventId).catch(() => [] as CandidateRecord[])).filter((c) => c.musicianId !== event.musicoContratadoId);
      await Promise.all([
        notify(
          event.musicoContratadoId,
          `Você foi contratado para "${event.titulo}"`,
          `O contratante aprovou sua inscrição e pagou o cachê de ${formatCurrency(cache)}, que fica retido até a conclusão do show (${when(event)}). O endereço e o telefone do contratante já estão no comprovante.`,
          hiringLink(event),
        ),
        notify(
          event.contractorId,
          `Pagamento confirmado: "${event.titulo}"`,
          `Recebemos seu pagamento e o músico foi avisado. O show está marcado para ${when(event)}. O cachê fica retido até as duas partes confirmarem a realização.`,
          hiringLink(event),
        ),
        ...others.map((candidate) => notify(
          candidate.musicianId,
          `Outro músico foi escolhido para "${event.titulo}"`,
          "O contratante fechou com outro músico. Obrigado pelo interesse; novos eventos aparecem no seu início.",
          eventLink(event),
          { email: false },
        )),
      ]);
    },

    async hiringCancelled(event: EventRecord, cancelledBy: "contratante" | "musico", refunded: boolean): Promise<void> {
      if (cancelledBy === "musico") {
        await notify(
          event.contractorId,
          `O músico desistiu de "${event.titulo}"`,
          `O músico contratado cancelou a participação no show de ${when(event)}. O valor pago foi devolvido integralmente e o evento voltou a receber inscrições.`,
          eventLink(event),
        );
        return;
      }
      await notify(
        event.musicoContratadoId,
        `Contratação cancelada: "${event.titulo}"`,
        refunded
          ? `O contratante cancelou o show de ${when(event)} com mais de 24 horas de antecedência. O valor foi devolvido a ele.`
          : `O contratante cancelou o show de ${when(event)} com menos de 24 horas de antecedência. Como compensação, o cachê será repassado para a sua chave Pix.`,
        hiringLink(event),
      );
    },

    async noShowReported(event: EventRecord): Promise<void> {
      await notify(
        event.musicoContratadoId,
        `Não comparecimento registrado: "${event.titulo}"`,
        `O contratante registrou que você não compareceu ao show de ${when(event)}. O valor foi devolvido a ele.`,
        hiringLink(event),
      );
    },

    async newApplication(event: EventRecord, valorProposto: number | null): Promise<void> {
      await notify(
        event.contractorId,
        `Nova inscrição em "${event.titulo}"`,
        valorProposto === null
          ? `Um músico se inscreveu aceitando o cachê de ${formatCurrency(event.cache)}.`
          : `Um músico se inscreveu propondo um cachê de ${formatCurrency(valorProposto)}.`,
        eventLink(event),
        { email: false },
      );
    },

    async newMessage(event: EventRecord, candidate: CandidateRecord, authorId: string): Promise<void> {
      const recipient = authorId === candidate.musicianId ? event.contractorId : candidate.musicianId;
      await notify(recipient, `Nova mensagem sobre "${event.titulo}"`, "Abra a conversa para responder.", `/conversa/${candidate.id}`, { email: false });
    },

    async candidateDeclined(event: EventRecord, musicianId: string): Promise<void> {
      await notify(
        musicianId,
        `Inscrição não selecionada: "${event.titulo}"`,
        "O contratante decidiu seguir com outros músicos para este evento.",
        eventLink(event),
        { email: false },
      );
    },

    async eventUpdated(event: EventRecord, musicianIds: string[]): Promise<void> {
      await Promise.all(musicianIds.map((musicianId) => notify(
        musicianId,
        `"${event.titulo}" foi alterado`,
        `O contratante mudou os dados do evento. Confira data, local e cachê: agora é ${when(event)}, com cachê oferecido de ${formatCurrency(event.cache)}.`,
        eventLink(event),
        { email: false },
      )));
    },

    async completionConfirmed(event: EventRecord, by: "contratante" | "musico"): Promise<void> {
      await notify(
        by === "contratante" ? event.musicoContratadoId : event.contractorId,
        `Show confirmado pela outra parte: "${event.titulo}"`,
        "Confirme você também para concluir a contratação. Sem a sua confirmação, o show é dado como realizado 7 dias após a data.",
        hiringLink(event),
      );
    },

    async payoutDone(event: EventRecord): Promise<void> {
      await notify(event.musicoContratadoId, `Cachê repassado: "${event.titulo}"`, "A transferência para a sua chave Pix foi concluída.", hiringLink(event));
    },
  };
}

export type Notifier = ReturnType<typeof createNotifier>;
