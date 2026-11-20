import { describe, expect, it, vi } from "vitest";
import { aparenciaDoCoracao, criarControleDeFavoritos, estadoDoBotaoDeFavorito, FALHA_AO_ATUALIZAR_FAVORITOS } from "./favoritos.ts";

function adiado<T>() {
  let resolver!: (valor: T) => void;
  let rejeitar!: (erro: unknown) => void;
  const promessa = new Promise<T>((ok, falha) => {
    resolver = ok;
    rejeitar = falha;
  });
  return { promessa, resolver, rejeitar };
}

const esperar = () => new Promise((resolve) => setTimeout(resolve, 0));

function montar(inicial: string[] = ["m1"]) {
  const leituras: ReturnType<typeof adiado<string[]>>[] = [];
  const gravacoes: { musicianId: string; favorito: boolean; pedido: ReturnType<typeof adiado<void>> }[] = [];
  const ler = vi.fn(() => {
    const pedido = adiado<string[]>();
    leituras.push(pedido);
    return pedido.promessa;
  });
  const gravar = vi.fn((musicianId: string, favorito: boolean) => {
    const pedido = adiado<void>();
    gravacoes.push({ musicianId, favorito, pedido });
    return pedido.promessa;
  });
  const controle = criarControleDeFavoritos({ ler, gravar, mensagemDeErro: (erro) => (erro instanceof Error ? erro.message : "falha") });
  const carregado = (async () => {
    const carga = controle.carregar();
    leituras[0].resolver(inicial);
    await carga;
  })();
  return { controle, ler, gravar, leituras, gravacoes, carregado };
}

describe("controle de favoritos", () => {
  it("mostra o estado pedido com indicação de pendência e confirma sem esperar a releitura", async () => {
    const t = montar([]);
    await t.carregado;

    t.controle.alternar("m2", true);
    expect(t.controle.estado()).toMatchObject({ ids: ["m2"], pendentes: ["m2"] });

    t.gravacoes[0].pedido.resolver();
    await esperar();
    expect(t.controle.estado()).toMatchObject({ ids: ["m2"], pendentes: [], erro: "" });
    expect(t.ler).toHaveBeenCalledTimes(2);
  });

  it("toques praticamente simultâneos no mesmo músico geram uma única gravação", async () => {
    const t = montar([]);
    await t.carregado;

    t.controle.alternar("m2", true);
    t.controle.alternar("m2", true);
    t.controle.alternar("m2", true);

    expect(t.gravar).toHaveBeenCalledTimes(1);
    t.gravacoes[0].pedido.resolver();
    await esperar();
    expect(t.gravar).toHaveBeenCalledTimes(1);
    expect(t.controle.estado().ids).toEqual(["m2"]);
  });

  it("alternância rápida preserva o último estado pedido", async () => {
    const t = montar([]);
    await t.carregado;

    t.controle.alternar("m2", true);
    t.controle.alternar("m2", false);
    t.controle.alternar("m2", true);
    t.controle.alternar("m2", false);
    expect(t.controle.estado().ids).toEqual([]);

    t.gravacoes[0].pedido.resolver();
    await esperar();
    expect(t.gravacoes.map((g) => g.favorito)).toEqual([true, false]);
    t.gravacoes[1].pedido.resolver();
    await esperar();

    expect(t.gravar).toHaveBeenCalledTimes(2);
    expect(t.controle.estado()).toMatchObject({ ids: [], pendentes: [] });
  });

  it("voltar ao estado original antes da primeira gravação terminar não grava de novo", async () => {
    const t = montar([]);
    await t.carregado;

    t.controle.alternar("m2", true);
    t.controle.alternar("m2", false);
    t.gravacoes[0].pedido.resolver();
    await esperar();
    t.gravacoes[1]?.pedido.resolver();
    await esperar();

    expect(t.gravacoes.map((g) => g.favorito)).toEqual([true, false]);
    expect(t.controle.estado().ids).toEqual([]);
  });

  it("outro músico pode ser alterado ao mesmo tempo, com pendência própria", async () => {
    const t = montar(["m1"]);
    await t.carregado;

    t.controle.alternar("m2", true);
    t.controle.alternar("m1", false);

    expect(t.gravar).toHaveBeenCalledTimes(2);
    expect(t.controle.estado()).toMatchObject({ ids: ["m2"], pendentes: ["m2", "m1"] });

    t.gravacoes[0].pedido.resolver();
    await esperar();
    expect(t.controle.estado().pendentes).toEqual(["m1"]);
    expect(t.ler).toHaveBeenCalledTimes(1);

    t.gravacoes[1].pedido.resolver();
    await esperar();
    expect(t.controle.estado()).toMatchObject({ ids: ["m2"], pendentes: [] });
    expect(t.ler).toHaveBeenCalledTimes(2);
  });

  it("falha na gravação volta ao estado confirmado e mostra o erro do servidor", async () => {
    const t = montar(["m1"]);
    await t.carregado;

    t.controle.alternar("m1", false);
    expect(t.controle.estado().ids).toEqual([]);
    t.gravacoes[0].pedido.rejeitar(new Error("Músicos favoritos fazem parte do Muve Casa."));
    await esperar();

    expect(t.controle.estado()).toMatchObject({ ids: ["m1"], pendentes: [], erro: "Músicos favoritos fazem parte do Muve Casa." });
  });

  it("novo toque limpa o erro de gravação anterior", async () => {
    const t = montar(["m1"]);
    await t.carregado;
    t.controle.alternar("m1", false);
    t.gravacoes[0].pedido.rejeitar(new Error("Falhou"));
    await esperar();

    t.controle.alternar("m1", false);

    expect(t.controle.estado().erro).toBe("");
  });

  it("falha na releitura mantém os favoritos já conhecidos e avisa", async () => {
    const t = montar(["m1"]);
    await t.carregado;

    t.controle.alternar("m2", true);
    t.gravacoes[0].pedido.resolver();
    await esperar();
    t.leituras[1].rejeitar(new Error("sem rede"));
    await esperar();

    expect(t.controle.estado()).toMatchObject({ ids: ["m1", "m2"], erro: FALHA_AO_ATUALIZAR_FAVORITOS });
  });

  it("releitura bem-sucedida passa a valer e limpa o aviso de leitura", async () => {
    const t = montar(["m1"]);
    await t.carregado;
    const releitura = t.controle.carregar();
    t.leituras[1].rejeitar(new Error("sem rede"));
    await releitura;
    expect(t.controle.estado().erro).toBe(FALHA_AO_ATUALIZAR_FAVORITOS);

    const outra = t.controle.carregar();
    t.leituras[2].resolver(["m3"]);
    await outra;

    expect(t.controle.estado()).toMatchObject({ ids: ["m3"], erro: "" });
  });

  it("releitura que começou antes de uma nova gravação não desfaz o que foi confirmado depois", async () => {
    const t = montar([]);
    await t.carregado;

    const releitura = t.controle.carregar();
    t.controle.alternar("m2", true);
    t.gravacoes[0].pedido.resolver();
    await esperar();
    t.leituras[1].resolver([]);
    await releitura;

    expect(t.controle.estado().ids).toEqual(["m2"]);
  });

  it("primeira carga com falha não inventa lista e informa o erro", async () => {
    const ler = vi.fn(() => Promise.reject(new Error("sem rede")));
    const controle = criarControleDeFavoritos({ ler, gravar: vi.fn(), mensagemDeErro: () => "" });

    await controle.carregar();

    expect(controle.estado()).toMatchObject({ ids: undefined, erro: FALHA_AO_ATUALIZAR_FAVORITOS });
  });

  it("avisa os inscritos a cada mudança e para de avisar depois de cancelar", async () => {
    const t = montar([]);
    await t.carregado;
    const ouvinte = vi.fn();
    const cancelar = t.controle.inscrever(ouvinte);

    t.controle.alternar("m2", true);
    expect(ouvinte).toHaveBeenCalled();
    cancelar();
    ouvinte.mockClear();
    t.gravacoes[0].pedido.resolver();
    await esperar();

    expect(ouvinte).not.toHaveBeenCalled();
  });
});

describe("estado do botão de favorito (igual no detalhe do evento e no perfil do candidato)", () => {
  it("enquanto a lista carrega ou sem Muve Casa, o botão não aparece", async () => {
    const t = montar(["m1"]);
    expect(estadoDoBotaoDeFavorito(t.controle.estado(), "m1", true)).toEqual({ visivel: false, favorito: false, salvando: false });
    await t.carregado;
    expect(estadoDoBotaoDeFavorito(t.controle.estado(), "m1", false).visivel).toBe(false);
  });

  it("adicionar: muda na hora com indicação de salvamento e fica firme quando o servidor confirma", async () => {
    const t = montar([]);
    await t.carregado;

    t.controle.alternar("m2", true);
    expect(estadoDoBotaoDeFavorito(t.controle.estado(), "m2", true)).toEqual({ visivel: true, favorito: true, salvando: true });

    t.gravacoes[0].pedido.resolver();
    await esperar();
    expect(estadoDoBotaoDeFavorito(t.controle.estado(), "m2", true)).toEqual({ visivel: true, favorito: true, salvando: false });
  });

  it("remover: mesmo comportamento", async () => {
    const t = montar(["m1"]);
    await t.carregado;

    t.controle.alternar("m1", false);
    expect(estadoDoBotaoDeFavorito(t.controle.estado(), "m1", true)).toEqual({ visivel: true, favorito: false, salvando: true });
    t.gravacoes[0].pedido.resolver();
    await esperar();
    expect(estadoDoBotaoDeFavorito(t.controle.estado(), "m1", true)).toEqual({ visivel: true, favorito: false, salvando: false });
  });

  it("depois de falha na gravação, volta ao estado confirmado sem indicar salvamento", async () => {
    const t = montar([]);
    await t.carregado;

    t.controle.alternar("m2", true);
    t.gravacoes[0].pedido.rejeitar(new Error("Falhou"));
    await esperar();

    expect(estadoDoBotaoDeFavorito(t.controle.estado(), "m2", true)).toEqual({ visivel: true, favorito: false, salvando: false });
  });

  it("falha na releitura mantém o botão visível com o último estado conhecido", async () => {
    const t = montar(["m1"]);
    await t.carregado;
    const releitura = t.controle.carregar();
    t.leituras[1].rejeitar(new Error("sem rede"));
    await releitura;

    expect(estadoDoBotaoDeFavorito(t.controle.estado(), "m1", true)).toEqual({ visivel: true, favorito: true, salvando: false });
  });
});

describe("tentar novamente nos favoritos", () => {
  it("depois de falha na gravação, oferece repetir e repete a última intenção uma única vez", async () => {
    const t = montar([]);
    await t.carregado;
    t.controle.alternar("m2", true);
    t.gravacoes[0].pedido.rejeitar(new Error("Não foi possível conectar ao servidor."));
    await esperar();
    expect(t.controle.estado()).toMatchObject({ ids: [], podeTentarDeNovo: true, erro: "Não foi possível conectar ao servidor." });

    t.controle.tentarDeNovo();
    t.controle.tentarDeNovo();
    expect(t.gravar).toHaveBeenCalledTimes(2);
    expect(t.gravacoes[1]).toMatchObject({ musicianId: "m2", favorito: true });
    expect(t.controle.estado()).toMatchObject({ ids: ["m2"], pendentes: ["m2"], erro: "", podeTentarDeNovo: false });

    t.gravacoes[1].pedido.resolver();
    await esperar();
    expect(t.controle.estado()).toMatchObject({ ids: ["m2"], pendentes: [], erro: "", podeTentarDeNovo: false });
  });

  it("alternância rápida seguida de falha: repetir grava o último estado pedido, não o primeiro", async () => {
    const t = montar([]);
    await t.carregado;
    t.controle.alternar("m2", true);
    t.controle.alternar("m2", false);
    t.controle.alternar("m2", true);
    t.gravacoes[0].pedido.rejeitar(new Error("Falhou"));
    await esperar();

    t.controle.tentarDeNovo();

    expect(t.gravacoes.map((g) => g.favorito)).toEqual([true, true]);
    expect(t.controle.estado().ids).toEqual(["m2"]);
  });

  it("se a pessoa tocar de novo depois da falha, a repetição não sobrescreve a nova escolha", async () => {
    const t = montar(["m2"]);
    await t.carregado;
    t.controle.alternar("m2", false);
    t.gravacoes[0].pedido.rejeitar(new Error("Falhou"));
    await esperar();
    expect(t.controle.estado().ids).toEqual(["m2"]);

    t.controle.alternar("m2", true);
    expect(t.controle.estado().podeTentarDeNovo).toBe(false);
    t.controle.tentarDeNovo();

    expect(t.gravar).toHaveBeenCalledTimes(1);
    expect(t.controle.estado().ids).toEqual(["m2"]);
  });

  it("falha na releitura: tentar novamente relê a lista e limpa o aviso quando dá certo", async () => {
    const t = montar(["m1"]);
    await t.carregado;
    const releitura = t.controle.carregar();
    t.leituras[1].rejeitar(new Error("sem rede"));
    await releitura;
    expect(t.controle.estado()).toMatchObject({ podeTentarDeNovo: true, erro: FALHA_AO_ATUALIZAR_FAVORITOS });

    t.controle.tentarDeNovo();
    expect(t.ler).toHaveBeenCalledTimes(3);
    t.leituras[2].resolver(["m1", "m5"]);
    await esperar();

    expect(t.controle.estado()).toMatchObject({ ids: ["m1", "m5"], erro: "", podeTentarDeNovo: false });
  });

  it("o aviso de releitura não pede para puxar a tela", () => {
    expect(FALHA_AO_ATUALIZAR_FAVORITOS).not.toMatch(/puxe/i);
  });

  it("nova falha na repetição volta ao estado confirmado e continua oferecendo repetir", async () => {
    const t = montar([]);
    await t.carregado;
    t.controle.alternar("m2", true);
    t.gravacoes[0].pedido.rejeitar(new Error("Falhou"));
    await esperar();
    t.controle.tentarDeNovo();
    t.gravacoes[1].pedido.rejeitar(new Error("Falhou de novo"));
    await esperar();

    expect(t.controle.estado()).toMatchObject({ ids: [], pendentes: [], erro: "Falhou de novo", podeTentarDeNovo: true });
  });
});

describe("aparência do coração no detalhe do evento", () => {
  it("o coração mostra só o estado pedido, com opacidade cheia e sem efeito extra", () => {
    expect(aparenciaDoCoracao({ favorito: true })).toEqual({ preenchido: true, opacidade: 1 });
    expect(aparenciaDoCoracao({ favorito: false })).toEqual({ preenchido: false, opacidade: 1 });
  });

  it("salvando e confirmado têm a mesma aparência: não há segunda troca de tom", async () => {
    const t = montar([]);
    await t.carregado;
    t.controle.alternar("m2", true);
    const salvando = estadoDoBotaoDeFavorito(t.controle.estado(), "m2", true);
    t.gravacoes[0].pedido.resolver();
    await esperar();
    const confirmado = estadoDoBotaoDeFavorito(t.controle.estado(), "m2", true);

    expect(salvando.salvando).toBe(true);
    expect(confirmado.salvando).toBe(false);
    expect(aparenciaDoCoracao({ favorito: confirmado.favorito })).toEqual(aparenciaDoCoracao({ favorito: salvando.favorito }));
  });

  it("sequência real: toque, salvando, falha, volta ao estado confirmado", async () => {
    const t = montar([]);
    await t.carregado;
    t.controle.alternar("m2", true);
    const durante = estadoDoBotaoDeFavorito(t.controle.estado(), "m2", true);
    expect(durante.salvando).toBe(true);
    expect(aparenciaDoCoracao({ favorito: durante.favorito })).toEqual({ preenchido: true, opacidade: 1 });

    t.gravacoes[0].pedido.rejeitar(new Error("Falhou"));
    await esperar();
    const depois = estadoDoBotaoDeFavorito(t.controle.estado(), "m2", true);
    expect(depois.salvando).toBe(false);
    expect(aparenciaDoCoracao({ favorito: depois.favorito })).toEqual({ preenchido: false, opacidade: 1 });
  });
});
