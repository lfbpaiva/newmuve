import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import ProfileOverview, { MusicianPublicFields } from "./ProfileOverview.tsx";

describe("apresentação pública do músico", () => {
  it("mostra somente os dados profissionais disponíveis", () => {
    const html = renderToStaticMarkup(<>
      <ProfileOverview profile={{ nome: "Músico Um", fotoPerfilUrl: "https://example.com/foto.png", cidade: "Cascavel", uf: "PR", avaliacaoMedia: 4.5, totalAvaliacoes: 2 }} label="Candidato ao evento"/>
      <MusicianPublicFields profile={{ bio: "Voz e violão", estilosMusicais: ["MPB", "Rock"], portfolioUrl: "https://example.com/portfolio" }}/>
    </>);

    expect(html).toContain("Músico Um");
    expect(html).toContain("Cascavel, PR");
    expect(html).toContain("Voz e violão");
    expect(html).toContain("MPB");
    expect(html).toContain("https://example.com/portfolio");
    expect(/CPF|telefone|e-mail|Pix/i.test(html)).toBe(false);
  });

  it("usa um marcador discreto e oculta campos profissionais ausentes", () => {
    const html = renderToStaticMarkup(<>
      <ProfileOverview profile={{ nome: "Músico Dois", fotoPerfilUrl: null, cidade: null, uf: null, avaliacaoMedia: 0, totalAvaliacoes: 0 }} label="Candidato ao evento"/>
      <MusicianPublicFields profile={{ bio: null, estilosMusicais: null, portfolioUrl: null }}/>
    </>);

    expect(html).toContain("Cidade não informada");
    expect(html).toContain("Descrição não informada");
    expect(html).toContain("avatar-placeholder");
    expect(html.includes("Portfólio")).toBe(false);
    expect(html.includes("Estilos musicais")).toBe(false);
  });
});
