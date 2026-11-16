import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { destinoDaNotificacao } from "../mobile/lib/notificacaoLink.ts";

const raizDoApp = new URL("../mobile/app", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const raizDoMobile = new URL("../mobile", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

function arquivos(pasta) {
  return readdirSync(pasta).flatMap((nome) => {
    const caminho = join(pasta, nome);
    return statSync(caminho).isDirectory() ? (nome === "node_modules" ? [] : arquivos(caminho)) : [caminho];
  });
}

const semGrupos = (caminho) => caminho.replace(/\/\([^/]+\)/g, "").replace(/^\([^/]+\)\/?/, "") || "/";

const rotas = arquivos(raizDoApp)
  .filter((arquivo) => arquivo.endsWith(".tsx") && !arquivo.endsWith("_layout.tsx"))
  .map((arquivo) => {
    const caminho = `/${relative(raizDoApp, arquivo).split(sep).join("/").replace(/\.tsx$/, "")}`;
    const publico = semGrupos(caminho).replace(/\/index$/, "") || "/";
    return { arquivo: caminho, padrao: new RegExp(`^${publico.replace(/\[[^\]]+\]/g, "[^/]+")}$`) };
  });

const existeRota = (destino) => rotas.some((rota) => rota.padrao.test(semGrupos(destino.split("?")[0]).replace(/\/$/, "") || "/"));

const fontes = [...arquivos(join(raizDoMobile, "app")), ...arquivos(join(raizDoMobile, "components")), ...arquivos(join(raizDoMobile, "lib"))].filter((arquivo) => /\.tsx?$/.test(arquivo) && !arquivo.endsWith(".test.ts"));

function destinosNavegados() {
  return fontes.flatMap((arquivo) => {
    const texto = readFileSync(arquivo, "utf8");
    return texto.split(/\r?\n/).flatMap((linha) => {
      if (!/router\.(push|replace)|href=|pathname:/.test(linha)) return [];
      return [...linha.matchAll(/["`](\/[^"`\s]*)["`]/g)].map(([, destino]) => ({ arquivo: relative(raizDoMobile, arquivo), destino: destino.replace(/\$\{[^}]+\}/g, "ID") }));
    });
  });
}

describe("rotas do aplicativo", () => {
  it("o inventário encontra as telas principais", () => {
    for (const destino of ["/", "/event/ID", "/event/ID/checkout", "/event/ID/hiring", "/event/ID/candidate/ID", "/conversa/ID", "/account/edit", "/terms", "/login", "/completar"]) {
      expect(existeRota(destino), destino).toBe(true);
    }
  });

  it("todo destino usado em router.push, router.replace, Link e Redirect corresponde a uma rota existente", () => {
    const destinos = destinosNavegados();
    expect(destinos.length).toBeGreaterThan(40);
    const quebrados = destinos.filter(({ destino }) => !existeRota(destino));
    expect(quebrados).toEqual([]);
  });

  it("o checkout sempre recebe o candidato que está sendo pago", () => {
    const chamadas = fontes.flatMap((arquivo) => readFileSync(arquivo, "utf8").split(/\r?\n/).filter((linha) => /router\.(push|replace)\(.*\/checkout/.test(linha)));
    expect(chamadas.length).toBeGreaterThan(0);
    for (const chamada of chamadas) expect(chamada).toMatch(/params:\s*\{\s*candidateId:/);
  });

  it("os links gerados pelas notificações do backend são aceitos pelo app e levam a rotas existentes", () => {
    const backend = readFileSync(join(raizDoMobile, "..", "backend", "src", "services", "notifications.ts"), "utf8");
    const id = "3f2c1a9e-5b7d-4c8a-9e1f-0a2b3c4d5e6f";
    const modelos = [...backend.matchAll(/["`](\/(?:event|conversa|pro|casa)[^"`]*)["`]/g)].map(([, modelo]) => modelo.replace(/\$\{[^}]+\}/g, id));
    expect(modelos.length).toBeGreaterThan(3);
    for (const link of new Set(modelos)) {
      expect(destinoDaNotificacao(link), link).toBe(link);
      expect(existeRota(link), link).toBe(true);
    }
  });

  it("a lista de notificações e o push só navegam por destinos validados", () => {
    const lista = readFileSync(join(raizDoApp, "notificacoes.tsx"), "utf8");
    const push = readFileSync(join(raizDoMobile, "lib", "push.ts"), "utf8");
    expect(lista).toContain("destinoDaNotificacao(link)");
    expect(lista).not.toMatch(/router\.push\(link/);
    expect(push).toContain("destinoDaNotificacao(");
    expect(push).toContain("getLastNotificationResponseAsync");
  });
});
