import { z } from "zod";
import {
  ESTILOS_MUSICAIS,
  isValidChavePix,
  isValidDocumento,
  isValidEmail,
  isValidUrl,
  normalizeChavePix,
  onlyDigits,
  SENHA_TAMANHO_MINIMO,
  TIPOS_CHAVE_PIX,
} from "../../../shared/dominio.ts";
import { cidade, telefone, texto, uf } from "./fields.ts";

export type Role = "MUSICIAN" | "CONTRACTOR";

const email = texto("Informe um e-mail válido.").toLowerCase().refine(isValidEmail, "Informe um e-mail válido.");

const password = z
  .string({ error: "Informe a senha." })
  .min(SENHA_TAMANHO_MINIMO, `A senha deve ter pelo menos ${SENHA_TAMANHO_MINIMO} caracteres.`)
  .max(72, "A senha deve ter no máximo 72 caracteres.");

const nome = texto("Informe seu nome.").min(1, "Informe seu nome.").max(120, "O nome deve ter no máximo 120 caracteres.");

// Cadastro mínimo: o resto do perfil é preenchido depois, quando fizer falta.
export const signupSchema = z.object({
  role: z.enum(["MUSICIAN", "CONTRACTOR"], { error: "Selecione o tipo de conta." }),
  nome,
  email,
  password,
  redirectTo: z.string().trim().max(300).optional(),
});
export type SignupInput = z.infer<typeof signupSchema>;

/** Campo opcional em que string vazia significa "não informado". */
const optionalText = <T>(schema: z.ZodType<T, string>) =>
  z
    .string()
    .trim()
    .optional()
    .transform((value) => value || undefined)
    .pipe(schema.optional());

// CPF ou CNPJ, para os dois perfis.
const documento = optionalText(z.string().refine(isValidDocumento, "Informe um CPF ou CNPJ válido.").transform(onlyDigits));

const profileCommon = {
  nome,
  documento,
  telefone: optionalText(telefone),
  uf: optionalText(uf),
  cidade: optionalText(cidade),
};

const contractorProfile = z.object(profileCommon);

const musicianProfile = z
  .object({
    ...profileCommon,
    bio: optionalText(z.string().max(1000, "A bio deve ter no máximo 1000 caracteres.")),
    estilosMusicais: z
      .array(z.enum(ESTILOS_MUSICAIS, { error: "Estilo musical inválido." }))
      .optional()
      .transform((estilos) => (estilos && estilos.length ? [...new Set(estilos)] : undefined)),
    // Link de vídeo ou áudio (YouTube, Instagram, Spotify...).
    portfolioUrl: optionalText(z.string().refine(isValidUrl, "Informe um link válido, começando com http:// ou https://.")),
    // A chave Pix é o destino do repasse do cachê.
    chavePixTipo: optionalText(z.enum(TIPOS_CHAVE_PIX, { error: "Tipo de chave Pix inválido." })),
    chavePix: optionalText(z.string()),
  })
  .refine((p) => (p.chavePix ? Boolean(p.chavePixTipo) : true), "Selecione o tipo da chave Pix.")
  .refine((p) => (p.chavePix && p.chavePixTipo ? isValidChavePix(p.chavePixTipo, p.chavePix) : true), "Chave Pix inválida para o tipo selecionado.")
  .transform((p) => ({
    ...p,
    chavePix: p.chavePix && p.chavePixTipo ? normalizeChavePix(p.chavePixTipo, p.chavePix) : undefined,
    chavePixTipo: p.chavePix ? p.chavePixTipo : undefined,
  }));

// O e-mail não é editável.
export const updateProfileSchemas = { MUSICIAN: musicianProfile, CONTRACTOR: contractorProfile };
export type ProfileChanges = z.infer<typeof musicianProfile> | z.infer<typeof contractorProfile>;

export const deleteAccountSchema = z.object({
  email: texto("Informe o e-mail da conta.").toLowerCase(),
  password: z.string({ error: "Informe a senha." }),
});
export type DeleteAccountInput = z.infer<typeof deleteAccountSchema>;

// Perfil completo, como devolvido ao próprio dono da conta. Campos nulos ainda não foram preenchidos.
export interface Account {
  id: string;
  role: Role;
  nome: string;
  documento: string | null;
  telefone: string | null;
  uf: string | null;
  cidade: string | null;
  fotoPerfilUrl: string | null;
  avaliacaoMedia: number;
  totalAvaliacoes: number;
  bio?: string | null;
  estilosMusicais?: string[] | null;
  chavePixTipo?: string | null;
  chavePix?: string | null;
  portfolioUrl?: string | null;
}
