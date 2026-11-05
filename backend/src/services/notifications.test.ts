import { describe, expect, it } from "vitest";
import { createNotifier, type PushGateway } from "./notifications.ts";
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
