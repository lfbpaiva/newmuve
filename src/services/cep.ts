export interface CepAddress {
  logradouro: string;
  bairro: string;
  cidade: string;
  uf: string;
}

export type CepLookupErrorCode = "invalid" | "not-found" | "unavailable";

export class CepLookupError extends Error {
  readonly code: CepLookupErrorCode;

  constructor(code: CepLookupErrorCode) {
    super({
      invalid: "Informe um CEP com 8 números.",
      "not-found": "CEP não encontrado. Confira o número ou preencha o endereço manualmente.",
      unavailable: "Não foi possível consultar o CEP agora. Preencha o endereço manualmente.",
    }[code]);
    this.code = code;
  }
}

export const cepDigits = (value: string) => value.replace(/\D/g, "").slice(0, 8);

export function formatCep(value: string): string {
  const digits = cepDigits(value);
  return digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;
}

export async function lookupCep(value: string, signal?: AbortSignal): Promise<CepAddress> {
  const digits = value.replace(/\D/g, "");
  if (digits.length !== 8) throw new CepLookupError("invalid");

  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) abort();
  const timeout = setTimeout(abort, 8000);

  try {
    const response = await fetch(`https://viacep.com.br/ws/${digits}/json/`, { signal: controller.signal });
    if (controller.signal.aborted) throw new CepLookupError("unavailable");
    if (!response.ok) throw new CepLookupError("unavailable");
    const data: unknown = await response.json();
    if (controller.signal.aborted) throw new CepLookupError("unavailable");
    if (!data || typeof data !== "object") throw new CepLookupError("unavailable");
    if ("erro" in data && (data.erro === true || data.erro === "true")) throw new CepLookupError("not-found");
    if (!("localidade" in data) || typeof data.localidade !== "string" || !data.localidade ||
        !("uf" in data) || typeof data.uf !== "string" || !/^[A-Z]{2}$/.test(data.uf)) {
      throw new CepLookupError("unavailable");
    }
    return {
      logradouro: "logradouro" in data && typeof data.logradouro === "string" ? data.logradouro : "",
      bairro: "bairro" in data && typeof data.bairro === "string" ? data.bairro : "",
      cidade: data.localidade,
      uf: data.uf,
    };
  } catch (error) {
    if (signal?.aborted || error instanceof CepLookupError) throw error;
    throw new CepLookupError("unavailable");
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abort);
  }
}

export function formatEventAddress(address: { logradouro: string; numero: string; complemento: string; bairro: string; cep: string }): string {
  const street = [address.logradouro.trim(), address.numero.trim()].filter(Boolean).join(", ");
  const withComplement = [street, address.complemento.trim()].filter(Boolean).join(", ");
  const withDistrict = address.bairro.trim() ? `${withComplement} - ${address.bairro.trim()}` : withComplement;
  return address.cep ? `${withDistrict}, CEP ${formatCep(address.cep)}` : withDistrict;
}
