import { describe, expect, it, vi } from "vitest";
import { ABERTURA_DURACAO_MS, ABERTURA_ESPERA_DA_LOGO_MS, ABERTURA_LIMITE_MS, criarLargada, encerrarUmaVez, telasLiberadas } from "./abertura.ts";

describe("encerramento da abertura", () => {
  it("encerra uma única vez, venha o aviso da animação, do limite de tempo ou do app em segundo plano", () => {
    const aoEncerrar = vi.fn();
    const encerrar = encerrarUmaVez(aoEncerrar);

    encerrar();
    encerrar();
    encerrar();

    expect(aoEncerrar).toHaveBeenCalledTimes(1);
  });

  it("o limite de tempo encerra a abertura mesmo se a animação nunca terminar", () => {
    vi.useFakeTimers();
    const aoEncerrar = vi.fn();
    const encerrar = encerrarUmaVez(aoEncerrar);
    setTimeout(encerrar, ABERTURA_LIMITE_MS);

    vi.advanceTimersByTime(ABERTURA_LIMITE_MS - 1);
    expect(aoEncerrar).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(aoEncerrar).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("o limite fica depois da espera da logo e da animação completa, para não cortar a apresentação normal", () => {
    expect(ABERTURA_LIMITE_MS).toBeGreaterThan(ABERTURA_ESPERA_DA_LOGO_MS + ABERTURA_DURACAO_MS);
    expect(ABERTURA_LIMITE_MS).toBeLessThanOrEqual(ABERTURA_ESPERA_DA_LOGO_MS + ABERTURA_DURACAO_MS + 1500);
  });
});

describe("largada da abertura", () => {
  it("só começa a desenhar quando a logo carregou e a preferência de movimento foi lida, em qualquer ordem", () => {
    const aoLargar = vi.fn();
    const largada = criarLargada(aoLargar);
    largada.preferenciaLida(false);
    expect(aoLargar).not.toHaveBeenCalled();
    largada.logoPronta();
    expect(aoLargar).toHaveBeenCalledWith(false);

    const outra = vi.fn();
    const segunda = criarLargada(outra);
    segunda.logoPronta();
    expect(outra).not.toHaveBeenCalled();
    segunda.preferenciaLida(false);
    expect(outra).toHaveBeenCalledTimes(1);
  });

  it("com reduzir movimento, encerra logo, sem esperar a imagem", () => {
    const aoLargar = vi.fn();
    criarLargada(aoLargar).preferenciaLida(true);
    expect(aoLargar).toHaveBeenCalledWith(true);
  });

  it("larga uma única vez, mesmo que a logo avise de novo ou o tempo de espera também dispare", () => {
    const aoLargar = vi.fn();
    const largada = criarLargada(aoLargar);
    largada.preferenciaLida(false);
    largada.logoPronta();
    largada.logoPronta();
    largada.preferenciaLida(false);
    expect(aoLargar).toHaveBeenCalledTimes(1);
  });

  it("se a imagem não carregar, o tempo de espera libera a animação", () => {
    vi.useFakeTimers();
    const aoLargar = vi.fn();
    const largada = criarLargada(aoLargar);
    setTimeout(largada.logoPronta, ABERTURA_ESPERA_DA_LOGO_MS);
    largada.preferenciaLida(false);

    vi.advanceTimersByTime(ABERTURA_ESPERA_DA_LOGO_MS - 1);
    expect(aoLargar).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(aoLargar).toHaveBeenCalledWith(false);
    vi.useRealTimers();
  });
});

describe("telas durante a abertura", () => {
  it("login e início só montam quando o desenho da logo termina", () => {
    expect(telasLiberadas({ abrindo: true, desenhoConcluido: false })).toBe(false);
    expect(telasLiberadas({ abrindo: true, desenhoConcluido: true })).toBe(true);
  });

  it("se a abertura terminar por qualquer caminho (limite, segundo plano, reduzir movimento), as telas montam", () => {
    expect(telasLiberadas({ abrindo: false, desenhoConcluido: false })).toBe(true);
  });
});
