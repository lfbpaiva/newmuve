import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchCandidateProfile, fetchCandidates } from "./events.ts";

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
