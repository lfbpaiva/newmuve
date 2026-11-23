import { describe, expect, it } from "vitest";
import { createNotifier, TEXTO_MAXIMO, TITULO_MAXIMO, type PushGateway } from "./notifications.ts";
import { memoryWorld } from "./testing.ts";

describe("notificação com o app fechado", () => {
  it("cada aviso do app também vai por push para os aparelhos do usuário, com o link da tela", async () => {
    const world = memoryWorld();
    const enviados: { userId: string; titulo: string; link: string | null }[] = [];
    const push: PushGateway = {
      register: async () => {},
      unregister: async () => {},
      send: async (userId, message) => void enviados.push({ userId, titulo: message.titulo, link: message.link }),
    };
    const notifier = createNotifier({ ...world.stores, appUrl: "http://localhost:8081", push });
    const event = world.seedEvent();

    await notifier.candidateDeclined(event, "m1");

    expect(enviados).toEqual([{ userId: "m1", titulo: expect.stringContaining("não selecionada"), link: `/event/${event.id}` }]);
    expect(world.notifications).toHaveLength(1);
  });

  it("falha no push não impede o aviso dentro do app", async () => {
    const world = memoryWorld();
    const push: PushGateway = { register: async () => {}, unregister: async () => {}, send: async () => { throw new Error("fora do ar"); } };
    const notifier = createNotifier({ ...world.stores, appUrl: "http://localhost:8081", push });
    const original = console.error;
    console.error = () => {};

    await notifier.candidateDeclined(world.seedEvent(), "m1");

    console.error = original;
    expect(world.notifications).toHaveLength(1);
  });
});

describe("aviso de penalidade", () => {
  it("explica os 15 dias sem feed e sem novas inscrições, inclusive por convite e com o Pro, sem cancelar inscrições existentes", async () => {
    const world = memoryWorld();
    const notifier = createNotifier({ ...world.stores, appUrl: "http://localhost:8081" });
    const event = world.seedEvent({ titulo: "Noite de rock" });

    await notifier.penaltyApplied(event, "m1", 100, new Date("2030-06-25T12:00:00Z"));
    await notifier.penaltyApplied(event, "m1", 0, new Date("2030-06-25T12:00:00Z"));

    const [ausencia, desistencia] = world.notifications;
    expect(ausencia.titulo).toBe("Multa por ausência: \"Noite de rock\"");
    expect(ausencia.texto).toContain("multa de R$ 100,00");
    expect(desistencia.titulo).toBe("Desistência em cima da hora: \"Noite de rock\"");
    expect(desistencia.texto).not.toContain("multa");
    for (const aviso of [ausencia, desistencia]) {
      expect(aviso.texto).toContain("A penalidade é de 15 dias: até 25/06/2030");
      expect(aviso.texto).toContain("não verá novos eventos no feed e não poderá fazer novas inscrições, nem por convite, mesmo com o Muve Pro");
      expect(aviso.texto).toContain("As inscrições que você já fez continuam valendo");
      expect(aviso.texto).not.toMatch(/cancelad/i);
    }
  });
});

describe("tamanho do aviso", () => {
  it("corta título e texto longos para caberem na caixa de entrada, em vez de perder o aviso", async () => {
    const world = memoryWorld();
    const notifier = createNotifier({ ...world.stores, appUrl: "http://localhost:8081" });

    await notifier.candidateDeclined(world.seedEvent({ titulo: "Show ".repeat(200) }), "m1");

    const [aviso] = world.notifications;
    expect(aviso.titulo.length).toBeLessThanOrEqual(TITULO_MAXIMO);
    expect(aviso.texto.length).toBeLessThanOrEqual(TEXTO_MAXIMO);
    expect(`${aviso.titulo}${aviso.texto}`).toContain("…");
  });
});
