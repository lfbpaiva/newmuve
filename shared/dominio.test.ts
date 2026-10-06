import { describe, expect, it } from "vitest";
import {
  calcularCobranca,
  estilosCompativeis,
  hasCancellationNotice,
  imageProblem,
  isValidChavePix,
  isValidCNPJ,
  isValidCPF,
  isValidDocumento,
  isValidTelefone,
  normalizeChavePix,
} from "./dominio.ts";

describe("isValidCPF", () => {
  it("aceita CPF com dígitos verificadores corretos, com ou sem máscara", () => {
    expect(isValidCPF("529.982.247-25")).toBe(true);
    expect(isValidCPF("11144477735")).toBe(true);
  });

  it("rejeita dígito verificador errado, sequências repetidas e tamanho incorreto", () => {
    expect(isValidCPF("529.982.247-26")).toBe(false);
    expect(isValidCPF("111.111.111-11")).toBe(false);
    expect(isValidCPF("5299822472")).toBe(false);
    expect(isValidCPF("")).toBe(false);
  });
});

describe("isValidCNPJ", () => {
  it("aceita CNPJ com dígitos verificadores corretos", () => {
    expect(isValidCNPJ("11.222.333/0001-81")).toBe(true);
  });

  it("rejeita dígito verificador errado, sequências repetidas e tamanho incorreto", () => {
    expect(isValidCNPJ("11.222.333/0001-80")).toBe(false);
    expect(isValidCNPJ("00000000000000")).toBe(false);
    expect(isValidCNPJ("1122233300018")).toBe(false);
  });
});

describe("isValidTelefone", () => {
  it("aceita 10 ou 11 dígitos", () => {
    expect(isValidTelefone("(45) 3222-1100")).toBe(true);
    expect(isValidTelefone("(45) 99988-7766")).toBe(true);
    expect(isValidTelefone("4599988")).toBe(false);
  });
});

describe("imageProblem", () => {
  it("aceita PNG, JPEG e WebP de até 5 MB", () => {
    expect(imageProblem({ type: "image/webp", size: 5 * 1024 * 1024 })).toBeNull();
  });

  it("aponta formato ou tamanho inválido", () => {
    expect(imageProblem({ type: "image/gif", size: 10 })).toMatch(/Formato inválido/);
    expect(imageProblem({ type: "image/png", size: 5 * 1024 * 1024 + 1 })).toMatch(/5 MB/);
  });
});

describe("isValidDocumento", () => {
  it("aceita CPF ou CNPJ válidos", () => {
    expect(isValidDocumento("529.982.247-25")).toBe(true);
    expect(isValidDocumento("11.222.333/0001-81")).toBe(true);
    expect(isValidDocumento("123")).toBe(false);
  });
});

describe("chave Pix", () => {
  it("valida conforme o tipo", () => {
    expect(isValidChavePix("CPF", "529.982.247-25")).toBe(true);
    expect(isValidChavePix("CNPJ", "11.222.333/0001-81")).toBe(true);
    expect(isValidChavePix("EMAIL", "ana@exemplo.com")).toBe(true);
    expect(isValidChavePix("PHONE", "(45) 99988-7766")).toBe(true);
    expect(isValidChavePix("EVP", "123e4567-e89b-12d3-a456-426614174000")).toBe(true);
  });

  it("rejeita chave que não corresponde ao tipo", () => {
    expect(isValidChavePix("CPF", "ana@exemplo.com")).toBe(false);
    expect(isValidChavePix("PHONE", "4532221100")).toBe(false);
    expect(isValidChavePix("EVP", "chave-qualquer")).toBe(false);
    expect(isValidChavePix("OUTRO", "x")).toBe(false);
  });

  it("normaliza para o formato enviado à Asaas", () => {
    expect(normalizeChavePix("PHONE", "(45) 99988-7766")).toBe("45999887766");
    expect(normalizeChavePix("EMAIL", " Ana@Exemplo.com ")).toBe("ana@exemplo.com");
  });
});

describe("calcularCobranca", () => {
  it("soma 10% de comissão ao cachê", () => {
    expect(calcularCobranca(500)).toEqual({ cache: 500, comissao: 50, total: 550 });
  });

  it("arredonda a comissão para centavos, sem erro de ponto flutuante", () => {
    expect(calcularCobranca(450.55)).toEqual({ cache: 450.55, comissao: 45.06, total: 495.61 });
    expect(calcularCobranca(100.1)).toEqual({ cache: 100.1, comissao: 10.01, total: 110.11 });
  });
});

describe("hasCancellationNotice", () => {
  const inicio = new Date("2030-01-10T20:00:00Z");

  it("exige mais de 24 horas de antecedência", () => {
    expect(hasCancellationNotice(inicio, new Date("2030-01-09T19:59:00Z"))).toBe(true);
    expect(hasCancellationNotice(inicio, new Date("2030-01-09T20:00:00Z"))).toBe(false);
    expect(hasCancellationNotice(inicio, new Date("2030-01-10T19:00:00Z"))).toBe(false);
  });
});

describe("estilosCompativeis", () => {
  it("casa por interseção ou quando o evento aceita qualquer estilo", () => {
    expect(estilosCompativeis(["Forró", "Sertanejo"], ["Sertanejo", "Pop"])).toBe(true);
    expect(estilosCompativeis(["Forró"], ["Sertanejo", "Pop"])).toBe(false);
    expect(estilosCompativeis(["Qualquer estilo"], ["Outros"])).toBe(true);
    expect(estilosCompativeis(["Rock"], [])).toBe(false);
  });
});
