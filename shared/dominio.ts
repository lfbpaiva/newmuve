export const ESTILOS_MUSICAIS = [
  "MPB", "Bossa nova", "Samba", "Pagode", "Sertanejo", "Forró", "Axé", "Funk", "Rap / Hip-hop", "Gospel",
  "Pop", "Rock", "Indie", "Metal", "Reggae", "Eletrônico / DJ", "Jazz", "Blues", "Soul / R&B", "Clássico / Erudito",
  "Instrumental", "Country", "Infantil", "Cover / Baile", "Outros",
] as const;
export type EstiloMusical = (typeof ESTILOS_MUSICAIS)[number];

export const QUALQUER_ESTILO = "Qualquer estilo";
export const ESTILOS_EVENTO = [QUALQUER_ESTILO, ...ESTILOS_MUSICAIS] as const;

export const TIPOS_EVENTO = ["Bar e restaurante", "Festa particular", "Corporativo"] as const;
export type TipoEvento = (typeof TIPOS_EVENTO)[number];

export const UFS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA",
  "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
] as const;

export const FORMACOES = ["Indiferente", "Solo", "Dupla", "Trio", "Banda"] as const;
export type Formacao = (typeof FORMACOES)[number];

export const RAIOS_FEED_KM = [0, 50, 100, 200] as const;
export const RAIO_MAXIMO_KM = 200;

export const TIPOS_CHAVE_PIX = ["CPF", "CNPJ", "EMAIL", "PHONE", "EVP"] as const;
export type TipoChavePix = (typeof TIPOS_CHAVE_PIX)[number];
export const ROTULOS_CHAVE_PIX: Record<TipoChavePix, string> = {
  CPF: "CPF",
  CNPJ: "CNPJ",
  EMAIL: "E-mail",
  PHONE: "Celular",
  EVP: "Chave aleatória",
};

export const CACHE_MINIMO = 100;
export const SENHA_TAMANHO_MINIMO = 6;
export const IMAGEM_TAMANHO_MAXIMO = 5 * 1024 * 1024;
export const IMAGEM_TIPOS_ACEITOS = ["image/jpeg", "image/png", "image/webp"] as const;

export const COMISSAO_PERCENTUAL = 10;
export const EMAIL_SUPORTE = "muveapp.contato@gmail.com";

const FUSOS_FORA_DE_BRASILIA: Record<string, { fuso: string; offset: string }> = {
  AC: { fuso: "America/Rio_Branco", offset: "-05:00" },
  AM: { fuso: "America/Manaus", offset: "-04:00" },
  MS: { fuso: "America/Campo_Grande", offset: "-04:00" },
  MT: { fuso: "America/Cuiaba", offset: "-04:00" },
  RO: { fuso: "America/Porto_Velho", offset: "-04:00" },
  RR: { fuso: "America/Boa_Vista", offset: "-04:00" },
};

export const fusoDaUf = (uf: string) => FUSOS_FORA_DE_BRASILIA[uf]?.fuso ?? "America/Sao_Paulo";

export const horarioLocalDoEvento = (data: string, horario: string, uf: string) =>
  new Date(`${data}T${horario}:00${FUSOS_FORA_DE_BRASILIA[uf]?.offset ?? "-03:00"}`);
export const TERMOS_VERSAO = "2026-10-27";
export const CANCELAMENTO_ANTECEDENCIA_MINIMA_MS = 24 * 60 * 60 * 1000;
export const COBRANCA_VALIDADE_MS = 15 * 60 * 1000;
export const CONCLUSAO_AUTOMATICA_MS = 7 * 24 * 60 * 60 * 1000;

export const onlyDigits = (value: string) => value.replace(/\D/g, "");

export const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim()) && email.trim().length <= 254;

export const isValidCache = (value: number) => value >= CACHE_MINIMO;

export const isValidUrl = (value: string) => /^https?:\/\/\S+\.\S+$/.test(value.trim()) && value.trim().length <= 300;

export const isValidTelefone = (value: string) => [10, 11].includes(onlyDigits(value).length);

function checkDigit(digits: number[], weights: number[]): number {
  const rest = digits.reduce((sum, digit, i) => sum + digit * weights[i], 0) % 11;
  return rest < 2 ? 0 : 11 - rest;
}

export function isValidCPF(value: string): boolean {
  const cpf = onlyDigits(value);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const d = [...cpf].map(Number);
  return (
    checkDigit(d.slice(0, 9), [10, 9, 8, 7, 6, 5, 4, 3, 2]) === d[9] &&
    checkDigit(d.slice(0, 10), [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]) === d[10]
  );
}

export function isValidCNPJ(value: string): boolean {
  const cnpj = onlyDigits(value);
  if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return false;
  const d = [...cnpj].map(Number);
  return (
    checkDigit(d.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]) === d[12] &&
    checkDigit(d.slice(0, 13), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]) === d[13]
  );
}

export const isValidDocumento = (value: string) => isValidCPF(value) || isValidCNPJ(value);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidChavePix(tipo: string, chave: string): boolean {
  switch (tipo) {
    case "CPF":
      return isValidCPF(chave);
    case "CNPJ":
      return isValidCNPJ(chave);
    case "EMAIL":
      return isValidEmail(chave);
    case "PHONE":
      return onlyDigits(chave).length === 11;
    case "EVP":
      return UUID.test(chave.trim());
    default:
      return false;
  }
}

export function normalizeChavePix(tipo: string, chave: string): string {
  if (tipo === "CPF" || tipo === "CNPJ" || tipo === "PHONE") return onlyDigits(chave);
  return chave.trim().toLowerCase();
}

export function imageProblem(file: { type: string; size: number }): string | null {
  if (!(IMAGEM_TIPOS_ACEITOS as readonly string[]).includes(file.type)) {
    return "Formato inválido. Use PNG, JPEG ou WebP.";
  }
  if (file.size > IMAGEM_TAMANHO_MAXIMO) return "A imagem deve ter no máximo 5 MB.";
  return null;
}

export const normalizeCidade = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();

export function eventMatchesMusician(
  event: { uf: string; cidade: string; estilosMusicais: readonly string[] },
  musician: { uf: string; cidade: string; estilosMusicais: readonly string[] },
  distanciaKm: number | null = null,
): boolean {
  if (!estilosCompativeis(event.estilosMusicais, musician.estilosMusicais)) return false;
  const mesmaCidade = event.uf === musician.uf && normalizeCidade(event.cidade) === normalizeCidade(musician.cidade);
  return mesmaCidade || (distanciaKm !== null && distanciaKm <= RAIO_MAXIMO_KM);
}

export const estilosCompativeis = (doEvento: readonly string[], doMusico: readonly string[]) =>
  doEvento.includes(QUALQUER_ESTILO) || doEvento.some((estilo) => doMusico.includes(estilo));

export const hasCancellationNotice = (inicio: Date, now: Date) =>
  inicio.getTime() - now.getTime() > CANCELAMENTO_ANTECEDENCIA_MINIMA_MS;

export function calcularCobranca(cache: number): { cache: number; comissao: number; total: number } {
  const centavos = Math.round(cache * 100);
  const comissao = Math.round((centavos * COMISSAO_PERCENTUAL) / 100);
  return { cache: centavos / 100, comissao: comissao / 100, total: (centavos + comissao) / 100 };
}

export type AcaoPerfil = "feed" | "candidatar" | "criarEvento" | "pagar";
export type CampoPerfil = "foto" | "documento" | "telefone" | "cidade" | "estilos" | "chavePix";

export const ROTULOS_CAMPOS: Record<CampoPerfil, string> = {
  foto: "foto de perfil",
  documento: "CPF ou CNPJ",
  telefone: "telefone",
  cidade: "estado e cidade",
  estilos: "estilos musicais",
  chavePix: "chave Pix",
};

export interface PerfilParaChecagem {
  role: "MUSICIAN" | "CONTRACTOR";
  fotoPerfilUrl?: string | null;
  documento?: string | null;
  telefone?: string | null;
  uf?: string | null;
  cidade?: string | null;
  estilosMusicais?: readonly string[] | null;
  chavePix?: string | null;
}

export function camposFaltantes(perfil: PerfilParaChecagem, acao: AcaoPerfil): CampoPerfil[] {
  const exigidos: CampoPerfil[] =
    acao === "feed" ? ["cidade", "estilos"]
    : acao === "candidatar" ? ["cidade", "estilos", "foto", "documento", "telefone", "chavePix"]
    : ["foto", "documento", "telefone", "cidade"];
  const vazio = {
    foto: !perfil.fotoPerfilUrl,
    documento: !perfil.documento,
    telefone: !perfil.telefone,
    cidade: !perfil.uf || !perfil.cidade,
    estilos: !perfil.estilosMusicais || perfil.estilosMusicais.length === 0,
    chavePix: !perfil.chavePix,
  };
  return exigidos.filter((campo) => vazio[campo]);
}

export const descreverFaltantes = (campos: CampoPerfil[]) => campos.map((c) => ROTULOS_CAMPOS[c]).join(", ");
