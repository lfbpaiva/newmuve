import { AppError } from "../domain/errors.ts";

const descrever = (error: unknown) => (error instanceof AppError ? error.code : error instanceof Error ? error.message : "falha inesperada");

export const seguirApesarDe = <T>(contexto: string, padrao: T) => (error: unknown): T => {
  console.error(`${contexto}:`, descrever(error));
  return padrao;
};
