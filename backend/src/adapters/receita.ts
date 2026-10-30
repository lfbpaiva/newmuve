import type { CnpjLookup } from "../services/accountService.ts";

export function createCnpjLookup(): CnpjLookup {
  return {
    async situacao(cnpj) {
      try {
        const response = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, {
          headers: { "User-Agent": "muve-api" },
          signal: AbortSignal.timeout(8_000),
        });
        if (response.status === 404) return "INEXISTENTE";
        if (!response.ok) return null;
        const data = (await response.json()) as { descricao_situacao_cadastral?: string };
        return data.descricao_situacao_cadastral === "ATIVA" ? "ATIVA" : "INATIVA";
      } catch (error) {
        console.error("Consulta de CNPJ indisponível", error instanceof Error ? error.name : "erro desconhecido");
        return null;
      }
    },
  };
}
