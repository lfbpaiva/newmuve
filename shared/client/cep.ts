export interface CepAddress {
  logradouro: string;
  bairro: string;
  cidade: string;
  uf: string;
}

const CEP_TIMEOUT_MS = 8_000;

export const cepDigits = (value: string) => value.replace(/\D/g, "").slice(0, 8);

export function formatCep(value: string): string {
  const digits = cepDigits(value);
  return digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;
}

export class CepError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CepError";
  }
}

const indisponivel = () => new CepError("Não foi possível consultar o CEP agora. Preencha o endereço manualmente.");

export async function lookupCep(value: string): Promise<CepAddress> {
  const digits = cepDigits(value);
  if (digits.length !== 8) throw new CepError("Informe um CEP com 8 números.");

  let data: { erro?: boolean | string; logradouro?: string; bairro?: string; localidade?: string; uf?: string };
  try {
    const response = await fetch(`https://viacep.com.br/ws/${digits}/json/`, { signal: AbortSignal.timeout(CEP_TIMEOUT_MS) });
    if (!response.ok) throw indisponivel();
    data = await response.json();
  } catch {
    throw indisponivel();
  }
  if (data.erro === true || data.erro === "true") throw new CepError("CEP não encontrado. Confira o número ou preencha o endereço manualmente.");
  if (!data.localidade || !data.uf || !/^[A-Z]{2}$/.test(data.uf)) throw indisponivel();
  return { logradouro: data.logradouro ?? "", bairro: data.bairro ?? "", cidade: data.localidade, uf: data.uf };
}
