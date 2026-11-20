import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "../domain/errors.ts";
import { createNotifier } from "./notifications.ts";
import { COBRANCA_REMOVIDA_NA_ASAAS } from "./ports.ts";
import { CHECKOUT_MARGEM_DO_APP_MS, CHECKOUT_ORCAMENTO_MS, CHECKOUT_RESERVA_ENCERRAMENTO_MS, CHECKOUT_TEMPO_MINIMO_QR_MS, createPaymentService, REMOCAO_TEMPO_LIMITE_MS, situacaoDoEstornoNaAsaas } from "./paymentService.ts";
import { CHECKOUT_TEMPO_LIMITE_APP_MS } from "../../../shared/dominio.ts";
import { createRotinaFinanceira } from "./rotinaFinanceira.ts";
import { contratante, DECLARACAO_AUSENCIA, hoursFromNow, memoryWorld, NOW, outroContratante, payAtAsaas } from "./testing.ts";

function setup() {
  const world = memoryWorld();
  const notifier = createNotifier({ ...world.stores, appUrl: "http://localhost:8443" });
  const service = createPaymentService({ ...world.stores, notifier });
  const event = world.seedEvent({ cache: 750 });
  const candidate = world.seedCandidate(event.id, "m1");
  const outro = world.seedCandidate(event.id, "m2");
  return { world, service, event, candidate, outro };
}

const minutesLater = (minutes: number) => new Date(NOW.getTime() + minutes * 60 * 1000);

let t: ReturnType<typeof setup>;
beforeEach(() => {
  t = setup();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

const checkout = (now = NOW) => t.service.startCheckout(contratante, t.event.id, t.candidate.id, now);
const HORA = 60 * 60 * 1000;
const tentativaAberta = (paymentId: string) => t.world.tentativas.find((tentativa) => tentativa.paymentId === paymentId && tentativa.encerradaEm === null)!;
const tentativasDo = (paymentId: string) => t.world.tentativas.filter((tentativa) => tentativa.paymentId === paymentId);
const recuar = (tentativa: { solicitadaEm: Date; verificacaoIniciadaEm: Date | null }, campo: "solicitadaEm" | "verificacaoIniciadaEm", ms: number) => {
  tentativa[campo] = new Date(Date.now() - ms);
};
const semResposta = () =>
  vi.spyOn(t.world.stores.asaas, "transferPix").mockRejectedValueOnce(new AppError(502, "PAGAMENTO_INDISPONIVEL", "tempo esgotado sem saber se a Asaas criou a transferência"));

describe("checkout (aprovar candidato)", () => {
  it("recusa cobrar quando o valor da inscrição mudou depois que o contratante conferiu", async () => {
    t.candidate.valorProposto = 900;

    await expect(t.service.startCheckout(contratante, t.event.id, t.candidate.id, NOW, 300)).rejects.toMatchObject({ code: "VALOR_ALTERADO" });
    expect(t.world.asaasCalls.createPixCharge).toEqual([]);

    await expect(t.service.startCheckout(contratante, t.event.id, t.candidate.id, NOW, 900)).resolves.toMatchObject({ valorCache: 900 });
  });

  it("cobra o valor proposto pelo músico, mais a taxa, quando ele pediu outro cachê", async () => {
    t.candidate.valorProposto = 900;

    const payment = await checkout();

    expect(payment).toMatchObject({ valor: 990, valorComissao: 90, valorCache: 900 });
    expect(t.world.asaasCalls.createPixCharge).toEqual([{ value: 990, customer: expect.any(String) }]);
  });

  it("cancela cobrança pendente sem estorno e mantém evento e candidatura abertos", async () => {
    const payment = await checkout();

    await t.service.cancelPendingCheckout(contratante, t.event.id, NOW);

    expect(t.world.asaasCalls.cancelCharge).toEqual([payment.asaasPaymentId]);
    expect(t.world.asaasCalls.refundPayment).toHaveLength(0);
    expect(t.world.payments.get(payment.id)?.status).toBe("CANCELADO");
    expect(t.world.events.get(t.event.id)?.status).toBe("ABERTO");
    expect(t.world.candidates.get(t.candidate.id)?.status).toBe("PENDENTE");
    await expect(t.service.cancelPendingCheckout(outroContratante, t.event.id, NOW)).rejects.toMatchObject({ status: 404 });
  });

  it("não cancela cobrança que o Asaas já recebeu", async () => {
    const payment = await checkout();
    payAtAsaas(t.world, payment.asaasPaymentId);
    await expect(t.service.cancelPendingCheckout(contratante, t.event.id, NOW)).rejects.toMatchObject({ code: "PAGAMENTO_JA_RECEBIDO" });
    expect(t.world.events.get(t.event.id)?.status).toBe("CONTRATADO");
    expect(t.world.asaasCalls.cancelCharge).toHaveLength(0);
  });

  it("pagamento tardio de cobrança já cancelada não contrata o músico", async () => {
    const payment = await checkout();
    await t.service.cancelPendingCheckout(contratante, t.event.id, NOW);
    t.world.asaasCharges.set(payment.asaasPaymentId, { status: "RECEIVED", value: payment.valor });

    await t.service.handleWebhook({ id: "evt_late", event: "PAYMENT_RECEIVED", payment: { id: payment.asaasPaymentId } });

    expect(t.world.events.get(t.event.id)?.status).toBe("ABERTO");
    expect(t.world.asaasCalls.refundPayment).toEqual([payment.asaasPaymentId]);
    expect(t.world.payments.get(payment.id)?.status).toBe("ESTORNADO");
  });

  it("cobra cachê + 10% de comissão, com validade de 15 minutos", async () => {
    const payment = await checkout();

    expect(payment).toMatchObject({ valor: 825, valorComissao: 75, valorCache: 750, status: "PENDENTE", candidateId: t.candidate.id });
    expect(payment.pixCopiaCola).toBe(`pix-${payment.asaasPaymentId}`);
    expect(payment.expiraEm).toEqual(minutesLater(15));
    expect(t.world.asaasCalls.createPixCharge).toEqual([{ value: 825, customer: expect.stringMatching(/^cus_/) }]);
    expect(t.world.events.get(t.event.id)?.status).toBe("ABERTO");
  });

  it("é idempotente enquanto a cobrança está válida", async () => {
    const first = await checkout();
    const second = await checkout(minutesLater(5));

    expect(second.id).toBe(first.id);
    expect(t.world.asaasCalls.createPixCharge).toHaveLength(1);
    expect(t.world.asaasCalls.createCustomer).toBe(1);
  });

  it("não envia telefone opcional que a Asaas pode recusar", async () => {
    t.world.accounts.get(contratante.id)!.telefone = "45322210001";
    const createCustomer = vi.spyOn(t.world.stores.asaas, "createCustomer");

    const payment = await checkout();

    expect(payment.status).toBe("PENDENTE");
    expect(createCustomer).toHaveBeenCalledWith(expect.objectContaining({ name: "c1", externalReference: "c1" }), { correlacao: expect.any(String), timeoutMs: expect.any(Number) });
    expect(Object.prototype.hasOwnProperty.call(createCustomer.mock.calls[0]![0], "mobilePhone")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(createCustomer.mock.calls[0]![0], "phone")).toBe(false);
  });

  it("substitui a cobrança expirada, cancelando a antiga na Asaas", async () => {
    const first = await checkout();
    const second = await checkout(minutesLater(16));

    expect(second.id).not.toBe(first.id);
    expect(t.world.payments.get(first.id)?.status).toBe("EXPIRADO");
    expect(t.world.asaasCalls.cancelCharge).toEqual([first.asaasPaymentId]);
  });

  it("ao trocar de candidato, cancela a cobrança anterior", async () => {
    const first = await checkout();
    const second = await t.service.startCheckout(contratante, t.event.id, t.outro.id, minutesLater(2));

    expect(t.world.payments.get(first.id)?.status).toBe("CANCELADO");
    expect(second.candidateId).toBe(t.outro.id);
  });

  it("não gera nova cobrança se a anterior já foi paga na Asaas", async () => {
    const first = await checkout();
    payAtAsaas(t.world, first.asaasPaymentId);

    await expect(checkout(minutesLater(16))).rejects.toMatchObject({ code: "PAGAMENTO_JA_RECEBIDO" });
    expect(t.world.events.get(t.event.id)?.status).toBe("CONTRATADO");
    expect(t.world.asaasCalls.createPixCharge).toHaveLength(1);
  });

  it("só o dono do evento aprova candidatos", async () => {
    await expect(t.service.startCheckout(outroContratante, t.event.id, t.candidate.id, NOW)).rejects.toMatchObject({ status: 404 });
    expect(t.world.asaasCalls.createPixCharge).toHaveLength(0);
  });

  it("recusa evento não aberto, já iniciado ou candidatura de outro evento", async () => {
    const contratado = t.world.seedEvent({ status: "CONTRATADO", musicoContratadoId: "m2" });
    const iniciado = t.world.seedEvent({ inicio: hoursFromNow(-1) });
    const iniciadoCandidate = t.world.seedCandidate(iniciado.id, "m1");

    await expect(t.service.startCheckout(contratante, contratado.id, t.candidate.id, NOW)).rejects.toMatchObject({ code: "EVENTO_INDISPONIVEL" });
    await expect(t.service.startCheckout(contratante, iniciado.id, iniciadoCandidate.id, NOW)).rejects.toMatchObject({ code: "EVENTO_JA_INICIADO" });
    await expect(t.service.startCheckout(contratante, t.event.id, iniciadoCandidate.id, NOW)).rejects.toMatchObject({ code: "CANDIDATURA_NAO_ENCONTRADA" });
  });

  it("cancela a cobrança na Asaas se não conseguir registrá-la", async () => {
    t.world.stores.payments.insertPayment = async () => {
      throw new Error("falha simulada no banco");
    };

    await expect(checkout()).rejects.toThrow("falha simulada");
    expect(t.world.asaasCharges.size).toBe(0);
  });
});

describe("checkout quando o QR Code Pix não vem", () => {
  const semQr = () => vi.spyOn(t.world.stores.asaas, "getPixQrCode").mockRejectedValue(new AppError(502, "PAGAMENTO_INDISPONIVEL", "tempo esgotado na Asaas"));
  const cobrancasCriadas = () => [...t.world.asaasCharges.keys()];
  const pagamentosLocais = () => [...t.world.payments.values()];

  beforeEach(() => {
    vi.spyOn(console, "info").mockImplementation(() => {});
  });

  it("remoção confirmada: devolve o erro, não cria outra cobrança e não grava pagamento", async () => {
    semQr();

    await expect(checkout()).rejects.toMatchObject({ code: "PAGAMENTO_INDISPONIVEL" });

    expect(t.world.asaasCalls.createPixCharge).toHaveLength(1);
    expect(t.world.asaasCalls.cancelCharge).toHaveLength(1);
    expect(cobrancasCriadas()).toHaveLength(0);
    expect(pagamentosLocais()).toHaveLength(0);
  });

  it("remoção recusada, mas a consulta mostra a cobrança removida: nada fica para conciliar", async () => {
    semQr();
    const cancelar = t.world.stores.asaas.cancelCharge;
    vi.spyOn(t.world.stores.asaas, "cancelCharge").mockImplementationOnce(async (id) => {
      await cancelar(id);
      throw new AppError(409, "CANCELAMENTO_COBRANCA_RECUSADO", "recusa simulada");
    });

    await expect(checkout()).rejects.toMatchObject({ code: "PAGAMENTO_INDISPONIVEL" });

    expect(pagamentosLocais()).toHaveLength(0);
  });

  it("tempo esgotado na remoção com a cobrança ainda ativa: fica registrada, vencida e sem QR, e a consulta seguinte a encerra", async () => {
    semQr();
    const remocao = vi.spyOn(t.world.stores.asaas, "cancelCharge").mockRejectedValueOnce(new AppError(502, "PAGAMENTO_INDISPONIVEL", "tempo esgotado"));

    await expect(checkout()).rejects.toMatchObject({ code: "PAGAMENTO_INDISPONIVEL" });

    const [ativa] = cobrancasCriadas();
    expect(pagamentosLocais()).toEqual([expect.objectContaining({ asaasPaymentId: ativa, status: "PENDENTE", pixCopiaCola: null, pixQrCode: null })]);
    expect(pagamentosLocais()[0]!.expiraEm.getTime()).toBeLessThanOrEqual(Date.now());

    await expect(t.service.syncCheckout(contratante, t.event.id, minutesLater(1))).resolves.toMatchObject({ status: "EXPIRADO", asaasPaymentId: ativa });
    expect(remocao.mock.calls.map(([id]) => id)).toEqual([ativa, ativa]);
    expect(cobrancasCriadas()).toHaveLength(0);
  });

  it("remoção sem resposta e consulta também sem resposta: resultado inconclusivo, a cobrança fica registrada", async () => {
    semQr();
    vi.spyOn(t.world.stores.asaas, "cancelCharge").mockRejectedValueOnce(new AppError(502, "PAGAMENTO_INDISPONIVEL", "tempo esgotado"));
    vi.spyOn(t.world.stores.asaas, "getPayment").mockRejectedValueOnce(new AppError(502, "PAGAMENTO_INDISPONIVEL", "tempo esgotado"));

    await expect(checkout()).rejects.toMatchObject({ code: "PAGAMENTO_INDISPONIVEL" });

    expect(pagamentosLocais()).toEqual([expect.objectContaining({ asaasPaymentId: cobrancasCriadas()[0], status: "PENDENTE" })]);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('"remocao":"INCONCLUSIVA"'));
  });

  it("cobrança recebida enquanto a remoção falhava: fica registrada e a consulta seguinte efetiva a contratação", async () => {
    semQr();
    vi.spyOn(t.world.stores.asaas, "cancelCharge").mockImplementationOnce(async (id) => {
      payAtAsaas(t.world, id);
      throw new AppError(409, "CANCELAMENTO_COBRANCA_RECUSADO", "já recebida");
    });

    await expect(checkout()).rejects.toMatchObject({ code: "PAGAMENTO_INDISPONIVEL" });
    expect(pagamentosLocais()).toHaveLength(1);

    await expect(t.service.syncCheckout(contratante, t.event.id, minutesLater(1))).resolves.toMatchObject({ status: "PAGO" });
    expect(t.world.events.get(t.event.id)?.status).toBe("CONTRATADO");
  });

  it("sem registrar nem remover, deixa um alerta rastreável com a cobrança", async () => {
    semQr();
    vi.spyOn(t.world.stores.asaas, "cancelCharge").mockRejectedValueOnce(new AppError(502, "PAGAMENTO_INDISPONIVEL", "tempo esgotado"));
    vi.spyOn(t.world.stores.payments, "insertPayment").mockRejectedValueOnce(new Error("banco fora do ar"));

    await expect(checkout()).rejects.toMatchObject({ code: "PAGAMENTO_INDISPONIVEL" });

    expect(console.error).toHaveBeenCalledWith(expect.stringContaining(`"alerta":"COBRANCA_SEM_REGISTRO_LOCAL"`));
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining(cobrancasCriadas()[0]!));
  });

  it("nova tentativa depois de uma cobrança registrada para conciliação: encerra a antiga antes de criar outra", async () => {
    const qr = semQr();
    const remocao = vi.spyOn(t.world.stores.asaas, "cancelCharge").mockRejectedValueOnce(new AppError(502, "PAGAMENTO_INDISPONIVEL", "tempo esgotado"));
    await expect(checkout()).rejects.toMatchObject({ code: "PAGAMENTO_INDISPONIVEL" });
    const [antiga] = cobrancasCriadas();
    qr.mockRestore();

    const nova = await checkout(minutesLater(1));

    expect(remocao.mock.calls.map(([id]) => id)).toEqual([antiga, antiga]);
    expect(nova).toMatchObject({ status: "PENDENTE" });
    expect(nova.asaasPaymentId).not.toBe(antiga);
    expect(pagamentosLocais().filter((p) => p.status === "PENDENTE")).toEqual([expect.objectContaining({ id: nova.id })]);
  });

  it("checkouts simultâneos: um só pagamento pendente, e a operação que perde remove só a própria cobrança", async () => {
    const resultados = await Promise.allSettled([checkout(), checkout()]);

    const aceitos = resultados.filter((r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof checkout>>> => r.status === "fulfilled");
    expect(aceitos).toHaveLength(1);
    expect(resultados.find((r) => r.status === "rejected")).toMatchObject({ reason: { code: "COBRANCA_EM_ANDAMENTO" } });
    const vencedora = aceitos[0]!.value.asaasPaymentId;
    expect(t.world.asaasCalls.cancelCharge).toHaveLength(1);
    expect(t.world.asaasCalls.cancelCharge).not.toContain(vencedora);
    expect(t.world.asaasCharges.has(vencedora)).toBe(true);
    expect(pagamentosLocais().filter((p) => p.status === "PENDENTE")).toEqual([expect.objectContaining({ asaasPaymentId: vencedora })]);
  });

  it("dá ao QR Code o orçamento do app menos a margem e a reserva para encerrar, com a mesma correlação em todas as chamadas", async () => {
    const qr = vi.spyOn(t.world.stores.asaas, "getPixQrCode");
    const cobranca = vi.spyOn(t.world.stores.asaas, "createPixCharge");
    const antes = Date.now();

    await checkout();

    const [, opcoes] = qr.mock.calls[0]!;
    expect(opcoes!.prazo).toBeGreaterThanOrEqual(antes + CHECKOUT_ORCAMENTO_MS - CHECKOUT_RESERVA_ENCERRAMENTO_MS);
    expect(opcoes!.prazo).toBeLessThanOrEqual(Date.now() + CHECKOUT_ORCAMENTO_MS - CHECKOUT_RESERVA_ENCERRAMENTO_MS);
    expect(CHECKOUT_ORCAMENTO_MS).toBe(CHECKOUT_TEMPO_LIMITE_APP_MS - CHECKOUT_MARGEM_DO_APP_MS);
    expect(cobranca.mock.calls[0]![1]).toEqual({ correlacao: opcoes!.correlacao, timeoutMs: expect.any(Number) });
    expect(console.info).toHaveBeenCalledWith(expect.stringContaining(`"correlacao":"${opcoes!.correlacao}"`));
  });
});

describe("checkout dentro de um único orçamento de tempo", () => {
  let relogio = 0;
  let agora: { mockRestore(): void } | null = null;
  const passar = (ms: number) => { relogio += ms; };

  beforeEach(() => {
    relogio = 1_000_000;
    agora = vi.spyOn(Date, "now").mockImplementation(() => relogio);
    vi.spyOn(console, "info").mockImplementation(() => {});
  });
  afterEach(() => agora?.mockRestore());

  it("o prazo começa antes de liberar a cobrança anterior: sem tempo para cobrar de novo, não cria outra cobrança", async () => {
    const primeira = await checkout();
    vi.spyOn(t.world.stores.asaas, "getPayment").mockImplementationOnce(async (id) => {
      passar(20_000);
      return t.world.asaasCharges.get(id) ?? null;
    });
    const cancelar = t.world.stores.asaas.cancelCharge;
    vi.spyOn(t.world.stores.asaas, "cancelCharge").mockImplementationOnce(async (id) => {
      passar(15_000);
      return cancelar(id);
    });

    await expect(checkout(minutesLater(16))).rejects.toMatchObject({ code: "PAGAMENTO_TEMPO_INSUFICIENTE" });

    expect(t.world.asaasCalls.createPixCharge).toHaveLength(1);
    expect(t.world.payments.get(primeira.id)?.status).toBe("EXPIRADO");
  });

  it("o tempo gasto para criar a cobrança encurta o QR Code, mas não a reserva para encerrar", async () => {
    const inicio = relogio;
    const criar = t.world.stores.asaas.createPixCharge;
    const cobranca = vi.spyOn(t.world.stores.asaas, "createPixCharge").mockImplementationOnce(async (dados, contexto) => {
      passar(20_000);
      return criar(dados, contexto);
    });
    const qr = vi.spyOn(t.world.stores.asaas, "getPixQrCode").mockImplementationOnce(async (_id, opcoes) => {
      relogio = opcoes!.prazo!;
      throw new AppError(502, "PAGAMENTO_INDISPONIVEL", "tempo esgotado");
    });
    const remocao = vi.spyOn(t.world.stores.asaas, "cancelCharge");

    await expect(checkout()).rejects.toMatchObject({ code: "PAGAMENTO_INDISPONIVEL" });

    const prazoFinal = inicio + CHECKOUT_ORCAMENTO_MS;
    expect(cobranca.mock.calls[0]![1]!.timeoutMs).toBeLessThanOrEqual(prazoFinal - CHECKOUT_RESERVA_ENCERRAMENTO_MS - CHECKOUT_TEMPO_MINIMO_QR_MS - inicio);
    expect(qr.mock.calls[0]![1]!.prazo).toBe(prazoFinal - CHECKOUT_RESERVA_ENCERRAMENTO_MS);
    expect(qr.mock.calls[0]![1]!.prazo! - (inicio + 20_000)).toBe(CHECKOUT_ORCAMENTO_MS - CHECKOUT_RESERVA_ENCERRAMENTO_MS - 20_000);
    expect(remocao.mock.calls[0]![1]!.timeoutMs).toBe(REMOCAO_TEMPO_LIMITE_MS);
    expect(prazoFinal - relogio).toBe(CHECKOUT_RESERVA_ENCERRAMENTO_MS);
  });

  it("sem tempo para encerrar com folga, a remoção e a conferência usam só o que resta do orçamento", async () => {
    const inicio = relogio;
    vi.spyOn(t.world.stores.asaas, "getPixQrCode").mockImplementationOnce(async () => {
      relogio = inicio + CHECKOUT_ORCAMENTO_MS - 3_000;
      throw new AppError(502, "PAGAMENTO_INDISPONIVEL", "tempo esgotado");
    });
    const remocao = vi.spyOn(t.world.stores.asaas, "cancelCharge").mockRejectedValueOnce(new AppError(502, "PAGAMENTO_INDISPONIVEL", "tempo esgotado"));
    const consulta = vi.spyOn(t.world.stores.asaas, "getPayment");

    await expect(checkout()).rejects.toMatchObject({ code: "PAGAMENTO_INDISPONIVEL" });

    expect(remocao.mock.calls[0]![1]!.timeoutMs).toBe(3_000);
    expect(consulta.mock.calls[0]![1]!.timeoutMs).toBeLessThanOrEqual(3_000);
  });
});

describe("cobrança anterior sem remoção confirmada", () => {
  it("nova cobrança não é criada enquanto a Asaas não confirma a remoção da anterior", async () => {
    const primeira = await checkout();
    vi.spyOn(t.world.stores.asaas, "cancelCharge").mockResolvedValueOnce({ removida: false });

    await expect(checkout(minutesLater(16))).rejects.toMatchObject({ code: "COBRANCA_EM_CONCILIACAO" });

    expect(t.world.asaasCalls.createPixCharge).toHaveLength(1);
    expect(t.world.payments.get(primeira.id)?.status).toBe("PENDENTE");
  });

  it("consulta depois do vencimento sem remoção confirmada mantém a cobrança pendente e avisa no log", async () => {
    const primeira = await checkout();
    vi.spyOn(t.world.stores.asaas, "cancelCharge").mockResolvedValueOnce({ removida: false });

    await expect(t.service.syncCheckout(contratante, t.event.id, minutesLater(16))).resolves.toMatchObject({ id: primeira.id, status: "PENDENTE" });

    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('"alerta":"REMOCAO_NAO_CONFIRMADA"'));
  });
});

describe("consulta ativa da cobrança (sem depender do webhook)", () => {
  it("descobre o pagamento na Asaas e efetiva a contratação", async () => {
    const payment = await checkout();
    payAtAsaas(t.world, payment.asaasPaymentId);

    const synced = await t.service.syncCheckout(contratante, t.event.id, minutesLater(1));

    expect(synced).toMatchObject({ status: "PAGO", repasseStatus: "RETIDO" });
    expect(t.world.events.get(t.event.id)).toMatchObject({ status: "CONTRATADO", musicoContratadoId: "m1" });
  });

  it("mantém pendente enquanto não há pagamento", async () => {
    await checkout();

    expect((await t.service.syncCheckout(contratante, t.event.id, minutesLater(1)))?.status).toBe("PENDENTE");
  });

  it("cancela na Asaas a cobrança que passou dos 15 minutos", async () => {
    const payment = await checkout();

    const synced = await t.service.syncCheckout(contratante, t.event.id, minutesLater(16));

    expect(synced?.status).toBe("EXPIRADO");
    expect(t.world.asaasCalls.cancelCharge).toEqual([payment.asaasPaymentId]);
  });

  it("é restrita ao dono do evento", async () => {
    await checkout();

    await expect(t.service.syncCheckout(outroContratante, t.event.id, NOW)).rejects.toMatchObject({ status: 404 });
  });

  it("lê evento, estornos atrasados e último pagamento ao mesmo tempo, antes de falar com a Asaas", async () => {
    await checkout();
    let liberarEvento!: () => void;
    const eventoOriginal = t.world.stores.events.findEvent;
    vi.spyOn(t.world.stores.events, "findEvent").mockImplementation((id) => new Promise((resolve) => { liberarEvento = () => resolve(eventoOriginal(id)); }));
    const ultimo = vi.spyOn(t.world.stores.payments, "findLatestPayment");
    const atrasados = vi.spyOn(t.world.stores.payments, "findLateRefundsToRetry");
    const consultaNaAsaas = vi.spyOn(t.world.stores.asaas, "getPayment");

    const pedido = t.service.syncCheckout(contratante, t.event.id, minutesLater(1));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(atrasados).toHaveBeenCalledWith(t.event.id);
    expect(ultimo).toHaveBeenCalledWith(t.event.id);
    expect(consultaNaAsaas).not.toHaveBeenCalled();
    liberarEvento();
    await expect(pedido).resolves.toMatchObject({ status: "PENDENTE" });
    expect(consultaNaAsaas).toHaveBeenCalledTimes(1);
  });

  it("quem não é dono recebe 404 sem nenhuma chamada à Asaas nem estorno, mesmo que as outras leituras falhem", async () => {
    const payment = await checkout();
    payAtAsaas(t.world, payment.asaasPaymentId);
    vi.spyOn(t.world.stores.payments, "findLateRefundsToRetry").mockRejectedValue(new Error("falha de banco"));
    vi.spyOn(t.world.stores.payments, "findLatestPayment").mockRejectedValue(new Error("falha de banco"));
    const estornos = t.world.asaasCalls.refundPayment.length;
    const consultaNaAsaas = vi.spyOn(t.world.stores.asaas, "getPayment");

    await expect(t.service.syncCheckout(outroContratante, t.event.id, minutesLater(1))).rejects.toMatchObject({ status: 404, code: "EVENTO_NAO_ENCONTRADO" });
    expect(t.world.asaasCalls.refundPayment.length).toBe(estornos);
    expect(consultaNaAsaas).not.toHaveBeenCalled();
    expect(t.world.events.get(t.event.id)?.status).toBe("ABERTO");
  });

  it("dono do evento: falha na leitura do pagamento continua sendo erro, sem inventar situação", async () => {
    await checkout();
    vi.spyOn(t.world.stores.payments, "findLatestPayment").mockRejectedValue(new Error("falha de banco"));

    await expect(t.service.syncCheckout(contratante, t.event.id, minutesLater(1))).rejects.toThrow("falha de banco");
  });

  it("com estorno atrasado a processar, segue o caminho de antes: estorna e só então relê o último pagamento", async () => {
    const payment = await checkout();
    payAtAsaas(t.world, payment.asaasPaymentId);
    await t.service.syncCheckout(contratante, t.event.id, minutesLater(1));
    const registro = t.world.payments.get(payment.id)!;
    vi.spyOn(t.world.stores.payments, "findLateRefundsToRetry").mockResolvedValueOnce([{ ...registro, refundAction: "NENHUMA", refundStatus: null }]);
    const ultimo = vi.spyOn(t.world.stores.payments, "findLatestPayment");

    await t.service.syncCheckout(contratante, t.event.id, minutesLater(2));

    expect(ultimo).toHaveBeenCalledTimes(2);
  });
});

describe("webhook da Asaas", () => {
  const received = (asaasPaymentId: string, id = "evt_1") => ({ id, event: "PAYMENT_RECEIVED", payment: { id: asaasPaymentId } });

  it("pagamento recebido contrata o músico, recusa os demais e retém o valor", async () => {
    const payment = await checkout();
    payAtAsaas(t.world, payment.asaasPaymentId);

    await t.service.handleWebhook(received(payment.asaasPaymentId));

    expect(t.world.payments.get(payment.id)).toMatchObject({ status: "PAGO", repasseStatus: "RETIDO" });
    expect(t.world.events.get(t.event.id)).toMatchObject({ status: "CONTRATADO", musicoContratadoId: "m1" });
    expect(t.world.candidates.get(t.candidate.id)?.status).toBe("APROVADO");
    expect(t.world.candidates.get(t.outro.id)?.status).toBe("RECUSADO");
    expect(t.world.asaasCalls.transferPix).toHaveLength(0);
  });

  it("não confia na notificação: reconfirma na Asaas, e não devolve erro para não pausar a fila", async () => {
    const payment = await checkout();

    await expect(t.service.handleWebhook(received(payment.asaasPaymentId))).resolves.toBeUndefined();

    expect(t.world.events.get(t.event.id)?.status).toBe("ABERTO");
    expect(t.world.webhookEvents.size).toBe(0);
  });

  it("ignora pagamento de valor menor que o cobrado", async () => {
    const payment = await checkout();
    t.world.asaasCharges.set(payment.asaasPaymentId, { status: "RECEIVED", value: 1 });

    await t.service.handleWebhook(received(payment.asaasPaymentId));

    expect(t.world.events.get(t.event.id)?.status).toBe("ABERTO");
  });

  it("notificação repetida não é processada de novo", async () => {
    const payment = await checkout();
    payAtAsaas(t.world, payment.asaasPaymentId);
    const confirmPayment = vi.spyOn(t.world.stores.payments, "confirmPayment");

    await t.service.handleWebhook(received(payment.asaasPaymentId));
    await t.service.handleWebhook(received(payment.asaasPaymentId));

    expect(confirmPayment).toHaveBeenCalledTimes(1);
  });

  it("pagamento tardio, com o evento já contratado por outra cobrança, é estornado automaticamente", async () => {
    const antiga = await checkout();
    const nova = await t.service.startCheckout(contratante, t.event.id, t.outro.id, minutesLater(2));
    payAtAsaas(t.world, nova.asaasPaymentId);
    await t.service.handleWebhook(received(nova.asaasPaymentId, "evt_1"));
    t.world.asaasCharges.set(antiga.asaasPaymentId, { status: "RECEIVED", value: 825 });

    await t.service.handleWebhook(received(antiga.asaasPaymentId, "evt_2"));

    expect(t.world.asaasCalls.refundPayment).toEqual([antiga.asaasPaymentId]);
    expect(t.world.payments.get(antiga.id)?.status).toBe("ESTORNADO");
    expect(t.world.events.get(t.event.id)?.musicoContratadoId).toBe("m2");
  });

  it("estorno feito fora do app cancela a contratação", async () => {
    const payment = await checkout();
    payAtAsaas(t.world, payment.asaasPaymentId);
    await t.service.handleWebhook(received(payment.asaasPaymentId));

    t.world.asaasCharges.set(payment.asaasPaymentId, { status: "REFUNDED", value: payment.valor });
    await t.service.handleWebhook({ id: "evt_2", event: "PAYMENT_REFUNDED", payment: { id: payment.asaasPaymentId } });

    expect(t.world.payments.get(payment.id)).toMatchObject({ status: "ESTORNADO", repasseStatus: null });
    expect(t.world.events.get(t.event.id)?.status).toBe("CANCELADO");
  });

  it("não aceita webhook de estorno antes da confirmação pela Asaas", async () => {
    const payment = await checkout();
    payAtAsaas(t.world, payment.asaasPaymentId);
    await t.service.handleWebhook(received(payment.asaasPaymentId));

    const notification = { id: "evt_refund", event: "PAYMENT_REFUNDED", payment: { id: payment.asaasPaymentId } };
    await t.service.handleWebhook(notification);
    expect(t.world.payments.get(payment.id)?.status).toBe("PAGO");
    expect(t.world.events.get(t.event.id)?.status).toBe("CONTRATADO");
    expect(t.world.webhookEvents.has(notification.id)).toBe(false);

    t.world.asaasCharges.set(payment.asaasPaymentId, { status: "REFUNDED", value: payment.valor });
    await t.service.handleWebhook(notification);
    expect(t.world.payments.get(payment.id)?.status).toBe("ESTORNADO");
    expect(t.world.events.get(t.event.id)?.status).toBe("CANCELADO");
  });

  it("cobrança vencida deixa de estar pendente; cobranças de outros sistemas são ignoradas", async () => {
    const payment = await checkout();

    await t.service.handleWebhook({ id: "evt_1", event: "PAYMENT_OVERDUE", payment: { id: payment.asaasPaymentId } });
    await t.service.handleWebhook(received("pay_de_outro_sistema", "evt_2"));
    await t.service.handleWebhook({ id: "evt_3", event: "ACCOUNT_STATUS_UPDATED" });

    expect(t.world.payments.get(payment.id)?.status).toBe("EXPIRADO");
    expect(t.world.events.get(t.event.id)?.status).toBe("ABERTO");
  });

  it("cobrança excluída deixa de estar pendente sem alterar o evento", async () => {
    const payment = await checkout();
    await t.service.handleWebhook({ id: "evt_deleted", event: "PAYMENT_DELETED", payment: { id: payment.asaasPaymentId } });
    expect(t.world.payments.get(payment.id)?.status).toBe("CANCELADO");
    expect(t.world.events.get(t.event.id)?.status).toBe("ABERTO");
  });

  it("vencimento atrasado não sobrescreve pagamento confirmado", async () => {
    const payment = await checkout();
    payAtAsaas(t.world, payment.asaasPaymentId);
    await t.service.handleWebhook(received(payment.asaasPaymentId));
    await t.world.stores.payments.setPaymentStatus(payment.id, "EXPIRADO");
    expect(t.world.payments.get(payment.id)?.status).toBe("PAGO");
  });
});

describe("repasse ao músico", () => {
  async function contratado() {
    const payment = await checkout();
    payAtAsaas(t.world, payment.asaasPaymentId);
    await t.service.syncCheckout(contratante, t.event.id, minutesLater(1));
    return payment;
  }

  it("transfere o cachê (sem a comissão) para a chave Pix do músico", async () => {
    const payment = await contratado();

    await t.service.payout(t.event.id);

    const tentativa = tentativaAberta(payment.id);
    expect(t.world.asaasCalls.transferPix).toEqual([{ value: 750, pixAddressKey: "m1@exemplo.com", pixAddressKeyType: "EMAIL", externalReference: tentativa.id }]);
    expect(t.world.payments.get(payment.id)?.repasseStatus).toBe("PROCESSANDO");
    expect(tentativa).toMatchObject({ origem: "ATUAL", estado: "PENDENTE", referenciaExterna: tentativa.id });
  });

  it("nunca repassa duas vezes, mesmo com chamadas simultâneas", async () => {
    await contratado();

    await Promise.all([t.service.payout(t.event.id), t.service.payout(t.event.id), t.service.payout(t.event.id)]);
    await t.service.payout(t.event.id);

    expect(t.world.asaasCalls.transferPix).toHaveLength(1);
  });

  it("a notificação da transferência conclui (ou marca a falha d)o repasse", async () => {
    const payment = await contratado();
    await t.service.payout(t.event.id);
    const transferId = t.world.payments.get(payment.id)!.asaasTransferId!;

    t.world.asaasTransfers.set(transferId, "DONE");
    await t.service.handleWebhook({ id: "evt_t1", event: "TRANSFER_DONE", transfer: { id: transferId } });

    expect(t.world.payments.get(payment.id)?.repasseStatus).toBe("REPASSADO");
  });

  it("consulta a transferência na Asaas quando a notificação não chega", async () => {
    const payment = await contratado();
    await t.service.payout(t.event.id);
    const transferId = t.world.payments.get(payment.id)!.asaasTransferId!;

    await t.service.payout(t.event.id);
    expect(t.world.payments.get(payment.id)?.repasseStatus).toBe("PROCESSANDO");

    t.world.asaasTransfers.set(transferId, "DONE");
    await t.service.payout(t.event.id);
    expect(t.world.payments.get(payment.id)?.repasseStatus).toBe("REPASSADO");
    expect(t.world.asaasCalls.transferPix).toHaveLength(1);
  });

  it("falha na transferência fica registrada e não é tentada de novo, nem avisada de novo", async () => {
    const payment = await contratado();
    t.world.failures.transfer = true;

    await expect(t.service.payout(t.event.id)).resolves.toBeUndefined();
    expect(t.world.payments.get(payment.id)?.repasseStatus).toBe("FALHOU");

    t.world.failures.transfer = false;
    for (let vez = 0; vez < 5; vez++) await t.service.payout(t.event.id);
    expect(t.world.payments.get(payment.id)?.repasseStatus).toBe("FALHOU");
    expect(tentativasDo(payment.id)).toEqual([expect.objectContaining({ estado: "FALHOU" })]);
    expect(t.world.notifications.filter((n) => n.titulo.startsWith("Repasse não concluído"))).toHaveLength(1);
  });

  it("resposta perdida da Asaas não gera segunda transferência: a tentativa é localizada pela própria referência", async () => {
    const payment = await contratado();
    t.world.failures.transferLost = true;

    await t.service.payout(t.event.id);
    const tentativa = tentativaAberta(payment.id);
    expect(tentativa).toMatchObject({ estado: "INCONCLUSIVA", asaasTransferId: null });
    expect(t.world.asaasCalls.transferPix[0]?.externalReference).toBe(tentativa.id);
    expect(t.world.payments.get(payment.id)).toMatchObject({ repasseStatus: "PROCESSANDO", asaasTransferId: null });

    t.world.failures.transferLost = false;
    await t.service.payout(t.event.id);

    expect(t.world.asaasCalls.transferPix).toHaveLength(1);
    expect(t.world.asaasCalls.findTransfersByReference).toEqual([{ reference: tentativa.id, maxPages: 5 }]);
    expect(tentativaAberta(payment.id)).toMatchObject({ estado: "PENDENTE", asaasTransferId: expect.stringMatching(/^tra_/) });
  });

  it("falha ao gravar depois da transferência não marca o repasse como falho", async () => {
    const payment = await contratado();
    vi.spyOn(t.world.stores.payments, "registerTransfer").mockRejectedValueOnce(new Error("banco fora do ar"));

    await t.service.payout(t.event.id);
    await t.service.payout(t.event.id);

    expect(t.world.asaasCalls.transferPix).toHaveLength(1);
    expect(t.world.payments.get(payment.id)?.repasseStatus).toBe("PROCESSANDO");
  });

  it("sem transferência localizada, as duas conferências do suporte encerram a tentativa sem reenviar o repasse", async () => {
    const payment = await contratado();
    semResposta();
    await t.service.payout(t.event.id);
    const tentativa = tentativaAberta(payment.id);

    await t.service.payout(t.event.id);
    expect(t.world.asaasCalls.transferPix).toHaveLength(0);
    expect(tentativa.estado).toBe("INCONCLUSIVA");

    await expect(t.service.verifyPayoutAbsence(tentativa.id, "Ana Suporte")).rejects.toMatchObject({ code: "LIBERACAO_PRAZO_NAO_ATINGIDO" });
    recuar(tentativa, "solicitadaEm", 25 * HORA);
    await expect(t.service.verifyPayoutAbsence(tentativa.id, "Ana Suporte")).resolves.toMatchObject({ resultado: "VERIFICACAO_INICIADA" });
    await expect(t.service.verifyPayoutAbsence(tentativa.id, "Ana Suporte")).rejects.toMatchObject({ code: "LIBERACAO_ESTADO_INVALIDO" });
    await expect(t.service.confirmPayoutAbsence(tentativa.id, "Ana Suporte", DECLARACAO_AUSENCIA)).rejects.toMatchObject({ code: "LIBERACAO_PRAZO_NAO_ATINGIDO" });
    expect(t.world.asaasCalls.transferPix).toHaveLength(0);

    recuar(tentativa, "verificacaoIniciadaEm", 61 * 60 * 1000);
    await expect(t.service.confirmPayoutAbsence(tentativa.id, "Ana Suporte", "confirmo")).rejects.toMatchObject({ code: "LIBERACAO_DECLARACAO_INVALIDA" });
    await expect(t.service.confirmPayoutAbsence(tentativa.id, "Ana Suporte", DECLARACAO_AUSENCIA)).resolves.toEqual({ resultado: "AUSENCIA_CONFIRMADA" });

    expect(tentativa.estado).toBe("AUSENCIA_CONFIRMADA");
    expect(t.world.asaasCalls.transferPix).toHaveLength(0);
    expect(tentativaAberta(payment.id)).toBeUndefined();
    expect(t.world.payments.get(payment.id)?.repasseStatus).toBe("FALHOU");
    await t.service.payout(t.event.id);
    expect(t.world.asaasCalls.transferPix).toHaveLength(0);
    expect(t.world.decisoes).toEqual([
      expect.objectContaining({ tentativaId: tentativa.id, etapa: "VERIFICACAO", operadorNomeInformado: "Ana Suporte", identidadeAutenticada: false, declaracao: null }),
      expect.objectContaining({ tentativaId: tentativa.id, etapa: "CONFIRMACAO", operadorNomeInformado: "Ana Suporte", identidadeAutenticada: false, declaracao: DECLARACAO_AUSENCIA }),
    ]);
    await expect(t.service.confirmPayoutAbsence(tentativa.id, "Ana Suporte", DECLARACAO_AUSENCIA)).rejects.toMatchObject({ code: "LIBERACAO_ESTADO_INVALIDO" });
  });

  it("notificação atrasada da transferência falha não abre nova tentativa nem repete o aviso", async () => {
    const payment = await contratado();
    await t.service.payout(t.event.id);
    const primeira = t.world.payments.get(payment.id)!.asaasTransferId!;
    t.world.asaasTransfers.set(primeira, "FAILED");
    await t.service.payout(t.event.id);
    expect(t.world.payments.get(payment.id)?.repasseStatus).toBe("FALHOU");

    await t.service.payout(t.event.id);
    await t.service.handleWebhook({ id: "evt_antigo", event: "TRANSFER_FAILED", transfer: { id: primeira } });

    expect(t.world.payments.get(payment.id)?.repasseStatus).toBe("FALHOU");
    expect(t.world.asaasCalls.transferPix).toHaveLength(1);
    expect(tentativasDo(payment.id)).toHaveLength(1);
    expect(t.world.notifications.filter((n) => n.titulo.startsWith("Repasse não concluído"))).toHaveLength(1);
  });

  it("cliente de outra conta da Asaas é recriado e a cobrança sai na segunda tentativa", async () => {
    t.world.failures.staleCustomer = true;
    await expect(checkout()).resolves.toMatchObject({ status: "PENDENTE" });
    expect(t.world.asaasCalls.createCustomer).toBe(2);
  });

  it("não repassa sem pagamento confirmado nem para músico sem chave Pix", async () => {
    await checkout();
    await t.service.payout(t.event.id);
    expect(t.world.asaasCalls.transferPix).toHaveLength(0);

    const payment = [...t.world.payments.values()][0];
    payAtAsaas(t.world, payment.asaasPaymentId);
    await t.service.syncCheckout(contratante, t.event.id, minutesLater(1));
    t.world.accounts.get("m1")!.chavePix = null;
    await t.service.payout(t.event.id);

    expect(t.world.asaasCalls.transferPix).toHaveLength(0);
    expect(t.world.payments.get(payment.id)?.repasseStatus).toBe("FALHOU");
  });
});

describe("estorno da contratação", () => {
  it("devolve o valor integral e libera a retenção", async () => {
    const payment = await checkout();
    payAtAsaas(t.world, payment.asaasPaymentId);
    await t.service.syncCheckout(contratante, t.event.id, minutesLater(1));

    await t.service.refundHiring(t.event.id, "CANCELAR");

    expect(t.world.asaasCalls.refundPayment).toEqual([payment.asaasPaymentId]);
    expect(t.world.payments.get(payment.id)).toMatchObject({ status: "ESTORNADO", repasseStatus: null });
  });

  it("repasse em processamento bloqueia o estorno como repasse em andamento, e só o concluído aparece como já repassado", async () => {
    const payment = await checkout();
    payAtAsaas(t.world, payment.asaasPaymentId);
    await t.service.syncCheckout(contratante, t.event.id, minutesLater(1));
    await t.service.payout(t.event.id);
    expect(t.world.payments.get(payment.id)?.repasseStatus).toBe("PROCESSANDO");

    await expect(t.service.refundHiring(t.event.id, "CANCELAR")).rejects.toMatchObject({ code: "REPASSE_EM_CONFERENCIA", status: 409 });

    const transferId = t.world.payments.get(payment.id)!.asaasTransferId!;
    t.world.asaasTransfers.set(transferId, "DONE");
    await t.service.handleWebhook({ id: "evt_repasse_ok", event: "TRANSFER_DONE", transfer: { id: transferId } });
    expect(t.world.payments.get(payment.id)?.repasseStatus).toBe("REPASSADO");

    await expect(t.service.refundHiring(t.event.id, "CANCELAR")).rejects.toMatchObject({ code: "REPASSE_JA_REALIZADO", status: 409 });
    expect(t.world.asaasCalls.refundPayment).toHaveLength(0);
  });

  it("tentativa aberta com o repasse marcado como falho também bloqueia o estorno como repasse em andamento", async () => {
    const payment = await checkout();
    payAtAsaas(t.world, payment.asaasPaymentId);
    await t.service.syncCheckout(contratante, t.event.id, minutesLater(1));
    semResposta();
    await t.service.payout(t.event.id);
    t.world.payments.get(payment.id)!.repasseStatus = "FALHOU";

    await expect(t.service.refundHiring(t.event.id, "CANCELAR")).rejects.toMatchObject({ code: "REPASSE_EM_CONFERENCIA" });
    expect(t.world.asaasCalls.refundPayment).toHaveLength(0);
  });
});

describe("ciclo do estorno", () => {
  const hire = async () => {
    const payment = await checkout();
    payAtAsaas(t.world, payment.asaasPaymentId);
    await t.service.syncCheckout(contratante, t.event.id, minutesLater(1));
    return payment;
  };
  const refundStaysPending = () => {
    t.world.stores.asaas.refundPayment = async (id) => {
      t.world.asaasCalls.refundPayment.push(id);
      t.world.asaasCharges.set(id, { ...t.world.asaasCharges.get(id)!, status: "REFUND_REQUESTED" });
    };
  };

  it("estorno negado não bloqueia o repasse", async () => {
    const payment = await hire();
    t.world.payments.get(payment.id)!.refundStatus = "NEGADO";

    await t.service.payout(t.event.id);

    expect(t.world.asaasCalls.transferPix).toHaveLength(1);
    expect(t.world.payments.get(payment.id)?.repasseStatus).toBe("PROCESSANDO");
  });

  it("estorno em processamento bloqueia o repasse", async () => {
    const payment = await hire();
    t.world.payments.get(payment.id)!.refundStatus = "PROCESSANDO";

    await t.service.payout(t.event.id);

    expect(t.world.asaasCalls.transferPix).toHaveLength(0);
  });

  it("reconciliação libera a reserva quando a Asaas não tem estorno em andamento", async () => {
    const payment = await hire();
    Object.assign(t.world.payments.get(payment.id)!, { refundStatus: "PROCESSANDO", refundAction: "CANCELAR", refundRequestedAt: new Date(Date.now() - 2 * 60_000) });

    const latest = await t.service.refreshRefund(t.event.id);

    expect(latest).toMatchObject({ status: "PAGO", refundStatus: null, refundAction: null });
    expect(t.world.events.get(t.event.id)?.status).toBe("CONTRATADO");
  });

  it("reconciliação não libera um pedido de estorno recém-enviado", async () => {
    const payment = await hire();
    Object.assign(t.world.payments.get(payment.id)!, { refundStatus: "PROCESSANDO", refundAction: "CANCELAR", refundRequestedAt: new Date() });

    expect((await t.service.refreshRefund(t.event.id))?.refundStatus).toBe("PROCESSANDO");
  });

  it("pagamento tardio: falha ao pedir o estorno libera a reserva e a próxima notificação tenta de novo", async () => {
    const payment = await checkout();
    await t.service.cancelPendingCheckout(contratante, t.event.id, NOW);
    t.world.asaasCharges.set(payment.asaasPaymentId, { status: "RECEIVED", value: payment.valor });
    t.world.failures.refund = true;

    await t.service.handleWebhook({ id: "evt_a", event: "PAYMENT_RECEIVED", payment: { id: payment.asaasPaymentId } });
    expect(t.world.payments.get(payment.id)).toMatchObject({ status: "CANCELADO", refundStatus: null });

    t.world.failures.refund = false;
    await t.service.handleWebhook({ id: "evt_b", event: "PAYMENT_RECEIVED", payment: { id: payment.asaasPaymentId } });
    expect(t.world.payments.get(payment.id)).toMatchObject({ status: "ESTORNADO", refundStatus: "CONFIRMADO" });
  });

  it("pagamento tardio: a notificação de estorno concluído finaliza o estorno em processamento", async () => {
    const payment = await checkout();
    await t.service.cancelPendingCheckout(contratante, t.event.id, NOW);
    t.world.asaasCharges.set(payment.asaasPaymentId, { status: "RECEIVED", value: payment.valor });
    refundStaysPending();

    await t.service.handleWebhook({ id: "evt_a", event: "PAYMENT_RECEIVED", payment: { id: payment.asaasPaymentId } });
    expect(t.world.payments.get(payment.id)).toMatchObject({ status: "CANCELADO", refundStatus: "PROCESSANDO" });

    t.world.asaasCharges.set(payment.asaasPaymentId, { status: "REFUNDED", value: payment.valor });
    await t.service.handleWebhook({ id: "evt_b", event: "PAYMENT_REFUNDED", payment: { id: payment.asaasPaymentId } });

    expect(t.world.payments.get(payment.id)).toMatchObject({ status: "ESTORNADO", refundStatus: "CONFIRMADO" });
    expect(t.world.events.get(t.event.id)?.status).toBe("ABERTO");
  });

  it("pagamento tardio deixa de bloquear o evento e vira estornado quando a Asaas devolve o valor", async () => {
    const payment = await checkout();
    t.world.events.get(t.event.id)!.status = "CANCELADO";
    payAtAsaas(t.world, payment.asaasPaymentId);
    refundStaysPending();

    await t.service.handleWebhook({ id: "evt_a", event: "PAYMENT_RECEIVED", payment: { id: payment.asaasPaymentId } });
    expect(t.world.payments.get(payment.id)).toMatchObject({ status: "CANCELADO", refundStatus: "PROCESSANDO" });

    t.world.asaasCharges.set(payment.asaasPaymentId, { status: "REFUNDED", value: payment.valor });
    await t.service.handleWebhook({ id: "evt_b", event: "PAYMENT_REFUNDED", payment: { id: payment.asaasPaymentId } });

    expect(t.world.payments.get(payment.id)).toMatchObject({ status: "ESTORNADO", refundStatus: "CONFIRMADO" });
  });

  it("cobrança com devolução recusada não contrata e a devolução é tentada de novo", async () => {
    const payment = await checkout();
    Object.assign(t.world.payments.get(payment.id)!, { refundStatus: "NEGADO", refundAction: "NENHUMA" });
    payAtAsaas(t.world, payment.asaasPaymentId);

    await t.service.syncCheckout(contratante, t.event.id, minutesLater(1));

    expect(t.world.events.get(t.event.id)?.status).toBe("ABERTO");
    expect(t.world.asaasCalls.refundPayment).toEqual([payment.asaasPaymentId]);
  });

  it("Pix pago fora de hora não trava o evento, avisa o contratante e a devolução é tentada até dar certo", async () => {
    const payment = await checkout();
    t.world.events.get(t.event.id)!.status = "CANCELADO";
    payAtAsaas(t.world, payment.asaasPaymentId);
    t.world.failures.refund = true;

    await t.service.handleWebhook({ id: "evt_c", event: "PAYMENT_RECEIVED", payment: { id: payment.asaasPaymentId } });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(t.world.payments.get(payment.id)).toMatchObject({ status: "CANCELADO", refundAction: "NENHUMA", refundStatus: null });
    expect(await t.world.stores.payments.findPendingPayment(t.event.id)).toBeNull();
    expect(t.world.notifications.filter((n) => n.userId === "c1").map((n) => n.titulo)).toEqual([expect.stringContaining("Pix recebido fora de hora")]);

    t.world.failures.refund = false;
    await t.service.syncCheckout(contratante, t.event.id, minutesLater(1));

    expect(t.world.asaasCalls.refundPayment).toEqual([payment.asaasPaymentId]);
  });

  it("não cobra músico que já tem show contratado no mesmo horário", async () => {
    const outro = t.world.seedEvent({ cache: 300, status: "CONTRATADO", musicoContratadoId: "m1", inicio: t.event.inicio });

    await expect(checkout()).rejects.toMatchObject({ code: "MUSICO_OCUPADO" });
    expect(t.world.asaasCalls.createPixCharge).toHaveLength(0);
    expect(outro.status).toBe("CONTRATADO");
  });
});

describe("reserva e liquidação de multas no repasse", () => {
  async function contratado() {
    const payment = await checkout();
    payAtAsaas(t.world, payment.asaasPaymentId);
    await t.service.syncCheckout(contratante, t.event.id, minutesLater(1));
    return payment;
  }
  const multa = (valor: number) => {
    const penalty = { id: `pen_${t.world.penalties.length + 1}`, musicianId: "m1", eventId: null, tipo: "AUSENCIA" as const, multa: valor, quitada: false, estornoPaymentId: null, reservaPaymentId: null as string | null };
    t.world.penalties.push(penalty);
    return penalty;
  };
  const transferenciaAtual = (paymentId: string) => t.world.payments.get(paymentId)!.asaasTransferId!;
  const avisos = (titulo: string) => t.world.notifications.filter((n) => n.userId === "m1" && n.titulo.startsWith(titulo));
  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

  it("transferência pendente reserva a multa; a falha definitiva devolve a multa e nenhuma nova tentativa a reserva de novo", async () => {
    const fine = multa(100);
    const payment = await contratado();

    await t.service.payout(t.event.id);
    const primeira = transferenciaAtual(payment.id);
    expect(t.world.asaasCalls.transferPix.at(-1)?.value).toBe(650);
    expect(fine).toMatchObject({ reservaPaymentId: payment.id, quitada: false });
    expect(t.world.payments.get(payment.id)).toMatchObject({ repasseStatus: "PROCESSANDO", multaDescontada: 100 });

    t.world.asaasTransfers.set(primeira, "FAILED");
    await t.service.handleWebhook({ id: "evt_falha", event: "TRANSFER_FAILED", transfer: { id: primeira } });
    expect(fine).toMatchObject({ reservaPaymentId: null, quitada: false });
    expect(t.world.payments.get(payment.id)).toMatchObject({ repasseStatus: "FALHOU", multaDescontada: 0, asaasTransferId: null });
    expect(tentativasDo(payment.id)).toEqual([expect.objectContaining({ estado: "FALHOU", asaasTransferId: primeira })]);

    await t.service.payout(t.event.id);
    expect(t.world.asaasCalls.transferPix).toHaveLength(1);
    expect(tentativasDo(payment.id)).toHaveLength(1);
    expect(fine).toMatchObject({ reservaPaymentId: null, quitada: false });
    expect(t.world.payments.get(payment.id)).toMatchObject({ repasseStatus: "FALHOU", multaDescontada: 0 });
  });

  it("falha ao quitar depois da transferência concluída é recuperada pela rotina sem desconto duplicado", async () => {
    const rotina = createRotinaFinanceira({ paymentStore: t.world.stores.payments, eventStore: t.world.stores.events, payments: t.service, events: { settleDueHiring: async () => {} }, trava: t.world.stores.trava });
    const fine = multa(100);
    const payment = await contratado();
    await t.service.payout(t.event.id);
    t.world.asaasTransfers.set(transferenciaAtual(payment.id), "DONE");
    vi.spyOn(t.world.stores.payments, "completeAttempt").mockRejectedValueOnce(new Error("banco fora do ar"));

    await rotina.run(minutesLater(10));
    expect(fine.quitada).toBe(false);
    expect(t.world.payments.get(payment.id)?.repasseStatus).toBe("PROCESSANDO");

    await rotina.run(minutesLater(20));
    await rotina.run(minutesLater(30));
    await flush();
    expect(fine.quitada).toBe(true);
    expect(t.world.payments.get(payment.id)?.repasseStatus).toBe("REPASSADO");
    expect(t.world.asaasCalls.transferPix).toHaveLength(1);
    expect(avisos("Cachê repassado")).toHaveLength(1);
  });

  it("transferência perdida conciliada depois de uma multa nova quita só as multas reservadas originalmente", async () => {
    const original = multa(100);
    const payment = await contratado();
    t.world.failures.transferLost = true;
    await t.service.payout(t.event.id);
    t.world.failures.transferLost = false;
    expect(t.world.payments.get(payment.id)).toMatchObject({ repasseStatus: "PROCESSANDO", asaasTransferId: null, multaDescontada: 100 });
    expect(original.reservaPaymentId).toBe(payment.id);

    const nova = multa(50);
    const [perdida] = [...t.world.asaasTransfers.keys()];
    t.world.asaasTransfers.set(perdida, "DONE");
    await t.service.payout(t.event.id);

    expect(t.world.payments.get(payment.id)).toMatchObject({ repasseStatus: "REPASSADO", asaasTransferId: perdida, multaDescontada: 100 });
    expect(original).toMatchObject({ quitada: true, reservaPaymentId: payment.id });
    expect(nova).toMatchObject({ quitada: false, reservaPaymentId: null });
    expect(t.world.asaasCalls.transferPix).toHaveLength(1);
  });

  it("webhooks e consultas repetidos não repetem a quitação nem o aviso", async () => {
    const fine = multa(100);
    const payment = await contratado();
    await t.service.payout(t.event.id);
    const transferId = transferenciaAtual(payment.id);
    t.world.asaasTransfers.set(transferId, "DONE");

    await Promise.all([
      t.service.handleWebhook({ id: "evt_a", event: "TRANSFER_DONE", transfer: { id: transferId } }),
      t.service.handleWebhook({ id: "evt_b", event: "TRANSFER_DONE", transfer: { id: transferId } }),
      t.service.payout(t.event.id),
    ]);
    await t.service.handleWebhook({ id: "evt_a", event: "TRANSFER_DONE", transfer: { id: transferId } });
    await t.service.payout(t.event.id);
    await flush();

    expect(fine.quitada).toBe(true);
    expect(t.world.payments.get(payment.id)?.repasseStatus).toBe("REPASSADO");
    expect(t.world.asaasCalls.transferPix).toHaveLength(1);
    expect(avisos("Cachê repassado")).toHaveLength(1);
  });

  it("multa maior que o cachê fica inteira aberta, multa menor posterior é reservada e multa zero nunca entra", async () => {
    const grande = multa(800);
    const zero = multa(0);
    const pequena = multa(100);
    const payment = await contratado();

    await t.service.payout(t.event.id);

    expect(t.world.asaasCalls.transferPix.at(-1)?.value).toBe(650);
    expect(grande).toMatchObject({ reservaPaymentId: null, quitada: false });
    expect(zero).toMatchObject({ reservaPaymentId: null, quitada: false });
    expect(pequena).toMatchObject({ reservaPaymentId: payment.id, quitada: false });
  });

  it("liberação pelo suporte com busca incompleta não avança e mantém a reserva; com ausência confirmada, devolve a multa sem reenviar", async () => {
    const fine = multa(100);
    const payment = await contratado();
    semResposta();
    await t.service.payout(t.event.id);
    const tentativa = tentativaAberta(payment.id);
    expect(fine.reservaPaymentId).toBe(payment.id);
    recuar(tentativa, "solicitadaEm", 25 * HORA);

    t.world.failures.transferSearchIncomplete = true;
    await expect(t.service.verifyPayoutAbsence(tentativa.id, "Ana Suporte")).rejects.toMatchObject({ code: "PAGAMENTO_BUSCA_INCOMPLETA" });
    await t.service.payout(t.event.id);
    expect(t.world.asaasCalls.transferPix).toHaveLength(0);
    expect(tentativa.estado).toBe("INCONCLUSIVA");
    expect(fine.reservaPaymentId).toBe(payment.id);
    expect(t.world.payments.get(payment.id)).toMatchObject({ repasseStatus: "PROCESSANDO", multaDescontada: 100 });

    t.world.failures.transferSearchIncomplete = false;
    await t.service.verifyPayoutAbsence(tentativa.id, "Ana Suporte");
    recuar(tentativa, "verificacaoIniciadaEm", 61 * 60 * 1000);
    t.world.failures.transferSearchIncomplete = true;
    await expect(t.service.confirmPayoutAbsence(tentativa.id, "Ana Suporte", DECLARACAO_AUSENCIA)).rejects.toMatchObject({ code: "PAGAMENTO_BUSCA_INCOMPLETA" });
    expect(tentativa.estado).toBe("EM_VERIFICACAO");
    expect(fine.reservaPaymentId).toBe(payment.id);

    t.world.failures.transferSearchIncomplete = false;
    await expect(t.service.confirmPayoutAbsence(tentativa.id, "Ana Suporte", DECLARACAO_AUSENCIA)).resolves.toEqual({ resultado: "AUSENCIA_CONFIRMADA" });
    expect(t.world.asaasCalls.transferPix).toHaveLength(0);
    expect(tentativaAberta(payment.id)).toBeUndefined();
    expect(fine).toMatchObject({ reservaPaymentId: null, quitada: false });
    expect(t.world.payments.get(payment.id)).toMatchObject({ repasseStatus: "FALHOU", multaDescontada: 0 });
  });

  it("notificação repetida de falha da mesma transferência não reserva a multa de novo nem repete o aviso", async () => {
    const fine = multa(100);
    const payment = await contratado();
    await t.service.payout(t.event.id);
    const antiga = transferenciaAtual(payment.id);
    t.world.asaasTransfers.set(antiga, "FAILED");
    await t.service.handleWebhook({ id: "evt_1", event: "TRANSFER_FAILED", transfer: { id: antiga } });
    await t.service.payout(t.event.id);

    await t.service.handleWebhook({ id: "evt_2", event: "TRANSFER_FAILED", transfer: { id: antiga } });
    await flush();

    expect(t.world.payments.get(payment.id)).toMatchObject({ repasseStatus: "FALHOU", asaasTransferId: null, multaDescontada: 0 });
    expect(fine.reservaPaymentId).toBeNull();
    expect(t.world.asaasCalls.transferPix).toHaveLength(1);
    expect(avisos("Repasse não concluído")).toHaveLength(1);
  });

  it("repasse falho antigo com transferência registrada não é tocado pelo repasse", async () => {
    const fine = multa(100);
    const payment = await contratado();
    Object.assign(t.world.payments.get(payment.id)!, { repasseStatus: "FALHOU", asaasTransferId: "tra_antiga", multaDescontada: 100 });

    await t.service.payout(t.event.id);

    expect(t.world.asaasCalls.transferPix).toHaveLength(0);
    expect(fine.reservaPaymentId).toBeNull();
    expect(tentativasDo(payment.id)).toHaveLength(0);
    expect(t.world.payments.get(payment.id)).toMatchObject({ repasseStatus: "FALHOU", asaasTransferId: "tra_antiga", multaDescontada: 100 });
  });
});

describe("tentativas de repasse", () => {
  async function contratado() {
    const payment = await checkout();
    payAtAsaas(t.world, payment.asaasPaymentId);
    await t.service.syncCheckout(contratante, t.event.id, minutesLater(1));
    return payment;
  }
  const avisos = (titulo: string) => t.world.notifications.filter((n) => n.userId === "m1" && n.titulo.startsWith(titulo));
  const transferenciaNaAsaas = (id: string, status: string, externalReference: string) => {
    t.world.asaasTransfers.set(id, status);
    t.world.asaasTransferDetails.set(id, { externalReference, value: 750 });
  };
  const tentativaLegada = (paymentId: string, asaasTransferId: string | null) => {
    const legada = { id: `00000000-0000-4000-9000-${paymentId.padStart(12, "0")}`, paymentId, origem: "LEGADO" as const, estado: "INCONCLUSIVA" as const, referenciaExterna: paymentId, asaasTransferId, solicitadaEm: new Date(Date.now() - 30 * 24 * HORA), verificacaoIniciadaEm: null, encerradaEm: null };
    t.world.tentativas.push(legada);
    Object.assign(t.world.payments.get(paymentId)!, { repasseStatus: "PROCESSANDO" });
    return legada;
  };

  it("transferência concluída já na resposta do pedido conclui o repasse na hora", async () => {
    const payment = await contratado();
    vi.spyOn(t.world.stores.asaas, "transferPix").mockImplementationOnce(async (transfer) => {
      transferenciaNaAsaas("tra_instantanea", "DONE", transfer.externalReference);
      return { id: "tra_instantanea", status: "DONE" };
    });

    await t.service.payout(t.event.id);

    expect(t.world.payments.get(payment.id)?.repasseStatus).toBe("REPASSADO");
    expect(tentativasDo(payment.id)).toEqual([expect.objectContaining({ estado: "CONCLUIDA", asaasTransferId: "tra_instantanea" })]);
    expect(avisos("Cachê repassado")).toHaveLength(1);
  });

  it("recusa definitiva da Asaas encerra a tentativa e não abre outra sozinha", async () => {
    const payment = await contratado();
    t.world.failures.transferUnavailable = true;
    await t.service.payout(t.event.id);
    expect(tentativasDo(payment.id)).toEqual([expect.objectContaining({ estado: "FALHOU", asaasTransferId: null })]);
    expect(t.world.payments.get(payment.id)?.repasseStatus).toBe("FALHOU");

    t.world.failures.transferUnavailable = false;
    await t.service.payout(t.event.id);
    expect(tentativaAberta(payment.id)).toBeUndefined();
    expect(tentativasDo(payment.id)).toHaveLength(1);
  });

  it("erro ambíguo deixa a tentativa inconclusiva e a rotina nunca reenvia sozinha", async () => {
    const payment = await contratado();
    const rotina = createRotinaFinanceira({ paymentStore: t.world.stores.payments, eventStore: t.world.stores.events, payments: t.service, events: { settleDueHiring: async () => {} }, trava: t.world.stores.trava });
    const pedido = semResposta();

    await t.service.payout(t.event.id);
    await rotina.run(minutesLater(10));
    await rotina.run(minutesLater(20));

    expect(pedido).toHaveBeenCalledTimes(1);
    expect(tentativaAberta(payment.id)).toMatchObject({ estado: "INCONCLUSIVA", asaasTransferId: null });
    expect(t.world.payments.get(payment.id)?.repasseStatus).toBe("PROCESSANDO");
  });

  it("solicitação sem registro vira inconclusiva depois de 10 minutos e é conciliada pela referência da tentativa", async () => {
    const payment = await contratado();
    vi.spyOn(t.world.stores.payments, "registerTransfer").mockRejectedValueOnce(new Error("banco fora do ar"));
    await t.service.payout(t.event.id);
    const tentativa = tentativaAberta(payment.id);
    expect(tentativa.estado).toBe("SOLICITANDO");

    await expect(t.service.markStalePayoutRequests()).resolves.toBe(0);
    recuar(tentativa, "solicitadaEm", 11 * 60 * 1000);
    await expect(t.service.markStalePayoutRequests()).resolves.toBe(1);
    expect(tentativa.estado).toBe("INCONCLUSIVA");

    await t.service.payout(t.event.id);
    expect(tentativa).toMatchObject({ estado: "PENDENTE", asaasTransferId: expect.stringMatching(/^tra_/) });
    expect(t.world.asaasCalls.transferPix).toHaveLength(1);
  });

  it("busca incompleta na rotina mantém a tentativa inconclusiva", async () => {
    const payment = await contratado();
    t.world.failures.transferLost = true;
    await t.service.payout(t.event.id);
    t.world.failures.transferLost = false;
    t.world.failures.transferSearchIncomplete = true;

    await t.service.payout(t.event.id);

    expect(tentativaAberta(payment.id)).toMatchObject({ estado: "INCONCLUSIVA", asaasTransferId: null });
    expect(t.world.asaasCalls.transferPix).toHaveLength(1);
  });

  it("duas transferências com a referência da mesma tentativa geram alerta e nenhuma é adotada", async () => {
    const payment = await contratado();
    semResposta();
    await t.service.payout(t.event.id);
    const tentativa = tentativaAberta(payment.id);
    transferenciaNaAsaas("tra_dup_1", "PENDING", tentativa.id);
    transferenciaNaAsaas("tra_dup_2", "DONE", tentativa.id);

    await t.service.payout(t.event.id);

    expect(tentativa).toMatchObject({ estado: "INCONCLUSIVA", asaasTransferId: null });
    expect(t.world.alertas).toEqual([
      { tentativaId: tentativa.id, tipo: "POSSIVEL_DUPLICIDADE", asaasTransferId: "tra_dup_1", status: "PENDING" },
      { tentativaId: tentativa.id, tipo: "POSSIVEL_DUPLICIDADE", asaasTransferId: "tra_dup_2", status: "DONE" },
    ]);
  });

  it("verificação que encontra a transferência registra a tentativa em vez de liberar", async () => {
    const payment = await contratado();
    semResposta();
    await t.service.payout(t.event.id);
    const tentativa = tentativaAberta(payment.id);
    recuar(tentativa, "solicitadaEm", 25 * HORA);
    transferenciaNaAsaas("tra_achada", "PENDING", tentativa.id);

    await expect(t.service.verifyPayoutAbsence(tentativa.id, "Ana Suporte")).resolves.toEqual({ resultado: "TRANSFERENCIA_ENCONTRADA" });

    expect(tentativa).toMatchObject({ estado: "PENDENTE", asaasTransferId: "tra_achada" });
    expect(t.world.decisoes).toHaveLength(0);
  });

  it("transferência concluída de uma tentativa encerrada vira alerta e nunca é adotada", async () => {
    const payment = await contratado();
    semResposta();
    await t.service.payout(t.event.id);
    const antiga = tentativaAberta(payment.id);
    recuar(antiga, "solicitadaEm", 25 * HORA);
    await t.service.verifyPayoutAbsence(antiga.id, "Ana Suporte");
    recuar(antiga, "verificacaoIniciadaEm", 61 * 60 * 1000);
    await t.service.confirmPayoutAbsence(antiga.id, "Ana Suporte", DECLARACAO_AUSENCIA);
    expect(tentativaAberta(payment.id)).toBeUndefined();

    transferenciaNaAsaas("tra_tardia", "DONE", antiga.id);
    await t.service.handleWebhook({ id: "evt_tardio", event: "TRANSFER_DONE", transfer: { id: "tra_tardia" } });

    expect(antiga.estado).toBe("AUSENCIA_CONFIRMADA");
    expect(t.world.alertas.filter((alerta) => alerta.tentativaId === antiga.id).map((alerta) => alerta.tipo).sort()).toEqual(["POSSIVEL_DUPLICIDADE", "RESPOSTA_TARDIA"]);
    expect(t.world.payments.get(payment.id)?.repasseStatus).toBe("FALHOU");
    expect(t.world.asaasCalls.transferPix).toHaveLength(0);
    expect(avisos("Cachê repassado")).toHaveLength(0);
  });

  it("tentativa legada nunca entra na conciliação automática pela referência", async () => {
    const payment = await contratado();
    const legada = tentativaLegada(payment.id, null);
    transferenciaNaAsaas("tra_antiga_ref", "DONE", payment.id);

    await t.service.payout(t.event.id);
    await t.service.handleWebhook({ id: "evt_legado", event: "TRANSFER_DONE", transfer: { id: "tra_antiga_ref" } });

    expect(t.world.asaasCalls.findTransfersByReference).toHaveLength(0);
    expect(legada).toMatchObject({ estado: "INCONCLUSIVA", asaasTransferId: null });
    expect(t.world.payments.get(payment.id)?.repasseStatus).toBe("PROCESSANDO");
    expect(t.world.asaasCalls.transferPix).toHaveLength(0);
  });

  it("tentativa legada com transferência registrada só é resolvida pela conferência do suporte", async () => {
    const payment = await contratado();
    const legada = tentativaLegada(payment.id, "tra_legada");
    transferenciaNaAsaas("tra_legada", "DONE", payment.id);

    await t.service.payout(t.event.id);
    await t.service.handleWebhook({ id: "evt_legada", event: "TRANSFER_DONE", transfer: { id: "tra_legada" } });
    expect(legada.estado).toBe("INCONCLUSIVA");
    await expect(t.service.verifyPayoutAbsence(legada.id, "Ana Suporte")).rejects.toMatchObject({ code: "LIBERACAO_TRANSFERENCIA_CONHECIDA" });

    await expect(t.service.checkPayoutTransfer(legada.id)).resolves.toBe("CONCLUIDA");
    expect(legada.estado).toBe("CONCLUIDA");
    expect(t.world.payments.get(payment.id)?.repasseStatus).toBe("REPASSADO");
  });
});

describe("solicitação de repasse parada", () => {
  async function contratado() {
    const payment = await checkout();
    payAtAsaas(t.world, payment.asaasPaymentId);
    await t.service.syncCheckout(contratante, t.event.id, minutesLater(1));
    return payment;
  }
  async function solicitacaoInterrompida(payment: { id: string }, { envioRegistrado }: { envioRegistrado: boolean }) {
    const { tentativaId } = await t.world.stores.payments.claimPayout(payment.id);
    if (envioRegistrado) await t.world.stores.payments.registerRequestSent(tentativaId!);
    return t.world.tentativas.find((tentativa) => tentativa.id === tentativaId)!;
  }

  it("queda antes do envio: a próxima chamada encerra a tentativa como falha, sem pedir transferência nem abrir outra", async () => {
    const payment = await contratado();
    const parada = await solicitacaoInterrompida(payment, { envioRegistrado: false });

    await t.service.payout(t.event.id);
    expect(parada.estado).toBe("SOLICITANDO");
    expect(t.world.asaasCalls.transferPix).toHaveLength(0);

    recuar(parada, "solicitadaEm", 11 * 60 * 1000);
    await t.service.payout(t.event.id);

    expect(parada).toMatchObject({ estado: "FALHOU", asaasTransferId: null });
    expect(t.world.asaasCalls.transferPix).toHaveLength(0);
    expect(tentativaAberta(payment.id)).toBeUndefined();
    expect(t.world.payments.get(payment.id)?.repasseStatus).toBe("FALHOU");
  });

  it("queda depois do envio registrado: a tentativa fica inconclusiva, é procurada na Asaas e nada é reenviado", async () => {
    const payment = await contratado();
    const parada = await solicitacaoInterrompida(payment, { envioRegistrado: true });
    recuar(parada, "solicitadaEm", 11 * 60 * 1000);

    await t.service.payout(t.event.id);
    await t.service.payout(t.event.id);

    expect(parada.estado).toBe("INCONCLUSIVA");
    expect(t.world.asaasCalls.transferPix).toHaveLength(0);
    expect(t.world.asaasCalls.findTransfersByReference.map((busca) => busca.reference)).toEqual([parada.id, parada.id]);
    expect(t.world.payments.get(payment.id)?.repasseStatus).toBe("PROCESSANDO");
    await expect(t.world.stores.payments.claimRefund(payment.id, "CANCELAR")).resolves.toBe(false);
    await expect(t.world.stores.payments.claimPayout(payment.id)).resolves.toMatchObject({ tentativaId: null });
  });

  it("queda depois do envio, com a transferência criada: a busca encontra e registra, sem segundo envio", async () => {
    const payment = await contratado();
    const parada = await solicitacaoInterrompida(payment, { envioRegistrado: true });
    t.world.asaasTransfers.set("tra_criada_antes_da_queda", "PENDING");
    t.world.asaasTransferDetails.set("tra_criada_antes_da_queda", { externalReference: parada.id, value: 750 });
    recuar(parada, "solicitadaEm", 11 * 60 * 1000);

    await t.service.payout(t.event.id);

    expect(parada).toMatchObject({ estado: "PENDENTE", asaasTransferId: "tra_criada_antes_da_queda" });
    expect(t.world.asaasCalls.transferPix).toHaveLength(0);
  });

  it("falha ao registrar o envio sem gravação: nada é enviado e a regra de solicitação parada encerra a tentativa sem abrir outra", async () => {
    const payment = await contratado();
    vi.spyOn(t.world.stores.payments, "registerRequestSent").mockRejectedValueOnce(new Error("banco fora do ar"));

    await t.service.payout(t.event.id);

    expect(t.world.asaasCalls.transferPix).toHaveLength(0);
    const parada = tentativaAberta(payment.id);
    expect(parada).toMatchObject({ estado: "SOLICITANDO", asaasTransferId: null });
    expect(t.world.payments.get(payment.id)?.repasseStatus).toBe("PROCESSANDO");

    recuar(parada, "solicitadaEm", 11 * 60 * 1000);
    await t.service.payout(t.event.id);

    expect(parada.estado).toBe("FALHOU");
    expect(t.world.asaasCalls.transferPix).toHaveLength(0);
    expect(tentativaAberta(payment.id)).toBeUndefined();
  });

  it("envio gravado no banco com erro na resposta: a tentativa não vira falha, nada é enviado e ela fica protegida", async () => {
    const payment = await contratado();
    const registrar = t.world.stores.payments.registerRequestSent;
    vi.spyOn(t.world.stores.payments, "registerRequestSent").mockImplementationOnce(async (attemptId) => {
      await registrar(attemptId);
      throw new Error("resposta perdida");
    });

    await t.service.payout(t.event.id);

    const tentativa = tentativaAberta(payment.id);
    expect(tentativa).toMatchObject({ estado: "SOLICITANDO", asaasTransferId: null });
    expect(tentativa.pedidoEnviadoEm).toBeInstanceOf(Date);
    expect(t.world.asaasCalls.transferPix).toHaveLength(0);

    await t.service.payout(t.event.id);
    expect(tentativa.estado).toBe("SOLICITANDO");

    recuar(tentativa, "solicitadaEm", 11 * 60 * 1000);
    await t.service.payout(t.event.id);
    await t.service.markStalePayoutRequests();

    expect(tentativa.estado).toBe("INCONCLUSIVA");
    expect(tentativasDo(payment.id)).toHaveLength(1);
    expect(t.world.asaasCalls.transferPix).toHaveLength(0);
    expect(t.world.payments.get(payment.id)?.repasseStatus).toBe("PROCESSANDO");
    await expect(t.world.stores.payments.failAttempt(tentativa.id, null)).resolves.toBe(false);
    await expect(t.world.stores.payments.claimRefund(payment.id, "CANCELAR")).resolves.toBe(false);
    await expect(t.world.stores.payments.claimPayout(payment.id)).resolves.toMatchObject({ tentativaId: null });
  });

  it("registro recusado porque a tentativa foi encerrada por prazo: nada é enviado", async () => {
    await contratado();
    vi.spyOn(t.world.stores.payments, "registerRequestSent").mockResolvedValueOnce(false);

    await t.service.payout(t.event.id);

    expect(t.world.asaasCalls.transferPix).toHaveLength(0);
    expect(console.error).toHaveBeenCalledWith("Tentativa de repasse encerrada antes do envio; a transferência não foi pedida", expect.any(String), expect.any(String));
  });

  it("a rotina financeira usa a mesma regra para as solicitações paradas", async () => {
    const payment = await contratado();
    const parada = await solicitacaoInterrompida(payment, { envioRegistrado: false });
    recuar(parada, "solicitadaEm", 11 * 60 * 1000);

    await expect(t.service.markStalePayoutRequests()).resolves.toBe(1);

    expect(parada.estado).toBe("FALHOU");
    expect(t.world.payments.get(payment.id)?.repasseStatus).toBe("FALHOU");
  });
});

describe("conciliação de tentativas fora do pagamento atual", () => {
  async function contratado() {
    const payment = await checkout();
    payAtAsaas(t.world, payment.asaasPaymentId);
    await t.service.syncCheckout(contratante, t.event.id, minutesLater(1));
    return payment;
  }
  const multa = (valor: number) => {
    const penalty = { id: `pen_${t.world.penalties.length + 1}`, musicianId: "m1", eventId: null, tipo: "AUSENCIA" as const, multa: valor, quitada: false, estornoPaymentId: null, reservaPaymentId: null as string | null };
    t.world.penalties.push(penalty);
    return penalty;
  };
  let webhooks = 0;
  const estornarNaAsaas = async (payment: { asaasPaymentId: string; valor: number }) => {
    t.world.asaasCharges.set(payment.asaasPaymentId, { status: "REFUNDED", value: payment.valor });
    await t.service.handleWebhook({ id: `evt_estorno_${++webhooks}`, event: "PAYMENT_REFUNDED", payment: { id: payment.asaasPaymentId } });
  };
  const concluirNaAsaas = async (transferId: string) => {
    t.world.asaasTransfers.set(transferId, "DONE");
    await t.service.handleWebhook({ id: `evt_transferencia_${++webhooks}`, event: "TRANSFER_DONE", transfer: { id: transferId } });
  };
  const rotina = () =>
    createRotinaFinanceira({ paymentStore: t.world.stores.payments, eventStore: t.world.stores.events, payments: t.service, events: { settleDueHiring: async () => {} }, trava: t.world.stores.trava });
  const alertasDe = (tentativaId: string) => t.world.alertas.filter((alerta) => alerta.tentativaId === tentativaId && alerta.tipo === "REPASSE_E_ESTORNO");
  const avisos = (titulo: string) => t.world.notifications.filter((n) => n.userId === "m1" && n.titulo.startsWith(titulo));
  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
  const substituir = (paymentId: string) => {
    const antigo = t.world.payments.get(paymentId)!;
    t.world.payments.set("pay_novo", { ...antigo, id: "pay_novo", asaasPaymentId: "pay_asaas_novo", repasseStatus: "RETIDO", multaDescontada: 0, asaasTransferId: null, createdAt: antigo.createdAt + 1 });
  };
  const estadoFinal = (paymentId: string, tentativaId: string) => {
    const payment = t.world.payments.get(paymentId)!;
    return {
      tentativa: t.world.tentativas.find((tentativa) => tentativa.id === tentativaId)?.estado,
      pagamento: payment.status,
      estorno: payment.refundStatus,
      repasse: payment.repasseStatus,
      retido: payment.multaDescontada,
      evento: t.world.events.get(t.event.id)?.status,
      reservadas: t.world.penalties.filter((p) => p.reservaPaymentId === paymentId && !p.quitada).length,
      quitadas: t.world.penalties.filter((p) => p.reservaPaymentId === paymentId && p.quitada).length,
      alertas: alertasDe(tentativaId).length,
    };
  };
  const ESTADO_FINAL_COM_ESTORNO = {
    tentativa: "CONCLUIDA", pagamento: "ESTORNADO", estorno: "CONFIRMADO", repasse: "REPASSADO", retido: 100, evento: "CANCELADO", reservadas: 1, quitadas: 0, alertas: 1,
  };

  it("estorno antes da conclusão: a rotina procura a tentativa pela referência, registra o alerta e não envia outra transferência", async () => {
    const fine = multa(100);
    const payment = await contratado();
    t.world.failures.transferLost = true;
    await t.service.payout(t.event.id);
    t.world.failures.transferLost = false;
    const tentativa = tentativaAberta(payment.id);
    const [transferId] = [...t.world.asaasTransfers.keys()];
    expect(tentativa.estado).toBe("INCONCLUSIVA");

    await estornarNaAsaas(payment);
    t.world.asaasTransfers.set(transferId!, "DONE");
    await t.service.payout(t.event.id);
    expect(t.world.asaasCalls.findTransfersByReference).toHaveLength(0);

    await rotina().run(minutesLater(30));
    await rotina().run(minutesLater(60));
    await flush();

    expect(estadoFinal(payment.id, tentativa.id)).toEqual(ESTADO_FINAL_COM_ESTORNO);
    expect(t.world.asaasCalls.findTransfersByReference.map((busca) => busca.reference)).toEqual([tentativa.id]);
    expect(t.world.asaasCalls.transferPix).toHaveLength(1);
    expect(fine).toMatchObject({ reservaPaymentId: payment.id, quitada: false });
    expect(alertasDe(tentativa.id)[0]?.detalhes).toEqual({
      ordem: "ESTORNO_ANTES_DA_CONCLUSAO",
      paymentId: payment.id,
      valorRetido: 100,
      valorTransferido: 650,
      valorPendente: 100,
      multas: [{ id: fine.id, multa: 100, reservaPaymentId: payment.id, quitada: false }],
    });
    expect(avisos("Cachê repassado")).toHaveLength(0);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("REPASSE_E_ESTORNO"), payment.id, tentativa.id, transferId);

    await concluirNaAsaas(transferId!);
    expect(estadoFinal(payment.id, tentativa.id)).toEqual(ESTADO_FINAL_COM_ESTORNO);
  });

  it("estorno depois da conclusão: a quitação é desfeita, guardada na foto, e o estado final é o mesmo", async () => {
    const fine = multa(100);
    const payment = await contratado();
    await t.service.payout(t.event.id);
    const tentativa = tentativaAberta(payment.id);
    const transferId = tentativa.asaasTransferId!;
    await concluirNaAsaas(transferId);
    expect(fine).toMatchObject({ reservaPaymentId: payment.id, quitada: true });

    await estornarNaAsaas(payment);
    expect(alertasDe(tentativa.id)[0]?.detalhes).toMatchObject({
      ordem: "ESTORNO_DEPOIS_DA_CONCLUSAO",
      valorRetido: 100,
      valorTransferido: 650,
      valorPendente: 100,
      multas: [{ id: fine.id, multa: 100, reservaPaymentId: payment.id, quitada: true }],
    });

    await concluirNaAsaas(transferId);
    await estornarNaAsaas(payment);

    expect(estadoFinal(payment.id, tentativa.id)).toEqual(ESTADO_FINAL_COM_ESTORNO);
    expect(fine).toMatchObject({ reservaPaymentId: payment.id, quitada: false });
    expect(t.world.asaasCalls.transferPix).toHaveLength(1);
  });

  it("conferência manual de transferência concluída depois do estorno devolve o alerta", async () => {
    const payment = await contratado();
    await t.service.payout(t.event.id);
    const tentativa = tentativaAberta(payment.id);
    await estornarNaAsaas(payment);
    t.world.asaasTransfers.set(tentativa.asaasTransferId!, "DONE");

    await expect(t.service.checkPayoutTransfer(tentativa.id)).resolves.toBe("REPASSE_E_ESTORNO");
    await expect(t.service.checkPayoutTransfer(tentativa.id)).rejects.toMatchObject({ code: "TENTATIVA_SEM_TRANSFERENCIA" });
    expect(alertasDe(tentativa.id)).toHaveLength(1);
    expect(t.world.asaasCalls.transferPix).toHaveLength(1);
  });

  it("solicitação parada de pagamento estornado é encerrada sem envio, sem chamar o repasse", async () => {
    const fine = multa(100);
    const payment = await contratado();
    const { tentativaId } = await t.world.stores.payments.claimPayout(payment.id);
    await estornarNaAsaas(payment);
    const parada = t.world.tentativas.find((tentativa) => tentativa.id === tentativaId)!;
    recuar(parada, "solicitadaEm", 11 * 60 * 1000);
    const payout = vi.spyOn(t.service, "payout");

    await expect(t.service.reconcileOutsidePayout()).resolves.toBe(1);

    expect(parada.estado).toBe("FALHOU");
    expect(payout).not.toHaveBeenCalled();
    expect(t.world.asaasCalls.transferPix).toHaveLength(0);
    expect(t.world.payments.get(payment.id)).toMatchObject({ status: "ESTORNADO", repasseStatus: "FALHOU", multaDescontada: 0 });
    expect(fine).toMatchObject({ reservaPaymentId: null, quitada: false });
    await expect(t.world.stores.payments.claimPayout(payment.id)).resolves.toMatchObject({ tentativaId: null });
  });

  it("solicitação parada com envio registrado em pagamento estornado fica inconclusiva e protegida", async () => {
    const payment = await contratado();
    const { tentativaId } = await t.world.stores.payments.claimPayout(payment.id);
    await t.world.stores.payments.registerRequestSent(tentativaId!);
    await estornarNaAsaas(payment);
    const parada = t.world.tentativas.find((tentativa) => tentativa.id === tentativaId)!;
    recuar(parada, "solicitadaEm", 11 * 60 * 1000);

    await t.service.reconcileOutsidePayout();

    expect(parada.estado).toBe("INCONCLUSIVA");
    expect(t.world.asaasCalls.findTransfersByReference.map((busca) => busca.reference)).toEqual([parada.id]);
    expect(t.world.asaasCalls.transferPix).toHaveLength(0);
    await expect(t.world.stores.payments.failAttempt(parada.id, null)).resolves.toBe(false);
  });

  it("busca vazia não libera nada: a tentativa do pagamento estornado continua aguardando a conferência do suporte", async () => {
    const payment = await contratado();
    semResposta();
    await t.service.payout(t.event.id);
    const tentativa = tentativaAberta(payment.id);
    await estornarNaAsaas(payment);

    await t.service.reconcileOutsidePayout();
    await t.service.reconcileOutsidePayout();

    expect(tentativa.estado).toBe("INCONCLUSIVA");
    expect(t.world.asaasCalls.findTransfersByReference.map((busca) => busca.reference)).toEqual([tentativa.id, tentativa.id]);
    expect(t.world.asaasCalls.transferPix).toHaveLength(0);
    expect(t.world.payments.get(payment.id)).toMatchObject({ status: "ESTORNADO", repasseStatus: "PROCESSANDO" });
    await expect(t.service.verifyPayoutAbsence(tentativa.id, "Ana Suporte")).rejects.toMatchObject({ code: "LIBERACAO_PRAZO_NAO_ATINGIDO" });
  });

  it("pagamento substituído: a tentativa do pagamento antigo é conciliada e o pagamento novo não é repassado", async () => {
    const payment = await contratado();
    t.world.failures.transferLost = true;
    await t.service.payout(t.event.id);
    t.world.failures.transferLost = false;
    const tentativa = tentativaAberta(payment.id);
    const [transferId] = [...t.world.asaasTransfers.keys()];
    substituir(payment.id);
    t.world.asaasTransfers.set(transferId!, "DONE");

    await expect(t.service.reconcileOutsidePayout()).resolves.toBe(1);

    expect(tentativa).toMatchObject({ estado: "CONCLUIDA", asaasTransferId: transferId });
    expect(t.world.payments.get(payment.id)?.repasseStatus).toBe("REPASSADO");
    expect(t.world.payments.get("pay_novo")?.repasseStatus).toBe("RETIDO");
    expect(t.world.asaasCalls.transferPix).toHaveLength(1);
    expect(alertasDe(tentativa.id)).toHaveLength(0);
  });

  it("confirmação de ausência de um pagamento substituído não repassa o pagamento novo", async () => {
    const payment = await contratado();
    semResposta();
    await t.service.payout(t.event.id);
    const tentativa = tentativaAberta(payment.id);
    substituir(payment.id);

    recuar(tentativa, "solicitadaEm", 25 * HORA);
    await t.service.verifyPayoutAbsence(tentativa.id, "Ana Suporte");
    recuar(tentativa, "verificacaoIniciadaEm", 61 * 60 * 1000);
    await expect(t.service.confirmPayoutAbsence(tentativa.id, "Ana Suporte", DECLARACAO_AUSENCIA)).resolves.toEqual({ resultado: "AUSENCIA_CONFIRMADA" });

    expect(t.world.asaasCalls.transferPix).toHaveLength(0);
    expect(t.world.payments.get("pay_novo")?.repasseStatus).toBe("RETIDO");
    expect(tentativasDo("pay_novo")).toHaveLength(0);
  });

  it("confirmação de ausência de um pagamento estornado não pede novo repasse", async () => {
    const payment = await contratado();
    semResposta();
    await t.service.payout(t.event.id);
    const tentativa = tentativaAberta(payment.id);
    await estornarNaAsaas(payment);
    const payout = vi.spyOn(t.service, "payout");

    recuar(tentativa, "solicitadaEm", 25 * HORA);
    await t.service.verifyPayoutAbsence(tentativa.id, "Ana Suporte");
    recuar(tentativa, "verificacaoIniciadaEm", 61 * 60 * 1000);
    await t.service.confirmPayoutAbsence(tentativa.id, "Ana Suporte", DECLARACAO_AUSENCIA);

    expect(payout).not.toHaveBeenCalled();
    expect(t.world.asaasCalls.transferPix).toHaveLength(0);
    expect(tentativasDo(payment.id)).toHaveLength(1);
  });

  it("a tentativa do pagamento atual fica com o repasse de sempre e não é consultada duas vezes", async () => {
    await contratado();
    semResposta();
    await t.service.payout(t.event.id);

    await expect(t.service.reconcileOutsidePayout()).resolves.toBe(0);
    expect(t.world.asaasCalls.findTransfersByReference).toHaveLength(0);
  });

  it("falha da transferência depois do estorno libera as multas sem avisar o músico de nova tentativa", async () => {
    const fine = multa(100);
    const payment = await contratado();
    await t.service.payout(t.event.id);
    const transferId = tentativaAberta(payment.id).asaasTransferId!;
    await estornarNaAsaas(payment);

    t.world.asaasTransfers.set(transferId, "FAILED");
    await t.service.handleWebhook({ id: "evt_falha_estornado", event: "TRANSFER_FAILED", transfer: { id: transferId } });
    await flush();

    expect(t.world.payments.get(payment.id)).toMatchObject({ status: "ESTORNADO", repasseStatus: "FALHOU" });
    expect(fine).toMatchObject({ reservaPaymentId: null, quitada: false });
    expect(avisos("Repasse não concluído")).toHaveLength(0);
    expect(t.world.asaasCalls.transferPix).toHaveLength(1);
  });
});

describe("situação do estorno na Asaas", () => {
  const hire = async () => {
    const payment = await checkout();
    payAtAsaas(t.world, payment.asaasPaymentId);
    await t.service.syncCheckout(contratante, t.event.id, minutesLater(1));
    return t.world.payments.get(payment.id)!;
  };
  const estornoNaAsaas = (payment: { asaasPaymentId: string; valor: number }, status: string, situacaoDaCobranca = "RECEIVED") =>
    t.world.asaasCharges.set(payment.asaasPaymentId, { status: situacaoDaCobranca, value: payment.valor, refunds: [{ status, value: payment.valor }] } as never);
  const estornoPedidoHa = (payment: { id: string }, ms: number) =>
    Object.assign(t.world.payments.get(payment.id)!, { refundStatus: "PROCESSANDO", refundAction: "CANCELAR", refundRequestedAt: new Date(Date.now() - ms) });

  it.each([
    ["PENDING", "EM_ANDAMENTO"],
    ["AWAITING_CRITICAL_ACTION_AUTHORIZATION", "EM_ANDAMENTO"],
    ["AWAITING_CUSTOMER_EXTERNAL_AUTHORIZATION", "EM_ANDAMENTO"],
    ["DONE", "CONCLUIDO"],
    ["CANCELLED", "ENCERRADO_SEM_DEVOLUCAO"],
    ["ESTADO_NOVO_DA_ASAAS", "DESCONHECIDA"],
  ])("classifica o estorno %s como %s", (status, situacao) => {
    expect(situacaoDoEstornoNaAsaas(status)).toBe(situacao);
  });

  it.each(["PENDING", "AWAITING_CRITICAL_ACTION_AUTHORIZATION", "ESTADO_NOVO_DA_ASAAS"])("repetir a solicitação com estorno %s na Asaas não pede outro estorno", async (status) => {
    const payment = await hire();
    estornoNaAsaas(payment, status);

    expect(await t.service.refundHiring(t.event.id, "CANCELAR")).toBe("PROCESSANDO");
    expect(await t.service.refundHiring(t.event.id, "CANCELAR")).toBe("PROCESSANDO");

    expect(t.world.asaasCalls.refundPayment).toHaveLength(0);
    expect(t.world.payments.get(payment.id)).toMatchObject({ status: "PAGO", refundStatus: "PROCESSANDO" });
  });

  it.each(["PENDING", "AWAITING_CRITICAL_ACTION_AUTHORIZATION", "ESTADO_NOVO_DA_ASAAS"])("estorno %s na Asaas continua em processamento na reconciliação, sem liberar a contratação", async (status) => {
    const payment = await hire();
    estornoPedidoHa(payment, 10 * 60_000);
    estornoNaAsaas(payment, status);

    expect(await t.service.refreshRefund(t.event.id)).toMatchObject({ status: "PAGO", refundStatus: "PROCESSANDO", refundAction: "CANCELAR" });
    expect(t.world.asaasCalls.refundPayment).toHaveLength(0);
  });

  it.each(["PENDING", "AWAITING_CRITICAL_ACTION_AUTHORIZATION", "ESTADO_NOVO_DA_ASAAS"])("aviso de estorno negado enquanto o estorno está %s na Asaas não nega o estorno", async (status) => {
    const payment = await hire();
    estornoPedidoHa(payment, 10 * 60_000);
    estornoNaAsaas(payment, status);

    await t.service.handleWebhook({ id: `evt_negado_${status}`, event: "PAYMENT_REFUND_DENIED", payment: { id: payment.asaasPaymentId } });

    expect(t.world.payments.get(payment.id)).toMatchObject({ status: "PAGO", refundStatus: "PROCESSANDO" });
  });

  it("estorno concluído na Asaas finaliza o estorno", async () => {
    const payment = await hire();
    estornoPedidoHa(payment, 10 * 60_000);
    estornoNaAsaas(payment, "DONE", "REFUNDED");

    expect(await t.service.refreshRefund(t.event.id)).toMatchObject({ status: "ESTORNADO", refundStatus: "CONFIRMADO" });
  });

  it("estorno cancelado na Asaas vira estorno negado na reconciliação", async () => {
    const payment = await hire();
    estornoPedidoHa(payment, 10 * 60_000);
    estornoNaAsaas(payment, "CANCELLED");

    expect(await t.service.refreshRefund(t.event.id)).toMatchObject({ status: "PAGO", refundStatus: "NEGADO" });
  });

  it("aviso de estorno negado com o estorno cancelado na Asaas nega o estorno", async () => {
    const payment = await hire();
    estornoPedidoHa(payment, 10 * 60_000);
    estornoNaAsaas(payment, "CANCELLED");

    await t.service.handleWebhook({ id: "evt_negado_cancelado", event: "PAYMENT_REFUND_DENIED", payment: { id: payment.asaasPaymentId } });

    expect(t.world.payments.get(payment.id)).toMatchObject({ status: "PAGO", refundStatus: "NEGADO" });
  });

  it("estorno anterior cancelado na Asaas permite pedir um novo estorno", async () => {
    const payment = await hire();
    estornoNaAsaas(payment, "CANCELLED");

    await t.service.refundHiring(t.event.id, "CANCELAR");

    expect(t.world.asaasCalls.refundPayment).toEqual([payment.asaasPaymentId]);
  });
});

describe("cobrança removida na Asaas", () => {
  it("cobrança pendente que a Asaas informa como removida vira cancelada, sem confirmar a contratação", async () => {
    const payment = await checkout();
    t.world.asaasCharges.set(payment.asaasPaymentId, { status: COBRANCA_REMOVIDA_NA_ASAAS, value: payment.valor });

    await t.service.syncCheckout(contratante, t.event.id, minutesLater(1));

    expect(t.world.payments.get(payment.id)?.status).toBe("CANCELADO");
    expect(t.world.events.get(t.event.id)?.status).toBe("ABERTO");
  });

  it("cobrança pendente que continua pendente na Asaas segue aguardando o Pix", async () => {
    const payment = await checkout();

    await t.service.syncCheckout(contratante, t.event.id, minutesLater(1));

    expect(t.world.payments.get(payment.id)?.status).toBe("PENDENTE");
  });
});
