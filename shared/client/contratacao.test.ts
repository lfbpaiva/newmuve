import { describe, expect, it } from "vitest";
import { etapasDaContratacao, tempoAteOShow } from "./contratacao.ts";
import type { Hiring } from "./events.ts";

const AGORA = new Date("2026-11-20T12:00:00Z");

function contratacao(mudancas: { evento?: Partial<Hiring["evento"]>; pagamento?: Partial<NonNullable<Hiring["pagamento"]>> | null; contestacao?: Hiring["contestacao"]; papel?: Hiring["papel"] } = {}): Hiring {
  return {
    papel: mudancas.papel ?? "contratante",
    evento: {
      id: "e1",
      titulo: "Noite de MPB",
      tipoEvento: "Bar",
      inicio: "2026-11-23T23:00:00Z",
      duracaoMinutos: 120,
      cidade: "São Paulo",
      uf: "SP",
      endereco: "Rua A, 1",
      estilosMusicais: ["MPB"],
      formacao: "Solo",
      somDisponivel: true,
      status: "CONTRATADO",
      confirmacaoMusico: false,
      confirmacaoContratante: false,
      ...mudancas.evento,
    },
    contratante: null,
    musico: null,
    pagamento: mudancas.pagamento === null ? null : { cache: 500, comissao: 50, total: 550, status: "PAGO", repasseStatus: "RETIDO", refundStatus: null, multaDescontada: 0, ...mudancas.pagamento },
    avaliou: false,
    contestacao: mudancas.contestacao ?? null,
    podeContestar: false,
    naoComparecimento: { permitido: false },
    cancelamento: { permitido: true, reembolso: true },
  };
}

const situacoes = (hiring: Hiring) => etapasDaContratacao(hiring, AGORA).map((etapa) => etapa.situacao);

describe("etapasDaContratacao", () => {
  it("mostra o cachê garantido e o show como etapa atual antes da data", () => {
    const etapas = etapasDaContratacao(contratacao(), AGORA);
    expect(etapas.map((etapa) => etapa.situacao)).toEqual(["feita", "atual", "pendente", "pendente"]);
    expect(etapas[0].detalhe).toContain("550,00");
    expect(etapas[1].detalhe).toContain("Faltam 3 dias");
  });

  it("mostra ao músico o valor do cachê, sem a taxa", () => {
    expect(etapasDaContratacao(contratacao({ papel: "musico" }), AGORA)[0].detalhe).toContain("500,00");
  });

  it("depois do show, espera a confirmação das duas partes", () => {
    const etapas = etapasDaContratacao(contratacao({ evento: { inicio: "2026-11-19T23:00:00Z", confirmacaoContratante: true } }), AGORA);
    expect(etapas.map((etapa) => etapa.situacao)).toEqual(["feita", "feita", "atual", "pendente"]);
    expect(etapas[2].detalhe).toContain("Contratante confirmou · músico aguardando");
  });

  it("conclui todas as etapas quando o cachê é repassado", () => {
    expect(situacoes(contratacao({ evento: { inicio: "2026-11-19T23:00:00Z", status: "CONCLUIDO" }, pagamento: { repasseStatus: "REPASSADO" } }))).toEqual(["feita", "feita", "feita", "feita"]);
  });

  it("marca o repasse em processamento e a falha com nova tentativa", () => {
    const concluido = { inicio: "2026-11-19T23:00:00Z", status: "CONCLUIDO" as const };
    expect(situacoes(contratacao({ evento: concluido, pagamento: { repasseStatus: "PROCESSANDO" } }))[3]).toBe("atual");
    const falha = etapasDaContratacao(contratacao({ evento: concluido, pagamento: { repasseStatus: "FALHOU" } }), AGORA)[3];
    expect(falha).toMatchObject({ situacao: "problema", detalhe: expect.stringContaining("automaticamente") });
  });

  it("suspende o repasse durante uma contestação", () => {
    expect(etapasDaContratacao(contratacao({ contestacao: { motivo: "Não apareceu", abertaPorMim: true } }), AGORA)[3].situacao).toBe("problema");
  });

  it("suspende a confirmação enquanto o estorno é processado", () => {
    const etapas = etapasDaContratacao(contratacao({ evento: { inicio: "2026-11-19T23:00:00Z" }, pagamento: { refundStatus: "PROCESSANDO" } }), AGORA);
    expect(etapas[2]).toMatchObject({ situacao: "problema", detalhe: expect.stringContaining("estorno") });
  });

  it("encerra a linha do tempo quando o pagamento é estornado", () => {
    const etapas = etapasDaContratacao(contratacao({ evento: { status: "CANCELADO" }, pagamento: { status: "ESTORNADO" } }), AGORA);
    expect(etapas.map((etapa) => etapa.titulo)).toEqual(["Pagamento estornado", "Contratação encerrada"]);
  });

  it("aguarda o Pix quando ainda não há pagamento", () => {
    expect(situacoes(contratacao({ pagamento: null }))).toEqual(["atual", "pendente", "pendente", "pendente"]);
  });
});

describe("tempoAteOShow", () => {
  const em = (ms: number) => tempoAteOShow(new Date(AGORA.getTime() + ms), AGORA);
  const HORA = 60 * 60 * 1000;

  it("descreve o tempo restante em dias, horas ou instantes", () => {
    expect(em(30 * 60 * 1000)).toBe("Começa em instantes");
    expect(em(HORA)).toBe("Começa em 1 hora");
    expect(em(5 * HORA)).toBe("Começa em 5 horas");
    expect(em(30 * HORA)).toBe("Falta 1 dia");
    expect(em(80 * HORA)).toBe("Faltam 3 dias");
    expect(em(-HORA)).toBe("O show já começou");
  });
});
