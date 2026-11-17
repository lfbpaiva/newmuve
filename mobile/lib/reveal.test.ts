import { describe, expect, it } from "vitest";
import { criarAvisoDeFimDaRolagem, deveMostrarAtualizacao, medidaDoReveal, posicaoNaRolagem, precisaAcompanharRolagem, REVEAL_FAIXA_DE_ENTRADA, revealRecebeToques, revelaAoRolar, somarDeslocamento } from "./reveal.ts";

const janela = 800;

describe("Reveal: quem recebe toques", () => {
  it("cartão já visível no carregamento recebe toques sem depender da rolagem", () => {
    const caixa = { y: 300, altura: 200 };
    expect(precisaAcompanharRolagem(caixa, janela, false)).toBe(false);
    expect(revealRecebeToques({ posicao: 0, caixa, alturaDaJanela: janela, empilhar: false })).toBe(true);
  });

  it("item de lista (sem empilhamento) recebe toques em qualquer ponto da rolagem, inclusive durante o embalo", () => {
    const caixa = { y: 1400, altura: 200 };
    expect(precisaAcompanharRolagem(caixa, janela, false)).toBe(false);
    for (const posicao of [0, caixa.y - janela + REVEAL_FAIXA_DE_ENTRADA * 0.1, caixa.y - janela + REVEAL_FAIXA_DE_ENTRADA * 0.4, caixa.y, caixa.y + 600]) {
      expect(revealRecebeToques({ posicao, caixa, alturaDaJanela: janela, empilhar: false })).toBe(true);
    }
  });

  it("cartão do feed (empilhado) abaixo da dobra, ainda transparente, não recebe toques", () => {
    const caixa = { y: 1400, altura: 200 };
    expect(precisaAcompanharRolagem(caixa, janela, true)).toBe(true);
    expect(revealRecebeToques({ posicao: 0, caixa, alturaDaJanela: janela, empilhar: true })).toBe(false);
    expect(revealRecebeToques({ posicao: caixa.y - janela + REVEAL_FAIXA_DE_ENTRADA * 0.4, caixa, alturaDaJanela: janela, empilhar: true })).toBe(false);
  });

  it("cartão do feed abaixo da dobra passa a receber toques quando já está mais da metade revelado", () => {
    const caixa = { y: 1400, altura: 200 };
    expect(revealRecebeToques({ posicao: caixa.y - janela + REVEAL_FAIXA_DE_ENTRADA * 0.5, caixa, alturaDaJanela: janela, empilhar: true })).toBe(true);
    expect(revealRecebeToques({ posicao: caixa.y - 1, caixa, alturaDaJanela: janela, empilhar: true })).toBe(true);
  });

  it("cartão empilhado sob o seguinte deixa de receber toques quando está mais da metade coberto", () => {
    const caixa = { y: 300, altura: 200 };
    expect(revealRecebeToques({ posicao: 299, caixa, alturaDaJanela: janela, empilhar: true })).toBe(true);
    expect(revealRecebeToques({ posicao: 399, caixa, alturaDaJanela: janela, empilhar: true })).toBe(true);
    expect(revealRecebeToques({ posicao: 400, caixa, alturaDaJanela: janela, empilhar: true })).toBe(false);
    expect(revealRecebeToques({ posicao: 900, caixa, alturaDaJanela: janela, empilhar: true })).toBe(false);
  });

  it("ao voltar a rolagem, o cartão empilhado volta a receber toques", () => {
    const caixa = { y: 300, altura: 200 };
    const posicoes = [0, 450, 120];
    expect(posicoes.map((posicao) => revealRecebeToques({ posicao, caixa, alturaDaJanela: janela, empilhar: true }))).toEqual([true, false, true]);
  });

  it("depois de filtrar ou remover itens, a decisão usa a posição nova do cartão", () => {
    const antes = { y: 1400, altura: 200 };
    const depois = { y: 200, altura: 200 };
    expect(revealRecebeToques({ posicao: 0, caixa: antes, alturaDaJanela: janela, empilhar: true })).toBe(false);
    expect(revealRecebeToques({ posicao: 0, caixa: depois, alturaDaJanela: janela, empilhar: true })).toBe(true);
  });
});

describe("indicador de atualização por gesto", () => {
  it("só aparece depois do gesto e enquanto o carregamento real não termina", () => {
    expect(deveMostrarAtualizacao(false, true)).toBe(false);
    expect(deveMostrarAtualizacao(true, true)).toBe(true);
    expect(deveMostrarAtualizacao(true, false)).toBe(false);
    expect(deveMostrarAtualizacao(true, undefined)).toBe(false);
  });
});

describe("Reveal: aviso de fim da rolagem", () => {
  it("começa na posição zero e guarda a última posição publicada", () => {
    const aviso = criarAvisoDeFimDaRolagem();
    expect(aviso.posicao()).toBe(0);
    aviso.publicar(420);
    expect(aviso.posicao()).toBe(420);
  });

  it("avisa cada cartão inscrito só quando a rolagem termina, e para de avisar depois de cancelada a inscrição", () => {
    const aviso = criarAvisoDeFimDaRolagem();
    const recebidas: number[] = [];
    const cancelar = aviso.inscrever((posicao) => recebidas.push(posicao));
    aviso.publicar(300);
    aviso.publicar(300);
    aviso.publicar(900);
    cancelar();
    aviso.publicar(1200);
    expect(recebidas).toEqual([300, 900]);
  });

  it("um cartão que cancela a inscrição durante o aviso não impede os demais de serem avisados", () => {
    const aviso = criarAvisoDeFimDaRolagem();
    const avisados: string[] = [];
    const cancelarA = aviso.inscrever(() => {
      avisados.push("a");
      cancelarA();
    });
    aviso.inscrever(() => avisados.push("b"));
    aviso.publicar(10);
    aviso.publicar(20);
    expect(avisados).toEqual(["a", "b", "b"]);
  });

  it("a decisão de toque do cartão empilhado acompanha as posições de fim da rolagem, indo e voltando", () => {
    const aviso = criarAvisoDeFimDaRolagem();
    const caixa = { y: 300, altura: 200 };
    const decisoes: boolean[] = [];
    const avaliar = (posicao: number) => decisoes.push(revealRecebeToques({ posicao, caixa, alturaDaJanela: janela, empilhar: true }));
    avaliar(aviso.posicao());
    aviso.inscrever(avaliar);
    aviso.publicar(450);
    aviso.publicar(120);
    expect(decisoes).toEqual([true, false, true]);
  });

  it("cartão montado depois de uma rolagem parte da última posição conhecida, não do topo", () => {
    const aviso = criarAvisoDeFimDaRolagem();
    aviso.publicar(1300);
    const caixa = { y: 1400, altura: 200 };
    expect(revealRecebeToques({ posicao: aviso.posicao(), caixa, alturaDaJanela: janela, empilhar: false })).toBe(true);
  });
});

describe("Reveal: medida do cartão", () => {
  it("arredonda frações de pixel para não remedir o cartão por variações mínimas de layout", () => {
    expect(medidaDoReveal(300.4, 199.6)).toEqual({ y: 300, altura: 200 });
    expect(medidaDoReveal(300.2, 200.3)).toEqual(medidaDoReveal(299.8, 199.9));
  });

  it("mudança real de altura, como uma imagem que terminou de carregar, continua mudando a medida", () => {
    expect(medidaDoReveal(300, 200)).not.toEqual(medidaDoReveal(300, 260));
  });
});

describe("Reveal: posição dentro de listas", () => {
  const janela = 800;

  it("soma o deslocamento dos contêineres à posição medida no pai", () => {
    const secao = somarDeslocamento(0, 1200.4);
    const lista = somarDeslocamento(secao, 48.6);

    expect(lista).toBe(1249);
    expect(posicaoNaRolagem({ y: 300, altura: 120 }, lista)).toEqual({ y: 1549, altura: 120 });
  });

  it("item abaixo da primeira tela dentro de uma lista passa a entrar ao rolar", () => {
    const medidaNoPai = { y: 300, altura: 120 };
    const naRolagem = posicaoNaRolagem(medidaNoPai, 900);

    expect(revelaAoRolar(medidaNoPai, janela)).toBe(false);
    expect(revelaAoRolar(naRolagem, janela)).toBe(true);
    expect(revealRecebeToques({ posicao: 0, caixa: naRolagem, alturaDaJanela: janela, empilhar: false })).toBe(true);
    expect(revealRecebeToques({ posicao: naRolagem.y - janela + REVEAL_FAIXA_DE_ENTRADA, caixa: naRolagem, alturaDaJanela: janela, empilhar: false })).toBe(true);
  });

  it("sem contêiner medido a posição continua a mesma (feed e blocos diretos)", () => {
    expect(posicaoNaRolagem({ y: 420, altura: 200 }, 0)).toEqual({ y: 420, altura: 200 });
  });
});
