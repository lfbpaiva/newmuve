import { beforeEach, describe, expect, it, vi } from "vitest";
import { candidaturaSchema, type EventInput } from "../domain/event.ts";
import { AppError } from "../domain/errors.ts";
import { createEventService } from "./eventService.ts";
import { createNotifier } from "./notifications.ts";
import { createPaymentService } from "./paymentService.ts";
import { createRotinaFinanceira } from "./rotinaFinanceira.ts";
import { contratante, hoursFromNow, memoryWorld, musico, NOW, outroContratante, outroMusico, payAtAsaas } from "./testing.ts";
import type { Hiring } from "../../../shared/client/events.ts";
import { historicoDaContestacao } from "../../../shared/client/contratacao.ts";
import { AUSENCIA_PRAZO_RESPOSTA_MS } from "../../../shared/dominio.ts";

function setup() {
  const world = memoryWorld();
  const notifier = createNotifier({ ...world.stores, appUrl: "http://localhost:8443" });
  const payments = createPaymentService({ ...world.stores, notifier });
  const service = createEventService({ ...world.stores, payments, notifier });
  const rotina = createRotinaFinanceira({ paymentStore: world.stores.payments, eventStore: world.stores.events, payments, events: service, trava: world.stores.trava });
  return { world, service, payments, rotina };
}

const banner = () => new File(["x"], "banner.png", { type: "image/png" });

const novoEvento: EventInput = {
  titulo: "Noite acústica",
  tipoEvento: "Bar e restaurante",
  inicio: hoursFromNow(48),
  duracaoMinutos: 180,
  uf: "PR",
  cidade: "Cascavel",
  endereco: "Av. Brasil, 1000 - Centro",
  estilosMusicais: ["MPB"],
  formacao: "Dupla",
  somDisponivel: true,
  cache: 350,
  descricao: "Voz e violão",
  repetirSemanas: 1,
};

let t: ReturnType<typeof setup>;
beforeEach(() => {
  t = setup();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

const depoisDoPrazoDeResposta = (quando: Date) => new Date(quando.getTime() + AUSENCIA_PRAZO_RESPOSTA_MS);

async function ausenciaSemResposta(eventId: string, quando: Date) {
  await t.service.reportNoShow(contratante, eventId, quando);
  return t.service.applyExpiredAbsence(eventId, depoisDoPrazoDeResposta(quando));
}

describe("criação de evento", () => {
  it("grava o evento do contratante com a imagem enviada", async () => {
    const event = await t.service.createEvent(contratante, novoEvento, banner(), NOW);

    expect(event).toMatchObject({ contractorId: "c1", status: "ABERTO", cache: 350 });
    expect(t.world.enderecos.get(event.id)).toBe("Av. Brasil, 1000 - Centro");
    expect(t.world.images.has(event.imagemUrl)).toBe(true);
  });

  it("só contratantes criam eventos", async () => {
    await expect(t.service.createEvent(musico, novoEvento, banner(), NOW)).rejects.toMatchObject({ status: 403 });
    expect(t.world.events.size).toBe(0);
  });

  it("recusa evento no passado e evento sem imagem", async () => {
    await expect(t.service.createEvent(contratante, { ...novoEvento, inicio: hoursFromNow(-1) }, banner(), NOW)).rejects.toMatchObject({
      code: "DATA_NO_PASSADO",
    });
    await expect(t.service.createEvent(contratante, novoEvento, null, NOW)).rejects.toMatchObject({ code: "IMAGEM_OBRIGATORIA" });
  });
});

describe("edição e exclusão", () => {
  it("o dono edita e exclui um evento aberto", async () => {
    const event = t.world.seedEvent();

    await t.service.updateEvent(contratante, event.id, { ...novoEvento, titulo: "Novo título" }, null, NOW);
    expect(t.world.events.get(event.id)?.titulo).toBe("Novo título");

    await t.service.deleteEvent(contratante, event.id, NOW);
    expect(t.world.events.has(event.id)).toBe(false);
  });

  it("outro contratante não enxerga o evento alheio", async () => {
    const event = t.world.seedEvent();

    await expect(t.service.updateEvent(outroContratante, event.id, novoEvento, null, NOW)).rejects.toMatchObject({ status: 404 });
    await expect(t.service.deleteEvent(outroContratante, event.id, NOW)).rejects.toMatchObject({ status: 404 });
    expect(t.world.events.has(event.id)).toBe(true);
  });

  it("evento com músico contratado fica bloqueado", async () => {
    const event = t.world.seedEvent({ status: "CONTRATADO", musicoContratadoId: "m1" });

    await expect(t.service.updateEvent(contratante, event.id, novoEvento, null, NOW)).rejects.toMatchObject({ code: "EVENTO_BLOQUEADO" });
    await expect(t.service.deleteEvent(contratante, event.id, NOW)).rejects.toMatchObject({ code: "EVENTO_BLOQUEADO" });
  });

  it("evento com pagamento em andamento não pode ser alterado", async () => {
    const event = t.world.seedEvent();
    const candidate = t.world.seedCandidate(event.id, "m1");
    await t.payments.startCheckout(contratante, event.id, candidate.id, NOW);

    await expect(t.service.deleteEvent(contratante, event.id, NOW)).rejects.toMatchObject({ code: "PAGAMENTO_EM_ANDAMENTO" });
  });
});

describe("candidatura", () => {
  it("músico compatível se inscreve uma única vez", async () => {
    const event = t.world.seedEvent();

    await t.service.apply(musico, event.id, null, NOW);
    await expect(t.service.apply(musico, event.id, null, NOW)).rejects.toMatchObject({ code: "JA_INSCRITO" });
    expect(t.world.candidates.size).toBe(1);
  });

  it("aceita cidade vizinha dentro do raio máximo e recusa o que está além dele", async () => {
    const vizinha = t.world.seedEvent({ cidade: "Toledo" });
    const noRaio = t.world.seedEvent({ cidade: "Foz do Iguacu" });
    const longe = t.world.seedEvent({ cidade: "Londrina" });
    const desconhecida = t.world.seedEvent({ cidade: "Cidade Inexistente" });

    await expect(t.service.apply(musico, vizinha.id, null, NOW)).resolves.toBeUndefined();
    await expect(t.service.apply(musico, noRaio.id, null, NOW)).resolves.toBeUndefined();
    await expect(t.service.apply(musico, longe.id, null, NOW)).rejects.toMatchObject({ code: "EVENTO_INCOMPATIVEL" });
    await expect(t.service.apply(musico, desconhecida.id, null, NOW)).rejects.toMatchObject({ code: "EVENTO_INCOMPATIVEL" });
  });

  it("recusa contratante e evento de estilo fora do perfil", async () => {
    const outroEstilo = t.world.seedEvent({ estilosMusicais: ["Pagode"] });
    const compativel = t.world.seedEvent();

    await expect(t.service.apply(contratante, compativel.id, null, NOW)).rejects.toMatchObject({ status: 403 });
    await expect(t.service.apply(musico, outroEstilo.id, null, NOW)).rejects.toMatchObject({ code: "EVENTO_INCOMPATIVEL" });
  });

  it("aceita a mesma cidade escrita com caixa e acentuação diferentes", async () => {
    t.world.accounts.get("m1")!.cidade = "São José dos Pinhais";
    const event = t.world.seedEvent({ cidade: "SAO JOSE DOS PINHAIS" });

    await expect(t.service.apply(musico, event.id, null, NOW)).resolves.toBeUndefined();
  });

  it("recusa evento já contratado ou já iniciado", async () => {
    const contratado = t.world.seedEvent({ status: "CONTRATADO", musicoContratadoId: "m2" });
    const iniciado = t.world.seedEvent({ inicio: hoursFromNow(-1) });

    await expect(t.service.apply(musico, contratado.id, null, NOW)).rejects.toMatchObject({ code: "INSCRICOES_ENCERRADAS" });
    await expect(t.service.apply(musico, iniciado.id, null, NOW)).rejects.toMatchObject({ code: "INSCRICOES_ENCERRADAS" });
  });
});

describe("proposta de cachê", () => {
  it("guarda o valor pedido pelo músico e ignora proposta igual ao cachê oferecido", async () => {
    const pedindoMais = t.world.seedEvent();
    const aceitando = t.world.seedEvent();

    await t.service.apply(musico, pedindoMais.id, 800, NOW);
    await t.service.apply(musico, aceitando.id, 500, NOW);

    const [primeira, segunda] = [...t.world.candidates.values()];
    expect([primeira.valorProposto, segunda.valorProposto]).toEqual([800, null]);
  });

  it("permite rever o valor enquanto a inscrição aguarda resposta, sem cobrança em andamento", async () => {
    const event = t.world.seedEvent();
    const candidate = t.world.seedCandidate(event.id, "m1");

    await t.service.updateProposal(musico, event.id, 650, NOW);
    expect(candidate.valorProposto).toBe(650);

    await t.payments.startCheckout(contratante, event.id, candidate.id, NOW);
    await expect(t.service.updateProposal(musico, event.id, 900, NOW)).rejects.toMatchObject({ code: "PAGAMENTO_EM_ANDAMENTO" });
    expect(candidate.valorProposto).toBe(650);
  });

  it("não altera proposta de inscrição já decidida", async () => {
    const event = t.world.seedEvent({ status: "CONTRATADO", musicoContratadoId: "m1" });
    t.world.seedCandidate(event.id, "m1", "APROVADO");

    await expect(t.service.updateProposal(musico, event.id, 900, NOW)).rejects.toMatchObject({ code: "PROPOSTA_INDISPONIVEL" });
  });
});

describe("conversa da candidatura", () => {
  it("músico e dono do evento conversam; terceiros não acessam", async () => {
    const event = t.world.seedEvent();
    const candidate = t.world.seedCandidate(event.id, "m1");

    await t.service.sendMessage(musico, candidate.id, "Consigo tocar por R$ 650?");
    await t.service.sendMessage(contratante, candidate.id, "Fechado em R$ 600.");
    await expect(t.service.sendMessage(outroMusico, candidate.id, "oi")).rejects.toMatchObject({ status: 404 });
    await expect(t.service.sendMessage(outroContratante, candidate.id, "oi")).rejects.toMatchObject({ status: 404 });

    expect(t.world.messages.map((m) => [m.authorId, m.texto])).toEqual([
      ["m1", "Consigo tocar por R$ 650?"],
      ["c1", "Fechado em R$ 600."],
    ]);
  });

  it("encerra a conversa de candidato não selecionado e de evento cancelado ou concluído", async () => {
    const aberto = t.world.seedEvent();
    const recusado = t.world.seedCandidate(aberto.id, "m1", "RECUSADO");
    const concluido = t.world.seedEvent({ status: "CONCLUIDO", musicoContratadoId: "m1" });
    const contratado = t.world.seedCandidate(concluido.id, "m1", "APROVADO");

    await expect(t.service.sendMessage(musico, recusado.id, "oi")).rejects.toMatchObject({ code: "CONVERSA_ENCERRADA" });
    await expect(t.service.sendMessage(musico, contratado.id, "oi")).rejects.toMatchObject({ code: "CONVERSA_ENCERRADA" });
  });
});

describe("cancelamento de inscrição (regra das 24h)", () => {
  it("permite cancelar com mais de 24h de antecedência", async () => {
    const event = t.world.seedEvent({ inicio: hoursFromNow(24.1) });
    t.world.seedCandidate(event.id, "m1");

    await t.service.cancelApplication(musico, event.id, NOW);

    expect(t.world.candidates.size).toBe(0);
  });

  it("bloqueia com 24h ou menos", async () => {
    const event = t.world.seedEvent({ inicio: hoursFromNow(24) });
    t.world.seedCandidate(event.id, "m1");

    await expect(t.service.cancelApplication(musico, event.id, NOW)).rejects.toMatchObject({ code: "CANCELAMENTO_INDISPONIVEL" });
    expect(t.world.candidates.size).toBe(1);
  });

  it("inscrição de evento cancelado ou já recusada não pode ser apagada pelo músico: o histórico fica", async () => {
    const cancelado = t.world.seedEvent({ status: "CANCELADO" });
    t.world.seedCandidate(cancelado.id, "m1");
    const aberto = t.world.seedEvent();
    t.world.seedCandidate(aberto.id, "m1", "RECUSADO");

    await expect(t.service.cancelApplication(musico, cancelado.id, NOW)).rejects.toMatchObject({ code: "INSCRICAO_ENCERRADA" });
    await expect(t.service.cancelApplication(musico, aberto.id, NOW)).rejects.toMatchObject({ code: "INSCRICAO_ENCERRADA" });
    expect(t.world.candidates.size).toBe(2);
  });

  it("músico contratado não cancela, e ninguém cancela a inscrição de outro", async () => {
    const event = t.world.seedEvent();
    t.world.seedCandidate(event.id, "m1", "APROVADO");

    await expect(t.service.cancelApplication(musico, event.id, NOW)).rejects.toMatchObject({ code: "JA_CONTRATADO" });
    await expect(t.service.cancelApplication(outroMusico, event.id, NOW)).rejects.toMatchObject({ status: 404 });
  });
});

describe("conclusão e avaliação", () => {
  const contratado = () => t.world.seedEvent({ status: "CONTRATADO", musicoContratadoId: "m1", inicio: hoursFromNow(-3) });

  it("conclui apenas após as duas partes confirmarem", async () => {
    const event = contratado();

    expect((await t.service.confirmCompletion(contratante, event.id, NOW)).status).toBe("CONTRATADO");
    expect((await t.service.confirmCompletion(musico, event.id, NOW)).status).toBe("CONCLUIDO");
  });

  it("não aceita confirmação antes do evento nem de terceiros", async () => {
    const futuro = t.world.seedEvent({ status: "CONTRATADO", musicoContratadoId: "m1" });
    const passado = contratado();

    await expect(t.service.confirmCompletion(contratante, futuro.id, NOW)).rejects.toMatchObject({ code: "EVENTO_NAO_INICIADO" });
    await expect(t.service.confirmCompletion(outroMusico, passado.id, NOW)).rejects.toMatchObject({ status: 404 });
    await expect(t.service.confirmCompletion(outroContratante, passado.id, NOW)).rejects.toMatchObject({ status: 404 });
  });

  it("avaliação só após a conclusão, uma por autor, sempre sobre a outra parte", async () => {
    const event = contratado();
    await expect(t.service.review(contratante, event.id, { rating: 5 })).rejects.toMatchObject({ code: "EVENTO_NAO_CONCLUIDO" });

    await t.service.confirmCompletion(contratante, event.id, NOW);
    await t.service.confirmCompletion(musico, event.id, NOW);
    await t.service.review(contratante, event.id, { rating: 5, comment: "Ótimo show" });
    await t.service.review(musico, event.id, { rating: 4 });

    expect(t.world.reviews).toEqual([
      expect.objectContaining({ authorId: "c1", reviewedId: "m1", rating: 5 }),
      expect.objectContaining({ authorId: "m1", reviewedId: "c1", rating: 4 }),
    ]);
    await expect(t.service.review(contratante, event.id, { rating: 1 })).rejects.toMatchObject({ code: "JA_AVALIADO" });
    await expect(t.service.review(outroMusico, event.id, { rating: 5 })).rejects.toMatchObject({ status: 404 });
  });
});

async function hired(inicio = hoursFromNow(72)) {
  const event = t.world.seedEvent({ inicio });
  const candidate = t.world.seedCandidate(event.id, "m1");
  const outro = t.world.seedCandidate(event.id, "m2");
  const payment = await t.payments.startCheckout(contratante, event.id, candidate.id, NOW);
  payAtAsaas(t.world, payment.asaasPaymentId);
  await t.payments.syncCheckout(contratante, event.id, NOW);
  return { event, payment, outro };
}

describe("comprovante da contratação", () => {
  it("mostra às duas partes o endereço, o contato do outro lado e os valores", async () => {
    const { event } = await hired();

    const paraMusico = await t.service.getHiring(musico, event.id, NOW);
    const paraContratante = await t.service.getHiring(contratante, event.id, NOW);

    expect(paraMusico).toMatchObject({
      papel: "musico",
      evento: { endereco: "Rua das Flores, 123 - Centro", status: "CONTRATADO" },
      contratante: { nome: "c1", telefone: "45999990000" },
      pagamento: { cache: 500, comissao: 50, total: 550, status: "PAGO", repasseStatus: "RETIDO" },
      cancelamento: { permitido: true, reembolso: true },
    });
    expect(paraContratante).toMatchObject({ papel: "contratante", musico: { nome: "m1", telefone: "45999990000" } });
    expect(JSON.stringify(paraContratante)).not.toMatch(/52998224725|m1@exemplo\.com/);
  });

  it("não existe para terceiros nem antes da contratação", async () => {
    const { event } = await hired();
    const aberto = t.world.seedEvent();

    await expect(t.service.getHiring(outroMusico, event.id, NOW)).rejects.toMatchObject({ status: 404 });
    await expect(t.service.getHiring(outroContratante, event.id, NOW)).rejects.toMatchObject({ status: 404 });
    await expect(t.service.getHiring(contratante, aberto.id, NOW)).rejects.toMatchObject({ code: "EVENTO_NAO_CONTRATADO" });
  });
});

describe("cancelamento da contratação", () => {
  it("mantém a contratação ativa durante o estorno e não envia pedidos duplicados", async () => {
    const { event, payment } = await hired(hoursFromNow(48));
    const original = t.world.stores.asaas.refundPayment;
    t.world.stores.asaas.refundPayment = async (id) => {
      t.world.asaasCalls.refundPayment.push(id);
      t.world.asaasCharges.set(id, { status: "REFUND_REQUESTED", value: payment.valor });
    };

    await expect(t.service.cancelHiring(musico, event.id, undefined, NOW)).resolves.toEqual({ situacao: "ESTORNO_PROCESSANDO" });
    await expect(t.service.cancelHiring(musico, event.id, undefined, NOW)).resolves.toEqual({ situacao: "ESTORNO_PROCESSANDO" });
    expect(t.world.asaasCalls.refundPayment).toHaveLength(1);
    expect(t.world.events.get(event.id)?.status).toBe("CONTRATADO");
    expect((await t.service.getHiring(musico, event.id, NOW)).pagamento?.refundStatus).toBe("PROCESSANDO");

    t.world.asaasCharges.set(payment.asaasPaymentId, { status: "REFUNDED", value: payment.valor });
    await t.payments.refreshRefund(event.id);
    expect(t.world.events.get(event.id)?.status).toBe("ABERTO");
    expect(t.world.payments.get(payment.id)?.status).toBe("ESTORNADO");
    t.world.stores.asaas.refundPayment = original;
  });

  it("contratante que já confirmou o show não registra não comparecimento", async () => {
    const { event } = await hired(hoursFromNow(1));
    await t.service.confirmCompletion(contratante, event.id, hoursFromNow(2));

    await expect(t.service.reportNoShow(contratante, event.id, hoursFromNow(3))).rejects.toMatchObject({ code: "CONTRATANTE_CONFIRMOU" });
    expect(t.world.asaasCalls.refundPayment).toHaveLength(0);
  });

  it("suspende confirmação e repasse enquanto o estorno está em processamento", async () => {
    const { event, payment } = await hired(hoursFromNow(1));
    t.world.stores.asaas.refundPayment = async (id) => {
      t.world.asaasCalls.refundPayment.push(id);
      t.world.asaasCharges.set(id, { status: "REFUND_REQUESTED", value: payment.valor });
    };

    await expect(ausenciaSemResposta(event.id, hoursFromNow(2))).resolves.toEqual({ situacao: "ESTORNO_PROCESSANDO" });
    await expect(t.service.confirmCompletion(musico, event.id, hoursFromNow(3))).rejects.toMatchObject({ code: "ESTORNO_PENDENTE" });
    expect((await t.service.getHiring(contratante, event.id, hoursFromNow(24 * 9))).evento.status).toBe("CONTRATADO");
    expect(t.world.asaasCalls.transferPix).toHaveLength(0);

    t.world.asaasCharges.set(payment.asaasPaymentId, { status: "REFUNDED", value: payment.valor });
    await expect(t.service.applyExpiredAbsence(event.id, hoursFromNow(24 * 3))).resolves.toEqual({ situacao: "ESTORNADO" });
    expect(t.world.events.get(event.id)?.status).toBe("CANCELADO");
    expect(t.world.payments.get(payment.id)?.status).toBe("ESTORNADO");
  });

  it("estorno negado fica visível, mas não impede a confirmação nem o repasse pela rotina", async () => {
    const { event, payment } = await hired(hoursFromNow(1));
    t.world.stores.asaas.refundPayment = async () => {
      throw new AppError(409, "ESTORNO_RECUSADO", "Estorno recusado.");
    };

    await expect(ausenciaSemResposta(event.id, hoursFromNow(2))).rejects.toMatchObject({ code: "ESTORNO_RECUSADO" });
    expect((await t.service.getHiring(contratante, event.id, hoursFromNow(2))).pagamento?.refundStatus).toBe("NEGADO");

    await t.service.confirmCompletion(contratante, event.id, hoursFromNow(3));
    const concluido = await t.service.confirmCompletion(musico, event.id, hoursFromNow(3));

    expect(concluido.status).toBe("CONCLUIDO");
    expect(t.world.asaasCalls.transferPix).toHaveLength(0);
    await t.rotina.run(hoursFromNow(4));
    expect(t.world.asaasCalls.transferPix).toEqual([expect.objectContaining({ value: 500 })]);
    expect(t.world.payments.get(payment.id)).toMatchObject({ status: "PAGO", repasseStatus: "PROCESSANDO", refundStatus: "NEGADO" });
  });

  it("estorno negado não impede a conclusão automática por prazo", async () => {
    const { event, payment } = await hired(hoursFromNow(1));
    await t.service.confirmCompletion(contratante, event.id, hoursFromNow(2));
    t.world.payments.get(payment.id)!.refundStatus = "NEGADO";

    const comprovante = await t.service.getHiring(contratante, event.id, hoursFromNow(24 * 8));

    expect(comprovante.evento.status).toBe("CONCLUIDO");
    expect(t.world.asaasCalls.transferPix).toHaveLength(0);
    await t.rotina.run(hoursFromNow(24 * 8));
    expect(t.world.asaasCalls.transferPix).toHaveLength(1);
  });

  it("estorno negado permite cancelar sem estorno com menos de 24h", async () => {
    const { event, payment } = await hired(hoursFromNow(12));
    t.world.payments.get(payment.id)!.refundStatus = "NEGADO";

    await expect(t.service.cancelHiring(contratante, event.id, undefined, NOW)).resolves.toEqual({ situacao: "SEM_ESTORNO" });
    expect(t.world.asaasCalls.transferPix).toHaveLength(0);
    await t.rotina.run(NOW);
    expect(t.world.asaasCalls.transferPix).toHaveLength(1);
  });

  it("repasse falho de cancelamento em cima da hora não é tentado de novo ao abrir o comprovante nem pela rotina", async () => {
    const { event, payment } = await hired(hoursFromNow(12));
    t.world.failures.transfer = true;
    await t.service.cancelHiring(contratante, event.id, undefined, NOW);
    await t.rotina.run(NOW);
    expect(t.world.payments.get(payment.id)?.repasseStatus).toBe("FALHOU");

    t.world.failures.transfer = false;
    for (let vez = 0; vez < 5; vez++) await t.service.getHiring(vez % 2 === 0 ? musico : contratante, event.id, NOW);
    await t.rotina.run(hoursFromNow(1));

    expect(t.world.payments.get(payment.id)?.repasseStatus).toBe("FALHOU");
    expect(t.world.tentativas.filter((tentativa) => tentativa.paymentId === payment.id)).toHaveLength(1);
    expect(t.world.notifications.filter((n) => n.titulo.startsWith("Repasse não concluído"))).toHaveLength(1);
  });

  it("registra recusa por saldo sem desfazer o contrato e permite nova tentativa segura", async () => {
    const { event, payment } = await hired(hoursFromNow(48));
    const original = t.world.stores.asaas.refundPayment;
    t.world.stores.asaas.refundPayment = async () => {
      throw new AppError(409, "ESTORNO_SALDO_INSUFICIENTE", "Saldo insuficiente no Sandbox.");
    };

    await expect(t.service.cancelHiring(contratante, event.id, undefined, NOW)).rejects.toMatchObject({ code: "ESTORNO_SALDO_INSUFICIENTE" });
    expect(t.world.payments.get(payment.id)).toMatchObject({ status: "PAGO", refundStatus: "NEGADO" });
    expect(t.world.events.get(event.id)?.status).toBe("CONTRATADO");

    t.world.stores.asaas.refundPayment = original;
    await expect(t.service.cancelHiring(contratante, event.id, undefined, NOW)).resolves.toEqual({ situacao: "ESTORNADO" });
    expect(t.world.events.get(event.id)?.status).toBe("CANCELADO");
  });

  it("reserva um único estorno sob duas desistências simultâneas", async () => {
    const { event } = await hired(hoursFromNow(48));
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    t.world.stores.asaas.refundPayment = async (id) => {
      t.world.asaasCalls.refundPayment.push(id);
      await gate;
    };

    const first = t.service.cancelHiring(musico, event.id, undefined, NOW);
    const second = t.service.cancelHiring(musico, event.id, undefined, NOW);
    release();
    await Promise.all([first, second]);

    expect(t.world.asaasCalls.refundPayment).toHaveLength(1);
    expect(t.world.events.get(event.id)?.status).toBe("CONTRATADO");
  });

  it("contratante com mais de 24h: estorno integral e evento cancelado", async () => {
    const { event, payment } = await hired(hoursFromNow(48));

    await expect(t.service.cancelHiring(contratante, event.id, undefined, NOW)).resolves.toEqual({ situacao: "ESTORNADO" });

    expect(t.world.asaasCalls.refundPayment).toEqual([payment.asaasPaymentId]);
    expect(t.world.payments.get(payment.id)?.status).toBe("ESTORNADO");
    expect(t.world.events.get(event.id)?.status).toBe("CANCELADO");
    expect(t.world.asaasCalls.transferPix).toHaveLength(0);
  });

  it("contratante com menos de 24h: sem estorno, o cachê vai para o músico pela rotina", async () => {
    const { event, payment } = await hired(hoursFromNow(12));

    await expect(t.service.cancelHiring(contratante, event.id, undefined, NOW)).resolves.toEqual({ situacao: "SEM_ESTORNO" });
    const consultas = await Promise.all([t.service.getHiring(musico, event.id, NOW), t.service.getHiring(contratante, event.id, NOW)]);
    expect(consultas.map((consulta) => consulta.evento.status)).toEqual(["CANCELADO", "CANCELADO"]);
    expect(t.world.asaasCalls.transferPix).toHaveLength(0);
    expect(t.world.payments.get(payment.id)?.repasseStatus).toBe("RETIDO");
    expect(t.world.tentativas.filter((tentativa) => tentativa.paymentId === payment.id)).toHaveLength(0);
    await t.rotina.run(NOW);

    expect(t.world.asaasCalls.refundPayment).toHaveLength(0);
    expect(t.world.asaasCalls.transferPix).toEqual([expect.objectContaining({ value: 500, pixAddressKey: "m1@exemplo.com" })]);
    expect(t.world.payments.get(payment.id)?.status).toBe("PAGO");
    expect(t.world.events.get(event.id)?.status).toBe("CANCELADO");
  });

  it("músico desiste: estorno integral e o evento volta a aceitar candidatos", async () => {
    const { event, payment, outro } = await hired(hoursFromNow(12));

    await expect(t.service.cancelHiring(musico, event.id, undefined, NOW)).resolves.toEqual({ situacao: "ESTORNADO" });

    expect(t.world.asaasCalls.refundPayment).toEqual([payment.asaasPaymentId]);
    expect(t.world.events.get(event.id)).toMatchObject({ status: "ABERTO", musicoContratadoId: null });
    expect(t.world.candidates.get(outro.id)?.status).toBe("PENDENTE");
    expect([...t.world.candidates.values()].some((c) => c.musicianId === "m1")).toBe(false);
  });

  it("se o pedido de estorno não chegar à Asaas, libera a reserva e permite nova tentativa", async () => {
    const { event, payment } = await hired(hoursFromNow(48));
    t.world.failures.refund = true;

    await expect(t.service.cancelHiring(contratante, event.id, undefined, NOW)).rejects.toMatchObject({ code: "PAGAMENTO_INDISPONIVEL" });
    expect(t.world.events.get(event.id)?.status).toBe("CONTRATADO");
    expect(t.world.payments.get(payment.id)).toMatchObject({ status: "PAGO", refundStatus: null, refundAction: null });

    t.world.failures.refund = false;
    await expect(t.service.cancelHiring(contratante, event.id, undefined, NOW)).resolves.toEqual({ situacao: "ESTORNADO" });
    expect(t.world.events.get(event.id)?.status).toBe("CANCELADO");
  });

  it("se a chamada falhar mas a Asaas registrou o estorno, mantém a reserva", async () => {
    const { event, payment } = await hired(hoursFromNow(48));
    t.world.stores.asaas.refundPayment = async (id) => {
      t.world.asaasCharges.set(id, { status: "REFUND_REQUESTED", value: payment.valor });
      throw new AppError(502, "PAGAMENTO_INDISPONIVEL", "falha simulada depois do pedido");
    };

    await expect(t.service.cancelHiring(contratante, event.id, undefined, NOW)).resolves.toEqual({ situacao: "ESTORNO_PROCESSANDO" });
    expect(t.world.payments.get(payment.id)?.refundStatus).toBe("PROCESSANDO");
  });

  it("depois de uma recusa, falha de rede volta o estorno para NEGADO", async () => {
    const { event, payment } = await hired(hoursFromNow(48));
    Object.assign(t.world.payments.get(payment.id)!, { refundStatus: "NEGADO", refundAction: "CANCELAR" });
    t.world.failures.refund = true;

    await expect(t.service.cancelHiring(contratante, event.id, undefined, NOW)).rejects.toMatchObject({ code: "PAGAMENTO_INDISPONIVEL" });
    expect(t.world.payments.get(payment.id)).toMatchObject({ refundStatus: "NEGADO", refundAction: "CANCELAR" });
  });

  it("não vale depois do início do evento, nem para terceiros", async () => {
    const { event } = await hired(hoursFromNow(48));

    await expect(t.service.cancelHiring(contratante, event.id, undefined, hoursFromNow(49))).rejects.toMatchObject({ code: "EVENTO_JA_INICIADO" });
    await expect(t.service.cancelHiring(outroMusico, event.id, undefined, NOW)).rejects.toMatchObject({ status: 404 });
  });
});

describe("liberação do valor retido", () => {
  it("a segunda confirmação conclui o show sem transferir; o repasse sai pela rotina", async () => {
    const { event, payment } = await hired(hoursFromNow(1));
    const depois = hoursFromNow(5);

    await t.service.confirmCompletion(contratante, event.id, depois);
    expect(t.world.asaasCalls.transferPix).toHaveLength(0);

    await t.service.confirmCompletion(musico, event.id, depois);
    expect(t.world.events.get(event.id)?.status).toBe("CONCLUIDO");
    expect(t.world.asaasCalls.transferPix).toHaveLength(0);
    expect(t.world.payments.get(payment.id)?.repasseStatus).toBe("RETIDO");

    await t.rotina.run(depois);
    expect(t.world.asaasCalls.transferPix).toEqual([expect.objectContaining({ value: 500 })]);
    expect(t.world.payments.get(payment.id)?.repasseStatus).toBe("PROCESSANDO");
  });

  it("com uma só confirmação, a consulta conclui após 7 dias sem transferir; o repasse sai pela rotina", async () => {
    const { event, payment } = await hired(hoursFromNow(1));
    await t.service.confirmCompletion(musico, event.id, hoursFromNow(5));

    const antes = await t.service.getHiring(contratante, event.id, hoursFromNow(24 * 6));
    expect(antes.evento.status).toBe("CONTRATADO");

    const depois = await t.service.getHiring(contratante, event.id, hoursFromNow(24 * 7 + 2));
    expect(depois.evento.status).toBe("CONCLUIDO");
    expect(depois.pagamento?.repasseStatus).toBe("RETIDO");
    expect(t.world.asaasCalls.transferPix).toHaveLength(0);

    await t.rotina.run(hoursFromNow(24 * 7 + 3));
    expect(t.world.asaasCalls.transferPix).toHaveLength(1);
    expect(t.world.payments.get(payment.id)?.repasseStatus).toBe("PROCESSANDO");
  });

  it("sem nenhuma confirmação nem ausência registrada, o show é dado como realizado após 7 dias, sem transferir na consulta", async () => {
    const { event } = await hired(hoursFromNow(1));

    expect((await t.service.getHiring(contratante, event.id, hoursFromNow(24 * 6))).evento.status).toBe("CONTRATADO");
    const view = await t.service.getHiring(contratante, event.id, hoursFromNow(24 * 8 + 1));

    expect(view.evento.status).toBe("CONCLUIDO");
    expect(t.world.asaasCalls.transferPix).toHaveLength(0);
  });

  it("consultas repetidas e simultâneas da contratação não transferem, não criam tentativas nem avisos", async () => {
    const { event, payment } = await hired(hoursFromNow(1));
    await t.service.confirmCompletion(contratante, event.id, hoursFromNow(5));
    await t.service.confirmCompletion(musico, event.id, hoursFromNow(5));
    const avisosAntes = t.world.notifications.length;

    const consultas = await Promise.all([
      t.service.getHiring(contratante, event.id, hoursFromNow(6)),
      t.service.getHiring(musico, event.id, hoursFromNow(6)),
      t.service.getHiring(contratante, event.id, hoursFromNow(6)),
    ]);
    for (let vez = 0; vez < 5; vez++) await t.service.getHiring(musico, event.id, hoursFromNow(7));

    expect(consultas.map((consulta) => consulta.evento.status)).toEqual(["CONCLUIDO", "CONCLUIDO", "CONCLUIDO"]);
    expect(consultas[0]).toMatchObject({ papel: "contratante", pagamento: { repasseStatus: "RETIDO" } });
    expect(consultas[1]).toMatchObject({ papel: "musico", pagamento: { repasseStatus: "RETIDO" } });
    expect(t.world.asaasCalls.transferPix).toHaveLength(0);
    expect(t.world.tentativas.filter((tentativa) => tentativa.paymentId === payment.id)).toHaveLength(0);
    expect(t.world.notifications.length).toBe(avisosAntes);
  });

  it("execuções simultâneas da rotina geram uma única transferência", async () => {
    const { event, payment } = await hired(hoursFromNow(1));
    await t.service.confirmCompletion(contratante, event.id, hoursFromNow(5));
    await t.service.confirmCompletion(musico, event.id, hoursFromNow(5));

    await Promise.all([t.rotina.run(hoursFromNow(6)), t.rotina.run(hoursFromNow(6)), t.payments.payout(event.id)]);
    await t.rotina.run(hoursFromNow(7));

    expect(t.world.asaasCalls.transferPix).toHaveLength(1);
    expect(t.world.tentativas.filter((tentativa) => tentativa.paymentId === payment.id)).toHaveLength(1);
  });

  it("o não comparecimento só pode ser registrado até 7 dias após o show", async () => {
    const { event } = await hired(hoursFromNow(1));

    await expect(t.service.reportNoShow(contratante, event.id, hoursFromNow(24 * 8 + 1))).rejects.toMatchObject({ code: "PRAZO_ENCERRADO" });
  });
});

describe("não comparecimento (garantia do contratante)", () => {
  it("após o horário, sem confirmação do músico: estorno integral e evento cancelado", async () => {
    const { event, payment } = await hired(hoursFromNow(1));

    await ausenciaSemResposta(event.id, hoursFromNow(4));

    expect(t.world.asaasCalls.refundPayment).toEqual([payment.asaasPaymentId]);
    expect(t.world.events.get(event.id)?.status).toBe("CANCELADO");
  });

  it("não vale antes do evento, se o músico confirmou, nem para o músico", async () => {
    const { event } = await hired(hoursFromNow(1));

    await expect(t.service.reportNoShow(contratante, event.id, NOW)).rejects.toMatchObject({ code: "EVENTO_NAO_INICIADO" });
    await expect(t.service.reportNoShow(musico, event.id, hoursFromNow(4))).rejects.toMatchObject({ status: 404 });

    await t.service.confirmCompletion(musico, event.id, hoursFromNow(4));
    await expect(t.service.reportNoShow(contratante, event.id, hoursFromNow(5))).rejects.toMatchObject({ code: "MUSICO_CONFIRMOU" });
    expect(t.world.events.get(event.id)?.status).toBe("CONTRATADO");
  });
});

describe("prazo de resposta do músico ao não comparecimento", () => {
  it("informar a ausência não estorna na hora: abre 24h para o músico e o avisa", async () => {
    const { event } = await hired(hoursFromNow(1));

    const resposta = await t.service.reportNoShow(contratante, event.id, hoursFromNow(3));

    expect(resposta).toEqual({ situacao: "AGUARDANDO_MUSICO", prazo: hoursFromNow(27).toISOString() });
    expect(t.world.asaasCalls.refundPayment).toHaveLength(0);
    expect(t.world.penalties).toHaveLength(0);
    expect(t.world.notifications).toEqual(expect.arrayContaining([expect.objectContaining({ userId: "m1", titulo: expect.stringContaining("Não comparecimento informado") })]));
    const vista = await t.service.getHiring(musico, event.id, hoursFromNow(4));
    expect(vista.ausencia).toEqual({ informadaEm: hoursFromNow(3).toISOString(), prazo: hoursFromNow(27).toISOString() });
    expect((await t.service.getHiring(contratante, event.id, hoursFromNow(4))).naoComparecimento.permitido).toBe(false);
    await expect(t.service.reportNoShow(contratante, event.id, hoursFromNow(5))).rejects.toMatchObject({ code: "AUSENCIA_JA_INFORMADA" });
  });

  it("antes do prazo nada é estornado; depois, a rotina pede o estorno com multa", async () => {
    const { event, payment } = await hired(hoursFromNow(1));
    await t.service.reportNoShow(contratante, event.id, hoursFromNow(3));

    await t.service.settleDueHiring(event.id, hoursFromNow(26));
    expect(t.world.asaasCalls.refundPayment).toHaveLength(0);

    await t.service.settleDueHiring(event.id, hoursFromNow(27));
    expect(t.world.asaasCalls.refundPayment).toEqual([payment.asaasPaymentId]);
    expect(t.world.events.get(event.id)?.status).toBe("CANCELADO");
    expect(t.world.penalties).toEqual([expect.objectContaining({ tipo: "AUSENCIA", multa: 100 })]);
  });

  it("com a ausência pendente, o show não é concluído sozinho nem paga o músico", async () => {
    const { event } = await hired(hoursFromNow(1));
    await t.service.reportNoShow(contratante, event.id, hoursFromNow(24 * 7 - 2));

    await t.service.settleDueHiring(event.id, hoursFromNow(24 * 7 + 1));
    const vista = await t.service.getHiring(contratante, event.id, hoursFromNow(24 * 7 + 1));

    expect(vista.evento.status).toBe("CONTRATADO");
    expect(t.world.asaasCalls.transferPix).toHaveLength(0);
    expect(t.world.asaasCalls.refundPayment).toHaveLength(0);
  });

  it("abrir a contratação depois do prazo pede o estorno, mesmo sem a rotina", async () => {
    const { event, payment } = await hired(hoursFromNow(1));
    await t.service.reportNoShow(contratante, event.id, hoursFromNow(3));

    await t.service.getHiring(contratante, event.id, hoursFromNow(28));

    expect(t.world.asaasCalls.refundPayment).toEqual([payment.asaasPaymentId]);
  });

  it("músico que confirma o show dentro do prazo abre contestação para o suporte decidir", async () => {
    const { event } = await hired(hoursFromNow(1));
    await t.service.reportNoShow(contratante, event.id, hoursFromNow(3));

    const confirmado = await t.service.confirmCompletion(musico, event.id, hoursFromNow(10));
    await t.service.settleDueHiring(event.id, hoursFromNow(30));

    expect(confirmado).toMatchObject({ status: "CONTRATADO", confirmacaoMusico: true });
    expect(t.world.disputes).toEqual([expect.objectContaining({ eventId: event.id, abertaPor: "m1", status: "ABERTA" })]);
    expect(t.world.asaasCalls.refundPayment).toHaveLength(0);
    expect(t.world.notifications).toEqual(expect.arrayContaining([expect.objectContaining({ userId: "c1", titulo: expect.stringContaining("Contestação aberta") })]));
  });

  it("músico também pode contestar dentro do prazo, e a contestação segura o estorno", async () => {
    const { event } = await hired(hoursFromNow(1));
    await t.service.reportNoShow(contratante, event.id, hoursFromNow(3));

    await t.service.openDispute(musico, event.id, "Eu toquei o show inteiro, tenho fotos e vídeos.", hoursFromNow(5));
    await t.service.settleDueHiring(event.id, hoursFromNow(30));

    expect(t.world.asaasCalls.refundPayment).toHaveLength(0);
  });

  it("depois do prazo, o músico não responde mais", async () => {
    const { event } = await hired(hoursFromNow(1));
    await t.service.reportNoShow(contratante, event.id, hoursFromNow(3));

    await expect(t.service.confirmCompletion(musico, event.id, hoursFromNow(28))).rejects.toMatchObject({ code: "PRAZO_DE_RESPOSTA_ENCERRADO" });
    await expect(t.service.openDispute(musico, event.id, "Eu toquei o show inteiro, tenho fotos.", hoursFromNow(28))).rejects.toMatchObject({ code: "PRAZO_DE_RESPOSTA_ENCERRADO" });
  });

  it("contratante que confirma o show retira a ausência informada", async () => {
    const { event } = await hired(hoursFromNow(1));
    await t.service.reportNoShow(contratante, event.id, hoursFromNow(3));

    await t.service.confirmCompletion(contratante, event.id, hoursFromNow(5));
    await t.service.settleDueHiring(event.id, hoursFromNow(30));

    expect(t.world.events.get(event.id)).toMatchObject({ status: "CONTRATADO", ausenciaInformadaEm: null, confirmacaoContratante: true });
    expect(t.world.asaasCalls.refundPayment).toHaveLength(0);
  });
});

describe("avisos por e-mail", () => {
  it("avisa músico e contratante quando o pagamento confirma a contratação", async () => {
    await hired();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(t.world.sent.map((m) => m.to).sort()).toEqual(["c1@exemplo.com", "m1@exemplo.com"]);
    expect(t.world.sent.find((m) => m.to === "m1@exemplo.com")?.subject).toContain("Você foi contratado");
  });

  it("avisa a outra parte quando alguém cancela, e o músico no não comparecimento", async () => {
    const { event } = await hired(hoursFromNow(48));
    t.world.sent.length = 0;

    await t.service.cancelHiring(musico, event.id, undefined, NOW);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(t.world.sent).toEqual([expect.objectContaining({ to: "c1@exemplo.com", subject: expect.stringContaining("desistiu") })]);

    const outro = await hired(hoursFromNow(1));
    t.world.sent.length = 0;
    await ausenciaSemResposta(outro.event.id, hoursFromNow(4));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(t.world.sent).toHaveLength(3);
    expect(t.world.sent).toEqual(expect.arrayContaining([
      expect.objectContaining({ to: "m1@exemplo.com", subject: expect.stringContaining("Não comparecimento informado") }),
      expect.objectContaining({ to: "m1@exemplo.com", subject: expect.stringContaining("Não comparecimento registrado") }),
      expect.objectContaining({ to: "m1@exemplo.com", subject: expect.stringContaining("Multa por ausência") }),
    ]));
  });

  it("falha no envio não afeta a operação", async () => {
    t.world.stores.mailer.send = async () => {
      throw new Error("smtp fora do ar");
    };

    await expect(hired()).resolves.toBeTruthy();
  });
});

describe("perfil incompleto", () => {
  it("músico sem chave Pix não se candidata; contratante sem documento não cria evento", async () => {
    const event = t.world.seedEvent();
    t.world.accounts.get("m1")!.chavePix = null;
    t.world.accounts.get("c1")!.documento = null;

    await expect(t.service.apply(musico, event.id, null, NOW)).rejects.toMatchObject({ code: "PERFIL_INCOMPLETO", message: expect.stringContaining("chave Pix") });
    await expect(t.service.createEvent(contratante, novoEvento, banner(), NOW)).rejects.toMatchObject({ code: "PERFIL_INCOMPLETO", message: expect.stringContaining("CPF ou CNPJ") });
    expect(t.world.candidates.size).toBe(0);
  });
});

describe("estilos do evento", () => {
  it("aceita candidatura com estilo em comum ou evento aberto a qualquer estilo", async () => {
    const varios = t.world.seedEvent({ estilosMusicais: ["Forró", "MPB"] });
    const qualquer = t.world.seedEvent({ estilosMusicais: ["Qualquer estilo"] });
    const nenhum = t.world.seedEvent({ estilosMusicais: ["Forró", "Axé"] });

    await expect(t.service.apply(musico, varios.id, null, NOW)).resolves.toBeUndefined();
    await expect(t.service.apply(musico, qualquer.id, null, NOW)).resolves.toBeUndefined();
    await expect(t.service.apply(musico, nenhum.id, null, NOW)).rejects.toMatchObject({ code: "EVENTO_INCOMPATIVEL" });
  });
});

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const avisosDe = (userId: string) => t.world.notifications.filter((n) => n.userId === userId);

describe("notificações no app", () => {
  it("avisam o contratante de nova inscrição e cada parte de mensagem nova", async () => {
    const event = t.world.seedEvent();

    await t.service.apply(musico, event.id, 800, NOW);
    const candidate = [...t.world.candidates.values()][0];
    await t.service.sendMessage(musico, candidate.id, "Topa R$ 800?");
    await t.service.sendMessage(contratante, candidate.id, "Topo.");
    await flush();

    expect(avisosDe("c1").map((n) => n.link)).toEqual([`/event/${event.id}`, `/conversa/${candidate.id}`]);
    expect(avisosDe("c1")[0].texto).toMatch(/R\$\s800,00/);
    expect(avisosDe("m1").map((n) => n.link)).toEqual([`/conversa/${candidate.id}`]);
  });

  it("avisam o contratado com o cachê pago e os demais candidatos de que outro foi escolhido", async () => {
    await hired();
    await flush();

    expect(avisosDe("m1").map((n) => n.titulo)).toEqual([expect.stringContaining("Você foi contratado")]);
    expect(avisosDe("m1")[0].texto).toMatch(/R\$\s500,00/);
    expect(avisosDe("m2").map((n) => n.titulo)).toEqual([expect.stringContaining("Outro músico foi escolhido")]);
    expect(avisosDe("c1").map((n) => n.titulo)).toEqual([expect.stringContaining("Pagamento confirmado")]);
  });

  it("avisam os inscritos só quando o evento muda em algo que importa para eles", async () => {
    const event = t.world.seedEvent();
    t.world.seedCandidate(event.id, "m1");

    await t.service.updateEvent(contratante, event.id, novoEvento, null, NOW);
    await t.service.updateEvent(contratante, event.id, { ...novoEvento, titulo: "Outro título" }, null, NOW);
    await t.service.updateEvent(contratante, event.id, { ...novoEvento, cache: novoEvento.cache + 100 }, null, NOW);
    await flush();

    expect(avisosDe("m1")).toHaveLength(2);
  });

  it("avisam a outra parte quando um lado confirma o show", async () => {
    const { event } = await hired(hoursFromNow(1));
    await flush();
    const antes = avisosDe("m1").length;

    await t.service.confirmCompletion(contratante, event.id, hoursFromNow(2));
    await flush();

    expect(avisosDe("m1").slice(antes).map((n) => n.titulo)).toEqual([expect.stringContaining("Show confirmado pela outra parte")]);
  });
});

describe("recusa de candidato", () => {
  it("o dono do evento recusa, o músico é avisado e a conversa é encerrada", async () => {
    const event = t.world.seedEvent();
    const candidate = t.world.seedCandidate(event.id, "m1");

    await expect(t.service.declineCandidate(outroContratante, event.id, candidate.id, NOW)).rejects.toMatchObject({ status: 404 });
    await t.service.declineCandidate(contratante, event.id, candidate.id, NOW);
    await flush();

    expect(candidate.status).toBe("RECUSADO");
    expect(avisosDe("m1").map((n) => n.titulo)).toEqual([expect.stringContaining("não selecionada")]);
    await expect(t.service.sendMessage(musico, candidate.id, "oi")).rejects.toMatchObject({ code: "CONVERSA_ENCERRADA" });
    await expect(t.service.declineCandidate(contratante, event.id, candidate.id, NOW)).rejects.toMatchObject({ code: "CANDIDATURA_INDISPONIVEL" });
  });

  it("não recusa com cobrança em andamento", async () => {
    const event = t.world.seedEvent();
    const candidate = t.world.seedCandidate(event.id, "m1");
    const outro = t.world.seedCandidate(event.id, "m2");
    await t.payments.startCheckout(contratante, event.id, candidate.id, NOW);

    await expect(t.service.declineCandidate(contratante, event.id, outro.id, NOW)).rejects.toMatchObject({ code: "PAGAMENTO_EM_ANDAMENTO" });
  });
});

describe("encerrar inscrições", () => {
  it("o dono encerra e reabre; com inscrições encerradas ninguém novo se inscreve", async () => {
    const event = t.world.seedEvent();

    await expect(t.service.setApplicationsClosed(outroContratante, event.id, true)).rejects.toMatchObject({ status: 404 });
    await t.service.setApplicationsClosed(contratante, event.id, true);
    await expect(t.service.apply(musico, event.id, null, NOW)).rejects.toMatchObject({ code: "INSCRICOES_ENCERRADAS" });

    await t.service.setApplicationsClosed(contratante, event.id, false);
    await expect(t.service.apply(musico, event.id, null, NOW)).resolves.toBeUndefined();
  });

  it("não mexe nas inscrições de evento já contratado", async () => {
    const event = t.world.seedEvent({ status: "CONTRATADO", musicoContratadoId: "m1" });

    await expect(t.service.setApplicationsClosed(contratante, event.id, true)).rejects.toMatchObject({ code: "EVENTO_INDISPONIVEL" });
  });
});

describe("correções de fluxo", () => {
  it("quem aceitou o cachê mantém o valor antigo quando o contratante muda o cachê", async () => {
    const event = t.world.seedEvent({ cache: 500 });
    const aceitou = t.world.seedCandidate(event.id, "m1");

    await t.service.updateEvent(contratante, event.id, { ...novoEvento, cache: 100 }, null, NOW);

    expect(aceitou.valorProposto).toBe(500);
  });

  it("inscrito que deixa de combinar com o evento editado é recusado e avisado", async () => {
    const event = t.world.seedEvent();
    const candidate = t.world.seedCandidate(event.id, "m1");

    await t.service.updateEvent(contratante, event.id, { ...novoEvento, uf: "SP", cidade: "São Paulo" }, null, NOW);
    await flush();

    expect(candidate).toMatchObject({ status: "RECUSADO", motivoRecusa: "EVENTO_ALTERADO" });
    expect(avisosDe("m1").map((n) => n.titulo)).toEqual([expect.stringContaining("não combina mais")]);
  });

  it("quando o contratado desiste, só voltam a concorrer os que perderam para ele, e eles são avisados", async () => {
    const event = t.world.seedEvent({ inicio: hoursFromNow(72) });
    const escolhido = t.world.seedCandidate(event.id, "m1");
    const perdeu = t.world.seedCandidate(event.id, "m2");
    const recusado = t.world.seedCandidate(event.id, "m3");
    await t.service.declineCandidate(contratante, event.id, recusado.id, NOW);
    const payment = await t.payments.startCheckout(contratante, event.id, escolhido.id, NOW);
    payAtAsaas(t.world, payment.asaasPaymentId);
    await t.payments.syncCheckout(contratante, event.id, NOW);

    await t.service.cancelHiring(musico, event.id, undefined, NOW);
    await flush();

    expect(perdeu).toMatchObject({ status: "PENDENTE", motivoRecusa: null });
    expect(recusado).toMatchObject({ status: "RECUSADO", motivoRecusa: "CONTRATANTE" });
    expect(avisosDe("m2").at(-1)?.titulo).toContain("voltou a concorrer");
    expect(avisosDe("m3").some((n) => n.titulo.includes("voltou a concorrer"))).toBe(false);
  });

  it("excluir evento com inscritos preserva o histórico: o evento é cancelado e inscrições, conversas e imagem continuam", async () => {
    const event = await t.service.createEvent(contratante, novoEvento, banner(), NOW);
    const candidate = t.world.seedCandidate(event.id, "m1");
    t.world.seedCandidate(event.id, "m2", "RECUSADO");
    const mensagem = await t.service.sendMessage(musico, candidate.id, "Tenho repertório de MPB.", NOW);
    const remover = vi.spyOn(t.world.stores.events, "deleteEvent");

    await t.service.deleteEvent(contratante, event.id, NOW);
    await flush();

    expect(remover).not.toHaveBeenCalled();
    expect(t.world.events.get(event.id)?.status).toBe("CANCELADO");
    expect([...t.world.candidates.values()].filter((c) => c.eventId === event.id)).toHaveLength(2);
    expect(await t.world.stores.events.findMessage(mensagem.id)).toMatchObject({ candidateId: candidate.id, texto: "Tenho repertório de MPB." });
    expect(t.world.images.has(event.imagemUrl)).toBe(true);
    expect(avisosDe("m1").map((n) => n.titulo)).toEqual([expect.stringContaining("foi excluído")]);
    expect(avisosDe("m2")).toHaveLength(0);
  });

  it("excluir evento sem nenhum inscrito continua apagando o evento e a imagem", async () => {
    const event = await t.service.createEvent(contratante, novoEvento, banner(), NOW);

    await t.service.deleteEvent(contratante, event.id, NOW);

    expect(t.world.events.has(event.id)).toBe(false);
    expect(t.world.images.has(event.imagemUrl)).toBe(false);
  });

  it("evento cancelado pela exclusão não aceita inscrição nem edição", async () => {
    const event = t.world.seedEvent();
    t.world.seedCandidate(event.id, "m2");
    await t.service.deleteEvent(contratante, event.id, NOW);

    await expect(t.service.apply(musico, event.id, null, NOW)).rejects.toMatchObject({ code: "INSCRICOES_ENCERRADAS" });
    await expect(t.service.updateEvent(contratante, event.id, novoEvento, null, NOW)).rejects.toMatchObject({ code: "EVENTO_BLOQUEADO" });
  });

  it("excluir o evento avisa os inscritos", async () => {
    const event = t.world.seedEvent();
    t.world.seedCandidate(event.id, "m1");

    await t.service.deleteEvent(contratante, event.id, NOW);
    await flush();

    expect(avisosDe("m1").map((n) => n.titulo)).toEqual([expect.stringContaining("foi excluído")]);
  });

  it("músico contratado num horário não se inscreve em outro show que se sobrepõe", async () => {
    t.world.seedEvent({ status: "CONTRATADO", musicoContratadoId: "m1", inicio: hoursFromNow(72), duracaoMinutos: 180 });
    const sobreposto = t.world.seedEvent({ inicio: hoursFromNow(73) });
    const depois = t.world.seedEvent({ inicio: hoursFromNow(76) });

    await expect(t.service.apply(musico, sobreposto.id, null, NOW)).rejects.toMatchObject({ code: "MUSICO_OCUPADO" });
    await expect(t.service.apply(musico, depois.id, null, NOW)).resolves.toBeUndefined();
  });

  it("cancelamento recusa a confirmação se o prazo de 24h mudou desde que a tela foi aberta", async () => {
    const { event } = await hired(hoursFromNow(23));

    await expect(t.service.cancelHiring(contratante, event.id, "COM_ESTORNO", NOW)).rejects.toMatchObject({ code: "PRAZO_ALTERADO" });
    expect(t.world.events.get(event.id)?.status).toBe("CONTRATADO");
    await expect(t.service.cancelHiring(contratante, event.id, "SEM_ESTORNO", NOW)).resolves.toEqual({ situacao: "SEM_ESTORNO" });
  });

  it("evento que passou sem contratação encerra conversa e proposta", async () => {
    const event = t.world.seedEvent({ inicio: hoursFromNow(-1) });
    const candidate = t.world.seedCandidate(event.id, "m1");

    await expect(t.service.sendMessage(musico, candidate.id, "oi", NOW)).rejects.toMatchObject({ code: "CONVERSA_ENCERRADA" });
    await expect(t.service.updateProposal(musico, event.id, 700, NOW)).rejects.toMatchObject({ code: "PROPOSTA_INDISPONIVEL" });
  });

  it("ao excluir a conta, o contratante leva os eventos abertos e avisa os inscritos; os shows passados ficam", async () => {
    const aberto = t.world.seedEvent();
    t.world.seedCandidate(aberto.id, "m1");
    const concluido = t.world.seedEvent({ status: "CONCLUIDO", musicoContratadoId: "m2" });

    await t.service.releaseAccount(contratante, "CONTRACTOR");
    await flush();

    expect(t.world.events.has(aberto.id)).toBe(false);
    expect(t.world.events.has(concluido.id)).toBe(true);
    expect(avisosDe("m1").map((n) => n.titulo)).toEqual([expect.stringContaining("foi excluído")]);
  });
});

describe("excluir a conta com Pix em andamento", () => {
  it("recusa enquanto a cobrança está no prazo e não apaga o evento", async () => {
    const aberto = t.world.seedEvent();
    const candidate = t.world.seedCandidate(aberto.id, "m1");
    await t.payments.startCheckout(contratante, aberto.id, candidate.id, new Date());

    await expect(t.service.releaseAccount(contratante, "CONTRACTOR")).rejects.toMatchObject({ code: "PAGAMENTO_EM_ANDAMENTO" });

    expect(t.world.events.has(aberto.id)).toBe(true);
    expect([...t.world.payments.values()].filter((p) => p.status === "PENDENTE")).toHaveLength(1);
  });

  it("cancela na Asaas a cobrança vencida antes de apagar o evento", async () => {
    const aberto = t.world.seedEvent();
    const candidate = t.world.seedCandidate(aberto.id, "m1");
    const cobranca = await t.payments.startCheckout(contratante, aberto.id, candidate.id, new Date(Date.now() - 60 * 60 * 1000));

    await t.service.releaseAccount(contratante, "CONTRACTOR");

    expect(t.world.events.has(aberto.id)).toBe(false);
    expect(t.world.asaasCalls.cancelCharge).toContain(cobranca.asaasPaymentId);
    expect([...t.world.payments.values()].filter((p) => p.status === "PENDENTE")).toHaveLength(0);
  });
});

describe("contraproposta no chat", () => {
  it("quem não é parte da inscrição não propõe nem responde", async () => {
    const event = t.world.seedEvent({ cache: 500 });
    const candidate = t.world.seedCandidate(event.id, "m1");
    const proposta = await t.service.proposeValue(musico, candidate.id, 700, NOW);

    await expect(t.service.proposeValue(outroMusico, candidate.id, 900, NOW)).rejects.toMatchObject({ status: 404 });
    await expect(t.service.proposeValue(outroContratante, candidate.id, 900, NOW)).rejects.toMatchObject({ status: 404 });
    await expect(t.service.answerProposal(outroContratante, candidate.id, proposta.id, true, NOW)).rejects.toMatchObject({ status: 404 });
    expect(candidate.valorProposto).toBeNull();
  });

  it("responder com a proposta de outra inscrição não muda nenhum valor", async () => {
    const event = t.world.seedEvent({ cache: 500 });
    const minha = t.world.seedCandidate(event.id, "m1");
    const outra = t.world.seedCandidate(event.id, "m2");
    const propostaDaOutra = await t.service.proposeValue(contratante, outra.id, 650, NOW);

    await expect(t.service.answerProposal(musico, minha.id, propostaDaOutra.id, true, NOW)).rejects.toMatchObject({ code: "PROPOSTA_NAO_ENCONTRADA" });
    expect(minha.valorProposto).toBeNull();
    expect(outra.valorProposto).toBeNull();
  });

  it("o contratante propõe, o músico aceita e o valor da inscrição passa a ser o combinado", async () => {
    const event = t.world.seedEvent({ cache: 500 });
    const candidate = t.world.seedCandidate(event.id, "m1");

    const proposta = await t.service.proposeValue(contratante, candidate.id, 600, NOW);
    await expect(t.service.answerProposal(contratante, candidate.id, proposta.id, true, NOW)).rejects.toMatchObject({ code: "PROPOSTA_PROPRIA" });
    await t.service.answerProposal(musico, candidate.id, proposta.id, true, NOW);

    expect(candidate.valorProposto).toBe(600);
    expect(t.world.messages.find((m) => m.id === proposta.id)?.statusProposta).toBe("ACEITA");
    await expect(t.service.answerProposal(musico, candidate.id, proposta.id, true, NOW)).rejects.toMatchObject({ code: "PROPOSTA_ENCERRADA" });
  });

  it("uma proposta nova substitui a anterior, e a recusada não muda o valor", async () => {
    const event = t.world.seedEvent({ cache: 500 });
    const candidate = t.world.seedCandidate(event.id, "m1");

    const primeira = await t.service.proposeValue(musico, candidate.id, 800, NOW);
    const segunda = await t.service.proposeValue(contratante, candidate.id, 650, NOW);
    await t.service.answerProposal(musico, candidate.id, segunda.id, false, NOW);

    expect(t.world.messages.find((m) => m.id === primeira.id)?.statusProposta).toBe("SUBSTITUIDA");
    expect(t.world.messages.find((m) => m.id === segunda.id)?.statusProposta).toBe("RECUSADA");
    expect(candidate.valorProposto).toBeNull();
  });

  it("não negocia valor com Pix em andamento nem depois de decidida a inscrição", async () => {
    const event = t.world.seedEvent();
    const candidate = t.world.seedCandidate(event.id, "m1");
    await t.payments.startCheckout(contratante, event.id, candidate.id, NOW);

    await expect(t.service.proposeValue(musico, candidate.id, 900, NOW)).rejects.toMatchObject({ code: "PAGAMENTO_EM_ANDAMENTO" });

    const recusada = t.world.seedCandidate(t.world.seedEvent().id, "m1", "RECUSADO");
    await expect(t.service.proposeValue(musico, recusada.id, 900, NOW)).rejects.toMatchObject({ code: "NEGOCIACAO_ENCERRADA" });
  });
});

const concluirTransferencia = (paymentId: string) => t.world.asaasTransfers.set(t.world.payments.get(paymentId)!.asaasTransferId!, "DONE");

describe("penalidades do músico", () => {
  it("ausência registrada gera multa de 20% e visibilidade reduzida; a multa sai do próximo cachê", async () => {
    const { event } = await hired(hoursFromNow(1));
    await ausenciaSemResposta(event.id, hoursFromNow(3));

    expect(t.world.penalties).toEqual([expect.objectContaining({ musicianId: "m1", tipo: "AUSENCIA", multa: 100 })]);
    expect(t.world.accounts.get("m1")?.visibilidadeReduzidaAte).toBeInstanceOf(Date);

    const proximo = await hired(hoursFromNow(48));
    await t.service.confirmCompletion(contratante, proximo.event.id, hoursFromNow(50));
    await t.service.confirmCompletion(musico, proximo.event.id, hoursFromNow(50));
    expect(t.world.asaasCalls.transferPix).toHaveLength(0);
    await t.rotina.run(hoursFromNow(50));

    expect(t.world.asaasCalls.transferPix.at(-1)?.value).toBe(400);
    expect(t.world.payments.get(proximo.payment.id)?.multaDescontada).toBe(100);
    expect(t.world.penalties[0]).toMatchObject({ quitada: false, reservaPaymentId: proximo.payment.id });

    concluirTransferencia(proximo.payment.id);
    await t.payments.payout(proximo.event.id);
    expect(t.world.penalties[0]).toMatchObject({ quitada: true, reservaPaymentId: proximo.payment.id });
  });

  it("desistência com menos de 24h reduz a visibilidade sem multa; com antecedência, nada acontece", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    const tarde = await hired(hoursFromNow(12));
    await t.service.cancelHiring(musico, tarde.event.id, undefined, NOW);
    const cedo = await hired(hoursFromNow(72));
    await t.service.cancelHiring(musico, cedo.event.id, undefined, NOW);

    expect(t.world.penalties).toEqual([expect.objectContaining({ tipo: "DESISTENCIA_TARDIA", multa: 0, eventId: tarde.event.id })]);
    vi.useRealTimers();
  });

  const estornoPendente = (paymentId: string, asaasPaymentId: string, valor: number) => {
    Object.assign(t.world.payments.get(paymentId)!, { refundStatus: "PROCESSANDO", refundAction: "NAO_COMPARECIMENTO", refundRequestedAt: hoursFromNow(3) });
    t.world.asaasCharges.set(asaasPaymentId, { status: "REFUNDED", value: valor });
  };
  const avisosDeMulta = () => avisosDe("m1").filter((n) => n.titulo.startsWith("Multa por ausência"));

  it("webhook repetido, rotina e consulta do comprovante sobre o mesmo estorno geram uma penalidade e um aviso", async () => {
    const rotina = createRotinaFinanceira({ paymentStore: t.world.stores.payments, eventStore: t.world.stores.events, payments: t.payments, events: t.service, trava: t.world.stores.trava });
    const { event, payment } = await hired(hoursFromNow(1));
    estornoPendente(payment.id, payment.asaasPaymentId, payment.valor);
    const webhook = (id: string) => t.payments.handleWebhook({ id, event: "PAYMENT_REFUNDED", payment: { id: payment.asaasPaymentId } });

    await Promise.all([webhook("evt_a"), webhook("evt_b"), rotina.run(hoursFromNow(4)), t.service.getHiring(contratante, event.id, hoursFromNow(4))]);
    await flush();
    const prazo = t.world.accounts.get("m1")?.visibilidadeReduzidaAte;

    expect(t.world.penalties.filter((p) => p.estornoPaymentId === payment.id)).toEqual([expect.objectContaining({ musicianId: "m1", tipo: "AUSENCIA", multa: 100 })]);
    expect(prazo).toBeInstanceOf(Date);
    expect(avisosDeMulta()).toHaveLength(1);

    await webhook("evt_c");
    await rotina.run(hoursFromNow(5));
    await t.service.getHiring(contratante, event.id, hoursFromNow(5));
    await flush();

    expect(t.world.penalties).toHaveLength(1);
    expect(t.world.accounts.get("m1")?.visibilidadeReduzidaAte).toBe(prazo);
    expect(avisosDeMulta()).toHaveLength(1);
  });

  it("falha ao avisar não desfaz nem duplica a penalidade", async () => {
    const { event } = await hired(hoursFromNow(1));
    vi.spyOn(t.world.stores.payments, "findRefundPenalty").mockRejectedValueOnce(new Error("falha simulada no aviso"));

    await expect(ausenciaSemResposta(event.id, hoursFromNow(3))).resolves.toMatchObject({ situacao: "ESTORNADO" });
    await flush();

    expect(t.world.penalties).toEqual([expect.objectContaining({ tipo: "AUSENCIA", multa: 100 })]);
    expect(t.world.accounts.get("m1")?.visibilidadeReduzidaAte).toBeInstanceOf(Date);
    expect(avisosDeMulta()).toHaveLength(0);
    expect(console.error).toHaveBeenCalledWith("Falha ao avisar a penalidade", expect.any(String), expect.any(Error));
  });

  it("multas antigas, sem estorno de origem, continuam sendo descontadas junto com as novas", async () => {
    t.world.penalties.push({ id: "pen_antiga", musicianId: "m1", eventId: null, tipo: "AUSENCIA", multa: 50, quitada: false, estornoPaymentId: null, reservaPaymentId: null });
    const { event } = await hired(hoursFromNow(1));
    await ausenciaSemResposta(event.id, hoursFromNow(3));

    const proximo = await hired(hoursFromNow(48));
    await t.service.confirmCompletion(contratante, proximo.event.id, hoursFromNow(50));
    await t.service.confirmCompletion(musico, proximo.event.id, hoursFromNow(50));
    await t.rotina.run(hoursFromNow(50));

    expect(t.world.asaasCalls.transferPix.at(-1)?.value).toBe(350);
    expect(t.world.payments.get(proximo.payment.id)?.multaDescontada).toBe(150);
    expect(t.world.penalties.every((p) => p.reservaPaymentId === proximo.payment.id && !p.quitada)).toBe(true);

    concluirTransferencia(proximo.payment.id);
    await t.payments.payout(proximo.event.id);
    expect(t.world.penalties.every((p) => p.quitada)).toBe(true);
  });
});

describe("contestação", () => {
  it("congela o repasse até o suporte decidir, e a decisão libera o pagamento ao músico pela rotina", async () => {
    const { event } = await hired(hoursFromNow(1));
    await t.service.confirmCompletion(musico, event.id, hoursFromNow(3));

    await expect(t.service.reportNoShow(contratante, event.id, hoursFromNow(4))).rejects.toMatchObject({ code: "MUSICO_CONFIRMOU" });
    await t.service.openDispute(contratante, event.id, "O músico não apareceu no bar.", hoursFromNow(4));
    await expect(t.service.confirmCompletion(contratante, event.id, hoursFromNow(5))).rejects.toMatchObject({ code: "CONTESTACAO_ABERTA" });
    expect((await t.service.getHiring(contratante, event.id, hoursFromNow(24 * 9))).evento.status).toBe("CONTRATADO");
    expect(t.world.asaasCalls.transferPix).toHaveLength(0);

    await t.service.resolveDispute(t.world.disputes[0].id, "PAGAR_MUSICO", "Fotos do show enviadas pelo músico.");

    expect(t.world.events.get(event.id)?.status).toBe("CONCLUIDO");
    expect(t.world.asaasCalls.transferPix).toHaveLength(0);
    await t.rotina.run(hoursFromNow(24 * 9));
    expect(t.world.asaasCalls.transferPix).toHaveLength(1);
    await expect(t.service.resolveDispute(t.world.disputes[0].id, "PAGAR_MUSICO", null)).rejects.toMatchObject({ code: "CONTESTACAO_RESOLVIDA" });
  });

  it("a decisão de devolver estorna o contratante e penaliza o músico", async () => {
    const { event } = await hired(hoursFromNow(1));
    await t.service.openDispute(contratante, event.id, "Ninguém apareceu para tocar.", hoursFromNow(3));

    await t.service.resolveDispute(t.world.disputes[0].id, "DEVOLVER_CONTRATANTE", null);

    expect(t.world.events.get(event.id)?.status).toBe("CANCELADO");
    expect(t.world.penalties).toEqual([expect.objectContaining({ tipo: "AUSENCIA" })]);
  });

  it("não abre contestação antes do show nem depois do repasse", async () => {
    const { event } = await hired(hoursFromNow(48));
    await expect(t.service.openDispute(contratante, event.id, "Quero contestar antes.", NOW)).rejects.toMatchObject({ code: "CONTESTACAO_INDISPONIVEL" });

    const pago = await hired(hoursFromNow(1));
    const pagamento = [...t.world.payments.values()].find((p) => p.eventId === pago.event.id && p.status === "PAGO")!;
    pagamento.repasseStatus = "REPASSADO";
    await expect(t.service.openDispute(contratante, pago.event.id, "Quero contestar depois.", hoursFromNow(3))).rejects.toMatchObject({ code: "CONTESTACAO_INDISPONIVEL" });
    expect(t.world.disputes).toHaveLength(0);
  });

  it("quem não é parte da contratação não abre contestação", async () => {
    const { event } = await hired(hoursFromNow(1));

    await expect(t.service.openDispute(outroContratante, event.id, "Não fui eu que contratei.", hoursFromNow(3))).rejects.toMatchObject({ status: 404 });
    await expect(t.service.openDispute(outroMusico, event.id, "Não fui eu que toquei.", hoursFromNow(3))).rejects.toMatchObject({ status: 404 });
    expect(t.world.disputes).toHaveLength(0);
  });

  it("decidir uma contestação que não existe responde 404", async () => {
    await expect(t.service.resolveDispute("00000000-0000-0000-0000-000000000000", "PAGAR_MUSICO", null)).rejects.toMatchObject({ code: "CONTESTACAO_NAO_ENCONTRADA" });
  });

  it("repasse iniciado depois da leitura do pagamento: o banco recusa a contestação", async () => {
    const { event } = await hired(hoursFromNow(1));
    const pagamento = [...t.world.payments.values()].find((p) => p.eventId === event.id && p.status === "PAGO")!;
    vi.spyOn(t.payments, "findPayment").mockResolvedValueOnce({ ...pagamento });
    pagamento.repasseStatus = "PROCESSANDO";

    await expect(t.service.openDispute(contratante, event.id, "O músico não apareceu no bar.", hoursFromNow(3))).rejects.toMatchObject({ code: "CONTESTACAO_INDISPONIVEL" });
    expect(t.world.disputes).toHaveLength(0);
  });

  it("contestação aberta depois da checagem do serviço: o banco recusa a reivindicação do repasse", async () => {
    const { event } = await hired(hoursFromNow(1));
    await t.service.openDispute(contratante, event.id, "O músico não apareceu no bar.", hoursFromNow(3));
    vi.spyOn(t.world.stores.events, "findOpenDispute").mockResolvedValueOnce(null);

    await t.payments.payout(event.id);

    expect(t.world.asaasCalls.transferPix).toHaveLength(0);
    expect(t.world.tentativas).toHaveLength(0);
    expect([...t.world.payments.values()].find((p) => p.eventId === event.id && p.status === "PAGO")?.repasseStatus).toBe("RETIDO");
  });
});

describe("acesso antecipado do Muve Pro", () => {
  it("evento novo com mais de 7 dias de antecedência só aceita músicos Pro nas primeiras 24h", async () => {
    const novo = t.world.seedEvent({ createdAt: hoursFromNow(-2), inicio: hoursFromNow(24 * 10) });
    const emCimaDaHora = t.world.seedEvent({ createdAt: hoursFromNow(-2), inicio: hoursFromNow(24 * 3) });

    await expect(t.service.apply(musico, novo.id, null, NOW)).rejects.toMatchObject({ code: "ACESSO_ANTECIPADO" });
    await expect(t.service.apply(musico, emCimaDaHora.id, null, NOW)).resolves.toBeUndefined();

    t.world.accounts.get("m1")!.proAte = hoursFromNow(24 * 30);
    await expect(t.service.apply(musico, novo.id, null, NOW)).resolves.toBeUndefined();
  });

  it("a urgência é conferida na hora da inscrição: com 7 dias exatos ainda espera, com menos de 7 dias libera", async () => {
    const seteDias = t.world.seedEvent({ createdAt: hoursFromNow(-2), inicio: hoursFromNow(24 * 7) });
    const quaseSete = t.world.seedEvent({ createdAt: hoursFromNow(-2), inicio: new Date(hoursFromNow(24 * 7).getTime() - 60_000) });

    await expect(t.service.apply(musico, seteDias.id, null, NOW)).rejects.toMatchObject({ code: "ACESSO_ANTECIPADO" });
    await expect(t.service.apply(musico, quaseSete.id, null, NOW)).resolves.toBeUndefined();
    await expect(t.service.apply(musico, seteDias.id, null, new Date(NOW.getTime() + 60_000))).resolves.toBeUndefined();
  });

  it("a recusa diz quando a inscrição abre para todos", async () => {
    const novo = t.world.seedEvent({ createdAt: hoursFromNow(-2), inicio: hoursFromNow(24 * 10) });

    const erro = await t.service.apply(musico, novo.id, null, NOW).catch((e: unknown) => e);

    expect((erro as AppError).message).toContain("Ela abre para todos em");
  });

  it("músico Pro se inscreve em eventos a até 400 km", async () => {
    const longe = t.world.seedEvent({ cidade: "Londrina" });

    await expect(t.service.apply(musico, longe.id, null, NOW)).rejects.toMatchObject({ code: "EVENTO_INCOMPATIVEL" });
    t.world.accounts.get("m1")!.proAte = hoursFromNow(24 * 30);
    await expect(t.service.apply(musico, longe.id, null, NOW)).resolves.toBeUndefined();
  });
});

describe("penalidade de visibilidade na inscrição", () => {
  const penalizar = (ate: Date | null) => {
    t.world.accounts.get("m1")!.visibilidadeReduzidaAte = ate;
  };

  it("músico com penalidade vigente não se inscreve, e nada é gravado nem notificado", async () => {
    const event = t.world.seedEvent();
    penalizar(hoursFromNow(24 * 10));

    const erro = await t.service.apply(musico, event.id, null, NOW).catch((e: unknown) => e);
    await flush();

    expect(erro).toBeInstanceOf(AppError);
    expect(erro).toMatchObject({ status: 403, code: "VISIBILIDADE_REDUZIDA" });
    expect((erro as AppError).message).toContain("não pode se inscrever em novos eventos até");
    expect([...t.world.candidates.values()].filter((c) => c.eventId === event.id)).toHaveLength(0);
    expect(avisosDe("c1")).toHaveLength(0);
    expect(t.world.sent).toHaveLength(0);
  });

  it("músico com penalidade vencida se inscreve normalmente", async () => {
    const event = t.world.seedEvent();
    penalizar(hoursFromNow(-1));

    await expect(t.service.apply(musico, event.id, null, NOW)).resolves.toBeUndefined();
    expect([...t.world.candidates.values()].some((c) => c.eventId === event.id && c.musicianId === "m1")).toBe(true);
  });

  it("músico sem penalidade se inscreve normalmente", async () => {
    const event = t.world.seedEvent();
    penalizar(null);

    await expect(t.service.apply(musico, event.id, null, NOW)).resolves.toBeUndefined();
  });

  it("compara a penalidade com o horário do servidor; a inscrição não aceita data vinda do app", async () => {
    const event = t.world.seedEvent({ inicio: hoursFromNow(24 * 5) });
    penalizar(hoursFromNow(1));

    await expect(t.service.apply(musico, event.id, null, NOW)).rejects.toMatchObject({ code: "VISIBILIDADE_REDUZIDA" });
    await expect(t.service.apply(musico, event.id, null, hoursFromNow(2))).resolves.toBeUndefined();
    expect(candidaturaSchema.parse({ valorProposto: null, visibilidadeReduzidaAte: null, agora: hoursFromNow(48).toISOString() })).toEqual({ valorProposto: null });
  });

  it("as regras de acesso antecipado continuam valendo depois da penalidade, e a penalidade vale até para o Pro", async () => {
    const novo = t.world.seedEvent({ createdAt: hoursFromNow(-2), inicio: hoursFromNow(24 * 10) });
    penalizar(hoursFromNow(1));
    t.world.accounts.get("m1")!.proAte = hoursFromNow(24 * 30);
    await expect(t.service.apply(musico, novo.id, null, NOW)).rejects.toMatchObject({ code: "VISIBILIDADE_REDUZIDA" });

    penalizar(hoursFromNow(-1));
    t.world.accounts.get("m1")!.proAte = null;
    await expect(t.service.apply(musico, novo.id, null, NOW)).rejects.toMatchObject({ code: "ACESSO_ANTECIPADO" });
  });

  it("convite não libera a inscrição durante a penalidade", async () => {
    const event = t.world.seedEvent({ cidade: "Curitiba", inscricoesEncerradas: true });
    t.world.invites.add(`${event.id}:m1`);
    penalizar(hoursFromNow(24));

    await expect(t.service.apply(musico, event.id, null, NOW)).rejects.toMatchObject({ code: "VISIBILIDADE_REDUZIDA" });
    expect([...t.world.candidates.values()].filter((c) => c.eventId === event.id)).toHaveLength(0);

    penalizar(hoursFromNow(-1));
    await expect(t.service.apply(musico, event.id, null, NOW)).resolves.toBeUndefined();
  });

  it("a penalidade de um músico não afeta outro", async () => {
    const event = t.world.seedEvent();
    penalizar(hoursFromNow(24));

    await expect(t.service.apply(outroMusico, event.id, null, NOW)).resolves.toBeUndefined();
  });
});

describe("Muve Casa", () => {
  const casa = () => {
    t.world.accounts.get("c1")!.casaAte = hoursFromNow(24 * 30);
  };

  it("com o Casa ativo, a taxa do contratante cai para 6%", async () => {
    casa();
    const event = t.world.seedEvent({ cache: 500 });
    const candidate = t.world.seedCandidate(event.id, "m1");

    const payment = await t.payments.startCheckout(contratante, event.id, candidate.id, NOW);

    expect(payment).toMatchObject({ valor: 530, valorComissao: 30, valorCache: 500 });
  });

  it("eventos recorrentes criam uma semana após a outra, só para quem tem o Casa", async () => {
    await expect(t.service.createEvent(contratante, { ...novoEvento, repetirSemanas: 3 }, banner(), NOW)).rejects.toMatchObject({ code: "RECURSO_CASA" });
    casa();

    await t.service.createEvent(contratante, { ...novoEvento, repetirSemanas: 3 }, banner(), NOW);

    const inicios = [...t.world.events.values()].map((e) => e.inicio.getTime()).sort();
    expect(inicios).toEqual([0, 1, 2].map((semana) => novoEvento.inicio.getTime() + semana * 7 * 24 * 60 * 60 * 1000));
  });

  it("recorrência envia as imagens das semanas ao mesmo tempo, uma por evento, antes de gravar", async () => {
    casa();
    const liberar: (() => void)[] = [];
    let contador = 0;
    vi.spyOn(t.world.stores.images, "upload").mockImplementation(() => new Promise((resolve) => {
      const url = `https://cdn.test/banner-${++contador}.png`;
      liberar.push(() => resolve(url));
    }));
    const inserir = vi.spyOn(t.world.stores.events, "insertEvent");

    const pedido = t.service.createEvent(contratante, { ...novoEvento, repetirSemanas: 3 }, banner(), NOW);
    await flush();

    expect(liberar).toHaveLength(3);
    expect(inserir).not.toHaveBeenCalled();
    liberar.forEach((solta) => solta());
    await pedido;
    expect([...t.world.events.values()].map((e) => e.imagemUrl).sort()).toEqual(["https://cdn.test/banner-1.png", "https://cdn.test/banner-2.png", "https://cdn.test/banner-3.png"]);
  });

  it("recorrência: falha no envio de uma semana cria as anteriores, descarta as imagens das seguintes e para", async () => {
    casa();
    let contador = 0;
    vi.spyOn(t.world.stores.images, "upload").mockImplementation(async () => {
      contador += 1;
      if (contador === 2) throw new Error("falha no Storage");
      return `https://cdn.test/banner-${contador}.png`;
    });
    const remover = vi.spyOn(t.world.stores.images, "removeByUrl");

    const primeiro = await t.service.createEvent(contratante, { ...novoEvento, repetirSemanas: 3 }, banner(), NOW);

    expect(primeiro.imagemUrl).toBe("https://cdn.test/banner-1.png");
    expect(t.world.events.size).toBe(1);
    expect(remover).toHaveBeenCalledWith("event-banners", "https://cdn.test/banner-3.png");
  });

  it("recorrência: se a primeira semana falhar no envio, nada é criado e o erro aparece", async () => {
    casa();
    let contador = 0;
    vi.spyOn(t.world.stores.images, "upload").mockImplementation(async () => {
      contador += 1;
      if (contador === 1) throw new Error("falha no Storage");
      return `https://cdn.test/banner-${contador}.png`;
    });
    const remover = vi.spyOn(t.world.stores.images, "removeByUrl");

    await expect(t.service.createEvent(contratante, { ...novoEvento, repetirSemanas: 3 }, banner(), NOW)).rejects.toThrow("falha no Storage");
    expect(t.world.events.size).toBe(0);
    expect(remover.mock.calls.map(([, url]) => url).sort()).toEqual(["https://cdn.test/banner-2.png", "https://cdn.test/banner-3.png"]);
  });

  it("favoritar exige o Casa e um músico que já se inscreveu; o convite libera a inscrição fora do alcance", async () => {
    const antigo = t.world.seedEvent();
    t.world.seedCandidate(antigo.id, "m1");
    const longe = t.world.seedEvent({ cidade: "Curitiba", inscricoesEncerradas: true });

    await expect(t.service.setFavorite(contratante, "m1", true, NOW)).rejects.toMatchObject({ code: "RECURSO_CASA" });
    casa();
    await expect(t.service.setFavorite(contratante, "m2", true, NOW)).rejects.toMatchObject({ code: "MUSICO_NAO_ENCONTRADO" });
    await expect(t.service.inviteMusician(contratante, longe.id, "m1", NOW)).rejects.toMatchObject({ code: "NAO_FAVORITO" });
    await t.service.setFavorite(contratante, "m1", true, NOW);

    await t.service.inviteMusician(contratante, longe.id, "m1", NOW);
    await flush();

    expect(avisosDe("m1").at(-1)?.titulo).toContain("convidou você");
    await expect(t.service.apply(musico, longe.id, null, NOW)).resolves.toBeUndefined();
  });

  it("favoritar consulta a conta e a inscrição ao mesmo tempo, antes de gravar", async () => {
    casa();
    t.world.seedCandidate(t.world.seedEvent().id, "m1");
    let liberarConta!: () => void;
    const contaOriginal = t.world.stores.accounts.findAccount;
    vi.spyOn(t.world.stores.accounts, "findAccount").mockImplementation((id) => new Promise((resolve) => { liberarConta = () => resolve(contaOriginal(id)); }));
    const inscricao = vi.spyOn(t.world.stores.events, "hasAppliedToContractor");
    const gravar = vi.spyOn(t.world.stores.events, "setFavorite");

    const pedido = t.service.setFavorite(contratante, "m1", true, NOW);
    await flush();

    expect(inscricao).toHaveBeenCalledWith("m1", "c1");
    expect(gravar).not.toHaveBeenCalled();
    liberarConta();
    await pedido;
    expect(gravar).toHaveBeenCalledWith("c1", "m1", true);
  });

  it("músico não favorita, mesmo que a verificação de inscrição falhe ao mesmo tempo", async () => {
    vi.spyOn(t.world.stores.events, "hasAppliedToContractor").mockRejectedValue(new Error("falha de banco"));
    const gravar = vi.spyOn(t.world.stores.events, "setFavorite");

    await expect(t.service.setFavorite(musico, "m2", true, NOW)).rejects.toMatchObject({ status: 403, code: "PERFIL_NAO_AUTORIZADO" });
    expect(gravar).not.toHaveBeenCalled();
  });

  it("sem o Casa a recusa continua sendo do plano, mesmo se a verificação de inscrição falhar", async () => {
    vi.spyOn(t.world.stores.events, "hasAppliedToContractor").mockRejectedValue(new Error("falha de banco"));

    await expect(t.service.setFavorite(contratante, "m1", true, NOW)).rejects.toMatchObject({ code: "RECURSO_CASA" });
  });

  it("falha na verificação de inscrição de um contratante válido não grava o favorito", async () => {
    casa();
    vi.spyOn(t.world.stores.events, "hasAppliedToContractor").mockRejectedValue(new Error("falha de banco"));
    const gravar = vi.spyOn(t.world.stores.events, "setFavorite");

    await expect(t.service.setFavorite(contratante, "m1", true, NOW)).rejects.toThrow("falha de banco");
    expect(gravar).not.toHaveBeenCalled();
  });

  it("remover não consulta inscrição e funciona mesmo depois do Casa vencer", async () => {
    casa();
    t.world.seedCandidate(t.world.seedEvent().id, "m1");
    await t.service.setFavorite(contratante, "m1", true, NOW);
    t.world.accounts.get("c1")!.casaAte = hoursFromNow(-1);
    const inscricao = vi.spyOn(t.world.stores.events, "hasAppliedToContractor");

    await t.service.setFavorite(contratante, "m1", false, NOW);

    expect(inscricao).not.toHaveBeenCalled();
    expect(await t.world.stores.events.isFavorite("c1", "m1")).toBe(false);
  });

  it("músico não remove favorito de ninguém", async () => {
    await expect(t.service.setFavorite(musico, "m2", false, NOW)).rejects.toMatchObject({ code: "PERFIL_NAO_AUTORIZADO" });
  });
});

describe("estorno com repasse em conferência", () => {
  async function contratadoComTentativaLegada(inicio = hoursFromNow(72)) {
    const contratado = await hired(inicio);
    const pagamento = t.world.payments.get(contratado.payment.id)!;
    Object.assign(pagamento, { repasseStatus: "FALHOU", asaasTransferId: "tra_legada" });
    const tentativa = {
      id: "00000000-0000-4000-9000-000000000001",
      paymentId: pagamento.id,
      origem: "LEGADO" as const,
      estado: "INCONCLUSIVA" as const,
      referenciaExterna: pagamento.id,
      asaasTransferId: "tra_legada",
      solicitadaEm: hoursFromNow(-24 * 30),
      verificacaoIniciadaEm: null,
      encerradaEm: null,
    };
    t.world.tentativas.push(tentativa);
    return { ...contratado, pagamento, tentativa };
  }

  it("cancelamento pelo contratante com estorno é suspenso enquanto o repasse está em conferência", async () => {
    const { event, pagamento } = await contratadoComTentativaLegada();

    await expect(t.service.cancelHiring(contratante, event.id, undefined, NOW)).rejects.toMatchObject({ code: "REPASSE_EM_CONFERENCIA", status: 409 });

    expect(t.world.asaasCalls.refundPayment).toHaveLength(0);
    expect(pagamento).toMatchObject({ status: "PAGO", refundStatus: null, repasseStatus: "FALHOU" });
    expect(t.world.events.get(event.id)?.status).toBe("CONTRATADO");
  });

  it("desistência do músico também é suspensa", async () => {
    const { event } = await contratadoComTentativaLegada();

    await expect(t.service.cancelHiring(musico, event.id, undefined, NOW)).rejects.toMatchObject({ code: "REPASSE_EM_CONFERENCIA" });

    expect(t.world.asaasCalls.refundPayment).toHaveLength(0);
    expect(t.world.events.get(event.id)?.status).toBe("CONTRATADO");
  });

  it("aviso de não comparecimento não estorna nem aplica penalidade", async () => {
    const { event } = await contratadoComTentativaLegada(hoursFromNow(1));

    await expect(ausenciaSemResposta(event.id, hoursFromNow(2))).rejects.toMatchObject({ code: "REPASSE_EM_CONFERENCIA" });

    expect(t.world.asaasCalls.refundPayment).toHaveLength(0);
    expect(t.world.penalties).toHaveLength(0);
  });

  const avisosDeDecisao = () => t.world.notifications.filter((n) => n.titulo.startsWith("Contestação resolvida"));

  it("contestação a favor do contratante continua aberta enquanto o repasse está em conferência, e pode ser decidida depois", async () => {
    const { event, pagamento, tentativa } = await contratadoComTentativaLegada(hoursFromNow(1));
    await t.service.openDispute(contratante, event.id, "O músico não apareceu no bar.", hoursFromNow(3));
    const contestacao = t.world.disputes[0];

    await expect(t.service.resolveDispute(contestacao.id, "DEVOLVER_CONTRATANTE", null)).rejects.toMatchObject({ code: "REPASSE_EM_CONFERENCIA" });

    expect(contestacao).toMatchObject({ status: "ABERTA", decisao: null });
    expect(avisosDeDecisao()).toHaveLength(0);
    expect(t.world.asaasCalls.refundPayment).toHaveLength(0);
    expect(t.world.penalties).toHaveLength(0);
    await t.payments.payout(event.id);
    expect(t.world.asaasCalls.transferPix).toHaveLength(0);

    Object.assign(tentativa, { estado: "FALHOU", encerradaEm: hoursFromNow(4) });
    pagamento.asaasTransferId = null;
    await t.service.resolveDispute(contestacao.id, "DEVOLVER_CONTRATANTE", "Ausência confirmada pelo bar.");

    expect(contestacao).toMatchObject({ status: "RESOLVIDA", decisao: "DEVOLVER_CONTRATANTE" });
    expect(t.world.asaasCalls.refundPayment).toEqual([pagamento.asaasPaymentId]);
    expect(avisosDeDecisao()).toHaveLength(2);
    await expect(t.service.resolveDispute(contestacao.id, "DEVOLVER_CONTRATANTE", null)).rejects.toMatchObject({ code: "CONTESTACAO_RESOLVIDA" });
    expect(t.world.asaasCalls.refundPayment).toHaveLength(1);
  });

  it("estorno recusado pela Asaas não encerra a contestação, e a decisão pode ser repetida", async () => {
    const { event, payment } = await hired(hoursFromNow(1));
    await t.service.openDispute(contratante, event.id, "O músico não apareceu no bar.", hoursFromNow(3));
    const contestacao = t.world.disputes[0];
    t.world.failures.refund = true;

    await expect(t.service.resolveDispute(contestacao.id, "DEVOLVER_CONTRATANTE", null)).rejects.toMatchObject({ status: 502 });

    expect(contestacao).toMatchObject({ status: "ABERTA", decisao: null });
    expect(t.world.payments.get(payment.id)).toMatchObject({ status: "PAGO", refundStatus: null });
    expect(avisosDeDecisao()).toHaveLength(0);

    t.world.failures.refund = false;
    await t.service.resolveDispute(contestacao.id, "DEVOLVER_CONTRATANTE", null);

    expect(contestacao).toMatchObject({ status: "RESOLVIDA", decisao: "DEVOLVER_CONTRATANTE" });
    expect(t.world.payments.get(payment.id)?.status).toBe("ESTORNADO");
    expect(avisosDeDecisao()).toHaveLength(2);
  });

  it("decisão a favor do músico continua encerrando a contestação e o repasse sai pela rotina", async () => {
    const { event } = await hired(hoursFromNow(1));
    await t.service.openDispute(contratante, event.id, "O músico chegou atrasado.", hoursFromNow(3));

    await t.service.resolveDispute(t.world.disputes[0].id, "PAGAR_MUSICO", null);

    expect(t.world.disputes[0]).toMatchObject({ status: "RESOLVIDA", decisao: "PAGAR_MUSICO" });
    expect(t.world.asaasCalls.transferPix).toHaveLength(0);
    await t.rotina.run(hoursFromNow(4));
    expect(t.world.asaasCalls.transferPix).toHaveLength(1);
    expect(avisosDeDecisao()).toHaveLength(2);
  });

  it("o banco também recusa o estorno quando o serviço não percebe a tentativa aberta, e o erro diz o motivo", async () => {
    const { event, pagamento } = await contratadoComTentativaLegada();
    vi.spyOn(t.world.stores.payments, "findOpenAttempt").mockResolvedValueOnce(null);

    await expect(t.service.cancelHiring(contratante, event.id, undefined, NOW)).rejects.toMatchObject({ code: "REPASSE_EM_CONFERENCIA", status: 409 });

    expect(t.world.asaasCalls.refundPayment).toHaveLength(0);
    expect(pagamento.refundStatus).toBeNull();
  });

  it("repasse iniciado entre a checagem do serviço e o pedido de estorno: o erro diz que há repasse em andamento", async () => {
    const { event, payment } = await hired();
    const pedirEstorno = t.world.stores.payments.claimRefund;
    vi.spyOn(t.world.stores.payments, "claimRefund").mockImplementationOnce(async (id, action) => {
      await t.world.stores.payments.claimPayout(id);
      return pedirEstorno(id, action);
    });

    await expect(t.service.cancelHiring(contratante, event.id, undefined, NOW)).rejects.toMatchObject({
      code: "REPASSE_EM_CONFERENCIA",
      message: expect.stringContaining("repasse deste show em andamento ou em conferência"),
    });

    expect(t.world.asaasCalls.refundPayment).toHaveLength(0);
    expect(t.world.payments.get(payment.id)).toMatchObject({ refundStatus: null, repasseStatus: "PROCESSANDO" });
  });

  it("tentativa encerrada como falha não impede o estorno", async () => {
    const { event, pagamento, tentativa } = await contratadoComTentativaLegada();
    Object.assign(tentativa, { estado: "FALHOU", encerradaEm: hoursFromNow(-1) });
    pagamento.asaasTransferId = null;

    await expect(t.service.cancelHiring(contratante, event.id, undefined, NOW)).resolves.toEqual({ situacao: "ESTORNADO" });

    expect(t.world.asaasCalls.refundPayment).toEqual([pagamento.asaasPaymentId]);
  });

  it("estorno feito no painel da Asaas com tentativa aberta fica registrado como conflito, sem reabrir o evento nem penalizar", async () => {
    const { event, pagamento, tentativa } = await contratadoComTentativaLegada();

    t.world.asaasCharges.set(pagamento.asaasPaymentId, { status: "REFUNDED", value: pagamento.valor });
    await t.payments.handleWebhook({ id: "evt_estorno_painel", event: "PAYMENT_REFUNDED", payment: { id: pagamento.asaasPaymentId } });

    expect(pagamento).toMatchObject({ status: "ESTORNADO", refundStatus: "CONFIRMADO", repasseStatus: "FALHOU", asaasTransferId: "tra_legada" });
    expect(t.world.events.get(event.id)?.status).toBe("CANCELADO");
    expect(t.world.penalties).toHaveLength(0);
    expect(tentativa.estado).toBe("INCONCLUSIVA");
    expect(console.error).toHaveBeenCalledWith("Estorno confirmado depois do início do repasse; requer conciliação manual", pagamento.id);
  });
});

describe("decisão da contestação e efetivação do estorno", () => {
  async function contestado() {
    const contratado = await hired(hoursFromNow(1));
    await t.service.openDispute(contratante, contratado.event.id, "O músico não apareceu no bar.", hoursFromNow(3));
    const pagamento = t.world.payments.get(contratado.payment.id)!;
    t.world.stores.asaas.refundPayment = async (id) => {
      t.world.asaasCalls.refundPayment.push(id);
      t.world.asaasCharges.set(id, { status: "RECEIVED", value: pagamento.valor });
    };
    return { ...contratado, pagamento, contestacao: t.world.disputes[0] };
  }
  const avisos = (prefixo: string) => t.world.notifications.filter((n) => n.titulo.startsWith(prefixo));
  const emailsAoSuporte = () => t.world.sent.filter((m) => m.subject.includes("estorno de contestação não concluído"));
  const avisosEnviados = () => new Promise((resolve) => setTimeout(resolve, 0));

  it("decisões opostas: a segunda recebe conflito sem pedir estorno nem repasse", async () => {
    const { event, contestacao } = await contestado();

    await t.service.resolveDispute(contestacao.id, "DEVOLVER_CONTRATANTE", null);
    expect(contestacao).toMatchObject({ status: "AGUARDANDO_ESTORNO", decisao: "DEVOLVER_CONTRATANTE" });

    await expect(t.service.resolveDispute(contestacao.id, "PAGAR_MUSICO", null)).rejects.toMatchObject({ code: "CONTESTACAO_RESOLVIDA", status: 409 });
    await expect(t.service.resolveDispute(contestacao.id, "DEVOLVER_CONTRATANTE", null)).rejects.toMatchObject({ code: "CONTESTACAO_RESOLVIDA" });

    expect(t.world.asaasCalls.refundPayment).toHaveLength(1);
    expect(t.world.asaasCalls.transferPix).toHaveLength(0);
    expect(contestacao).toMatchObject({ status: "AGUARDANDO_ESTORNO", decisao: "DEVOLVER_CONTRATANTE" });
    expect(t.world.events.get(event.id)?.status).toBe("CONTRATADO");
  });

  it("enquanto o estorno não é confirmado, a contestação segura o repasse, a conclusão por prazo e uma nova contestação", async () => {
    const { event, contestacao } = await contestado();
    await t.service.resolveDispute(contestacao.id, "DEVOLVER_CONTRATANTE", null);

    await t.payments.payout(event.id);
    await t.service.settleDueHiring(event.id, hoursFromNow(24 * 9));

    expect(t.world.asaasCalls.transferPix).toHaveLength(0);
    expect(t.world.events.get(event.id)?.status).toBe("CONTRATADO");
    await expect(t.service.openDispute(musico, event.id, "Quero contestar de novo.", hoursFromNow(5))).rejects.toMatchObject({ status: 409 });
  });

  it("estorno confirmado depois encerra a contestação", async () => {
    const { contestacao, pagamento } = await contestado();
    await t.service.resolveDispute(contestacao.id, "DEVOLVER_CONTRATANTE", null);

    t.world.asaasCharges.set(pagamento.asaasPaymentId, { status: "REFUNDED", value: pagamento.valor });
    await t.payments.handleWebhook({ id: "evt_estorno_ok", event: "PAYMENT_REFUNDED", payment: { id: pagamento.asaasPaymentId } });

    expect(pagamento.status).toBe("ESTORNADO");
    expect(contestacao).toMatchObject({ status: "RESOLVIDA", decisao: "DEVOLVER_CONTRATANTE" });
  });

  it("estorno feito no painel da Asaas com a contestação aberta encerra a contestação como devolvida, sem deixá-la presa", async () => {
    const { event, contestacao, pagamento } = await contestado();

    t.world.asaasCharges.set(pagamento.asaasPaymentId, { status: "REFUNDED", value: pagamento.valor });
    await t.payments.handleWebhook({ id: "evt_estorno_painel_contestacao", event: "PAYMENT_REFUNDED", payment: { id: pagamento.asaasPaymentId } });

    expect(pagamento).toMatchObject({ status: "ESTORNADO", refundStatus: "CONFIRMADO" });
    expect(contestacao).toMatchObject({ status: "RESOLVIDA", decisao: "DEVOLVER_CONTRATANTE", observacao: "Valor devolvido ao contratante por estorno confirmado fora da decisão do suporte." });
    expect(await t.world.stores.events.findOpenDispute(event.id)).toBeNull();

    await expect(t.service.resolveDispute(contestacao.id, "DEVOLVER_CONTRATANTE", null)).rejects.toMatchObject({ code: "CONTESTACAO_RESOLVIDA", status: 409 });
    await expect(t.service.resolveDispute(contestacao.id, "PAGAR_MUSICO", null)).rejects.toMatchObject({ code: "CONTESTACAO_RESOLVIDA", status: 409 });
    expect(t.world.asaasCalls.refundPayment).toHaveLength(0);
    expect(t.world.asaasCalls.transferPix).toHaveLength(0);
    expect(contestacao).toMatchObject({ status: "RESOLVIDA", decisao: "DEVOLVER_CONTRATANTE" });
    expect(t.world.penalties).toHaveLength(0);
  });

  it("webhook repetido do estorno feito no painel não altera de novo a contestação encerrada", async () => {
    const { contestacao, pagamento } = await contestado();

    t.world.asaasCharges.set(pagamento.asaasPaymentId, { status: "REFUNDED", value: pagamento.valor });
    await t.payments.handleWebhook({ id: "evt_painel_1", event: "PAYMENT_REFUNDED", payment: { id: pagamento.asaasPaymentId } });
    const encerrada = { ...contestacao };
    await t.payments.handleWebhook({ id: "evt_painel_2", event: "PAYMENT_REFUNDED", payment: { id: pagamento.asaasPaymentId } });

    expect(contestacao).toEqual(encerrada);
  });

  function pagamentoSecundarioEstornado(pagamento: { id: string; eventId: string | null; valor: number }) {
    const principal = t.world.payments.get(pagamento.id)!;
    const secundario = { ...principal, id: "p_secundario", asaasPaymentId: "pay_secundario", status: "EXPIRADO" as const, repasseStatus: null, refundStatus: "PROCESSANDO" as const, refundAction: "NENHUMA" as const, refundRequestedAt: new Date() };
    t.world.payments.set(secundario.id, secundario);
    t.world.asaasCharges.set(secundario.asaasPaymentId, { status: "REFUNDED", value: secundario.valor });
    return secundario;
  }

  it("estorno de outro pagamento do mesmo evento não encerra a contestação aberta do pagamento contratado, e o repasse continua bloqueado", async () => {
    const { event, contestacao, pagamento } = await contestado();
    const secundario = pagamentoSecundarioEstornado(pagamento);

    await t.payments.handleWebhook({ id: "evt_estorno_secundario", event: "PAYMENT_REFUNDED", payment: { id: secundario.asaasPaymentId } });

    expect(t.world.payments.get(secundario.id)).toMatchObject({ status: "ESTORNADO", refundStatus: "CONFIRMADO" });
    expect(pagamento).toMatchObject({ status: "PAGO", repasseStatus: "RETIDO" });
    expect(contestacao).toMatchObject({ status: "ABERTA", decisao: null, observacao: null });
    expect(await t.world.stores.events.findOpenDispute(event.id)).toMatchObject({ id: contestacao.id });

    await t.payments.payout(event.id);
    expect(t.world.asaasCalls.transferPix).toHaveLength(0);
  });

  it("estorno de outro pagamento do mesmo evento não encerra a contestação aguardando o estorno do pagamento contratado", async () => {
    const { event, contestacao, pagamento } = await contestado();
    await t.service.resolveDispute(contestacao.id, "DEVOLVER_CONTRATANTE", "Ausência comprovada");
    const secundario = pagamentoSecundarioEstornado(pagamento);

    await t.payments.handleWebhook({ id: "evt_estorno_secundario_aguardando", event: "PAYMENT_REFUNDED", payment: { id: secundario.asaasPaymentId } });

    expect(t.world.payments.get(secundario.id)).toMatchObject({ status: "ESTORNADO", refundStatus: "CONFIRMADO" });
    expect(pagamento).toMatchObject({ status: "PAGO", refundStatus: "PROCESSANDO" });
    expect(contestacao).toMatchObject({ status: "AGUARDANDO_ESTORNO", decisao: "DEVOLVER_CONTRATANTE", observacao: "Ausência comprovada" });

    await t.payments.payout(event.id);
    expect(t.world.asaasCalls.transferPix).toHaveLength(0);

    t.world.asaasCharges.set(pagamento.asaasPaymentId, { status: "REFUNDED", value: pagamento.valor });
    await t.payments.handleWebhook({ id: "evt_estorno_principal", event: "PAYMENT_REFUNDED", payment: { id: pagamento.asaasPaymentId } });
    expect(contestacao).toMatchObject({ status: "RESOLVIDA", decisao: "DEVOLVER_CONTRATANTE", observacao: "Ausência comprovada" });
  });

  async function aguardandoComDevolucaoSecundaria() {
    const contratado = await contestado();
    await t.service.resolveDispute(contratado.contestacao.id, "DEVOLVER_CONTRATANTE", "Ausência comprovada");
    const secundario = { ...contratado.pagamento, id: "p_secundario", asaasPaymentId: "pay_secundario", status: "EXPIRADO" as const, repasseStatus: null, refundStatus: "PROCESSANDO" as const, refundAction: "NENHUMA" as const, refundRequestedAt: new Date(0) };
    t.world.payments.set(secundario.id, secundario);
    await avisosEnviados();
    const avisosAntes = t.world.notifications.length;
    const emailsAntes = emailsAoSuporte().length;
    const novosAvisos = () => t.world.notifications.slice(avisosAntes).map((n) => n.titulo);
    const novosEmails = () => emailsAoSuporte().length - emailsAntes;
    return { ...contratado, secundario, novosAvisos, novosEmails };
  }
  const continuaAguardando = { status: "AGUARDANDO_ESTORNO", decisao: "DEVOLVER_CONTRATANTE", observacao: "Ausência comprovada" };

  it("negativa da devolução de outro pagamento do evento pelo webhook não reabre a contestação aguardando o estorno do contratado nem avisa reabertura", async () => {
    const { contestacao, pagamento, secundario, novosAvisos, novosEmails } = await aguardandoComDevolucaoSecundaria();
    t.world.asaasCharges.set(secundario.asaasPaymentId, { status: "RECEIVED", value: secundario.valor, refunds: [{ status: "CANCELLED", value: secundario.valor }] } as never);

    await t.payments.handleWebhook({ id: "evt_negativa_secundaria", event: "PAYMENT_REFUND_DENIED", payment: { id: secundario.asaasPaymentId } });
    await t.payments.handleWebhook({ id: "evt_negativa_secundaria_repetida", event: "PAYMENT_REFUND_DENIED", payment: { id: secundario.asaasPaymentId } });
    await avisosEnviados();

    expect(t.world.payments.get(secundario.id)?.refundStatus).toBe("NEGADO");
    expect(pagamento.refundStatus).toBe("PROCESSANDO");
    expect(contestacao).toMatchObject(continuaAguardando);
    expect(novosAvisos()).toEqual([]);
    expect(novosEmails()).toBe(0);
    await expect(t.service.resolveDispute(contestacao.id, "PAGAR_MUSICO", null)).rejects.toMatchObject({ code: "CONTESTACAO_RESOLVIDA", status: 409 });
  });

  it("negativa da devolução de outro pagamento percebida ao conferir a cobrança avisa a devolução pendente, sem reabrir a contestação do contratado", async () => {
    const { event, contestacao, secundario, novosAvisos, novosEmails } = await aguardandoComDevolucaoSecundaria();
    t.world.asaasCharges.set(secundario.asaasPaymentId, { status: "RECEIVED", value: secundario.valor, refunds: [{ status: "CANCELLED", value: secundario.valor }] } as never);

    await t.payments.handleWebhook({ id: "evt_pix_secundario_negado", event: "PAYMENT_RECEIVED", payment: { id: secundario.asaasPaymentId } });
    await avisosEnviados();

    expect(contestacao).toMatchObject(continuaAguardando);
    expect(novosAvisos()).toContain(`Devolução pendente: "${event.titulo}"`);
    expect(novosAvisos().some((titulo) => titulo.startsWith("Contestação em análise de novo"))).toBe(false);
    expect(novosEmails()).toBe(0);
  });

  it("devolução de outro pagamento parada na Asaas é liberada sem reabrir a contestação do contratado", async () => {
    const { contestacao, secundario, novosAvisos, novosEmails } = await aguardandoComDevolucaoSecundaria();
    t.world.asaasCharges.set(secundario.asaasPaymentId, { status: "RECEIVED", value: secundario.valor });

    await t.payments.handleWebhook({ id: "evt_pix_secundario_de_novo", event: "PAYMENT_RECEIVED", payment: { id: secundario.asaasPaymentId } });
    await avisosEnviados();

    expect(contestacao).toMatchObject(continuaAguardando);
    expect(novosAvisos().some((titulo) => titulo.startsWith("Contestação em análise de novo"))).toBe(false);
    expect(novosEmails()).toBe(0);
  });

  it("nova tentativa de devolução de outro pagamento recusada ou sem resposta não reabre a contestação do contratado", async () => {
    const { event, contestacao, secundario } = await aguardandoComDevolucaoSecundaria();
    Object.assign(t.world.payments.get(secundario.id)!, { refundStatus: "NEGADO" });
    t.world.asaasCharges.set(secundario.asaasPaymentId, { status: "RECEIVED", value: secundario.valor });

    t.world.stores.asaas.refundPayment = async () => {
      throw new AppError(422, "ESTORNO_RECUSADO", "Estorno recusado.");
    };
    await t.payments.syncCheckout(contratante, event.id, hoursFromNow(4));
    expect(t.world.payments.get(secundario.id)?.refundStatus).toBe("NEGADO");
    expect(contestacao).toMatchObject(continuaAguardando);

    t.world.stores.asaas.refundPayment = async () => {
      throw new AppError(502, "ASAAS_INDISPONIVEL", "Asaas fora do ar.");
    };
    await t.payments.syncCheckout(contratante, event.id, hoursFromNow(5));
    expect(t.world.payments.get(secundario.id)?.refundStatus).toBe("NEGADO");
    expect(contestacao).toMatchObject(continuaAguardando);
  });

  it("estorno do pagamento contratado parado na Asaas continua liberado com a contestação de volta para análise e o aviso às partes", async () => {
    const { event, contestacao, pagamento, novosAvisos, novosEmails } = await aguardandoComDevolucaoSecundaria();
    pagamento.refundRequestedAt = new Date(0);
    t.world.asaasCharges.set(pagamento.asaasPaymentId, { status: "RECEIVED", value: pagamento.valor });

    await t.payments.refreshRefund(event.id);
    await t.payments.refreshRefund(event.id);
    await avisosEnviados();

    expect(pagamento.refundStatus).toBeNull();
    expect(contestacao).toMatchObject({ status: "ABERTA", decisao: null });
    expect(novosAvisos().filter((titulo) => titulo.startsWith("Contestação em análise de novo"))).toHaveLength(2);
    expect(novosEmails()).toBe(1);
  });

  it("estorno aceito e depois negado pela Asaas devolve a contestação para análise, mantém o repasse suspenso e avisa partes e suporte", async () => {
    const { event, contestacao, pagamento } = await contestado();
    await t.service.resolveDispute(contestacao.id, "DEVOLVER_CONTRATANTE", null);

    t.world.asaasCharges.set(pagamento.asaasPaymentId, { status: "RECEIVED", value: pagamento.valor, refunds: [{ status: "CANCELLED", value: pagamento.valor }] } as never);
    await t.payments.refreshRefund(event.id);

    expect(pagamento.refundStatus).toBe("NEGADO");
    expect(contestacao).toMatchObject({ status: "ABERTA", decisao: null });
    await avisosEnviados();
    expect(avisos("Contestação em análise de novo")).toHaveLength(2);
    expect(emailsAoSuporte()).toHaveLength(1);

    await t.payments.payout(event.id);
    await t.service.settleDueHiring(event.id, hoursFromNow(24 * 9));
    expect(t.world.asaasCalls.transferPix).toHaveLength(0);

    t.world.asaasCharges.set(pagamento.asaasPaymentId, { status: "RECEIVED", value: pagamento.valor });
    await t.service.resolveDispute(contestacao.id, "DEVOLVER_CONTRATANTE", "Nova tentativa de estorno.");
    expect(t.world.asaasCalls.refundPayment).toHaveLength(2);
    expect(contestacao).toMatchObject({ status: "AGUARDANDO_ESTORNO", decisao: "DEVOLVER_CONTRATANTE" });
  });

  it("aviso de negativa enquanto o estorno aguarda autorização na Asaas mantém a contestação aguardando o estorno", async () => {
    const { contestacao, pagamento } = await contestado();
    await t.service.resolveDispute(contestacao.id, "DEVOLVER_CONTRATANTE", null);
    t.world.asaasCharges.set(pagamento.asaasPaymentId, { status: "RECEIVED", value: pagamento.valor, refunds: [{ status: "AWAITING_CRITICAL_ACTION_AUTHORIZATION", value: pagamento.valor }] } as never);

    await t.payments.handleWebhook({ id: "evt_negado_aguardando", event: "PAYMENT_REFUND_DENIED", payment: { id: pagamento.asaasPaymentId } });

    expect(pagamento.refundStatus).toBe("PROCESSANDO");
    expect(contestacao).toMatchObject({ status: "AGUARDANDO_ESTORNO", decisao: "DEVOLVER_CONTRATANTE" });
    await avisosEnviados();
    expect(avisos("Contestação em análise de novo")).toHaveLength(0);
    expect(t.world.asaasCalls.refundPayment).toHaveLength(1);
  });

  it("negativa pelo webhook também devolve a contestação para análise", async () => {
    const { contestacao, pagamento } = await contestado();
    await t.service.resolveDispute(contestacao.id, "DEVOLVER_CONTRATANTE", null);

    await t.payments.handleWebhook({ id: "evt_negado", event: "PAYMENT_REFUND_DENIED", payment: { id: pagamento.asaasPaymentId } });

    expect(pagamento.refundStatus).toBe("NEGADO");
    expect(contestacao).toMatchObject({ status: "ABERTA", decisao: null });
    await avisosEnviados();
    expect(avisos("Contestação em análise de novo")).toHaveLength(2);
    expect(emailsAoSuporte()).toHaveLength(1);
  });

  it("pedido de estorno que a Asaas não registrou é desfeito e a contestação volta para análise", async () => {
    const { event, contestacao, pagamento } = await contestado();
    await t.service.resolveDispute(contestacao.id, "DEVOLVER_CONTRATANTE", null);
    pagamento.refundRequestedAt = new Date(Date.now() - 5 * 60 * 1000);

    await t.payments.refreshRefund(event.id);

    expect(pagamento.refundStatus).toBeNull();
    expect(contestacao).toMatchObject({ status: "ABERTA", decisao: null });
    expect(avisos("Contestação em análise de novo")).toHaveLength(2);
  });

  it("estorno recusado pela Asaas na própria decisão reabre a contestação sem avisar as partes nem o suporte", async () => {
    const { contestacao, pagamento } = await contestado();
    vi.spyOn(t.world.stores.asaas, "refundPayment").mockRejectedValueOnce(new AppError(409, "ESTORNO_RECUSADO", "Estorno recusado."));

    await expect(t.service.resolveDispute(contestacao.id, "DEVOLVER_CONTRATANTE", null)).rejects.toMatchObject({ code: "ESTORNO_RECUSADO" });

    expect(pagamento.refundStatus).toBe("NEGADO");
    expect(contestacao).toMatchObject({ status: "ABERTA", decisao: null });
    await avisosEnviados();
    expect(avisos("Contestação em análise de novo")).toHaveLength(0);
    expect(avisos("Contestação resolvida")).toHaveLength(0);
    expect(avisos("Devolução recusada")).toHaveLength(0);
    expect(emailsAoSuporte()).toHaveLength(0);
  });

  it("pedido de estorno sem resposta e não registrado pela Asaas na própria decisão reabre a contestação sem avisos", async () => {
    const { contestacao, pagamento } = await contestado();
    vi.spyOn(t.world.stores.asaas, "refundPayment").mockRejectedValueOnce(new AppError(502, "PAGAMENTO_INDISPONIVEL", "sem resposta da Asaas"));

    await expect(t.service.resolveDispute(contestacao.id, "DEVOLVER_CONTRATANTE", null)).rejects.toMatchObject({ status: 502 });

    expect(pagamento.refundStatus).toBeNull();
    expect(contestacao).toMatchObject({ status: "ABERTA", decisao: null });
    await avisosEnviados();
    expect(avisos("Contestação em análise de novo")).toHaveLength(0);
    expect(avisos("Contestação resolvida")).toHaveLength(0);
    expect(emailsAoSuporte()).toHaveLength(0);
  });

  it("estorno pedido e cancelado pela Asaas ainda na própria decisão não anuncia a decisão nem a reabertura", async () => {
    const { contestacao, pagamento } = await contestado();
    vi.spyOn(t.world.stores.asaas, "refundPayment").mockImplementationOnce(async (paymentId) => {
      t.world.asaasCharges.set(paymentId, { status: "RECEIVED", value: pagamento.valor, refunds: [{ status: "CANCELLED", value: pagamento.valor }] } as never);
    });

    await expect(t.service.resolveDispute(contestacao.id, "DEVOLVER_CONTRATANTE", null)).rejects.toMatchObject({ code: "ESTORNO_RECUSADO", status: 409 });

    expect(pagamento.refundStatus).toBe("NEGADO");
    expect(contestacao).toMatchObject({ status: "ABERTA", decisao: null });
    await avisosEnviados();
    expect(avisos("Contestação em análise de novo")).toHaveLength(0);
    expect(avisos("Contestação resolvida")).toHaveLength(0);
    expect(emailsAoSuporte()).toHaveLength(0);
  });

  it("depois de uma reabertura silenciosa, a negativa posterior por webhook avisa partes e suporte", async () => {
    const { contestacao, pagamento } = await contestado();
    vi.spyOn(t.world.stores.asaas, "refundPayment").mockRejectedValueOnce(new AppError(409, "ESTORNO_RECUSADO", "Estorno recusado."));
    await expect(t.service.resolveDispute(contestacao.id, "DEVOLVER_CONTRATANTE", null)).rejects.toMatchObject({ code: "ESTORNO_RECUSADO" });

    await t.service.resolveDispute(contestacao.id, "DEVOLVER_CONTRATANTE", "Segunda tentativa.");
    await t.payments.handleWebhook({ id: "evt_negado_depois", event: "PAYMENT_REFUND_DENIED", payment: { id: pagamento.asaasPaymentId } });

    expect(contestacao).toMatchObject({ status: "ABERTA", decisao: null });
    await avisosEnviados();
    expect(avisos("Contestação resolvida")).toHaveLength(2);
    expect(avisos("Contestação em análise de novo")).toHaveLength(2);
    expect(emailsAoSuporte()).toHaveLength(1);
  });

  it("o comprovante informa se a contestação está em análise ou aguardando o estorno", async () => {
    const { event, contestacao } = await contestado();
    await expect(t.service.getHiring(musico, event.id, hoursFromNow(4))).resolves.toMatchObject({ contestacao: { status: "ABERTA" } });

    await t.service.resolveDispute(contestacao.id, "DEVOLVER_CONTRATANTE", null);

    await expect(t.service.getHiring(contratante, event.id, hoursFromNow(4))).resolves.toMatchObject({ contestacao: { status: "AGUARDANDO_ESTORNO", abertaPorMim: true } });
  });

  it("decisão gravada sem pedido de estorno, como numa queda da API, pode ser retomada", async () => {
    const { contestacao } = await contestado();
    await t.world.stores.events.decideDispute(contestacao.id, "DEVOLVER_CONTRATANTE", null);
    expect(contestacao.status).toBe("AGUARDANDO_ESTORNO");

    await t.service.resolveDispute(contestacao.id, "DEVOLVER_CONTRATANTE", null);

    expect(t.world.asaasCalls.refundPayment).toHaveLength(1);
    expect(avisos("Contestação resolvida")).toHaveLength(2);
    await expect(t.service.resolveDispute(contestacao.id, "PAGAR_MUSICO", null)).rejects.toMatchObject({ code: "CONTESTACAO_RESOLVIDA" });
    expect(t.world.asaasCalls.transferPix).toHaveLength(0);
  });
  describe("não comparecimento com contestação pendente", () => {
    const registrarAusencia = () => t.service.reportNoShow(contratante, t.world.disputes[0].eventId, hoursFromNow(4));
    function nadaMudou({ pagamento, contestacao, antes }: { pagamento: { refundStatus: unknown; refundAction: unknown; status: string }; contestacao: object; antes: { pedidos: number; avisos: number; contestacao: object; refund: [unknown, unknown] } }) {
      expect(t.world.asaasCalls.refundPayment).toHaveLength(antes.pedidos);
      expect([pagamento.refundStatus, pagamento.refundAction]).toEqual(antes.refund);
      expect(pagamento.status).toBe("PAGO");
      expect(t.world.penalties).toHaveLength(0);
      expect(contestacao).toEqual(antes.contestacao);
      expect(t.world.notifications).toHaveLength(antes.avisos);
    }
    const fotografar = (pagamento: { refundStatus: unknown; refundAction: unknown }, contestacao: object) => ({
      pedidos: t.world.asaasCalls.refundPayment.length,
      avisos: t.world.notifications.length,
      contestacao: { ...contestacao },
      refund: [pagamento.refundStatus, pagamento.refundAction] as [unknown, unknown],
    });

    it("com contestação aberta pelo contratante, o registro é recusado sem estorno, multa ou mudança na contestação", async () => {
      const { pagamento, contestacao } = await contestado();
      await avisosEnviados();
      const antes = fotografar(pagamento, contestacao);

      await expect(registrarAusencia()).rejects.toMatchObject({ status: 409, code: "CONTESTACAO_ABERTA" });
      await avisosEnviados();

      nadaMudou({ pagamento, contestacao, antes });
      expect(contestacao).toMatchObject({ status: "ABERTA", decisao: null });
    });

    it("com contestação aberta pelo músico, o registro também é recusado", async () => {
      const contratado = await hired(hoursFromNow(1));
      await t.service.openDispute(musico, contratado.event.id, "O contratante não confirmou o show que eu fiz.", hoursFromNow(3));
      const pagamento = t.world.payments.get(contratado.payment.id)!;
      const contestacao = t.world.disputes[0];
      await avisosEnviados();
      const antes = fotografar(pagamento, contestacao);

      await expect(t.service.reportNoShow(contratante, contratado.event.id, hoursFromNow(4))).rejects.toMatchObject({ status: 409, code: "CONTESTACAO_ABERTA" });
      await avisosEnviados();

      nadaMudou({ pagamento, contestacao, antes });
    });

    it("com contestação aguardando o estorno decidido pelo suporte, o registro é recusado sem novo pedido", async () => {
      const { pagamento, contestacao } = await contestado();
      await t.service.resolveDispute(contestacao.id, "DEVOLVER_CONTRATANTE", "Ausência comprovada");
      await avisosEnviados();
      const antes = fotografar(pagamento, contestacao);

      await expect(registrarAusencia()).rejects.toMatchObject({ status: 409, code: "CONTESTACAO_ABERTA" });
      await avisosEnviados();

      nadaMudou({ pagamento, contestacao, antes });
      expect(pagamento.refundStatus).toBe("PROCESSANDO");
    });

    it("com contestação aguardando estorno retomável, o registro é recusado e só o suporte retoma", async () => {
      const { pagamento, contestacao } = await contestado();
      await t.service.resolveDispute(contestacao.id, "DEVOLVER_CONTRATANTE", "Ausência comprovada");
      Object.assign(pagamento, { refundStatus: "NEGADO" });
      await avisosEnviados();
      const antes = fotografar(pagamento, contestacao);

      await expect(registrarAusencia()).rejects.toMatchObject({ status: 409, code: "CONTESTACAO_ABERTA" });
      await avisosEnviados();
      nadaMudou({ pagamento, contestacao, antes });

      const reivindicacao = vi.spyOn(t.world.stores.payments, "claimRefund");
      await t.service.resolveDispute(contestacao.id, "DEVOLVER_CONTRATANTE", "Nova tentativa de estorno.");
      expect(reivindicacao).toHaveBeenCalledWith(pagamento.id, "NAO_COMPARECIMENTO", contestacao.id);
      expect(pagamento).toMatchObject({ refundStatus: "PROCESSANDO", refundAction: "NAO_COMPARECIMENTO" });
      expect(contestacao).toMatchObject({ status: "AGUARDANDO_ESTORNO", decisao: "DEVOLVER_CONTRATANTE" });
    });

    it("a decisão de devolver do suporte pede o estorno com o id da contestação", async () => {
      const { pagamento, contestacao } = await contestado();
      const reivindicacao = vi.spyOn(t.world.stores.payments, "claimRefund");

      await t.service.resolveDispute(contestacao.id, "DEVOLVER_CONTRATANTE", null);

      expect(reivindicacao).toHaveBeenCalledWith(pagamento.id, "NAO_COMPARECIMENTO", contestacao.id);
      expect(pagamento).toMatchObject({ refundStatus: "PROCESSANDO", refundAction: "NAO_COMPARECIMENTO" });
      expect(t.world.asaasCalls.refundPayment).toEqual([pagamento.asaasPaymentId]);
    });

    it("contestação aberta depois da conferência do serviço é barrada no pedido de estorno e a resposta não finge estorno em andamento", async () => {
      const { event, pagamento, contestacao } = await contestado();
      await t.world.stores.events.reportAbsence(event.id, hoursFromNow(4));
      vi.spyOn(t.world.stores.events, "findOpenDispute").mockResolvedValueOnce(null);
      await avisosEnviados();
      const antes = fotografar(pagamento, contestacao);

      await expect(t.service.applyExpiredAbsence(event.id, depoisDoPrazoDeResposta(hoursFromNow(4)))).rejects.toMatchObject({ status: 409, code: "CONTESTACAO_ABERTA" });
      await avisosEnviados();

      nadaMudou({ pagamento, contestacao, antes });
    });

    it("pedido de estorno sem o id certo é recusado com a contestação aguardando estorno, mesmo para a ação do suporte", async () => {
      const { pagamento, contestacao } = await contestado();
      await t.service.resolveDispute(contestacao.id, "DEVOLVER_CONTRATANTE", null);
      Object.assign(pagamento, { refundStatus: "NEGADO" });

      expect(await t.world.stores.payments.claimRefund(pagamento.id, "NAO_COMPARECIMENTO")).toBe(false);
      expect(await t.world.stores.payments.claimRefund(pagamento.id, "NAO_COMPARECIMENTO", "outra-contestacao")).toBe(false);
      expect(await t.world.stores.payments.claimRefund(pagamento.id, "CANCELAR", contestacao.id)).toBe(false);
      expect(pagamento.refundStatus).toBe("NEGADO");
      expect(await t.world.stores.payments.claimRefund(pagamento.id, "NAO_COMPARECIMENTO", contestacao.id)).toBe(true);
    });

    it("a devolução de Pix pago fora de hora continua com a contestação aberta", async () => {
      const { event, pagamento, contestacao } = await contestado();
      const secundario = { ...pagamento, id: "p_secundario", asaasPaymentId: "pay_secundario", status: "EXPIRADO" as const, repasseStatus: null, refundStatus: "NEGADO" as const, refundAction: "NENHUMA" as const, refundRequestedAt: null };
      t.world.payments.set(secundario.id, secundario);
      t.world.asaasCharges.set(secundario.asaasPaymentId, { status: "RECEIVED", value: secundario.valor });

      await t.payments.syncCheckout(contratante, event.id, hoursFromNow(4));

      expect(t.world.asaasCalls.refundPayment).toEqual([secundario.asaasPaymentId]);
      expect(t.world.payments.get(secundario.id)).toMatchObject({ refundStatus: "PROCESSANDO", refundAction: "NENHUMA" });
      expect(pagamento.refundStatus).toBeNull();
      expect(contestacao).toMatchObject({ status: "ABERTA", decisao: null });
    });

    it("contestação não abre com estorno da contratação em andamento, mas abre com só a devolução de Pix fora de hora em andamento", async () => {
      const contratado = await hired(hoursFromNow(1));
      const pagamento = t.world.payments.get(contratado.payment.id)!;
      expect(await t.world.stores.payments.claimRefund(pagamento.id, "NAO_COMPARECIMENTO")).toBe(true);

      expect(await t.world.stores.events.openDispute({ eventId: contratado.event.id, abertaPor: contratante.id, motivo: "O músico não apareceu no bar." })).toBeNull();
      expect(t.world.disputes).toHaveLength(0);

      Object.assign(pagamento, { refundStatus: null, refundAction: null });
      t.world.payments.set("p_secundario", { ...pagamento, id: "p_secundario", asaasPaymentId: "pay_secundario", status: "EXPIRADO", repasseStatus: null, refundStatus: "PROCESSANDO", refundAction: "NENHUMA" });
      await t.service.openDispute(contratante, contratado.event.id, "O músico não apareceu no bar.", hoursFromNow(3));
      expect(t.world.disputes).toHaveLength(1);
    });
  });
});

describe("histórico da contestação na contratação", () => {
  async function contestado() {
    const contratado = await hired(hoursFromNow(1));
    await t.service.openDispute(contratante, contratado.event.id, "O músico não apareceu no bar.", hoursFromNow(3));
    return { ...contratado, contestacao: t.world.disputes[0] };
  }
  const historico = async (usuario = contratante, eventId: string) => {
    const resposta: Hiring = await t.service.getHiring(usuario, eventId, hoursFromNow(4));
    return resposta;
  };

  it("sem contestação, a contratação não traz contestação pendente nem histórico", async () => {
    const { event } = await hired(hoursFromNow(1));

    const resposta = await historico(contratante, event.id);

    expect(resposta.contestacao).toBeNull();
    expect(resposta.contestacaoResolvida).toBeNull();
    expect(historicoDaContestacao(resposta)).toBeNull();
  });

  it("contestação aberta aparece só como pendente, sem histórico", async () => {
    const { event } = await contestado();

    const resposta = await historico(musico, event.id);

    expect(resposta.contestacao).toEqual({ motivo: "O músico não apareceu no bar.", abertaPorMim: false, status: "ABERTA" });
    expect(resposta.contestacaoResolvida).toBeNull();
    expect(historicoDaContestacao(resposta)).toBeNull();
  });

  it("contestação aguardando o estorno continua pendente, sem histórico", async () => {
    const { event, payment, contestacao } = await contestado();
    t.world.stores.asaas.refundPayment = async (id) => {
      t.world.asaasCalls.refundPayment.push(id);
      t.world.asaasCharges.set(id, { status: "RECEIVED", value: payment.valor });
    };
    await t.service.resolveDispute(contestacao.id, "DEVOLVER_CONTRATANTE", null);

    const resposta = await historico(contratante, event.id);

    expect(resposta.contestacao).toMatchObject({ status: "AGUARDANDO_ESTORNO" });
    expect(resposta.contestacaoResolvida).toBeNull();
    expect(historicoDaContestacao(resposta)).toBeNull();
  });

  it("resolvida por devolução: as duas partes veem a decisão e a data, sem pendência", async () => {
    const { event, contestacao } = await contestado();
    await t.service.resolveDispute(contestacao.id, "DEVOLVER_CONTRATANTE", "Observação interna do suporte.");
    expect(contestacao.status).toBe("RESOLVIDA");

    for (const parte of [contratante, musico]) {
      const resposta = await historico(parte, event.id);
      expect(resposta.contestacao).toBeNull();
      expect(resposta.contestacaoResolvida).toEqual({ status: "RESOLVIDA", decisao: "DEVOLVER_CONTRATANTE", resolvidaEm: t.world.resolucaoDaContestacao.get(contestacao.id)!.toISOString() });
      expect(historicoDaContestacao(resposta)?.resultado).toBe("Resultado: o valor foi devolvido ao contratante.");
    }
  });

  it("resolvida com repasse ao músico: mostra a decisão, e o histórico não expõe motivo nem observação do suporte", async () => {
    const { event, contestacao } = await contestado();
    await t.service.resolveDispute(contestacao.id, "PAGAR_MUSICO", "Observação interna do suporte.");

    const resposta = await historico(musico, event.id);

    expect(resposta.contestacao).toBeNull();
    expect(resposta.contestacaoResolvida).toMatchObject({ status: "RESOLVIDA", decisao: "PAGAR_MUSICO" });
    expect(Object.keys(resposta.contestacaoResolvida!).sort()).toEqual(["decisao", "resolvidaEm", "status"]);
    expect(JSON.stringify(resposta)).not.toContain("Observação interna");
    expect(historicoDaContestacao(resposta)?.resultado).toBe("Decisão do suporte: o cachê vai para o músico.");
  });

  it("com várias contestações históricas, escolhe a resolvida mais recente do pagamento atual", async () => {
    const { event, payment } = await hired(hoursFromNow(1));
    const outro = await hired(hoursFromNow(100));
    const registrar = (id: string, eventId: string, paymentId: string | null, decisao: "PAGAR_MUSICO" | "DEVOLVER_CONTRATANTE", resolvidaEm: string | null) => {
      t.world.disputes.push({ id, eventId, abertaPor: "c1", motivo: "Motivo antigo da contestação.", status: "RESOLVIDA", decisao, observacao: null, createdAt: new Date("2030-01-01T00:00:00Z") });
      t.world.pagamentoDaContestacao.set(id, paymentId);
      if (resolvidaEm) t.world.resolucaoDaContestacao.set(id, new Date(resolvidaEm));
    };
    registrar("antiga", event.id, payment.id, "DEVOLVER_CONTRATANTE", "2030-01-02T00:00:00Z");
    registrar("recente", event.id, payment.id, "PAGAR_MUSICO", "2030-01-05T00:00:00Z");
    registrar("sem-data", event.id, payment.id, "DEVOLVER_CONTRATANTE", null);
    registrar("outro-pagamento", event.id, "pagamento-anterior", "DEVOLVER_CONTRATANTE", "2030-02-01T00:00:00Z");
    registrar("sem-vinculo", event.id, null, "DEVOLVER_CONTRATANTE", "2030-02-02T00:00:00Z");
    registrar("outro-evento", outro.event.id, outro.payment.id, "DEVOLVER_CONTRATANTE", "2030-03-01T00:00:00Z");

    const resposta = await historico(contratante, event.id);

    expect(resposta.contestacaoResolvida).toEqual({ status: "RESOLVIDA", decisao: "PAGAR_MUSICO", resolvidaEm: "2030-01-05T00:00:00.000Z" });
  });

  it("contestação resolvida de um pagamento anterior do mesmo evento não aparece na contratação atual", async () => {
    const { event } = await hired(hoursFromNow(1));
    t.world.disputes.push({ id: "anterior", eventId: event.id, abertaPor: "c1", motivo: "Motivo antigo da contestação.", status: "RESOLVIDA", decisao: "DEVOLVER_CONTRATANTE", observacao: null, createdAt: new Date() });
    t.world.pagamentoDaContestacao.set("anterior", "pagamento-anterior");
    t.world.resolucaoDaContestacao.set("anterior", new Date());

    expect((await historico(contratante, event.id)).contestacaoResolvida).toBeNull();
  });

  it("quem não é parte da contratação não vê a contratação nem o histórico", async () => {
    const { event, contestacao } = await contestado();
    await t.service.resolveDispute(contestacao.id, "PAGAR_MUSICO", null);

    for (const intruso of [outroContratante, outroMusico]) {
      await expect(t.service.getHiring(intruso, event.id, hoursFromNow(4))).rejects.toMatchObject({ status: 404, code: "EVENTO_NAO_ENCONTRADO" });
    }
  });

  it("ler o histórico não altera a decisão registrada", async () => {
    const { event, contestacao } = await contestado();
    await t.service.resolveDispute(contestacao.id, "DEVOLVER_CONTRATANTE", null);
    const antes = { ...contestacao };

    await historico(contratante, event.id);
    await historico(musico, event.id);

    expect(contestacao).toEqual(antes);
  });
});
