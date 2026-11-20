import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const BASH_DO_GIT = ["C:/Program Files/Git/bin/bash.exe", "C:/Program Files (x86)/Git/bin/bash.exe"];
const bash = process.platform === "win32" ? BASH_DO_GIT.find((caminho) => existsSync(caminho)) ?? null : "bash";

const workflow = readFileSync(new URL("../.github/workflows/rotina-financeira.yml", import.meta.url), "utf8");
const condicao = workflow.match(/^ {4}if: (.+)$/m)?.[1].trim();
const linhas = workflow.split(/\r?\n/);
const inicioDoScript = linhas.findIndex((linha) => /^ {8}run: \|$/.test(linha));
const fimDoScript = linhas.findIndex((linha, indice) => indice > inicioDoScript && linha !== "" && !linha.startsWith("          "));
const script = linhas
  .slice(inicioDoScript + 1, fimDoScript === -1 ? undefined : fimDoScript)
  .map((linha) => linha.slice(10))
  .join("\n")
  .replace("https://*) ;;", "http://127.0.0.1*) ;;");

function avaliar(expressao, contexto) {
  const valor = (termo) => {
    const literal = termo.match(/^'(.*)'$/);
    if (literal) return literal[1];
    if (termo === "github.event_name") return contexto.evento;
    const variavel = termo.match(/^vars\.([A-Z_]+)$/);
    if (variavel) return contexto.variaveis[variavel[1]] ?? "";
    throw new Error(`Termo não suportado na condição do workflow: ${termo}`);
  };
  return expressao.split("||").some((ou) =>
    ou.split("&&").every((e) => {
      const [esquerda, direita] = e.split("==").map((parte) => parte.trim());
      if (direita === undefined) throw new Error(`Comparação não suportada: ${e}`);
      return valor(esquerda).toLowerCase() === valor(direita).toLowerCase();
    }),
  );
}

const pasta = mkdtempSync(join(tmpdir(), "muve-workflow-"));
const arquivoDoScript = join(pasta, "disparo.sh");
writeFileSync(arquivoDoScript, script);
afterAll(() => rmSync(pasta, { recursive: true, force: true }));

async function executarWorkflow({ evento, variaveis }) {
  const chamadas = [];
  const servidor = createServer((req, res) => {
    chamadas.push({ caminho: req.url, metodo: req.method });
    res.statusCode = 202;
    res.end("{}");
  });
  await new Promise((resolve) => servidor.listen(0, "127.0.0.1", resolve));
  try {
    if (!avaliar(condicao, { evento, variaveis })) return { executado: false, chamadas };
    const { port } = servidor.address();
    const codigo = await new Promise((resolve) => {
      const processo = spawn(bash, [arquivoDoScript], {
        env: { ...process.env, MUVE_API_URL: `http://127.0.0.1:${port}/api`, FINANCIAL_ROUTINE_TOKEN: "t".repeat(40) },
        stdio: "ignore",
      });
      processo.on("close", resolve);
    });
    return { executado: true, codigo, chamadas };
  } finally {
    servidor.close();
  }
}

describe("workflow da rotina financeira", () => {
  it("a condição do job lê só a variável de ativação", () => {
    expect(condicao).toBe("vars.ROTINA_FINANCEIRA_ATIVA == 'true'");
    expect(script).toContain("/admin/rotina-financeira");
  });

  for (const evento of ["schedule", "workflow_dispatch"]) {
    for (const ativa of [undefined, "false", "", "1", "sim"]) {
      it(`${evento} com ROTINA_FINANCEIRA_ATIVA=${ativa ?? "(ausente)"} é ignorado sem chamar a API`, async () => {
        const resultado = await executarWorkflow({ evento, variaveis: ativa === undefined ? {} : { ROTINA_FINANCEIRA_ATIVA: ativa } });

        expect(resultado.executado).toBe(false);
        expect(resultado.chamadas).toEqual([]);
      });
    }

    it.skipIf(!bash)(`${evento} com ROTINA_FINANCEIRA_ATIVA=true chama a rota uma vez`, async () => {
      const resultado = await executarWorkflow({ evento, variaveis: { ROTINA_FINANCEIRA_ATIVA: "true" } });

      expect(resultado.executado).toBe(true);
      expect(resultado.codigo).toBe(0);
      expect(resultado.chamadas).toEqual([{ caminho: "/api/admin/rotina-financeira", metodo: "POST" }]);
    });
  }
});
