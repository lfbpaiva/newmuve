import { describe, expect, it } from "vitest";
import { chaveDaAbertura, criarRegistroDeAberturas, destinoDaNotificacao } from "./notificacaoLink.ts";

const ID = "3f2c1a9e-5b7d-4c8a-9e1f-0a2b3c4d5e6f";

describe("destino de uma notificação", () => {
  it.each([`/event/${ID}`, `/event/${ID}/hiring`, `/conversa/${ID}`, "/pro", "/casa", "/notificacoes"])("aceita %s", (link) => {
    expect(destinoDaNotificacao(link)).toBe(link);
  });

  it.each([
    null,
    undefined,
    42,
    "",
    "event/abc",
    "/event/",
    "/event/nao-e-um-id",
    `/event/${ID}/checkout`,
    `/event/${ID}/edit`,
    "https://exemplo.com/event/1",
    "//exemplo.com",
    "/admin",
    `/conversa/${ID}/extra`,
  ])("recusa %s", (link) => {
    expect(destinoDaNotificacao(link)).toBeNull();
  });
});

describe("abertura de notificações", () => {
  const resposta = (identifier: string, actionIdentifier = "expo.modules.notifications.actions.DEFAULT") => ({ actionIdentifier, notification: { request: { identifier } } });

  it("a mesma notificação entregue pelo listener e pela última resposta abre uma vez só", () => {
    const primeira = criarRegistroDeAberturas();
    const chave = chaveDaAbertura(resposta("n1"));

    expect(primeira(chave)).toBe(true);
    expect(primeira(chave)).toBe(false);
    expect(primeira(chaveDaAbertura(resposta("n2")))).toBe(true);
  });

  it("o registro guarda um limite de aberturas e esquece as mais antigas", () => {
    const primeira = criarRegistroDeAberturas(2);
    primeira("a");
    primeira("b");
    primeira("c");

    expect(primeira("c")).toBe(false);
    expect(primeira("a")).toBe(true);
  });
});
