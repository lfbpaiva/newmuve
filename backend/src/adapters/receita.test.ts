import { afterEach, describe, expect, it, vi } from "vitest";
import { createCnpjLookup } from "./receita.ts";

describe("consulta de CNPJ na BrasilAPI", () => {
  afterEach(() => vi.unstubAllGlobals());
  const responder = (corpo: unknown, status = 200) => vi.stubGlobal("fetch", vi.fn(async () => Response.json(corpo, { status })));

  it("reconhece a situação ativa mesmo com outra caixa ou espaços", async () => {
    responder({ descricao_situacao_cadastral: " Ativa " });
    await expect(createCnpjLookup().situacao("11222333000181")).resolves.toBe("ATIVA");
  });

  it("resposta sem a situação não bloqueia o cadastro", async () => {
    responder({ razao_social: "Bar Teste" });
    await expect(createCnpjLookup().situacao("11222333000181")).resolves.toBeNull();
  });

  it("situação diferente de ativa continua recusada, e CNPJ inexistente também", async () => {
    responder({ descricao_situacao_cadastral: "BAIXADA" });
    await expect(createCnpjLookup().situacao("11222333000181")).resolves.toBe("INATIVA");
    responder({}, 404);
    await expect(createCnpjLookup().situacao("11222333000181")).resolves.toBe("INEXISTENTE");
  });
});
