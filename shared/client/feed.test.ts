import { describe, expect, it, vi } from "vitest";
import { supabase } from "./config.ts";
import { fetchFeed, filterFeed, FILTROS_VAZIOS, type EventItem } from "./events.ts";

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
  createdAt: daysFromNow(-5),
  cachePago: 0,
  cacheEmRepasse: 0,
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

describe("feed sem eventos em que o músico foi recusado", () => {
  const linha = (id: string) => ({ id, contractor_id: "c1", musico_contratado_id: null, titulo: "Evento " + id, tipo_evento: "Bar e restaurante", inicio: daysFromNow(3), duracao_minutos: 120, uf: "PR", cidade: "Cascavel", estilos_musicais: ["Rock"], formacao: "Indiferente", som_disponivel: false, cache: "500", imagem_url: "https://x/e.png", descricao: null, status: "ABERTO", confirmacao_musico: false, confirmacao_contratante: false, inscricoes_encerradas: false, created_at: daysFromNow(-5) });

  function montarSupabase(recusados: string[], erroNasRecusas = false) {
    const consultas: { tabela: string; filtros: unknown[][] }[] = [];
    const cliente = {
      rpc: vi.fn().mockResolvedValue({ data: [{ event_id: "a", distancia_km: 0 }, { event_id: "b", distancia_km: 12 }, { event_id: "c", distancia_km: 30 }], error: null }),
      from: vi.fn((tabela: string) => {
        const registro = { tabela, filtros: [] as unknown[][] };
        consultas.push(registro);
        const consulta = {
          select: vi.fn(() => consulta),
          in: vi.fn((...args: unknown[]) => {
            registro.filtros.push(["in", ...args]);
            return tabela === "events" ? Promise.resolve({ data: ["a", "b", "c"].map(linha), error: null }) : consulta;
          }),
          eq: vi.fn((...args: unknown[]) => {
            registro.filtros.push(["eq", ...args]);
            return Promise.resolve(erroNasRecusas ? { data: null, error: { message: "falha" } } : { data: recusados.map((event_id) => ({ event_id })), error: null });
          }),
        };
        return consulta;
      }),
    };
    vi.mocked(supabase).mockReturnValue(cliente as never);
    return { consultas };
  }

  it("tira do feed só os eventos com inscrição recusada deste músico, mantendo a ordem e a distância dos demais", async () => {
    const { consultas } = montarSupabase(["b"]);

    const feed = await fetchFeed(50);

    expect(feed.map((e) => [e.id, e.distanciaKm])).toEqual([["a", 0], ["c", 30]]);
    const recusas = consultas.find((c) => c.tabela === "event_candidates")!;
    expect(recusas.filtros).toEqual([["in", "event_id", ["a", "b", "c"]], ["eq", "status", "RECUSADO"]]);
  });

  it("inscrição pendente ou aprovada não esconde o evento", async () => {
    montarSupabase([]);
    expect((await fetchFeed(50)).map((e) => e.id)).toEqual(["a", "b", "c"]);
  });

  it("se a consulta das recusas falhar, o feed mostra erro em vez de exibir eventos recusados", async () => {
    montarSupabase([], true);
    await expect(fetchFeed(50)).rejects.toMatchObject({ code: "FALHA_DE_LEITURA" });
  });
});
