import { describe, expect, it, vi } from "vitest";
import { filterFeed, FILTROS_VAZIOS, type EventItem } from "./events.ts";

vi.mock("./config.ts", () => ({ supabase: vi.fn() }));

const NOW = new Date("2030-06-10T12:00:00Z");
const daysFromNow = (days: number) => new Date(NOW.getTime() + days * 24 * 60 * 60 * 1000).toISOString();

const evento = (overrides: Partial<EventItem>): EventItem => ({
  id: "e",
  contractorId: "c1",
  musicoContratadoId: null,
  titulo: "Noite de rock",
  tipoEvento: "Bar e restaurante",
  inicio: daysFromNow(3),
  duracaoMinutos: 120,
  uf: "PR",
  cidade: "Cascavel",
  estilosMusicais: ["Rock"],
  formacao: "Indiferente",
  somDisponivel: false,
  cache: 500,
  imagemUrl: "https://x/e.png",
  descricao: null,
  status: "ABERTO",
  confirmacaoMusico: false,
  confirmacaoContratante: false,
  inscricoesEncerradas: false,
  ...overrides,
});

describe("filtros do feed", () => {
  const feed = [
    evento({ id: "rock", titulo: "Noite de rock", cache: 500, inicio: daysFromNow(3) }),
    evento({ id: "casamento", titulo: "Casamento na chácara", tipoEvento: "Festa particular", cache: 1500, inicio: daysFromNow(20), cidade: "Toledo", estilosMusicais: ["MPB"] }),
    evento({ id: "empresa", titulo: "Confraternização", tipoEvento: "Corporativo", cache: 300, inicio: daysFromNow(45) }),
  ];
  const ids = (filtros: Partial<typeof FILTROS_VAZIOS>) => filterFeed(feed, { ...FILTROS_VAZIOS, ...filtros }, NOW).map((e) => e.id);

  it("busca por nome, cidade e estilo, ignorando acentos e maiúsculas", () => {
    expect(ids({ busca: "chacara" })).toEqual(["casamento"]);
    expect(ids({ busca: "TOLEDO mpb" })).toEqual(["casamento"]);
    expect(ids({ busca: "rock" })).toEqual(["rock", "empresa"]);
  });

  it("filtra por período, tipo de evento e cachê mínimo", () => {
    expect(ids({ periodo: "SEMANA" })).toEqual(["rock"]);
    expect(ids({ periodo: "MES" })).toEqual(["rock", "casamento"]);
    expect(ids({ tipos: ["Corporativo", "Festa particular"] })).toEqual(["casamento", "empresa"]);
    expect(ids({ cacheMinimo: 500 })).toEqual(["rock", "casamento"]);
  });

  it("sem filtros mostra tudo", () => {
    expect(ids({})).toEqual(["rock", "casamento", "empresa"]);
  });
});
