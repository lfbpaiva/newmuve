import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchCandidateProfile, fetchCandidates, fetchEventWithContractor, SEM_CONEXAO_MENSAGEM, unwrap } from "./events.ts";

const { supabaseMock } = vi.hoisted(() => ({ supabaseMock: vi.fn() }));
vi.mock("./config.ts", () => ({ supabase: supabaseMock }));

const row = (candidateId: string, musicianId: string, nome: string) => ({
  id: candidateId,
  status: "PENDENTE",
  musician: {
    user_id: musicianId,
    nome_completo: nome,
    foto_perfil_url: null,
    bio: null,
    estilos_musicais: ["Rock"],
    portfolio_url: null,
    uf: "PR",
    cidade: "Cascavel",
    avaliacao_media: 0,
    total_avaliacoes: 0,
  },
});

function setup(rows: ReturnType<typeof row>[], detail: ReturnType<typeof row> | null = null) {
  const query = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue({ data: rows, error: null }),
    maybeSingle: vi.fn().mockResolvedValue({ data: detail, error: null }),
  };
  const from = vi.fn().mockReturnValue(query);
  supabaseMock.mockReturnValue({ from });
  return { query, from };
}

beforeEach(() => vi.clearAllMocks());

describe("perfis dos candidatos", () => {
  it("mantém a identidade e o estado de um ou vários candidatos", async () => {
    const first = row("candidate-1", "musician-1", "Músico Um");
    const second = { ...row("candidate-2", "musician-2", "Músico Dois"), status: "RECUSADO" };
    setup([first]);
    expect((await fetchCandidates("event-1")).map((candidate) => candidate.musician.id)).toEqual(["musician-1"]);

    setup([first, second]);
    expect((await fetchCandidates("event-1")).map((candidate) => [candidate.id, candidate.musician.id, candidate.status]))
      .toEqual([["candidate-1", "musician-1", "PENDENTE"], ["candidate-2", "musician-2", "RECUSADO"]]);
  });

  it("busca o perfil pelo ID real da candidatura dentro do evento e seleciona apenas dados públicos", async () => {
    const { query, from } = setup([], row("candidate-2", "musician-2", "Músico Dois"));
    const candidate = await fetchCandidateProfile("event-1", "candidate-2");

    expect(candidate?.musician).toMatchObject({ id: "musician-2", nome: "Músico Dois" });
    expect(from).toHaveBeenCalledWith("event_candidates");
    expect(query.eq.mock.calls).toEqual([["event_id", "event-1"], ["id", "candidate-2"]]);
    const projection = query.select.mock.calls[0][0] as string;
    expect(projection).toContain("musician:musician_profiles");
    expect(/documento|telefone|chave_pix|email/i.test(projection)).toBe(false);
  });

  it("não retorna perfil para candidatura ausente, removida ou invisível pela RLS", async () => {
    setup([], null);
    expect(await fetchCandidateProfile("event-outro", "candidate-2")).toBeNull();

    const { query } = setup([], null);
    query.maybeSingle.mockResolvedValue({ data: { ...row("candidate-2", "musician-2", "Músico Dois"), musician: null }, error: null });
    expect(await fetchCandidateProfile("event-1", "candidate-2")).toBeNull();
  });

  it("propaga erro de leitura para exibir a opção de tentar novamente", async () => {
    const { query } = setup([], null);
    query.maybeSingle.mockResolvedValue({ data: null, error: { message: "read failed" } });
    await expect(fetchCandidateProfile("event-1", "candidate-2")).rejects.toMatchObject({ code: "FALHA_DE_LEITURA" });
  });
});

describe("unwrap", () => {
  const erro = { message: "TypeError: Network request failed", details: "", hint: "", code: "" } as unknown as Parameters<typeof unwrap>[0]["error"];

  it("falha de rede (status 0) vira aviso de sem conexão", () => {
    expect(() => unwrap({ data: null, error: erro, status: 0 })).toThrow(expect.objectContaining({ code: "SEM_CONEXAO", message: SEM_CONEXAO_MENSAGEM }));
  });

  it("erro do banco com status HTTP continua como falha de leitura", () => {
    expect(() => unwrap({ data: null, error: erro, status: 500 })).toThrow(expect.objectContaining({ code: "FALHA_DE_LEITURA" }));
    expect(() => unwrap({ data: null, error: erro })).toThrow(expect.objectContaining({ code: "FALHA_DE_LEITURA" }));
  });

  it("devolve os dados quando a leitura dá certo", () => {
    expect(unwrap<number[]>({ data: [1, 2], error: null, status: 200 })).toEqual([1, 2]);
  });
});

describe("detalhe do evento com o contratante em uma única consulta", () => {
  const eventoRow = {
    id: "event-1", contractor_id: "contractor-1", musico_contratado_id: null, titulo: "Noite acústica", tipo_evento: "Bar e restaurante",
    inicio: "2026-11-20T23:00:00Z", duracao_minutos: 180, uf: "PR", cidade: "Cascavel", estilos_musicais: ["MPB"], formacao: "Dupla",
    som_disponivel: true, cache: "350.00", imagem_url: "https://exemplo/banner.png", descricao: null, status: "ABERTO",
    confirmacao_musico: false, confirmacao_contratante: false, inscricoes_encerradas: false, created_at: "2026-11-10T12:00:00Z",
  };
  const contratante = { user_id: "contractor-1", nome_fantasia: "Bar do Zé", foto_perfil_url: "https://exemplo/foto.png", uf: "PR", cidade: "Cascavel", avaliacao_media: "4.5", total_avaliacoes: 2 };

  function setupDetalhe(data: unknown) {
    const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data, error: null }) };
    const from = vi.fn().mockReturnValue(query);
    supabaseMock.mockReturnValue({ from });
    return { query, from };
  }

  it("traz o evento e o perfil público do contratante juntos, com os mesmos dados da busca separada", async () => {
    const { query, from } = setupDetalhe({ ...eventoRow, contratante });

    const { event, contractor } = await fetchEventWithContractor("event-1");

    expect(from).toHaveBeenCalledTimes(1);
    expect(from).toHaveBeenCalledWith("events");
    expect(query.eq).toHaveBeenCalledWith("id", "event-1");
    expect(event).toMatchObject({ id: "event-1", contractorId: "contractor-1", cache: 350, status: "ABERTO" });
    expect("contratante" in event).toBe(false);
    expect(contractor).toMatchObject({ id: "contractor-1", nome: "Bar do Zé", avaliacaoMedia: 4.5, totalAvaliacoes: 2 });
  });

  it("seleciona só colunas públicas do contratante", async () => {
    const { query } = setupDetalhe({ ...eventoRow, contratante });
    await fetchEventWithContractor("event-1");

    const projecao = query.select.mock.calls[0][0] as string;
    expect(projecao).toContain("contratante:contractor_profiles(nome_fantasia");
    expect(/documento|telefone|cnpj|chave_pix|email|asaas/i.test(projecao)).toBe(false);
  });

  it("contratante que excluiu a conta: o evento abre e o contratante fica nulo", async () => {
    setupDetalhe({ ...eventoRow, contractor_id: null, contratante: null });
    await expect(fetchEventWithContractor("event-1")).resolves.toMatchObject({ contractor: null, event: { contractorId: null } });
  });

  it("evento indisponível continua com a mesma mensagem de antes", async () => {
    setupDetalhe(null);
    await expect(fetchEventWithContractor("event-1")).rejects.toMatchObject({ status: 404, code: "EVENTO_NAO_ENCONTRADO" });
  });
});
