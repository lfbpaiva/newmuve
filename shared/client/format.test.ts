import { describe, expect, it } from "vitest";
import { estimarCobrancaDoContratante } from "../dominio.ts";
import { detalharTotalDoContratante, formatTotalDaInscricao, formatTotalDoContratante, formatTotalSeAceita } from "./format.ts";

const agora = new Date("2026-11-16T20:00:00Z");
const espaco = (texto: string) => texto.replace(/\s/g, " ");

describe("texto do total para o contratante", () => {
  it("deixa claro que é o valor se aprovar agora, separando cachê e taxa", () => {
    const estimativa = estimarCobrancaDoContratante(650, null, agora)!;

    expect(espaco(formatTotalDoContratante(estimativa))).toBe("Você paga R$ 715,00 se aprovar agora");
    expect(espaco(formatTotalSeAceita(estimativa))).toBe("Se esta proposta for aceita, você pagará R$ 715,00 ao aprovar");
    expect(espaco(detalharTotalDoContratante(estimativa))).toBe("R$ 650,00 de cachê + R$ 65,00 de taxa de 10%. O valor final é calculado no pagamento.");
  });

  it("no topo da conversa, o total fica ligado ao valor da inscrição atual, não a uma proposta", () => {
    const estimativa = estimarCobrancaDoContratante(650, null, agora)!;

    expect(espaco(formatTotalDaInscricao(estimativa))).toBe("Para aprovar a inscrição de R$ 650,00, você paga R$ 715,00");
  });

  it("com Muve Casa informa a taxa reduzida e a validade, sem prometer o valor depois dela", () => {
    const estimativa = estimarCobrancaDoContratante(650, "2026-12-12T18:52:49Z", agora)!;

    expect(espaco(formatTotalDoContratante(estimativa))).toBe("Você paga R$ 689,00 se aprovar agora");
    expect(espaco(detalharTotalDoContratante(estimativa))).toBe("R$ 650,00 de cachê + R$ 39,00 de taxa de 6% do Muve Casa, válida até 12/12/2026. O valor final é calculado no pagamento.");
  });
});
