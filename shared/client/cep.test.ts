import { afterEach, describe, expect, it, vi } from "vitest";
import { formatCep, lookupCep } from "./cep.ts";

const respond = (body: object, status = 200) => vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status })));

afterEach(() => vi.unstubAllGlobals());

describe("consulta de CEP", () => {
  it("formata enquanto a pessoa digita", () => {
    expect(formatCep("85810")).toBe("85810");
    expect(formatCep("85810010999")).toBe("85810-010");
  });

  it("devolve o endereço encontrado", async () => {
    respond({ logradouro: "Avenida Brasil", bairro: "Centro", localidade: "Cascavel", uf: "PR" });

    await expect(lookupCep("85810-010")).resolves.toEqual({ logradouro: "Avenida Brasil", bairro: "Centro", cidade: "Cascavel", uf: "PR" });
  });

  it("explica CEP incompleto sem consultar o serviço", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    await expect(lookupCep("8581")).rejects.toThrow("8 números");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("diferencia CEP inexistente de serviço fora do ar", async () => {
    respond({ erro: "true" });
    await expect(lookupCep("00000000")).rejects.toThrow("não encontrado");

    respond({}, 500);
    await expect(lookupCep("85810010")).rejects.toThrow("Não foi possível");

    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("sem rede"); }));
    await expect(lookupCep("85810010")).rejects.toThrow("Não foi possível");
  });
});
