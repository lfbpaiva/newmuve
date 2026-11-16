import { describe, expect, it } from "vitest";
import { depoisDoEnvio, FORMULARIO_FECHADO } from "./formularioContestacao.ts";

describe("formulário da contestação", () => {
  const preenchido = { aberto: true, motivo: "O músico chegou com duas horas de atraso." };

  it("começa fechado e vazio", () => {
    expect(FORMULARIO_FECHADO).toEqual({ aberto: false, motivo: "" });
  });

  it("depois de um envio bem-sucedido, limpa o motivo e fecha o formulário", () => {
    expect(depoisDoEnvio(preenchido, true)).toEqual({ aberto: false, motivo: "" });
  });

  it("depois de uma falha, preserva o motivo e o formulário aberto para corrigir ou tentar de novo", () => {
    expect(depoisDoEnvio(preenchido, false)).toBe(preenchido);
  });
});
