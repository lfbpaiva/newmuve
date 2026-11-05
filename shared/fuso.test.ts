import { describe, expect, it } from "vitest";
import { eventDateParts } from "./client/format.ts";
import { fusoDaUf, horarioLocalDoEvento } from "./dominio.ts";
import { formatDateTime } from "./formato.ts";

describe("horário do evento no fuso do estado", () => {
  it("interpreta a hora digitada no fuso da UF do evento, não no do aparelho", () => {
    expect(horarioLocalDoEvento("2026-11-14", "21:00", "PR").toISOString()).toBe("2026-11-15T00:00:00.000Z");
    expect(horarioLocalDoEvento("2026-11-14", "21:00", "AM").toISOString()).toBe("2026-11-15T01:00:00.000Z");
    expect(horarioLocalDoEvento("2026-11-14", "21:00", "AC").toISOString()).toBe("2026-11-15T02:00:00.000Z");
  });

  it("mostra o mesmo horário que foi digitado, para quem estiver em qualquer fuso", () => {
    const inicio = horarioLocalDoEvento("2026-11-14", "21:00", "AM").toISOString();

    expect(eventDateParts(inicio, "AM")).toMatchObject({ day: "14", time: "21:00", data: "14/11/2026" });
    expect(formatDateTime(inicio, "AM")).toBe("14/11/2026 às 21:00");
  });

  it("usa o horário de Brasília para os estados que o seguem", () => {
    expect(fusoDaUf("SP")).toBe("America/Sao_Paulo");
    expect(fusoDaUf("MT")).toBe("America/Cuiaba");
  });
});
