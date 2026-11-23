import { describe, expect, it } from "vitest";
import { updateProfileSchemas } from "./account.ts";

describe("redes sociais no perfil do músico", () => {
  const perfil = (redesSociais: unknown) => updateProfileSchemas.MUSICIAN.safeParse({ nome: "Banda Teste", redesSociais });

  it("guarda só as redes preenchidas, já como link", () => {
    const resultado = perfil({ instagram: "@bandateste", youtube: "", spotify: "https://open.spotify.com/artist/1" });

    expect(resultado.success && resultado.data.redesSociais).toEqual({ instagram: "https://www.instagram.com/bandateste", spotify: "https://open.spotify.com/artist/1" });
  });

  it("recusa link de outra rede e diz qual campo está errado", () => {
    const resultado = perfil({ tiktok: "https://instagram.com/bandateste" });

    expect(resultado.success).toBe(false);
    expect(resultado.error?.issues[0]?.message).toBe("Informe um link válido do TikTok.");
  });

  it("ignora rede que o app não conhece", () => {
    expect(perfil({ facebook: "https://facebook.com/banda" }).success).toBe(true);
    expect(perfil({ facebook: "https://facebook.com/banda" }).data?.redesSociais).toEqual({});
  });

  it("sem o campo, as redes ficam como estão", () => {
    expect(perfil(undefined).data?.redesSociais).toBeUndefined();
  });
});
