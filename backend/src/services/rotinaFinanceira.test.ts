import { beforeEach, describe, expect, it, vi } from "vitest";
import { createEventService } from "./eventService.ts";
import { createNotifier } from "./notifications.ts";
import { createPaymentService } from "./paymentService.ts";
import { createAgendaFinanceira, createRotinaFinanceira } from "./rotinaFinanceira.ts";
import { contratante, criarTravaEmMemoria, hoursFromNow, memoryWorld, NOW, payAtAsaas } from "./testing.ts";

function setup() {
  const world = memoryWorld();
  const notifier = createNotifier({ ...world.stores, appUrl: "http://localhost:8443" });
  const payments = createPaymentService({ ...world.stores, notifier });
  const events = createEventService({ ...world.stores, payments, notifier });
  const rotina = createRotinaFinanceira({ paymentStore: world.stores.payments, eventStore: world.stores.events, payments, events, trava: world.stores.trava });
  const event = world.seedEvent();
  const candidate = world.seedCandidate(event.id, "m1");
  return { world, payments, rotina, event, candidate };
}

let t: ReturnType<typeof setup>;
beforeEach(() => {
  t = setup();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

const umaSemanaDepois = () => new Date(t.event.inicio.getTime() + 8 * 24 * 60 * 60 * 1000);

async function contratado() {
  const payment = await t.payments.startCheckout(contratante, t.event.id, t.candidate.id, NOW);
  payAtAsaas(t.world, payment.asaasPaymentId);
  await t.payments.syncCheckout(contratante, t.event.id, NOW);
  return payment;
}

describe("rotina financeira", () => {
  it("expira a cobrança vencida sem ninguém abrir o app", async () => {
    const payment = await t.payments.startCheckout(contratante, t.event.id, t.candidate.id, NOW);

    await t.rotina.run(hoursFromNow(1));

    expect(t.world.payments.get(payment.id)?.status).toBe("EXPIRADO");
    expect(t.world.asaasCalls.cancelCharge).toContain(payment.asaasPaymentId);
  });

  it("contrata quando o Pix foi pago e a notificação se perdeu", async () => {
    const payment = await t.payments.startCheckout(contratante, t.event.id, t.candidate.id, NOW);
    payAtAsaas(t.world, payment.asaasPaymentId);

    await t.rotina.run(hoursFromNow(1));

    expect(t.world.payments.get(payment.id)?.status).toBe("PAGO");
    expect(t.world.events.get(t.event.id)?.status).toBe("CONTRATADO");
  });

  it("conclui o show depois de 7 dias, mesmo sem confirmação, e só repassa na execução seguinte", async () => {
    const payment = await contratado();

    await t.rotina.run(umaSemanaDepois());

    expect(t.world.events.get(t.event.id)?.status).toBe("CONCLUIDO");
    expect(t.world.payments.get(payment.id)?.repasseStatus).toBe("RETIDO");
    expect(t.world.asaasCalls.transferPix).toHaveLength(0);

    await t.rotina.run(umaSemanaDepois());

    expect(t.world.payments.get(payment.id)?.repasseStatus).toBe("PROCESSANDO");
    expect(t.world.asaasCalls.transferPix).toHaveLength(1);
  });

  it("não tenta de novo um repasse que falhou, nem avisa o músico de novo", async () => {
    const payment = await contratado();
    await t.rotina.run(umaSemanaDepois());
    t.world.failures.transfer = true;
    await t.rotina.run(umaSemanaDepois());
    expect(t.world.payments.get(payment.id)?.repasseStatus).toBe("FALHOU");

    t.world.failures.transfer = false;
    for (let vez = 0; vez < 3; vez++) await t.rotina.run(umaSemanaDepois());

    expect(t.world.payments.get(payment.id)?.repasseStatus).toBe("FALHOU");
    expect(t.world.tentativas.filter((tentativa) => tentativa.paymentId === payment.id)).toHaveLength(1);
    expect(t.world.notifications.filter((n) => n.titulo.startsWith("Repasse não concluído"))).toHaveLength(1);
  });

  it("repasse que já estava em processamento é concluído só pela rotina, sem consulta da contratação nem nova transferência", async () => {
    const payment = await contratado();
    t.world.events.get(t.event.id)!.status = "CONCLUIDO";
    await t.payments.payout(t.event.id);
    expect(t.world.payments.get(payment.id)?.repasseStatus).toBe("PROCESSANDO");
    t.world.asaasTransfers.set(t.world.payments.get(payment.id)!.asaasTransferId!, "DONE");

    await t.rotina.run(umaSemanaDepois());

    expect(t.world.payments.get(payment.id)?.repasseStatus).toBe("REPASSADO");
    expect(t.world.asaasCalls.transferPix).toHaveLength(1);
    expect(t.world.notifications.filter((n) => n.titulo.startsWith("Cachê repassado"))).toHaveLength(1);
  });

  it("repasse em processamento recusado pela Asaas vira falha pela rotina, com um aviso e sem nova tentativa", async () => {
    const payment = await contratado();
    t.world.events.get(t.event.id)!.status = "CONCLUIDO";
    await t.payments.payout(t.event.id);
    t.world.asaasTransfers.set(t.world.payments.get(payment.id)!.asaasTransferId!, "FAILED");

    for (let vez = 0; vez < 3; vez++) await t.rotina.run(umaSemanaDepois());

    expect(t.world.payments.get(payment.id)?.repasseStatus).toBe("FALHOU");
    expect(t.world.asaasCalls.transferPix).toHaveLength(1);
    expect(t.world.tentativas.filter((tentativa) => tentativa.paymentId === payment.id)).toEqual([expect.objectContaining({ estado: "FALHOU" })]);
    expect(t.world.notifications.filter((n) => n.titulo.startsWith("Repasse não concluído"))).toHaveLength(1);
  });

  it("repasse em processamento sem resposta da Asaas é localizado pela rotina pela referência, sem segundo envio", async () => {
    const payment = await contratado();
    t.world.events.get(t.event.id)!.status = "CONCLUIDO";
    t.world.failures.transferLost = true;
    await t.payments.payout(t.event.id);
    t.world.failures.transferLost = false;
    expect(t.world.payments.get(payment.id)).toMatchObject({ repasseStatus: "PROCESSANDO", asaasTransferId: null });

    await t.rotina.run(umaSemanaDepois());

    expect(t.world.asaasCalls.transferPix).toHaveLength(1);
    expect(t.world.tentativas.find((tentativa) => tentativa.paymentId === payment.id && tentativa.encerradaEm === null)).toMatchObject({ estado: "PENDENTE", asaasTransferId: expect.stringMatching(/^tra_/) });
  });

  it("repasse retido de evento ainda contratado não sai pela rotina", async () => {
    const payment = await contratado();

    await t.rotina.run(hoursFromNow(80));

    expect(t.world.payments.get(payment.id)?.repasseStatus).toBe("RETIDO");
    expect(t.world.asaasCalls.transferPix).toHaveLength(0);
  });

  it("sem a trava da rotina, nada é executado", async () => {
    await contratado();
    t.world.events.get(t.event.id)!.status = "CONCLUIDO";
    vi.spyOn(t.world.stores.trava, "adquirir").mockResolvedValueOnce(null);

    await expect(t.rotina.iniciar(umaSemanaDepois())).resolves.toMatchObject({ resultado: "EM_ANDAMENTO" });

    expect(t.world.asaasCalls.transferPix).toHaveLength(0);
    expect(t.world.tentativas).toHaveLength(0);
  });

  it("não conclui nem repassa com contestação aberta ou antes do prazo", async () => {
    await contratado();

    await t.rotina.run(hoursFromNow(80));
    expect(t.world.events.get(t.event.id)?.status).toBe("CONTRATADO");

    t.world.disputes.push({ id: "d1", eventId: t.event.id, abertaPor: "c1", motivo: "Show não aconteceu", status: "ABERTA", decisao: null, observacao: null, createdAt: NOW });
    await t.rotina.run(umaSemanaDepois());

    expect(t.world.events.get(t.event.id)?.status).toBe("CONTRATADO");
    expect(t.world.asaasCalls.transferPix).toHaveLength(0);
  });

  it("acompanha o repasse até a conclusão e nunca transfere de novo", async () => {
    const payment = await contratado();
    await t.rotina.run(umaSemanaDepois());
    await t.rotina.run(umaSemanaDepois());
    t.world.asaasTransfers.set(t.world.payments.get(payment.id)!.asaasTransferId!, "DONE");

    await t.rotina.run(umaSemanaDepois());

    expect(t.world.payments.get(payment.id)?.repasseStatus).toBe("REPASSADO");
    expect(t.world.asaasCalls.transferPix).toHaveLength(1);
  });

  it("falha em um item não impede os demais", async () => {
    const outroEvento = t.world.seedEvent();
    const outroCandidato = t.world.seedCandidate(outroEvento.id, "m2");
    const primeiro = await t.payments.startCheckout(contratante, t.event.id, t.candidate.id, NOW);
    const segundo = await t.payments.startCheckout(contratante, outroEvento.id, outroCandidato.id, NOW);
    vi.spyOn(t.world.stores.asaas, "getPayment").mockRejectedValueOnce(new Error("Asaas fora do ar"));

    await t.rotina.run(hoursFromNow(1));

    expect(t.world.payments.get(primeiro.id)?.status).toBe("PENDENTE");
    expect(t.world.payments.get(segundo.id)?.status).toBe("EXPIRADO");
  });
});

describe("agenda da rotina financeira", () => {
  function agenda(configuracao: "enabled" | "disabled" | "invalid", permitida = true) {
    const rotina = { run: vi.fn(async () => {}) };
    const agendar = vi.fn();
    const log = vi.fn();
    const aviso = vi.fn();
    return { rotina, agendar, log, aviso, agenda: createAgendaFinanceira({ rotina, configuracao, permitida, intervaloMs: 5 * 60 * 1000, agendar, log, aviso }) };
  }

  it("desabilitada: não executa nem agenda, e registra como habilitar", () => {
    const t = agenda("disabled");
    expect(t.agenda.iniciar()).toBe(false);
    expect(t.rotina.run).not.toHaveBeenCalled();
    expect(t.agendar).not.toHaveBeenCalled();
    expect(t.log).toHaveBeenCalledWith(expect.stringContaining("desabilitada"));
  });

  it("valor inválido: avisa, não executa nem agenda", () => {
    const t = agenda("invalid");
    expect(t.agenda.iniciar()).toBe(false);
    expect(t.rotina.run).not.toHaveBeenCalled();
    expect(t.agendar).not.toHaveBeenCalled();
    expect(t.aviso).toHaveBeenCalledWith(expect.stringContaining("valor não reconhecido"));
  });

  it("habilitada: executa ao iniciar e agenda a cada 5 minutos", () => {
    const t = agenda("enabled");
    expect(t.agenda.iniciar()).toBe(true);
    expect(t.rotina.run).toHaveBeenCalledOnce();
    expect(t.agendar).toHaveBeenCalledOnce();
    expect(t.agendar).toHaveBeenCalledWith(expect.any(Function), 5 * 60 * 1000);
    expect(t.log).toHaveBeenCalledWith(expect.stringContaining("habilitada"));
  });

  it("habilitada em desenvolvimento com Supabase hospedado: avisa, não executa nem agenda", () => {
    const t = agenda("enabled", false);
    expect(t.agenda.iniciar()).toBe(false);
    expect(t.rotina.run).not.toHaveBeenCalled();
    expect(t.agendar).not.toHaveBeenCalled();
    expect(t.aviso).toHaveBeenCalledWith(expect.stringContaining("bloqueada"));
  });

  it("habilitada: iniciar de novo não cria um segundo agendamento", () => {
    const t = agenda("enabled");
    t.agenda.iniciar();
    expect(t.agenda.iniciar()).toBe(false);
    expect(t.rotina.run).toHaveBeenCalledOnce();
    expect(t.agendar).toHaveBeenCalledOnce();
  });

  it("habilitada: cada disparo do agendamento executa a rotina, e uma falha não derruba a agenda", async () => {
    const t = agenda("enabled");
    t.rotina.run.mockRejectedValueOnce(new Error("falha"));
    t.agenda.iniciar();
    await Promise.resolve();
    const tarefa = t.agendar.mock.calls[0][0] as () => void;
    tarefa();
    expect(t.rotina.run).toHaveBeenCalledTimes(2);
    expect(console.error).toHaveBeenCalledWith("Falha na rotina financeira", expect.any(Error));
  });
});

describe("trava distribuída da rotina financeira", () => {
  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

  function cenario({ segurar = false }: { segurar?: boolean } = {}) {
    const relogio = { agora: 1_000_000 };
    const agora = () => relogio.agora;
    const trava = criarTravaEmMemoria(agora);
    const renovacoes: (() => void)[] = [];
    const paradas = { total: 0 };
    const etapas: string[] = [];
    let liberar = () => {};
    const bloqueio = new Promise<void>((resolve) => {
      liberar = resolve;
    });
    const payments = {
      syncPending: vi.fn(async (eventId: string) => {
        etapas.push(`cobranca:${eventId}`);
        return null;
      }),
      refreshRefund: vi.fn(async () => null),
      payout: vi.fn(async () => {}),
      markStalePayoutRequests: vi.fn(async () => {
        etapas.push("paradas");
        return 0;
      }),
      reconcileOutsidePayout: vi.fn(async () => {
        etapas.push("conciliar");
        return 0;
      }),
    };
    const paymentStore = {
      findFinanceFollowUps: vi.fn(async () => {
        etapas.push("buscar");
        if (segurar) await bloqueio;
        return { expiredCharges: ["e1", "e2"], refunds: [], payouts: [] };
      }),
    };
    const eventStore = {
      findDueHirings: vi.fn(async () => {
        etapas.push("vencidos");
        return [] as string[];
      }),
    };
    const criar = () =>
      createRotinaFinanceira({
        paymentStore,
        eventStore,
        payments: payments as unknown as Parameters<typeof createRotinaFinanceira>[0]["payments"],
        events: { settleDueHiring: vi.fn(async () => {}) },
        trava: trava.store,
        relogio: agora,
        agendarRenovacao: (tarefa) => {
          renovacoes.push(tarefa);
          return { parar: () => void paradas.total++ };
        },
      });
    return { relogio, trava, renovacoes, paradas, etapas, liberar: () => liberar(), payments, paymentStore, criar };
  }

  it("adquire a trava, executa as etapas na ordem de sempre e encerra com sucesso", async () => {
    const c = cenario();

    await c.criar().run();

    expect(c.etapas).toEqual(["buscar", "cobranca:e1", "cobranca:e2", "paradas", "conciliar", "vencidos"]);
    expect(c.trava.estado).toMatchObject({ dono: null, geracao: 1, ultimoResultado: "SUCESSO", ultimoErro: null });
    expect(c.paradas.total).toBe(1);
  });

  it("uma segunda execução simultânea, em outra instância, não processa nada", async () => {
    const c = cenario({ segurar: true });
    const primeira = await c.criar().iniciar();
    const segunda = await c.criar().iniciar();

    expect(primeira.resultado).toBe("INICIADA");
    expect(segunda.resultado).toBe("EM_ANDAMENTO");
    c.liberar();
    await primeira.conclusao;
    await segunda.conclusao;

    expect(c.paymentStore.findFinanceFollowUps).toHaveBeenCalledTimes(1);
    expect(c.payments.syncPending).toHaveBeenCalledTimes(2);
  });

  it("na mesma instância, a flag local recusa antes de consultar o banco", async () => {
    const c = cenario({ segurar: true });
    const rotina = c.criar();
    const primeira = await rotina.iniciar();

    await expect(rotina.iniciar()).resolves.toMatchObject({ resultado: "EM_ANDAMENTO" });
    expect(c.trava.estado.chamadas.adquirir).toBe(1);
    c.liberar();
    await primeira.conclusao;
  });

  it("renova a validade durante a execução", async () => {
    const c = cenario({ segurar: true });
    const execucao = await c.criar().iniciar();
    c.relogio.agora += 3 * 60 * 1000;

    c.renovacoes[0]!();
    await flush();

    expect(c.trava.estado.chamadas.renovar).toBe(1);
    expect(c.trava.estado.validaAte).toBe(c.relogio.agora + 600 * 1000);
    c.liberar();
    await execucao.conclusao;
    expect(c.trava.estado.ultimoResultado).toBe("SUCESSO");
  });

  it("trava vencida é retomada, e o dono antigo não renova nem encerra", async () => {
    const c = cenario();
    await c.trava.store.adquirir("dono-antigo", 600);
    c.relogio.agora += 11 * 60 * 1000;

    await c.criar().run();

    expect(c.trava.estado).toMatchObject({ dono: null, geracao: 2, ultimoResultado: "SUCESSO" });
    await expect(c.trava.store.renovar("dono-antigo", 1, 600)).resolves.toBe(false);
    await expect(c.trava.store.encerrar("dono-antigo", 1, "SUCESSO", null)).resolves.toBe(false);
  });

  it("uma falha durante o processamento libera a trava e registra o erro, sem detalhes internos", async () => {
    const c = cenario();
    c.paymentStore.findFinanceFollowUps.mockRejectedValueOnce(new Error("senha=segredo conexão recusada"));

    await c.criar().run();

    expect(c.trava.estado).toMatchObject({ dono: null, ultimoResultado: "FALHA", ultimoErro: "Falha inesperada na rotina financeira." });
    await c.criar().run();
    expect(c.trava.estado).toMatchObject({ dono: null, geracao: 2, ultimoResultado: "SUCESSO" });
  });

  it("perde a autorização quando a renovação é recusada e não inicia novas etapas", async () => {
    const c = cenario({ segurar: true });
    const execucao = await c.criar().iniciar();
    vi.spyOn(c.trava.store, "renovar").mockResolvedValueOnce(false);

    c.renovacoes[0]!();
    await flush();
    c.liberar();
    await execucao.conclusao;

    expect(c.payments.syncPending).not.toHaveBeenCalled();
    expect(c.payments.markStalePayoutRequests).not.toHaveBeenCalled();
    expect(c.trava.estado).toMatchObject({ dono: null, ultimoResultado: "FALHA", ultimoErro: "A trava da rotina foi perdida durante a execução." });
  });

  it("falha de comunicação ao renovar também interrompe a rotina", async () => {
    const c = cenario({ segurar: true });
    const execucao = await c.criar().iniciar();
    vi.spyOn(c.trava.store, "renovar").mockRejectedValueOnce(new Error("banco fora do ar"));

    c.renovacoes[0]!();
    await flush();
    c.liberar();
    await execucao.conclusao;

    expect(c.payments.syncPending).not.toHaveBeenCalled();
    expect(c.trava.estado.ultimoResultado).toBe("FALHA");
  });

  it("sem renovação, a validade local esgotada impede novas etapas", async () => {
    const c = cenario({ segurar: true });
    const execucao = await c.criar().iniciar();
    c.relogio.agora += 9 * 60 * 1000 + 1;

    c.liberar();
    await execucao.conclusao;

    expect(c.payments.syncPending).not.toHaveBeenCalled();
    expect(c.trava.estado.ultimoResultado).toBe("FALHA");
  });

  it("execução antiga cuja trava foi assumida por outra não continua nem encerra a nova", async () => {
    const c = cenario({ segurar: true });
    const antiga = await c.criar().iniciar();
    c.relogio.agora += 11 * 60 * 1000;
    c.liberar();
    const nova = await c.criar().iniciar();
    expect(nova.resultado).toBe("INICIADA");

    await antiga.conclusao;
    await nova.conclusao;

    expect(c.payments.syncPending).toHaveBeenCalledTimes(2);
    expect(c.trava.estado).toMatchObject({ dono: null, geracao: 2, ultimoResultado: "SUCESSO" });
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("sem conseguir encerrar a própria trava"), expect.any(String));
  });
});
