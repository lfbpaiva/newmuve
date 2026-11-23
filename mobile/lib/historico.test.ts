import { describe, expect, it } from "vitest";
import { eventoEmAndamento, inscricaoEmAndamento, separarPorAndamento } from "./historico.ts";

const AGORA = new Date("2030-06-10T12:00:00Z").getTime();
const dia = (dias: number) => new Date(AGORA + dias * 24 * 60 * 60 * 1000).toISOString();

describe("histórico de eventos", () => {
  const eventos = [
    { id: "passado-antigo", status: "CONCLUIDO", inicio: dia(-30) },
    { id: "aberto-longe", status: "ABERTO", inicio: dia(20) },
    { id: "cancelado", status: "CANCELADO", inicio: dia(-2) },
    { id: "contratado-perto", status: "CONTRATADO", inicio: dia(3) },
    { id: "aberto-que-ja-comecou", status: "ABERTO", inicio: dia(-1) },
    { id: "contratado-em-andamento", status: "CONTRATADO", inicio: dia(-1) },
  ];

  it("em andamento vêm do próximo show para o mais distante; o histórico, do mais recente para o mais antigo", () => {
    const { andamento, historico } = separarPorAndamento(eventos, (e) => e.inicio, (e) => eventoEmAndamento(e, AGORA));

    expect(andamento.map((e) => e.id)).toEqual(["contratado-em-andamento", "contratado-perto", "aberto-longe"]);
    expect(historico.map((e) => e.id)).toEqual(["aberto-que-ja-comecou", "cancelado", "passado-antigo"]);
  });

  it("a inscrição continua em andamento enquanto aguarda resposta ou o show contratado não terminou", () => {
    const inscricao = (status: string, eventoStatus: string, inicio: string) => ({ status, event: { status: eventoStatus, inicio } });

    expect(inscricaoEmAndamento(inscricao("PENDENTE", "ABERTO", dia(5)), AGORA)).toBe(true);
    expect(inscricaoEmAndamento(inscricao("APROVADO", "CONTRATADO", dia(5)), AGORA)).toBe(true);
    expect(inscricaoEmAndamento(inscricao("RECUSADO", "ABERTO", dia(5)), AGORA)).toBe(false);
    expect(inscricaoEmAndamento(inscricao("PENDENTE", "ABERTO", dia(-1)), AGORA)).toBe(false);
    expect(inscricaoEmAndamento(inscricao("APROVADO", "CONCLUIDO", dia(-3)), AGORA)).toBe(false);
    expect(inscricaoEmAndamento(inscricao("PENDENTE", "CANCELADO", dia(5)), AGORA)).toBe(false);
  });
});
