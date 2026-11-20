import { describe, expect, it } from "vitest";
import { segundosAte, situacaoDaCobranca } from "./cobranca.ts";

describe("situação da cobrança Pix na tela", () => {
  it("pendente com tempo restante aguarda o pagamento", () => {
    expect(situacaoDaCobranca("PENDENTE", 120)).toBe("aguardando");
  });

  it("pendente com o relógio do celular zerado só confirma o prazo com o servidor, sem declarar expirada", () => {
    expect(situacaoDaCobranca("PENDENTE", 0)).toBe("confirmando-prazo");
  });

  it.each(["EXPIRADO", "CANCELADO", "ESTORNADO"])("%s informado pelo servidor encerra a cobrança, mesmo com o relógio do celular atrasado", (status) => {
    expect(situacaoDaCobranca(status, 600)).toBe("encerrada");
  });

  it("calcula os segundos restantes a partir do horário de expiração do servidor", () => {
    const agora = Date.parse("2030-01-01T12:00:00Z");
    expect(segundosAte("2030-01-01T12:15:00Z", agora)).toBe(900);
    expect(segundosAte("2030-01-01T11:59:00Z", agora)).toBe(0);
    expect(segundosAte("2030-01-01T12:00:00.400Z", agora)).toBe(1);
  });
});
