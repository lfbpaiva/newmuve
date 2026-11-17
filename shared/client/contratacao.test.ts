import { describe, expect, it } from "vitest";
import { acaoDeContestacao, avisoDoEstorno, confirmacaoDaParte, etapasDaContratacao, historicoDaContestacao, motivoDaConfirmacaoSuspensa, situacaoDoCache, tempoAteOShow } from "./contratacao.ts";
import type { Hiring } from "./events.ts";

const AGORA = new Date("2026-11-20T12:00:00Z");

function contratacao(mudancas: { evento?: Partial<Hiring["evento"]>; pagamento?: Partial<NonNullable<Hiring["pagamento"]>> | null; contestacao?: Hiring["contestacao"]; contestacaoResolvida?: Hiring["contestacaoResolvida"]; papel?: Hiring["papel"]; podeContestar?: boolean } = {}): Hiring {
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
    contestacaoResolvida: mudancas.contestacaoResolvida ?? null,
    podeContestar: mudancas.podeContestar ?? false,
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

  it("marca o repasse em processamento e a falha com orientação ao suporte", () => {
    const concluido = { inicio: "2026-11-19T23:00:00Z", status: "CONCLUIDO" as const };
    expect(situacoes(contratacao({ evento: concluido, pagamento: { repasseStatus: "PROCESSANDO" } }))[3]).toBe("atual");
    const falha = etapasDaContratacao(contratacao({ evento: concluido, pagamento: { repasseStatus: "FALHOU" } }), AGORA)[3];
    expect(falha).toMatchObject({ situacao: "problema", detalhe: "O Pix falhou. Fale com o suporte da Muve" });
  });

  it("suspende o repasse durante uma contestação", () => {
    const etapa = etapasDaContratacao(contratacao({ contestacao: { motivo: "Não apareceu", abertaPorMim: true, status: "ABERTA" } }), AGORA)[3];
    expect(etapa).toMatchObject({ situacao: "problema", detalhe: "Suspenso enquanto o suporte analisa a contestação" });
  });

  it("com a devolução decidida, não diz que o suporte ainda analisa nem que o estorno foi concluído", () => {
    const etapa = etapasDaContratacao(contratacao({ contestacao: { motivo: "Não apareceu", abertaPorMim: false, status: "AGUARDANDO_ESTORNO" } }), AGORA)[3];
    expect(etapa.situacao).toBe("problema");
    expect(etapa.detalhe).toContain("aguarda confirmação");
    expect(etapa.detalhe).not.toContain("analisa");
    expect(etapa.detalhe).not.toMatch(/conclu|devolvido/);
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

describe("situacaoDoCache", () => {
  it("explica onde está o cachê em cada momento", () => {
    expect(situacaoDoCache(contratacao({ pagamento: null }))).toContain("assim que o contratante pagar");
    expect(situacaoDoCache(contratacao())).toContain("guarda o cachê");
    expect(situacaoDoCache(contratacao({ pagamento: { repasseStatus: "PROCESSANDO" } }))).toContain("está repassando");
    expect(situacaoDoCache(contratacao({ pagamento: { repasseStatus: "REPASSADO" } }))).toContain("repassou");
    expect(situacaoDoCache(contratacao({ pagamento: { repasseStatus: "FALHOU" } }))).toContain("Fale com o suporte");
    expect(situacaoDoCache(contratacao({ pagamento: { status: "ESTORNADO" } }))).toContain("devolvido");
  });
});

describe("confirmação do show na tela da contratação", () => {
  const depoisDoShow = new Date("2026-11-24T02:00:00Z");
  const aberta = { motivo: "O músico não apareceu.", abertaPorMim: true, status: "ABERTA" as const };
  const aguardando = { ...aberta, status: "AGUARDANDO_ESTORNO" as const };

  it("depois do show, sem contestação, a própria parte pode confirmar e a outra aparece aguardando", () => {
    const hiring = contratacao();
    expect(confirmacaoDaParte(hiring, "contratante", depoisDoShow)).toEqual({ situacao: "disponivel", texto: "Confirmar" });
    expect(confirmacaoDaParte(hiring, "musico", depoisDoShow)).toEqual({ situacao: "aguardando-outra-parte", texto: "Aguardando" });
    expect(motivoDaConfirmacaoSuspensa(hiring)).toBeNull();
  });

  it("antes do show, o botão não aparece", () => {
    expect(confirmacaoDaParte(contratacao(), "contratante", AGORA)).toEqual({ situacao: "indisponivel", texto: "Após o início" });
  });

  it.each([aberta, aguardando])("com contestação %s, a confirmação fica suspensa e o motivo é explicado", (contestacao) => {
    const hiring = contratacao({ contestacao });
    expect(confirmacaoDaParte(hiring, "contratante", depoisDoShow)).toEqual({ situacao: "indisponivel", texto: "Suspensa" });
    expect(motivoDaConfirmacaoSuspensa(hiring)).toContain("contestação");
    expect(etapasDaContratacao(hiring, depoisDoShow)[2]).toMatchObject({ situacao: "problema", detalhe: expect.stringContaining("contestação") });
  });

  it("com estorno em andamento, a confirmação fica suspensa pelo estorno", () => {
    const hiring = contratacao({ pagamento: { refundStatus: "PROCESSANDO" } });
    expect(confirmacaoDaParte(hiring, "contratante", depoisDoShow).situacao).toBe("indisponivel");
    expect(motivoDaConfirmacaoSuspensa(hiring)).toContain("estorno");
  });

  it("a parte que já confirmou aparece confirmada", () => {
    const hiring = contratacao({ evento: { confirmacaoContratante: true } });
    expect(confirmacaoDaParte(hiring, "contratante", depoisDoShow)).toEqual({ situacao: "confirmada", texto: "Confirmado" });
  });
});

describe("aviso do estorno", () => {
  it("sem estorno, não há aviso", () => {
    expect(avisoDoEstorno(contratacao())).toBeNull();
  });

  it("estorno negado sem contestação continua permitindo confirmar ou cancelar", () => {
    expect(avisoDoEstorno(contratacao({ pagamento: { refundStatus: "NEGADO" } }))).toMatchObject({ tom: "error", texto: expect.stringContaining("pode ser confirmada ou cancelada") });
  });

  it("estorno negado com contestação não diz que a contratação pode ser confirmada", () => {
    const aviso = avisoDoEstorno(contratacao({ pagamento: { refundStatus: "NEGADO" }, contestacao: { motivo: "x".repeat(10), abertaPorMim: false, status: "ABERTA" } }));
    expect(aviso?.texto).toContain("contestação continua com o suporte");
    expect(aviso?.texto).not.toContain("pode ser confirmada");
  });

  it("estorno da decisão do suporte em processamento é identificado", () => {
    const aviso = avisoDoEstorno(contratacao({ pagamento: { refundStatus: "PROCESSANDO" }, contestacao: { motivo: "x".repeat(10), abertaPorMim: true, status: "AGUARDANDO_ESTORNO" } }));
    expect(aviso).toMatchObject({ tom: "info", texto: expect.stringContaining("decidido pelo suporte") });
  });
});

describe("histórico da contestação na tela", () => {
  const devolvida = { status: "RESOLVIDA" as const, decisao: "DEVOLVER_CONTRATANTE" as const, resolvidaEm: "2026-11-21T15:30:00Z" };
  const paga = { status: "RESOLVIDA" as const, decisao: "PAGAR_MUSICO" as const, resolvidaEm: "2026-11-21T15:30:00Z" };

  it("sem contestação não mostra histórico", () => {
    expect(historicoDaContestacao(contratacao())).toBeNull();
  });

  it.each(["ABERTA", "AGUARDANDO_ESTORNO"] as const)("contestação %s continua pendente e não vira histórico", (status) => {
    const pendente = contratacao({ contestacao: { motivo: "x".repeat(10), abertaPorMim: true, status }, contestacaoResolvida: devolvida });
    expect(historicoDaContestacao(pendente)).toBeNull();
    expect(confirmacaoDaParte(pendente, "contratante", new Date("2026-11-24T12:00:00Z"))).toEqual({ situacao: "indisponivel", texto: "Suspensa" });
  });

  it("resolvida por devolução mostra o resultado, a data e que não há pendência", () => {
    const historico = historicoDaContestacao(contratacao({ pagamento: { status: "ESTORNADO", refundStatus: "CONFIRMADO" }, contestacaoResolvida: devolvida }));
    expect(historico).toMatchObject({ titulo: "Contestação encerrada", resultado: "Resultado: o valor foi devolvido ao contratante." });
    expect(historico?.data).toMatch(new RegExp("^Encerrada em [0-9]{2}/[0-9]{2}/2026 às [0-9]{2}:[0-9]{2}$"));
    expect(historico?.aviso).toContain("decisão já tomada");
  });

  it("resolvida com repasse ao músico mostra a decisão do suporte", () => {
    expect(historicoDaContestacao(contratacao({ contestacaoResolvida: paga }))?.resultado).toBe("Decisão do suporte: o cachê vai para o músico.");
  });

  it("sem data registrada, mostra o resultado sem inventar uma data", () => {
    expect(historicoDaContestacao(contratacao({ contestacaoResolvida: { ...paga, resolvidaEm: null } }))?.data).toBeNull();
  });

  it("o histórico não reabre a confirmação nem a contestação: as ações seguem o estado atual", () => {
    const encerrada = contratacao({ evento: { status: "CONCLUIDO", confirmacaoMusico: true, confirmacaoContratante: true }, contestacaoResolvida: paga });
    expect(encerrada.podeContestar).toBe(false);
    expect(confirmacaoDaParte(encerrada, "contratante", new Date("2026-11-24T12:00:00Z")).situacao).toBe("confirmada");
    expect(motivoDaConfirmacaoSuspensa(encerrada)).toBeNull();
  });
});
describe("ação de contestar na tela", () => {
  const paga = { status: "RESOLVIDA" as const, decisao: "PAGAR_MUSICO" as const, resolvidaEm: "2026-11-21T15:30:00Z" };
  const repasseFalhou = { evento: { status: "CONCLUIDO" as const, confirmacaoMusico: true, confirmacaoContratante: true }, pagamento: { repasseStatus: "FALHOU" as const } };

  it("com histórico resolvido e contestação permitida, oferece abrir uma nova contestação sem desfazer a anterior", () => {
    const hiring = contratacao({ ...repasseFalhou, contestacaoResolvida: paga, podeContestar: true });
    const acao = acaoDeContestacao(hiring);

    expect(historicoDaContestacao(hiring)?.resultado).toBe("Decisão do suporte: o cachê vai para o músico.");
    expect(acao?.botao).toBe("Abrir nova contestação");
    expect(acao?.explicacao).toContain("A decisão anterior continua registrada e não muda");
    expect(acao?.explicacao).toContain("independente da anterior");
    expect(acao?.explicacao).not.toMatch(new RegExp("reabr|revert|anul|cancel", "i"));
  });

  it("sem histórico, mantém o texto atual e nenhuma explicação extra", () => {
    const acao = acaoDeContestacao(contratacao({ ...repasseFalhou, podeContestar: true }));

    expect(acao).toEqual({ botao: "Contestar o que aconteceu", explicacao: null });
  });

  it("com uma contestação pendente, o histórico não aparece e o texto de nova contestação não é usado", () => {
    const pendente = contratacao({ contestacao: { motivo: "x".repeat(10), abertaPorMim: true, status: "ABERTA" }, contestacaoResolvida: paga, podeContestar: true });

    expect(acaoDeContestacao(pendente)?.botao).toBe("Contestar o que aconteceu");
  });

  it.each([
    ["sem histórico", null],
    ["com histórico", paga],
  ] as const)("a elegibilidade continua vindo da API: sem permissão não há ação, %s", (_, contestacaoResolvida) => {
    expect(acaoDeContestacao(contratacao({ ...repasseFalhou, contestacaoResolvida, podeContestar: false }))).toBeNull();
  });
});
