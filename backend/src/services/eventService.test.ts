import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EventInput } from "../domain/event.ts";
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

    await t.service.apply(musico, event.id, NOW);
    await expect(t.service.apply(musico, event.id, NOW)).rejects.toMatchObject({ code: "JA_INSCRITO" });
    expect(t.world.candidates.size).toBe(1);
  });

  it("aceita cidade vizinha dentro do raio máximo e recusa o que está além dele", async () => {
    const vizinha = t.world.seedEvent({ cidade: "Toledo" });
    const noRaio = t.world.seedEvent({ cidade: "Foz do Iguacu" });
    const longe = t.world.seedEvent({ cidade: "Curitiba" });
    const desconhecida = t.world.seedEvent({ cidade: "Cidade Inexistente" });

    await expect(t.service.apply(musico, vizinha.id, NOW)).resolves.toBeUndefined();
    await expect(t.service.apply(musico, noRaio.id, NOW)).resolves.toBeUndefined();
    await expect(t.service.apply(musico, longe.id, NOW)).rejects.toMatchObject({ code: "EVENTO_INCOMPATIVEL" });
    await expect(t.service.apply(musico, desconhecida.id, NOW)).rejects.toMatchObject({ code: "EVENTO_INCOMPATIVEL" });
  });

  it("recusa contratante e evento de estilo fora do perfil", async () => {
    const outroEstilo = t.world.seedEvent({ estilosMusicais: ["Pagode"] });
    const compativel = t.world.seedEvent();

    await expect(t.service.apply(contratante, compativel.id, NOW)).rejects.toMatchObject({ status: 403 });
    await expect(t.service.apply(musico, outroEstilo.id, NOW)).rejects.toMatchObject({ code: "EVENTO_INCOMPATIVEL" });
  });

  it("aceita a mesma cidade escrita com caixa e acentuação diferentes", async () => {
    t.world.accounts.get("m1")!.cidade = "São José dos Pinhais";
    const event = t.world.seedEvent({ cidade: "SAO JOSE DOS PINHAIS" });

    await expect(t.service.apply(musico, event.id, NOW)).resolves.toBeUndefined();
  });

  it("recusa evento já contratado ou já iniciado", async () => {
    const contratado = t.world.seedEvent({ status: "CONTRATADO", musicoContratadoId: "m2" });
    const iniciado = t.world.seedEvent({ inicio: hoursFromNow(-1) });

    await expect(t.service.apply(musico, contratado.id, NOW)).rejects.toMatchObject({ code: "INSCRICOES_ENCERRADAS" });
    await expect(t.service.apply(musico, iniciado.id, NOW)).rejects.toMatchObject({ code: "INSCRICOES_ENCERRADAS" });
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

// Evento de c1 já pago: m1 contratado, valor retido.
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
    // Documento e chave Pix nunca são expostos à outra parte.
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
  it("contratante com mais de 24h: estorno integral e evento cancelado", async () => {
    const { event, payment } = await hired(hoursFromNow(48));

    await expect(t.service.cancelHiring(contratante, event.id, NOW)).resolves.toEqual({ reembolsado: true });

    expect(t.world.asaasCalls.refundPayment).toEqual([payment.asaasPaymentId]);
    expect(t.world.payments.get(payment.id)?.status).toBe("ESTORNADO");
    expect(t.world.events.get(event.id)?.status).toBe("CANCELADO");
    expect(t.world.asaasCalls.transferPix).toHaveLength(0);
  });

  it("contratante com menos de 24h: sem estorno, o cachê vai para o músico", async () => {
    const { event, payment } = await hired(hoursFromNow(12));

    await expect(t.service.cancelHiring(contratante, event.id, NOW)).resolves.toEqual({ reembolsado: false });

    expect(t.world.asaasCalls.refundPayment).toHaveLength(0);
    expect(t.world.asaasCalls.transferPix).toEqual([expect.objectContaining({ value: 500, pixAddressKey: "m1@exemplo.com" })]);
    expect(t.world.payments.get(payment.id)?.status).toBe("PAGO");
    expect(t.world.events.get(event.id)?.status).toBe("CANCELADO");
  });

  it("músico desiste: estorno integral e o evento volta a aceitar candidatos", async () => {
    const { event, payment, outro } = await hired(hoursFromNow(12));

    await expect(t.service.cancelHiring(musico, event.id, NOW)).resolves.toEqual({ reembolsado: true });

    expect(t.world.asaasCalls.refundPayment).toEqual([payment.asaasPaymentId]);
    expect(t.world.events.get(event.id)).toMatchObject({ status: "ABERTO", musicoContratadoId: null });
    expect(t.world.candidates.get(outro.id)?.status).toBe("PENDENTE");
    expect([...t.world.candidates.values()].some((c) => c.musicianId === "m1")).toBe(false);
  });

  it("se o estorno falhar, a contratação permanece intacta", async () => {
    const { event } = await hired(hoursFromNow(48));
    t.world.failures.refund = true;

    await expect(t.service.cancelHiring(contratante, event.id, NOW)).rejects.toMatchObject({ status: 502 });
    expect(t.world.events.get(event.id)?.status).toBe("CONTRATADO");
  });

  it("não vale depois do início do evento, nem para terceiros", async () => {
    const { event } = await hired(hoursFromNow(48));

    await expect(t.service.cancelHiring(contratante, event.id, hoursFromNow(49))).rejects.toMatchObject({ code: "EVENTO_JA_INICIADO" });
    await expect(t.service.cancelHiring(outroMusico, event.id, NOW)).rejects.toMatchObject({ status: 404 });
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

  it("sem nenhuma confirmação, nada é concluído por prazo", async () => {
    const { event } = await hired(hoursFromNow(1));

    const view = await t.service.getHiring(contratante, event.id, hoursFromNow(24 * 30));

    expect(view.evento.status).toBe("CONTRATADO");
    expect(t.world.asaasCalls.transferPix).toHaveLength(0);
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

    await t.service.cancelHiring(musico, event.id, NOW);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(t.world.sent).toEqual([expect.objectContaining({ to: "c1@exemplo.com", subject: expect.stringContaining("desistiu") })]);

    const outro = await hired(hoursFromNow(1));
    t.world.sent.length = 0;
    await t.service.reportNoShow(contratante, outro.event.id, hoursFromNow(4));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(t.world.sent).toEqual([expect.objectContaining({ to: "m1@exemplo.com", subject: expect.stringContaining("Não comparecimento") })]);
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

    await expect(t.service.apply(musico, event.id, NOW)).rejects.toMatchObject({ code: "PERFIL_INCOMPLETO", message: expect.stringContaining("chave Pix") });
    await expect(t.service.createEvent(contratante, novoEvento, banner(), NOW)).rejects.toMatchObject({ code: "PERFIL_INCOMPLETO", message: expect.stringContaining("CPF ou CNPJ") });
    expect(t.world.candidates.size).toBe(0);
  });
});

describe("estilos do evento", () => {
  it("aceita candidatura com estilo em comum ou evento aberto a qualquer estilo", async () => {
    const varios = t.world.seedEvent({ estilosMusicais: ["Forró", "MPB"] });
    const qualquer = t.world.seedEvent({ estilosMusicais: ["Qualquer estilo"] });
    const nenhum = t.world.seedEvent({ estilosMusicais: ["Forró", "Axé"] });

    await expect(t.service.apply(musico, varios.id, NOW)).resolves.toBeUndefined();
    await expect(t.service.apply(musico, qualquer.id, NOW)).resolves.toBeUndefined();
    await expect(t.service.apply(musico, nenhum.id, NOW)).rejects.toMatchObject({ code: "EVENTO_INCOMPATIVEL" });
  });
});
