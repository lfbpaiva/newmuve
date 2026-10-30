import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Candidate } from "../../services/events";
import { CandidateCard } from "./EventManageScreen.tsx";

const candidate = (id: string, nome: string, status: Candidate["status"]): Candidate => ({
  id,
  status,
  musician: {
    id: `musician-${id}`,
    nome,
    fotoPerfilUrl: "",
    cidade: "Cascavel",
    uf: "PR",
    avaliacaoMedia: 0,
    totalAvaliacoes: 0,
    bio: null,
    estilosMusicais: [],
    portfolioUrl: null,
  },
});

describe("lista de candidatos no navegador", () => {
  it("oferece o perfil do candidato sem depender de avaliação ou bio", () => {
    const html = renderToStaticMarkup(<CandidateCard candidate={candidate("1", "Músico Um", "PENDENTE")} canApprove approveLabel="Aprovar e pagar" onProfile={() => {}} onApprove={() => {}}/>);
    expect(html).toContain("Ver perfil de Músico Um");
    expect(html).toContain("avatar-placeholder");
    expect(html).toContain("Aprovar e pagar");
  });

  it("mantém dois músicos e seus estados sem oferecer aprovação quando bloqueada", () => {
    const html = renderToStaticMarkup(<>
      <CandidateCard candidate={candidate("1", "Músico Um", "APROVADO")} canApprove={false} approveLabel="Aprovar e pagar" onProfile={() => {}} onApprove={() => {}}/>
      <CandidateCard candidate={candidate("2", "Músico Dois", "RECUSADO")} canApprove={false} approveLabel="Aprovar e pagar" onProfile={() => {}} onApprove={() => {}}/>
    </>);
    expect(html).toContain("Ver perfil de Músico Um");
    expect(html).toContain("Ver perfil de Músico Dois");
    expect(html).toContain("Contratado");
    expect(html).toContain("Não selecionado");
    expect(html.includes("Aprovar e pagar")).toBe(false);
  });
});
