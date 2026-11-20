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

    expect(eventDateParts(inicio, "AM")).toMatchObject({ day: "14", time: "21:00", data: "14/11/2026", weekday: "SÁB", cartaz: "SÁB 14 NOV · 21H" });
    expect(formatDateTime(inicio, "AM")).toBe("14/11/2026 às 21:00");
  });

  it("usa o horário de Brasília para os estados que o seguem", () => {
    expect(fusoDaUf("SP")).toBe("America/Sao_Paulo");
    expect(fusoDaUf("MT")).toBe("America/Cuiaba");
  });
});

describe("data e horário impossíveis", () => {
  it("não viram outra data", () => {
    for (const [data, horario] of [["2026-02-31", "21:00"], ["2026-02-29", "21:00"], ["2026-13-01", "21:00"], ["2026-04-31", "10:00"], ["2026-11-14", "25:00"], ["2026-11-14", "21:60"]]) {
      expect(Number.isNaN(horarioLocalDoEvento(data, horario, "PR").getTime()), `${data} ${horario}`).toBe(true);
    }
    expect(horarioLocalDoEvento("2028-02-29", "21:00", "PR").toISOString()).toBe("2028-03-01T00:00:00.000Z");
  });
});
