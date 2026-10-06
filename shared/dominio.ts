// Regras de domínio compartilhadas entre o backend e o frontend.
// Módulo puro: sem dependências de Node, do navegador ou de bibliotecas.

// Gêneros que se contratam no Brasil. A lista vive aqui (não no banco) para
// crescer sem migration; "Outros" cobre o que não está nela.
export const ESTILOS_MUSICAIS = [
  "MPB", "Bossa nova", "Samba", "Pagode", "Sertanejo", "Forró", "Axé", "Funk", "Rap / Hip-hop", "Gospel",
  "Pop", "Rock", "Indie", "Metal", "Reggae", "Eletrônico / DJ", "Jazz", "Blues", "Soul / R&B", "Clássico / Erudito",
  "Instrumental", "Country", "Infantil", "Cover / Baile", "Outros",
] as const;
export type EstiloMusical = (typeof ESTILOS_MUSICAIS)[number];

/** Opção do contratante: o evento aparece para músicos de qualquer estilo. */
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

/** Raios disponíveis no feed do músico (km). 0 = apenas a mesma cidade. */
export const RAIOS_FEED_KM = [0, 50, 100, 200] as const;
/** Maior raio aceito em uma candidatura: o mesmo máximo oferecido no feed. */
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

/** Taxa de serviço da plataforma, somada ao cachê e paga pelo contratante. */
export const COMISSAO_PERCENTUAL = 10;
/** Antecedência mínima para cancelar: a inscrição (músico) ou a contratação com reembolso (contratante). */
export const CANCELAMENTO_ANTECEDENCIA_MINIMA_MS = 24 * 60 * 60 * 1000;
export const COBRANCA_VALIDADE_MS = 15 * 60 * 1000;
/** Com apenas uma confirmação, o show é dado como concluído após este prazo. */
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

/** Músicos e contratantes podem se cadastrar com CPF ou CNPJ. */
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

/** Formato em que a chave é guardada e enviada à Asaas (documentos e telefone só com dígitos). */
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

/** Compara cidades ignorando caixa, acentuação e espaços nas pontas. */
export const normalizeCidade = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();

/**
 * O músico só vê e se candidata a eventos de um dos seus estilos, na sua cidade
 * ou dentro do raio máximo (distância em km entre as sedes dos municípios).
 */
export function eventMatchesMusician(
  event: { uf: string; cidade: string; estilosMusicais: readonly string[] },
  musician: { uf: string; cidade: string; estilosMusicais: readonly string[] },
  distanciaKm: number | null = null,
): boolean {
  if (!estilosCompativeis(event.estilosMusicais, musician.estilosMusicais)) return false;
  const mesmaCidade = event.uf === musician.uf && normalizeCidade(event.cidade) === normalizeCidade(musician.cidade);
  return mesmaCidade || (distanciaKm !== null && distanciaKm <= RAIO_MAXIMO_KM);
}

/** O evento aceita qualquer estilo, ou há ao menos um estilo em comum. */
export const estilosCompativeis = (doEvento: readonly string[], doMusico: readonly string[]) =>
  doEvento.includes(QUALQUER_ESTILO) || doEvento.some((estilo) => doMusico.includes(estilo));

/** Verdadeiro enquanto faltam mais de 24 horas para o início do evento. */
export const hasCancellationNotice = (inicio: Date, now: Date) =>
  inicio.getTime() - now.getTime() > CANCELAMENTO_ANTECEDENCIA_MINIMA_MS;

/** Valores da contratação: o contratante paga cachê + comissão; o músico recebe o cachê. */
export function calcularCobranca(cache: number): { cache: number; comissao: number; total: number } {
  const centavos = Math.round(cache * 100);
  const comissao = Math.round((centavos * COMISSAO_PERCENTUAL) / 100);
  return { cache: centavos / 100, comissao: comissao / 100, total: (centavos + comissao) / 100 };
}

// ---------------------------------------------------------------------------
// Cadastro progressivo: cada dado do perfil é exigido só quando faz falta.
// ---------------------------------------------------------------------------

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

/** Campos ainda vazios que a ação exige, na ordem em que devem ser pedidos. */
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
