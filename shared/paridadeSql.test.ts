import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ESPERA_CONFIRMACAO_MS, ESPERA_VERIFICACAO_MS } from "../backend/src/services/paymentService.ts";
import {
  CANCELAMENTO_ANTECEDENCIA_MINIMA_MS,
  MULTA_AUSENCIA_PERCENTUAL,
  PRO_ANTECEDENCIA_MINIMA_DIAS,
  PRO_ANTECIPACAO_HORAS,
  PRO_RAIO_MAXIMO_KM,
  RAIO_MAXIMO_KM,
  VISIBILIDADE_REDUZIDA_DIAS,
} from "./dominio.ts";

const pasta = new URL("../supabase/migrations/", import.meta.url);
const migrations = readdirSync(pasta).filter((nome) => nome.endsWith(".sql")).sort();
const HORA_MS = 60 * 60 * 1000;

function versaoAtual(funcao: string): string {
  const inicio = new RegExp(`create (or replace )?function public\\.${funcao}\\(`, "i");
  for (const nome of [...migrations].reverse()) {
    const sql = readFileSync(new URL(nome, pasta), "utf8").replace(/\r\n/g, "\n");
    const posicao = sql.search(inicio);
    if (posicao === -1) continue;
    const corpo = sql.slice(posicao);
    const abertura = corpo.indexOf("$$");
    const fechamento = corpo.indexOf("$$", abertura + 2);
    return corpo.slice(0, fechamento);
  }
  throw new Error(`Função ${funcao} não encontrada nas migrations.`);
}

describe("regras que existem no banco e no TypeScript continuam iguais", () => {
  it("multa e penalidade do estorno usam os valores de dominio.ts", () => {
    const sql = versaoAtual("finalize_asaas_refund");

    expect(sql).toContain(`valor_cache * ${MULTA_AUSENCIA_PERCENTUAL}) / 100`);
    expect(sql).toContain(`interval '${VISIBILIDADE_REDUZIDA_DIAS} days'`);
    expect(sql).toContain(`interval '${CANCELAMENTO_ANTECEDENCIA_MINIMA_MS / HORA_MS} hours'`);
  });

  it("feed usa o mesmo raio e o mesmo acesso antecipado do Muve Pro", () => {
    const sql = versaoAtual("musician_feed");

    expect(sql).toContain(`then ${PRO_RAIO_MAXIMO_KM} else ${RAIO_MAXIMO_KM} end`);
    expect(sql).toContain(`e.created_at <= now() - interval '${PRO_ANTECIPACAO_HORAS} hours'`);
    expect(sql).toContain(`e.inicio - now() < interval '${PRO_ANTECEDENCIA_MINIMA_DIAS} days'`);
  });

  it("prazos da liberação manual de repasse são os mesmos na API e no banco", () => {
    expect(versaoAtual("iniciar_verificacao_ausencia")).toContain(`interval '${ESPERA_VERIFICACAO_MS / HORA_MS} hours'`);
    expect(versaoAtual("confirmar_ausencia")).toContain(`interval '${ESPERA_CONFIRMACAO_MS / HORA_MS} hour'`);
  });
});
