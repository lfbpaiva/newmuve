import { describe, expect, it, vi } from "vitest";
import { aplicarNovaProposta, mesclarMensagens, mostraEstimativaParaContratante, situacaoDaConversa, type Message } from "./conversation.ts";

vi.mock("./config.ts", () => ({
  clientConfig: () => ({ apiUrl: "/api" }),
  supabase: () => ({}),
}));

const proposta = (id: string, statusProposta: Message["statusProposta"], createdAt: string, candidateId = "c1"): Message => ({
  id, candidateId, authorId: "u1", texto: "Proposta", tipo: "PROPOSTA", valor: 500, statusProposta, createdAt,
});

describe("aplicarNovaProposta", () => {
  it("mostra a anterior como substituída assim que a nova proposta é confirmada", () => {
    const antiga = proposta("p1", "ABERTA", "2026-11-16T10:00:00Z");
    const nova = proposta("p2", "ABERTA", "2026-11-16T10:05:00Z");

    expect(aplicarNovaProposta([antiga], nova).map((m) => [m.id, m.statusProposta])).toEqual([["p1", "SUBSTITUIDA"], ["p2", "ABERTA"]]);
  });

  it("não mexe em propostas já respondidas nem em outras conversas", () => {
    const aceita = proposta("p1", "ACEITA", "2026-11-16T09:00:00Z");
    const outraConversa = proposta("p9", "ABERTA", "2026-11-16T09:30:00Z", "c2");
    const nova = proposta("p2", "ABERTA", "2026-11-16T10:05:00Z");

    expect(aplicarNovaProposta([aceita, outraConversa], nova).map((m) => [m.id, m.statusProposta])).toEqual([["p1", "ACEITA"], ["p9", "ABERTA"], ["p2", "ABERTA"]]);
  });

  it("uma leitura atrasada do banco não volta a mostrar a proposta substituída como aberta", () => {
    const atuais = aplicarNovaProposta([proposta("p1", "ABERTA", "2026-11-16T10:00:00Z")], proposta("p2", "ABERTA", "2026-11-16T10:05:00Z"));
    const leituraAntiga = [proposta("p1", "ABERTA", "2026-11-16T10:00:00Z")];

    expect(mesclarMensagens(atuais, leituraAntiga).find((m) => m.id === "p1")?.statusProposta).toBe("SUBSTITUIDA");
  });
});

describe("mesclarMensagens", () => {
  it("ordena por data e aceita a atualização que responde a proposta", () => {
    const aberta = proposta("p1", "ABERTA", "2026-11-16T10:00:00Z");
    const texto: Message = { id: "t1", candidateId: "c1", authorId: "u2", texto: "Oi", tipo: "TEXTO", valor: null, statusProposta: null, createdAt: "2026-11-16T09:00:00Z" };

    expect(mesclarMensagens([aberta], [texto, { ...aberta, statusProposta: "RECUSADA" }]).map((m) => [m.id, m.statusProposta])).toEqual([["t1", null], ["p1", "RECUSADA"]]);
  });
});

describe("mostraEstimativaParaContratante", () => {
  const base = { souContratante: true, inscricao: "PENDENTE" as const, evento: "ABERTO" as const, eventoEncerrado: false };

  it("mostra o total da inscrição atual e o total condicional da contraproposta aberta", () => {
    expect(mostraEstimativaParaContratante(base)).toBe(true);
    expect(mostraEstimativaParaContratante({ ...base, statusProposta: "ABERTA" })).toBe(true);
  });

  it("não repete o total em propostas aceitas, substituídas ou recusadas: o valor atual fica só no topo", () => {
    expect(mostraEstimativaParaContratante({ ...base, statusProposta: "ACEITA" })).toBe(false);
    expect(mostraEstimativaParaContratante({ ...base, statusProposta: "SUBSTITUIDA" })).toBe(false);
    expect(mostraEstimativaParaContratante({ ...base, statusProposta: "RECUSADA" })).toBe(false);
  });

  it("o músico nunca vê a estimativa da cobrança", () => {
    expect(mostraEstimativaParaContratante({ ...base, souContratante: false })).toBe(false);
    expect(mostraEstimativaParaContratante({ ...base, souContratante: false, statusProposta: "ABERTA" })).toBe(false);
  });

  it("depois da contratação, da recusa ou com o evento fechado deixa de ser estimativa e não aparece", () => {
    expect(mostraEstimativaParaContratante({ ...base, inscricao: "APROVADO" })).toBe(false);
    expect(mostraEstimativaParaContratante({ ...base, inscricao: "RECUSADO" })).toBe(false);
    expect(mostraEstimativaParaContratante({ ...base, evento: "CONTRATADO" })).toBe(false);
    expect(mostraEstimativaParaContratante({ ...base, evento: "CANCELADO" })).toBe(false);
  });
});

describe("evento encerrado na conversa", () => {
  const agora = new Date("2026-11-17T20:00:00Z");
  const depois = "2026-11-20T20:00:00Z";
  const antes = "2026-11-17T19:00:00Z";

  it("evento aberto que ainda não começou: conversa aberta e negociação liberada", () => {
    expect(situacaoDaConversa({ inscricao: "PENDENTE", evento: "ABERTO", inicio: depois, agora })).toEqual({ encerrado: false, aberta: true, negociavel: true });
  });

  it("evento aberto que já começou fica encerrado: sem mensagens e sem propostas, como no servidor", () => {
    expect(situacaoDaConversa({ inscricao: "PENDENTE", evento: "ABERTO", inicio: antes, agora })).toEqual({ encerrado: true, aberta: false, negociavel: false });
    expect(situacaoDaConversa({ inscricao: "PENDENTE", evento: "ABERTO", inicio: agora.toISOString(), agora }).encerrado).toBe(true);
  });

  it("evento contratado continua com conversa mesmo depois do início, sem negociação", () => {
    expect(situacaoDaConversa({ inscricao: "APROVADO", evento: "CONTRATADO", inicio: antes, agora })).toEqual({ encerrado: false, aberta: true, negociavel: false });
  });

  it("inscrição recusada ou evento cancelado ou concluído encerram a conversa", () => {
    expect(situacaoDaConversa({ inscricao: "RECUSADO", evento: "ABERTO", inicio: depois, agora }).aberta).toBe(false);
    expect(situacaoDaConversa({ inscricao: "APROVADO", evento: "CANCELADO", inicio: depois, agora }).aberta).toBe(false);
    expect(situacaoDaConversa({ inscricao: "APROVADO", evento: "CONCLUIDO", inicio: antes, agora }).aberta).toBe(false);
  });

  it("estimativa do contratante some em evento encerrado, no topo e nas propostas abertas", () => {
    const base = { souContratante: true, inscricao: "PENDENTE" as const, evento: "ABERTO" as const, eventoEncerrado: true };
    expect(mostraEstimativaParaContratante(base)).toBe(false);
    expect(mostraEstimativaParaContratante({ ...base, statusProposta: "ABERTA" })).toBe(false);
  });
});
