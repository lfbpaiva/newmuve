import { describe, expect, it } from "vitest";
import {
  isValidCache,
  isValidEmail,
  maskCNPJ,
  maskCPF,
  maskPhone,
  sanitizeEmail,
} from "./validators.ts";

describe("maskCPF", () => {
  it("formata 11 dígitos", () => {
    expect(maskCPF("12345678901")).toBe("123.456.789-01");
  });

  it("formata parcialmente enquanto o usuário digita", () => {
    expect(maskCPF("1234")).toBe("123.4");
  });

  it("descarta caracteres não numéricos e o excedente", () => {
    expect(maskCPF("123.456.789-01999abc")).toBe("123.456.789-01");
  });
});

describe("maskCNPJ", () => {
  it("formata 14 dígitos", () => {
    expect(maskCNPJ("12345678000195")).toBe("12.345.678/0001-95");
  });

  it("descarta o excedente", () => {
    expect(maskCNPJ("1234567800019599")).toBe("12.345.678/0001-95");
  });
});

describe("maskPhone", () => {
  it("formata celular com 11 dígitos", () => {
    expect(maskPhone("45999887766")).toBe("(45) 99988-7766");
  });

  it("formata fixo com 10 dígitos", () => {
    expect(maskPhone("4532221100")).toBe("(45) 3222-1100");
  });

  it("limita a 11 dígitos", () => {
    expect(maskPhone("459998877665544")).toBe("(45) 99988-7766");
  });
});

describe("sanitizeEmail", () => {
  it("remove espaços, acentos e cedilha e converte para minúsculas", () => {
    expect(sanitizeEmail(" João.Açaí @Gmail.com ")).toBe("joao.acai@gmail.com");
  });
});

describe("isValidEmail", () => {
  it("aceita e-mails de qualquer provedor", () => {
    expect(isValidEmail("musico.teste@gmail.com")).toBe(true);
    expect(isValidEmail("contato@bardoze.com.br")).toBe(true);
  });

  it("rejeita formatos inválidos", () => {
    expect(isValidEmail("sem-arroba.com")).toBe(false);
    expect(isValidEmail("nome@dominio")).toBe(false);
    expect(isValidEmail("nome @dominio.com")).toBe(false);
    expect(isValidEmail("")).toBe(false);
  });
});

describe("isValidCache", () => {
  it("exige o mínimo de R$ 100,00", () => {
    expect(isValidCache(100)).toBe(true);
    expect(isValidCache(99.99)).toBe(false);
  });

  it("rejeita valores não numéricos", () => {
    expect(isValidCache(Number("abc"))).toBe(false);
  });
});
