import { describe, expect, it, vi } from "vitest";
import { ABERTURA_DURACAO_MS, ABERTURA_LIMITE_MS, encerrarUmaVez } from "./abertura.ts";

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

  it("o limite fica depois da animação completa, para não cortar a apresentação normal", () => {
    expect(ABERTURA_LIMITE_MS).toBeGreaterThan(ABERTURA_DURACAO_MS);
    expect(ABERTURA_LIMITE_MS).toBeLessThanOrEqual(ABERTURA_DURACAO_MS + 1500);
  });
});
