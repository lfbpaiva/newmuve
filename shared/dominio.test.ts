import { describe, expect, it } from "vitest";
import {
  conteudoDeImagemConfere,
  emAcessoAntecipado,
  liberadoParaTodosEm,
  calcularCobranca,
  comissaoPercentual,
  estimarCobrancaDoContratante,
  estilosCompativeis,
  hasCancellationNotice,
  imageProblem,
  isValidChavePix,
  isValidCNPJ,
  isValidCPF,
  isValidDocumento,
  isValidTelefone,
  normalizeChavePix,
  valorDaInscricao,
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

describe("valorDaInscricao", () => {
  it("guarda nulo quando o valor é igual ao cachê oferecido", () => {
    expect(valorDaInscricao(500, 500)).toBeNull();
    expect(valorDaInscricao(null, 500)).toBeNull();
  });

  it("guarda a proposta quando o valor é diferente do cachê", () => {
    expect(valorDaInscricao(650, 500)).toBe(650);
    expect(valorDaInscricao(400, 500)).toBe(400);
  });
});

describe("estimarCobrancaDoContratante", () => {
  const agora = new Date("2026-11-16T20:00:00Z");

  it("sem Muve Casa usa a taxa de 10% sobre o valor pedido", () => {
    expect(estimarCobrancaDoContratante(650, null, agora)).toEqual({ cache: 650, comissao: 65, total: 715, percentual: 10, casaAte: null });
  });

  it("com Muve Casa ativo usa 6% e informa até quando vale", () => {
    const estimativa = estimarCobrancaDoContratante(650, "2026-12-12T18:52:49Z", agora);

    expect(estimativa).toMatchObject({ cache: 650, comissao: 39, total: 689, percentual: 6 });
    expect(estimativa?.casaAte?.toISOString()).toBe("2026-12-12T18:52:49.000Z");
  });

  it("Muve Casa vencido volta para 10% e não informa validade", () => {
    expect(estimarCobrancaDoContratante(650, "2026-11-01T00:00:00Z", agora)).toMatchObject({ total: 715, percentual: 10, casaAte: null });
  });

  it("é o mesmo cálculo usado na cobrança", () => {
    for (const [valor, casaAte] of [[500, null], [733.33, "2026-12-12T00:00:00Z"], [100, null]] as const) {
      expect(estimarCobrancaDoContratante(valor, casaAte, agora)?.total).toBe(calcularCobranca(valor, comissaoPercentual(casaAte, agora)).total);
    }
  });

  it.each([null, undefined, 0, -10, Number.NaN, Number.POSITIVE_INFINITY])("valor ausente ou inválido (%s) não gera estimativa", (valor) => {
    expect(estimarCobrancaDoContratante(valor, null, agora)).toBeNull();
  });
});

describe("conteúdo real da imagem enviada", () => {
  const arquivo = (bytes: number[], type: string) => new Blob([new Uint8Array(bytes)], { type });

  it("aceita PNG, JPEG e WebP de verdade", async () => {
    expect(await conteudoDeImagemConfere(arquivo([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a], "image/png"))).toBe(true);
    expect(await conteudoDeImagemConfere(arquivo([0xff, 0xd8, 0xff, 0xe0], "image/jpeg"))).toBe(true);
    expect(await conteudoDeImagemConfere(arquivo([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50], "image/webp"))).toBe(true);
  });

  it("recusa outro arquivo declarado como imagem", async () => {
    expect(await conteudoDeImagemConfere(arquivo([0x25, 0x50, 0x44, 0x46], "image/png"))).toBe(false);
    expect(await conteudoDeImagemConfere(arquivo([0x3c, 0x68, 0x74, 0x6d, 0x6c], "image/jpeg"))).toBe(false);
    expect(await conteudoDeImagemConfere(arquivo([0x89, 0x50, 0x4e, 0x47], "image/gif"))).toBe(false);
  });
});

describe("acesso antecipado do Muve Pro na inscrição", () => {
  const AGORA = new Date("2030-06-10T12:00:00Z");
  const MINUTO = 60 * 1000;
  const DIA = 24 * 60 * MINUTO;
  const evento = (publicadoHaMs: number, faltamMs: number) => ({ criadoEm: new Date(AGORA.getTime() - publicadoHaMs), inicio: new Date(AGORA.getTime() + faltamMs) });

  it("com 7 dias ou mais pela frente, a inscrição fica só para o Pro nas primeiras 24 horas", () => {
    expect(emAcessoAntecipado(evento(MINUTO, 15 * DIA), AGORA)).toBe(true);
    expect(emAcessoAntecipado(evento(MINUTO, 7 * DIA), AGORA)).toBe(true);
    expect(emAcessoAntecipado(evento(MINUTO, 7 * DIA + MINUTO), AGORA)).toBe(true);
  });

  it("com menos de 7 dias pela frente, a inscrição é livre para todos", () => {
    expect(emAcessoAntecipado(evento(MINUTO, 7 * DIA - MINUTO), AGORA)).toBe(false);
    expect(emAcessoAntecipado(evento(MINUTO, 5 * DIA), AGORA)).toBe(false);
  });

  it("depois de 24 horas da publicação, a inscrição é livre para todos", () => {
    expect(emAcessoAntecipado(evento(24 * 60 * MINUTO, 15 * DIA), AGORA)).toBe(false);
    expect(emAcessoAntecipado(evento(24 * 60 * MINUTO - MINUTO, 15 * DIA), AGORA)).toBe(true);
  });

  it("a urgência é calculada na tentativa: o evento que cruza os 7 dias dentro das 24 horas é liberado", () => {
    const publicado = { criadoEm: AGORA, inicio: new Date(AGORA.getTime() + 7 * DIA + 2 * 60 * MINUTO) };
    expect(emAcessoAntecipado(publicado, new Date(AGORA.getTime() + 60 * MINUTO))).toBe(true);
    expect(emAcessoAntecipado(publicado, new Date(AGORA.getTime() + 2 * 60 * MINUTO))).toBe(true);
    expect(emAcessoAntecipado(publicado, new Date(AGORA.getTime() + 2 * 60 * MINUTO + 1))).toBe(false);
  });

  it("a liberação é o que vier primeiro: fim das 24 horas ou a entrada nos últimos 7 dias", () => {
    const longe = evento(0, 30 * DIA);
    expect(liberadoParaTodosEm(longe).getTime()).toBe(AGORA.getTime() + DIA);
    const perto = evento(0, 7 * DIA + 2 * 60 * MINUTO);
    const liberacao = liberadoParaTodosEm(perto);
    expect(liberacao.getTime()).toBe(AGORA.getTime() + 2 * 60 * MINUTO + 1);
    expect(emAcessoAntecipado(perto, liberacao)).toBe(false);
    expect(emAcessoAntecipado(perto, new Date(liberacao.getTime() - 1))).toBe(true);
  });
});
