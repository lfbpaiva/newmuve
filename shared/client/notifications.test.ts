import { describe, expect, it, vi } from "vitest";
import { aplicarLeitura, type AppNotification } from "./notifications.ts";

vi.mock("./config.ts", () => ({
  clientConfig: () => ({ apiUrl: "/api" }),
  supabase: () => ({}),
}));

const notificacao = (id: string, lida: boolean): AppNotification => ({ id, titulo: `Título ${id}`, texto: "Texto", link: null, lida, createdAt: "2026-11-16T12:00:00Z" });

describe("aplicarLeitura", () => {
  it("marca como lidas só as notificações confirmadas pelo servidor", () => {
    const lista = [notificacao("n1", false), notificacao("n2", false), notificacao("n3", true)];

    expect(aplicarLeitura(lista, new Set(["n1"])).map((n) => [n.id, n.lida])).toEqual([["n1", true], ["n2", false], ["n3", true]]);
  });

  it("sem confirmação mantém a lista como veio do banco", () => {
    const lista = [notificacao("n1", false), notificacao("n2", true)];

    expect(aplicarLeitura(lista, new Set())).toEqual(lista);
  });

  it("não altera a lista original", () => {
    const lista = [notificacao("n1", false)];

    aplicarLeitura(lista, new Set(["n1"]));

    expect(lista[0].lida).toBe(false);
  });
});
