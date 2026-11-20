import { spawn } from "node:child_process";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";

const HOSTS_LOOPBACK = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);
const VARIAVEIS_DO_SISTEMA = ["PATH", "Path", "PATHEXT", "SystemRoot", "SYSTEMROOT", "windir", "ComSpec", "TEMP", "TMP", "HOME", "USERPROFILE", "APPDATA", "LOCALAPPDATA"];

export class AmbienteRecusado extends Error {}

const recusar = (motivo) => {
  throw new AmbienteRecusado(`Ambiente E2E recusado: ${motivo}`);
};

export function ehLoopback(endereco) {
  try {
    return HOSTS_LOOPBACK.has(new URL(endereco).hostname);
  } catch {
    return false;
  }
}

export function exigirLoopback(endereco, rotulo) {
  if (!ehLoopback(endereco)) recusar(`${rotulo} não aponta para a própria máquina.`);
}

export function lerProjectId(configToml) {
  const encontrado = /^project_id\s*=\s*"([a-z0-9_-]+)"/m.exec(configToml);
  if (!encontrado) recusar("supabase/config.toml não define project_id.");
  return encontrado[1];
}

export function interpretarStatus(saida) {
  return Object.fromEntries(
    saida
      .split(/\r?\n/)
      .filter((linha) => /^[A-Z0-9_]+=/.test(linha))
      .map((linha) => [linha.slice(0, linha.indexOf("=")), linha.slice(linha.indexOf("=") + 1).replace(/^"|"$/g, "")]),
  );
}

function conferirChaveLocal(chave, papel, segredo) {
  const partes = String(chave ?? "").split(".");
  if (partes.length !== 3) recusar(`a chave ${papel} não é um JWT da instância local.`);
  let conteudo;
  try {
    conteudo = JSON.parse(Buffer.from(partes[1], "base64url").toString("utf8"));
  } catch {
    recusar(`a chave ${papel} não pôde ser lida.`);
  }
  if (conteudo.iss !== "supabase-demo" || conteudo.role !== papel || "ref" in conteudo) recusar(`a chave ${papel} não é a chave de demonstração do Supabase local.`);
  const esperada = createHmac("sha256", String(segredo ?? "")).update(`${partes[0]}.${partes[1]}`).digest();
  const recebida = Buffer.from(partes[2], "base64url");
  if (!segredo || esperada.length !== recebida.length || !timingSafeEqual(esperada, recebida)) recusar(`a chave ${papel} não foi assinada pelo segredo da instância local.`);
}

function portasPublicadas(saida) {
  return new Set(saida.split(/\r?\n/).map((linha) => linha.trim().split(":").at(-1)).filter(Boolean));
}

export function validarAmbienteLocal({ status, projectId, conteineres }) {
  for (const nome of ["API_URL", "DB_URL", "ANON_KEY", "SERVICE_ROLE_KEY", "JWT_SECRET"]) {
    if (!status[nome]) recusar(`o Supabase CLI não informou ${nome}.`);
  }
  exigirLoopback(status.API_URL, "API_URL do Supabase");
  exigirLoopback(status.DB_URL, "DB_URL do Supabase");
  const portaApi = new URL(status.API_URL).port;
  const portaBanco = new URL(status.DB_URL).port;
  for (const [servico, porta] of [["kong", portaApi], ["db", portaBanco]]) {
    const conteiner = conteineres[servico];
    if (!conteiner?.ativo) recusar(`o contêiner supabase_${servico}_${projectId} não está rodando.`);
    if (!conteiner.portas.has(porta)) recusar(`a porta ${porta} não pertence ao contêiner supabase_${servico}_${projectId}.`);
  }
  conferirChaveLocal(status.ANON_KEY, "anon", status.JWT_SECRET);
  conferirChaveLocal(status.SERVICE_ROLE_KEY, "service_role", status.JWT_SECRET);
  return { supabaseUrl: status.API_URL, anonKey: status.ANON_KEY, serviceRoleKey: status.SERVICE_ROLE_KEY, projectId };
}

export async function conteinerAtivo(executar, nome) {
  const inspecao = await executar("docker", ["inspect", "-f", "{{.State.Running}}", nome]);
  return inspecao.codigo === 0 && inspecao.saida.trim() === "true";
}

export async function carregarAmbienteLocal({ executar, lerArquivo }) {
  const projectId = lerProjectId(lerArquivo("supabase/config.toml"));
  const status = await executar("npx", ["supabase", "status", "-o", "env"]);
  if (status.codigo !== 0) recusar("o Supabase CLI não encontrou a instância local deste projeto.");
  const conteineres = {};
  for (const [servico, portaInterna] of [["kong", "8000/tcp"], ["db", "5432/tcp"]]) {
    const nome = `supabase_${servico}_${projectId}`;
    const ativo = await conteinerAtivo(executar, nome);
    const portas = ativo ? await executar("docker", ["port", nome, portaInterna]) : { codigo: 1, saida: "" };
    conteineres[servico] = { ativo, portas: portas.codigo === 0 ? portasPublicadas(portas.saida) : new Set() };
  }
  return validarAmbienteLocal({ status: interpretarStatus(status.saida), projectId, conteineres });
}

export function ambienteDaApi(sistema, supabase, porta) {
  const base = Object.fromEntries(VARIAVEIS_DO_SISTEMA.filter((nome) => sistema[nome] !== undefined).map((nome) => [nome, sistema[nome]]));
  return {
    ...base,
    MUVE_IGNORAR_ARQUIVO_ENV: "true",
    NODE_ENV: "development",
    HOST: "127.0.0.1",
    PORT: String(porta),
    SUPABASE_URL: supabase.supabaseUrl,
    SUPABASE_ANON_KEY: supabase.anonKey,
    SUPABASE_SERVICE_ROLE_KEY: supabase.serviceRoleKey,
    ASAAS_API_KEY: "",
    ASAAS_WEBHOOK_TOKEN: "",
    ADMIN_TOKEN: "",
    SMTP_HOST: "",
    ENABLE_FINANCIAL_ROUTINE: "false",
    FINANCIAL_ROUTINE_TOKEN: randomBytes(32).toString("base64url"),
    ALLOWED_ORIGINS: "http://localhost:8443",
  };
}

const COMANDOS_PERMITIDOS = {
  npx: [["supabase", "status", "-o", "env"], ["supabase", "start"], ["supabase", "stop"], ["supabase", "db", "reset", "--local"]],
};

export function executarComando(comando, argumentos) {
  if (comando === "npx" && !COMANDOS_PERMITIDOS.npx.some((permitido) => permitido.join(" ") === argumentos.join(" "))) {
    return Promise.reject(new AmbienteRecusado(`Comando do Supabase CLI não permitido no E2E: ${argumentos.join(" ")}`));
  }
  return new Promise((resolve) => {
    const processo = comando === "npx"
      ? spawn(`npx ${argumentos.join(" ")}`, { shell: true })
      : spawn(comando, argumentos);
    let saida = "";
    let erro = "";
    processo.stdout.on("data", (parte) => (saida += parte));
    processo.stderr.on("data", (parte) => (erro += parte));
    processo.on("error", (falha) => resolve({ codigo: 1, saida, erro: `${erro}${falha.message}` }));
    processo.on("close", (codigo) => resolve({ codigo: codigo ?? 1, saida, erro }));
  });
}

export const lerArquivoDoProjeto = (caminho) => {
  if (caminho !== "supabase/config.toml") throw new AmbienteRecusado(`Leitura de arquivo não permitida no E2E: ${caminho}`);
  return readFileSync(caminho, "utf8");
};
