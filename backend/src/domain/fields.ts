import { z } from "zod";
import { isValidTelefone, onlyDigits, UFS } from "../../../shared/dominio.ts";

// Campos reutilizados pelos esquemas de validação da API.

export const texto = (obrigatorio: string) => z.string({ error: obrigatorio }).trim();

export const uf = z.enum(UFS, { error: "Selecione o estado e a cidade." });

export const cidade = texto("Selecione o estado e a cidade.").min(1, "Selecione o estado e a cidade.").max(120);

export const telefone = texto("Informe um telefone completo.")
  .refine(isValidTelefone, "Informe um telefone completo.")
  .transform(onlyDigits);
