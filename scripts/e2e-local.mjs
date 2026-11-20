import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { pathToFileURL } from "node:url";
import { AmbienteRecusado, ambienteDaApi, carregarAmbienteLocal, conteinerAtivo, executarComando, lerArquivoDoProjeto, lerProjectId } from "./e2e-ambiente.mjs";
import { executarE2E } from "./e2e-api.mjs";

const RESIDUOS = `
  select 'contas de teste', count(*) from auth.users where email like '%@muve.test'
  union all select 'pagamentos', count(*) from public.payments
  union all select 'tentativas de repasse', count(*) from public.repasse_tentativas
  union all select 'decisoes de repasse', count(*) from public.repasse_decisoes
  union all select 'alertas de repasse', count(*) from public.repasse_alertas
  union all select 'penalidades', count(*) from public.penalties
  union all select 'eventos', count(*) from public.events
  union all select 'perfis', count(*) from public.profiles
  union all select 'execucao ativa da rotina', count(*) from public.rotina_financeira_execucao where dono is not null
  union all select 'arquivos no storage', count(*) from storage.objects;
`;

const ESPERA_ENCERRAMENTO_MS = 5_000;

const encerrado = (processo) => processo.exitCode !== null || processo.signalCode !== null;
const foiCriado = (processo) => processo.pid !== undefined;

function enviarSinal(processo, sinal) {
  try {
    processo.kill(sinal);
  } catch (error) {
    console.error(`[e2e] Falha ao enviar ${sinal} ao processo da API (${processo.pid}): ${error.message}`);
  }
}

function aguardarSaida(processo, esperaMs) {
  return new Promise((resolve) => {
    if (encerrado(processo)) return resolve(true);
    const prazo = setTimeout(() => {
      processo.off("exit", aoSair);
      resolve(false);
    }, esperaMs);
    const aoSair = () => {
      clearTimeout(prazo);
      resolve(true);
    };
    processo.once("exit", aoSair);
  });
}

export async function encerrarProcesso(processo, esperaMs = ESPERA_ENCERRAMENTO_MS) {
  if (!foiCriado(processo) || encerrado(processo)) return;
  enviarSinal(processo, "SIGTERM");
  if (await aguardarSaida(processo, esperaMs)) return;
  enviarSinal(processo, "SIGKILL");
  if (await aguardarSaida(processo, esperaMs)) return;
  throw new Error(`A API local (processo ${processo.pid}) não encerrou nem com o encerramento forçado.`);
}

async function etapaDeEncerramento(log, descricao, etapa) {
  try {
    return (await etapa()) !== false;
  } catch (error) {
    log(`${descricao}: ${error.message}`);
    return false;
  }
}

export async function orquestrar(deps) {
  const { executar, lerArquivo, escolherPorta, iniciarApi, rodarE2E, log, reutilizarInstancia } = deps;
  const projectId = lerProjectId(lerArquivo("supabase/config.toml"));
  const conteinerDoBanco = `supabase_db_${projectId}`;
  const jaAtiva = await conteinerAtivo(executar, conteinerDoBanco);
  if (jaAtiva && !reutilizarInstancia) {
    throw new AmbienteRecusado("O Supabase local deste projeto já está rodando e pode estar em uso. O E2E apaga os dados locais com reset; pare a instância (npx supabase stop) ou rode com --reutilizar-instancia para autorizar o reset dela.");
  }
  let iniciouInstancia = false;
  let validado = false;
  let api = null;
  let codigo;
  try {
    if (!jaAtiva) {
      log("Subindo o Supabase local...");
      const inicio = await executar("npx", ["supabase", "start"]);
      if (inicio.codigo !== 0) throw new Error("Não foi possível subir o Supabase local.");
      iniciouInstancia = true;
    }
    const supabase = await carregarAmbienteLocal({ executar, lerArquivo });
    validado = true;
    log(`Supabase local conferido (${supabase.supabaseUrl}, projeto ${projectId}). Resetando o banco local...`);
    const reset = await executar("npx", ["supabase", "db", "reset", "--local"]);
    if (reset.codigo !== 0) throw new Error("O reset inicial do banco local falhou.");
    const porta = await escolherPorta();
    const ambienteDaApiLocal = ambienteDaApi(process.env, supabase, porta);
    api = await iniciarApi(ambienteDaApiLocal, porta);
    api.tokenDaRotina = ambienteDaApiLocal.FINANCIAL_ROUTINE_TOKEN;
    log(`API local do E2E em ${api.url}, escutando só em 127.0.0.1.`);
    codigo = await rodarE2E(api);
  } finally {
    const encerramentos = [];
    if (api) encerramentos.push(await etapaDeEncerramento(log, "Falha ao encerrar a API local", () => api.parar()));
    if (validado) encerramentos.push(await etapaDeEncerramento(log, "Falha na limpeza do banco local", () => limparAmbienteLocal({ executar, lerArquivo, log, conteinerDoBanco })));
    if (iniciouInstancia) {
      encerramentos.push(await etapaDeEncerramento(log, "Falha ao parar o Supabase local", async () => {
        log("Parando o Supabase local iniciado pelo E2E...");
        const parada = await executar("npx", ["supabase", "stop"]);
        if (parada.codigo !== 0) throw new Error("o Supabase CLI não confirmou a parada.");
      }));
    }
    if (encerramentos.includes(false)) codigo = 1;
  }
  return codigo;
}

async function limparAmbienteLocal({ executar, lerArquivo, log, conteinerDoBanco }) {
  try {
    await carregarAmbienteLocal({ executar, lerArquivo });
  } catch (error) {
    log(`Reset final não executado: ${error.message}`);
    return false;
  }
  log("Resetando o banco local ao final...");
  const reset = await executar("npx", ["supabase", "db", "reset", "--local"]);
  if (reset.codigo !== 0) {
    log("O reset final do banco local falhou; os dados de teste continuam apenas no Supabase local.");
    return false;
  }
  const consulta = await executar("docker", ["exec", conteinerDoBanco, "psql", "-U", "postgres", "-d", "postgres", "-At", "-F", "=", "-c", RESIDUOS]);
  if (consulta.codigo !== 0) {
    log("Não foi possível conferir os resíduos no banco local.");
    return false;
  }
  const residuos = consulta.saida.trim().split(/\r?\n/).map((linha) => linha.split("="));
  log(`Resíduos no banco local: ${residuos.map(([nome, total]) => `${nome} ${total}`).join(", ")}`);
  return residuos.every(([, total]) => total === "0");
}

function portaLivreEmLoopback() {
  return new Promise((resolve, reject) => {
    const servidor = createServer();
    servidor.once("error", reject);
    servidor.listen(0, "127.0.0.1", () => {
      const { port } = servidor.address();
      servidor.close(() => resolve(port));
    });
  });
}

export async function aguardarApiPronta(processo, { porta, tentativas = 60, intervaloMs = 500, esperaMs = ESPERA_ENCERRAMENTO_MS }) {
  let falhaDeCriacao = null;
  let saida = "";
  processo.on("error", (error) => {
    if (!foiCriado(processo)) {
      falhaDeCriacao = error;
      return;
    }
    saida += `\nFalha ao enviar sinal ao processo da API: ${error.message}`;
    console.error(`[e2e] Falha ao enviar sinal ao processo da API (${processo.pid}): ${error.message}`);
  });
  const url = `http://127.0.0.1:${porta}/api`;
  let escutando = false;
  processo.stdout?.on("data", (parte) => {
    saida += parte;
    if (saida.includes(`API do Muve em http://localhost:${porta}/api`)) escutando = true;
  });
  processo.stderr?.on("data", (parte) => (saida += parte));

  if (!foiCriado(processo)) {
    await new Promise((resolve) => setImmediate(resolve));
    throw new Error(`Não foi possível criar o processo da API local: ${falhaDeCriacao?.message ?? "o sistema não devolveu um identificador de processo"}.`);
  }
  const parar = () => encerrarProcesso(processo, esperaMs);
  for (let tentativa = 0; tentativa < tentativas; tentativa++) {
    if (encerrado(processo)) break;
    if (escutando && (await fetch(`${url}/health`).then((resposta) => resposta.ok, () => false))) return { url, processo, parar };
    await new Promise((resolve) => setTimeout(resolve, intervaloMs));
  }
  await parar().catch((error) => console.error(`[e2e] ${error.message}`));
  throw new Error(`A API local não subiu para o E2E.\n${saida.slice(-2000)}`);
}

function iniciarApiLocal(env, porta) {
  return aguardarApiPronta(spawn(process.execPath, ["backend/src/server.ts"], { env, stdio: ["ignore", "pipe", "pipe"] }), { porta });
}

async function rodarE2ENaApiIniciada(apiIniciada) {
  try {
    return (await executarE2E({ apiIniciada, executar: executarComando, lerArquivo: lerArquivoDoProjeto })) === 0 ? 0 : 1;
  } catch (error) {
    console.error(error);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  orquestrar({
    executar: executarComando,
    lerArquivo: lerArquivoDoProjeto,
    escolherPorta: portaLivreEmLoopback,
    iniciarApi: iniciarApiLocal,
    rodarE2E: rodarE2ENaApiIniciada,
    log: (mensagem) => console.log(`[e2e] ${mensagem}`),
    reutilizarInstancia: process.argv.includes("--reutilizar-instancia"),
  }).then(
    (codigo) => process.exit(codigo),
    (error) => {
      console.error(`[e2e] ${error.message}`);
      process.exit(1);
    },
  );
}
