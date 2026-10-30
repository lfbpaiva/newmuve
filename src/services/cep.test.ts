import { afterEach, describe, expect, it, vi } from "vitest";
import { CepLookupError, formatCep, formatEventAddress, lookupCep } from "./cep.ts";

afterEach(() => vi.unstubAllGlobals());

describe("consulta de CEP para eventos", () => {
  it("formata a digitação e consulta um CEP completo", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ logradouro: "Praça da Sé", bairro: "Sé", localidade: "São Paulo", uf: "SP" }) });
    vi.stubGlobal("fetch", fetchMock);

    expect(formatCep("01001-000")).toBe("01001-000");
    expect(formatCep("01001000")).toBe("01001-000");
    expect(await lookupCep("01001-000")).toEqual({ logradouro: "Praça da Sé", bairro: "Sé", cidade: "São Paulo", uf: "SP" });
    expect(fetchMock).toHaveBeenCalledWith("https://viacep.com.br/ws/01001000/json/", expect.objectContaining({ signal: expect.any(AbortSignal) }));
  });

  it("recusa CEP incompleto sem fazer requisição", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(lookupCep("01001-00")).rejects.toMatchObject({ code: "invalid" });
    await expect(lookupCep("010010000")).rejects.toMatchObject({ code: "invalid" });
    expect(fetchMock).toHaveBeenCalledTimes(0);
  });

  it("distingue CEP inexistente de serviço indisponível", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ erro: "true" }) }));
    await expect(lookupCep("99999-999")).rejects.toMatchObject({ code: "not-found" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ erro: true }) }));
    await expect(lookupCep("99999-999")).rejects.toMatchObject({ code: "not-found" });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("network")));
    await expect(lookupCep("01001-000")).rejects.toMatchObject({ code: "unavailable" });
  });

  it("aceita CEP sem logradouro, para completar manualmente", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ logradouro: "", bairro: "", localidade: "Brasília", uf: "DF" }) }));
    expect(await lookupCep("70000-000")).toEqual({ logradouro: "", bairro: "", cidade: "Brasília", uf: "DF" });
  });

  it("descarta uma resposta atrasada após cancelar a consulta anterior", async () => {
    let release!: (response: { ok: boolean; json: () => Promise<unknown> }) => void;
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => new Promise((resolve) => { release = resolve; })));
    const controller = new AbortController();
    const pending = lookupCep("01001-000", controller.signal);
    const rejected = expect(pending).rejects.toBeTruthy();
    controller.abort();
    release({ ok: true, json: async () => ({ logradouro: "Rua antiga", localidade: "São Paulo", uf: "SP" }) });
    await rejected;
  });

  it("preserva edição manual ao montar o endereço no formato atual do backend", () => {
    expect(formatEventAddress({ cep: "01001-000", logradouro: "Praça da Sé", numero: "42", complemento: "Sala 3", bairro: "Sé" }))
      .toBe("Praça da Sé, 42, Sala 3 - Sé, CEP 01001-000");
    expect(formatEventAddress({ cep: "", logradouro: "Rua manual", numero: "s/n", complemento: "", bairro: "" }))
      .toBe("Rua manual, s/n");
    expect(new CepLookupError("not-found").message).toContain("não encontrado");
  });
});
