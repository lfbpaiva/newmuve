import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EventInput } from "../domain/event.ts";
import { AppError } from "../domain/errors.ts";
import { createEventService } from "./eventService.ts";
import { createNotifier } from "./notifications.ts";
import { createPaymentService } from "./paymentService.ts";
import { contratante, hoursFromNow, memoryWorld, musico, NOW, outroContratante, outroMusico, payAtAsaas } from "./testing.ts";

function setup() {
  const world = memoryWorld();
  const notifier = createNotifier({ ...world.stores, appUrl: "http://localhost:8443" });
  const payments = createPaymentService({ ...world.stores, notifier });
  const service = createEventService({ ...world.stores, payments, notifier });
  return { world, service, payments };
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
};

let t: ReturnType<typeof setup>;
beforeEach(() => {
  t = setup();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

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

    await expect(t.service.reportNoShow(contratante, event.id, hoursFromNow(2))).resolves.toEqual({ situacao: "ESTORNO_PROCESSANDO" });
    await expect(t.service.confirmCompletion(musico, event.id, hoursFromNow(3))).rejects.toMatchObject({ code: "ESTORNO_PENDENTE" });
    expect((await t.service.getHiring(contratante, event.id, hoursFromNow(24 * 9))).evento.status).toBe("CONTRATADO");
    expect(t.world.asaasCalls.transferPix).toHaveLength(0);

    t.world.asaasCharges.set(payment.asaasPaymentId, { status: "REFUNDED", value: payment.valor });
    await expect(t.service.reportNoShow(contratante, event.id, hoursFromNow(24 * 3))).resolves.toEqual({ situacao: "ESTORNADO" });
    expect(t.world.events.get(event.id)?.status).toBe("CANCELADO");
    expect(t.world.payments.get(payment.id)?.status).toBe("ESTORNADO");
  });

  it("estorno negado fica visível, mas não impede a confirmação nem o repasse", async () => {
    const { event, payment } = await hired(hoursFromNow(1));
    t.world.stores.asaas.refundPayment = async () => {
      throw new AppError(409, "ESTORNO_RECUSADO", "Estorno recusado.");
    };

    await expect(t.service.reportNoShow(contratante, event.id, hoursFromNow(2))).rejects.toMatchObject({ code: "ESTORNO_RECUSADO" });
    expect((await t.service.getHiring(contratante, event.id, hoursFromNow(2))).pagamento?.refundStatus).toBe("NEGADO");

    await t.service.confirmCompletion(contratante, event.id, hoursFromNow(3));
    const concluido = await t.service.confirmCompletion(musico, event.id, hoursFromNow(3));

    expect(concluido.status).toBe("CONCLUIDO");
    expect(t.world.asaasCalls.transferPix).toEqual([expect.objectContaining({ value: 500 })]);
    expect(t.world.payments.get(payment.id)).toMatchObject({ status: "PAGO", repasseStatus: "PROCESSANDO", refundStatus: "NEGADO" });
  });

  it("estorno negado não impede a conclusão automática por prazo", async () => {
    const { event, payment } = await hired(hoursFromNow(1));
    await t.service.confirmCompletion(contratante, event.id, hoursFromNow(2));
    t.world.payments.get(payment.id)!.refundStatus = "NEGADO";

    const comprovante = await t.service.getHiring(contratante, event.id, hoursFromNow(24 * 8));

    expect(comprovante.evento.status).toBe("CONCLUIDO");
    expect(t.world.asaasCalls.transferPix).toHaveLength(1);
  });

  it("estorno negado permite cancelar sem estorno com menos de 24h", async () => {
    const { event, payment } = await hired(hoursFromNow(12));
    t.world.payments.get(payment.id)!.refundStatus = "NEGADO";

    await expect(t.service.cancelHiring(contratante, event.id, undefined, NOW)).resolves.toEqual({ situacao: "SEM_ESTORNO" });
    expect(t.world.asaasCalls.transferPix).toHaveLength(1);
  });

  it("repasse de cancelamento em cima da hora é tentado de novo ao abrir o comprovante", async () => {
    const { event, payment } = await hired(hoursFromNow(12));
    t.world.failures.transfer = true;
    await t.service.cancelHiring(contratante, event.id, undefined, NOW);
    expect(t.world.payments.get(payment.id)?.repasseStatus).toBe("FALHOU");

    t.world.failures.transfer = false;
    await t.service.getHiring(musico, event.id, NOW);

    expect(t.world.payments.get(payment.id)?.repasseStatus).toBe("PROCESSANDO");
    expect(t.world.asaasCalls.transferPix).toHaveLength(1);
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

  it("contratante com menos de 24h: sem estorno, o cachê vai para o músico", async () => {
    const { event, payment } = await hired(hoursFromNow(12));

    await expect(t.service.cancelHiring(contratante, event.id, undefined, NOW)).resolves.toEqual({ situacao: "SEM_ESTORNO" });

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
  it("a segunda confirmação conclui o show e dispara o repasse ao músico", async () => {
    const { event, payment } = await hired(hoursFromNow(1));
    const depois = hoursFromNow(5);

    await t.service.confirmCompletion(contratante, event.id, depois);
    expect(t.world.asaasCalls.transferPix).toHaveLength(0);

    await t.service.confirmCompletion(musico, event.id, depois);
    expect(t.world.asaasCalls.transferPix).toEqual([expect.objectContaining({ value: 500 })]);
    expect(t.world.payments.get(payment.id)?.repasseStatus).toBe("PROCESSANDO");
  });

  it("com uma só confirmação, conclui e repassa automaticamente após 7 dias", async () => {
    const { event } = await hired(hoursFromNow(1));
    await t.service.confirmCompletion(musico, event.id, hoursFromNow(5));

    const antes = await t.service.getHiring(contratante, event.id, hoursFromNow(24 * 6));
    expect(antes.evento.status).toBe("CONTRATADO");
    expect(t.world.asaasCalls.transferPix).toHaveLength(0);

    const depois = await t.service.getHiring(contratante, event.id, hoursFromNow(24 * 7 + 2));
    expect(depois.evento.status).toBe("CONCLUIDO");
    expect(t.world.asaasCalls.transferPix).toHaveLength(1);
  });

  it("sem nenhuma confirmação nem ausência registrada, o show é dado como realizado após 7 dias", async () => {
    const { event } = await hired(hoursFromNow(1));

    expect((await t.service.getHiring(contratante, event.id, hoursFromNow(24 * 6))).evento.status).toBe("CONTRATADO");
    const view = await t.service.getHiring(contratante, event.id, hoursFromNow(24 * 8 + 1));

    expect(view.evento.status).toBe("CONCLUIDO");
    expect(t.world.asaasCalls.transferPix).toHaveLength(1);
  });

  it("o não comparecimento só pode ser registrado até 7 dias após o show", async () => {
    const { event } = await hired(hoursFromNow(1));

    await expect(t.service.reportNoShow(contratante, event.id, hoursFromNow(24 * 8 + 1))).rejects.toMatchObject({ code: "PRAZO_ENCERRADO" });
  });
});

describe("não comparecimento (garantia do contratante)", () => {
  it("após o horário, sem confirmação do músico: estorno integral e evento cancelado", async () => {
    const { event, payment } = await hired(hoursFromNow(1));

    await t.service.reportNoShow(contratante, event.id, hoursFromNow(4));

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
    await t.service.reportNoShow(contratante, outro.event.id, hoursFromNow(4));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(t.world.sent).toEqual([
      expect.objectContaining({ to: "m1@exemplo.com", subject: expect.stringContaining("Não comparecimento") }),
      expect.objectContaining({ to: "m1@exemplo.com", subject: expect.stringContaining("Multa por ausência") }),
    ]);
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

describe("contraproposta no chat", () => {
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

describe("penalidades do músico", () => {
  it("ausência registrada gera multa de 20% e visibilidade reduzida; a multa sai do próximo cachê", async () => {
    const { event } = await hired(hoursFromNow(1));
    await t.service.reportNoShow(contratante, event.id, hoursFromNow(3));

    expect(t.world.penalties).toEqual([expect.objectContaining({ musicianId: "m1", tipo: "AUSENCIA", multa: 100 })]);
    expect(t.world.accounts.get("m1")?.visibilidadeReduzidaAte).toBeInstanceOf(Date);

    const proximo = await hired(hoursFromNow(48));
    await t.service.confirmCompletion(contratante, proximo.event.id, hoursFromNow(50));
    await t.service.confirmCompletion(musico, proximo.event.id, hoursFromNow(50));

    expect(t.world.asaasCalls.transferPix.at(-1)?.value).toBe(400);
    expect(t.world.payments.get(proximo.payment.id)?.multaDescontada).toBe(100);
    expect(t.world.penalties[0].quitada).toBe(true);
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
});

describe("contestação", () => {
  it("congela o repasse até o suporte decidir, e a decisão paga o músico", async () => {
    const { event } = await hired(hoursFromNow(1));
    await t.service.confirmCompletion(musico, event.id, hoursFromNow(3));

    await expect(t.service.reportNoShow(contratante, event.id, hoursFromNow(4))).rejects.toMatchObject({ code: "MUSICO_CONFIRMOU" });
    await t.service.openDispute(contratante, event.id, "O músico não apareceu no bar.", hoursFromNow(4));
    await expect(t.service.confirmCompletion(contratante, event.id, hoursFromNow(5))).rejects.toMatchObject({ code: "CONTESTACAO_ABERTA" });
    expect((await t.service.getHiring(contratante, event.id, hoursFromNow(24 * 9))).evento.status).toBe("CONTRATADO");
    expect(t.world.asaasCalls.transferPix).toHaveLength(0);

    await t.service.resolveDispute(t.world.disputes[0].id, "PAGAR_MUSICO", "Fotos do show enviadas pelo músico.");

    expect(t.world.events.get(event.id)?.status).toBe("CONCLUIDO");
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

  it("músico Pro se inscreve em eventos a até 400 km", async () => {
    const longe = t.world.seedEvent({ cidade: "Londrina" });

    await expect(t.service.apply(musico, longe.id, null, NOW)).rejects.toMatchObject({ code: "EVENTO_INCOMPATIVEL" });
    t.world.accounts.get("m1")!.proAte = hoursFromNow(24 * 30);
    await expect(t.service.apply(musico, longe.id, null, NOW)).resolves.toBeUndefined();
  });
});
