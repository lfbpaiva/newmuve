import { spawn, spawnSync } from "node:child_process";
import { EventEmitter } from "node:events";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ambienteDaApi, carregarAmbienteLocal, ehLoopback, executarComando, lerArquivoDoProjeto } from "./e2e-ambiente.mjs";
import { executarE2E, prepararE2E } from "./e2e-api.mjs";
import { aguardarApiPronta, encerrarProcesso, orquestrar } from "./e2e-local.mjs";

const SEGREDO = "segredo-local-de-teste-com-mais-de-32-caracteres";
const jwt = (conteudo, segredo = SEGREDO) => {
  const cabecalho = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const corpo = Buffer.from(JSON.stringify(conteudo)).toString("base64url");
  return `${cabecalho}.${corpo}.${createHmac("sha256", segredo).update(`${cabecalho}.${corpo}`).digest("base64url")}`;
};
const statusLocal = (mudancas = {}) => ({
  API_URL: "http://127.0.0.1:54321",
  DB_URL: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  ANON_KEY: jwt({ iss: "supabase-demo", role: "anon" }),
  SERVICE_ROLE_KEY: jwt({ iss: "supabase-demo", role: "service_role" }),
  JWT_SECRET: SEGREDO,
  ...mudancas,
});
const comoTexto = (status) => Object.entries(status).map(([chave, valor]) => `${chave}="${valor}"`).join("\n");

function falsoSistema({ ativa = false, status = statusLocal(), portaKong = "54321", portaBanco = "54322", residuos = "0", statusDepois, resetFinal = "ok", consultaDeResiduos = 0, parada = 0 } = {}) {
  const chamadas = [];
  let instanciaAtiva = ativa;
  let consultasDeStatus = 0;
  let resets = 0;
  const executar = vi.fn(async (comando, argumentos) => {
    chamadas.push([comando, ...argumentos].join(" "));
    const linha = argumentos.join(" ");
    if (comando === "docker" && argumentos[0] === "inspect") return { codigo: 0, saida: String(instanciaAtiva) };
    if (comando === "docker" && argumentos[0] === "port") return { codigo: 0, saida: argumentos[1].startsWith("supabase_kong") ? `0.0.0.0:${portaKong}\n[::]:${portaKong}` : `0.0.0.0:${portaBanco}` };
    if (comando === "docker" && argumentos[0] === "exec") return { codigo: consultaDeResiduos, saida: `contas de teste=${residuos}\npagamentos=0\ntentativas de repasse=0` };
    if (linha === "supabase start") {
      instanciaAtiva = true;
      return { codigo: 0, saida: "" };
    }
    if (linha === "supabase stop") {
      if (parada === 0) instanciaAtiva = false;
      return { codigo: parada, saida: "" };
    }
    if (linha === "supabase status -o env") {
      consultasDeStatus++;
      const atual = statusDepois && consultasDeStatus > 1 ? statusDepois : status;
      return { codigo: 0, saida: comoTexto(atual) };
    }
    if (linha === "supabase db reset --local") {
      resets++;
      if (resets > 1 && resetFinal === "excecao") throw new Error("CLI interrompido no reset final");
      return { codigo: resets > 1 && resetFinal === "falha" ? 1 : 0, saida: "" };
    }
    throw new Error(`comando inesperado: ${comando} ${linha}`);
  });
  const lidos = [];
  const lerArquivo = vi.fn((caminho) => {
    lidos.push(caminho);
    return 'project_id = "muve"\n';
  });
  return { executar, lerArquivo, chamadas, lidos };
}

const resets = (chamadas) => chamadas.filter((chamada) => chamada.includes("reset"));

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ambiente do E2E", () => {
  it("só aceita hosts da própria máquina", () => {
    expect(["http://127.0.0.1:54321", "http://localhost:3333/api", "http://[::1]:54321"].every(ehLoopback)).toBe(true);
    expect(["https://abcd.supabase.co", "http://192.168.0.10:54321", "http://127.0.0.1.nip.io", "nao-e-url"].some(ehLoopback)).toBe(false);
  });

  it.each([
    ["URL externa do Supabase", { status: statusLocal({ API_URL: "https://abcd.supabase.co" }) }],
    ["banco externo", { status: statusLocal({ DB_URL: "postgresql://postgres:x@db.abcd.supabase.co:5432/postgres" }) }],
    ["porta que não é do contêiner local", { portaKong: "54999" }],
    ["chave de projeto hospedado", { status: statusLocal({ SERVICE_ROLE_KEY: jwt({ iss: "supabase", role: "service_role", ref: "abcd" }) }) }],
    ["chave assinada por outro segredo", { status: statusLocal({ ANON_KEY: jwt({ iss: "supabase-demo", role: "anon" }, "outro-segredo") }) }],
    ["instância sem o contêiner do banco", { ativa: false }],
  ])("recusa %s antes de qualquer requisição", async (_caso, opcoes) => {
    const fetchEspiao = vi.spyOn(globalThis, "fetch");
    const sistema = falsoSistema({ ativa: true, ...opcoes });

    await expect(carregarAmbienteLocal(sistema)).rejects.toThrow("Ambiente E2E recusado");
    expect(fetchEspiao).not.toHaveBeenCalled();
    expect(resets(sistema.chamadas)).toEqual([]);
  });

  it("aceita a instância local e lê apenas supabase/config.toml", async () => {
    const sistema = falsoSistema({ ativa: true });
    await expect(carregarAmbienteLocal(sistema)).resolves.toMatchObject({ supabaseUrl: "http://127.0.0.1:54321", projectId: "muve" });
    expect(sistema.lidos).toEqual(["supabase/config.toml"]);
  });

  it("a leitura de arquivos do E2E recusa backend/.env", () => {
    expect(() => lerArquivoDoProjeto("backend/.env")).toThrow("não permitida");
    expect(() => lerArquivoDoProjeto("../backend/.env")).toThrow("não permitida");
  });

  it("o Supabase CLI só roda os comandos locais permitidos", async () => {
    await expect(executarComando("npx", ["supabase", "db", "reset", "--linked"])).rejects.toThrow("não permitido");
    await expect(executarComando("npx", ["supabase", "db", "reset"])).rejects.toThrow("não permitido");
    await expect(executarComando("npx", ["supabase", "db", "push"])).rejects.toThrow("não permitido");
  });

  it("a API do E2E recebe só as variáveis locais e ignora backend/.env", () => {
    const sistema = { PATH: "/bin", SUPABASE_URL: "https://abcd.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "chave-compartilhada", ASAAS_API_KEY: "chave-real", SMTP_HOST: "smtp.real" };
    const env = ambienteDaApi(sistema, { supabaseUrl: "http://127.0.0.1:54321", anonKey: "anon-local", serviceRoleKey: "service-local" }, 49152);

    expect(env).toMatchObject({
      PATH: "/bin",
      HOST: "127.0.0.1",
      PORT: "49152",
      MUVE_IGNORAR_ARQUIVO_ENV: "true",
      SUPABASE_URL: "http://127.0.0.1:54321",
      SUPABASE_SERVICE_ROLE_KEY: "service-local",
      ASAAS_API_KEY: "",
      SMTP_HOST: "",
      ENABLE_FINANCIAL_ROUTINE: "false",
    });
    expect(env.NODE_ENV).not.toBe("production");
    expect(JSON.stringify(env)).not.toMatch(/abcd\.supabase\.co|chave-compartilhada|chave-real|smtp\.real/);
  });

  it("a API do E2E recebe um token de disparo da rotina novo e forte a cada execução, sem copiar o do sistema", () => {
    const sistema = { PATH: "/bin", FINANCIAL_ROUTINE_TOKEN: "token-do-sistema-que-nao-pode-vazar-para-o-e2e" };
    const supabase = { supabaseUrl: "http://127.0.0.1:54321", anonKey: "anon-local", serviceRoleKey: "service-local" };
    const primeiro = ambienteDaApi(sistema, supabase, 49152).FINANCIAL_ROUTINE_TOKEN;
    const segundo = ambienteDaApi(sistema, supabase, 49152).FINANCIAL_ROUTINE_TOKEN;

    expect(primeiro).toMatch(/^[A-Za-z0-9_-]{32,}$/);
    expect(primeiro).not.toBe(segundo);
    expect(primeiro).not.toBe(sistema.FINANCIAL_ROUTINE_TOKEN);
  });

  it("a API com MUVE_IGNORAR_ARQUIVO_ENV não carrega backend/.env", () => {
    const env = { PATH: process.env.PATH, Path: process.env.Path, SystemRoot: process.env.SystemRoot, MUVE_IGNORAR_ARQUIVO_ENV: "true" };
    const resultado = spawnSync(process.execPath, ["backend/src/server.ts"], { env, encoding: "utf8", timeout: 20_000 });

    expect(resultado.status).not.toBe(0);
    expect(resultado.stderr).toContain("Variável de ambiente SUPABASE_URL não definida");
  });

  it("os scripts do E2E não leem backend/.env", () => {
    for (const arquivo of ["scripts/e2e-api.mjs", "scripts/e2e-local.mjs", "scripts/e2e-ambiente.mjs"]) {
      const fonte = readFileSync(arquivo, "utf8");
      expect(fonte).not.toMatch(/backend\/\.env|loadEnvFile|dotenv/);
    }
    expect(readFileSync("scripts/e2e-api.mjs", "utf8")).not.toMatch(/node:fs/);
    expect(readFileSync("scripts/e2e-local.mjs", "utf8")).not.toMatch(/node:fs/);
    expect(readFileSync("scripts/e2e-ambiente.mjs", "utf8").match(/readFileSync\(/g)).toHaveLength(1);
  });
});

describe("script E2E", () => {
  const apiViva = (url = "http://127.0.0.1:49152/api") => ({ url, processo: { exitCode: null, signalCode: null } });

  it("execução direta do arquivo recusa sem consultar o Supabase nem a API", () => {
    const armadilha = "data:text/javascript," + encodeURIComponent(
      'import childProcess from "node:child_process"; import { syncBuiltinESMExports } from "node:module";'
      + ' globalThis.fetch = () => { process.stderr.write("REQUISICAO_HTTP\\n"); throw new Error("proibido"); };'
      + ' for (const nome of ["spawn", "spawnSync", "exec", "execFile", "execSync", "execFileSync"]) childProcess[nome] = () => { process.stderr.write("PROCESSO_EXTERNO\\n"); throw new Error("proibido"); };'
      + " syncBuiltinESMExports();",
    );
    for (const argumentos of [["scripts/e2e-api.mjs"], ["scripts/e2e-api.mjs", "run"]]) {
      const resultado = spawnSync(process.execPath, ["--import", armadilha, ...argumentos], { encoding: "utf8", timeout: 20_000 });

      expect(resultado.status).toBe(1);
      expect(resultado.stderr).toContain("Este arquivo não roda sozinho");
      expect(resultado.stderr).not.toMatch(/REQUISICAO_HTTP|PROCESSO_EXTERNO/);
      expect(resultado.stdout).toBe("");
    }
  });

  it.each([
    ["sem a API do orquestrador", undefined],
    ["com a API já encerrada", { url: "http://127.0.0.1:49152/api", processo: { exitCode: 0, signalCode: null } }],
    ["com a API morta por sinal", { url: "http://127.0.0.1:49152/api", processo: { exitCode: null, signalCode: "SIGTERM" } }],
    ["com uma API sem processo, como uma API já existente", { url: "http://127.0.0.1:3333/api" }],
    ["com API fora da própria máquina", { url: "https://api.muve.app/api", processo: { exitCode: null, signalCode: null } }],
  ])("o E2E recusa rodar %s antes de qualquer comando ou requisição", async (_caso, apiIniciada) => {
    const fetchEspiao = vi.spyOn(globalThis, "fetch");
    const sistema = falsoSistema({ ativa: true });
    const criarCliente = vi.fn();

    await expect(executarE2E({ apiIniciada, ...sistema, criarCliente })).rejects.toThrow("Ambiente E2E recusado");
    expect(sistema.chamadas).toEqual([]);
    expect(criarCliente).not.toHaveBeenCalled();
    expect(fetchEspiao).not.toHaveBeenCalled();
  });

  it("aborta se a API não reconhecer a sessão do Supabase local, antes de qualquer outra chamada", async () => {
    const sistema = falsoSistema({ ativa: true });
    const tabela = { insert: () => ({ throwOnError: async () => ({}) }) };
    const cliente = {
      auth: {
        admin: {
          listUsers: async () => ({ data: { users: [] }, error: null }),
          createUser: async () => ({ data: { user: { id: "u1" } }, error: null }),
        },
        signInWithPassword: async () => ({ data: { session: { access_token: "sessao-local" } }, error: null }),
      },
      from: () => tabela,
    };
    const fetchEspiao = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ error: { code: "NAO_AUTENTICADO" } }, { status: 401 }));

    await expect(executarE2E({ apiIniciada: apiViva(), ...sistema, criarCliente: () => cliente })).rejects.toThrow("não está ligada ao banco local");
    expect(fetchEspiao).toHaveBeenCalledTimes(1);
    expect(String(fetchEspiao.mock.calls[0][0])).toBe("http://127.0.0.1:49152/api/me");
  });

  it("recusa URL externa antes de criar o cliente ou fazer requisições", async () => {
    const fetchEspiao = vi.spyOn(globalThis, "fetch");
    const criarCliente = vi.fn();
    const sistema = falsoSistema({ ativa: true, status: statusLocal({ API_URL: "https://abcd.supabase.co" }) });

    await expect(prepararE2E({ ...sistema, criarCliente, api: "http://127.0.0.1:49152/api" })).rejects.toThrow("Ambiente E2E recusado");
    expect(criarCliente).not.toHaveBeenCalled();
    expect(fetchEspiao).not.toHaveBeenCalled();
  });

  it("recusa API do Muve fora da própria máquina", async () => {
    const criarCliente = vi.fn();
    await expect(prepararE2E({ ...falsoSistema({ ativa: true }), criarCliente, api: "https://api.muve.app/api" })).rejects.toThrow("API do E2E");
    expect(criarCliente).not.toHaveBeenCalled();
  });

  it("usa só as credenciais locais e recusa banco que ainda tem contas do E2E", async () => {
    const sistema = falsoSistema({ ativa: true });
    const listUsers = vi.fn(async () => ({ data: { users: [{ email: "e2e.musico@muve.test" }] }, error: null }));
    const criarCliente = vi.fn(() => ({ auth: { admin: { listUsers } } }));

    await expect(prepararE2E({ ...sistema, criarCliente, api: "http://127.0.0.1:49152/api" })).rejects.toThrow("ainda tem contas do E2E");
    expect(criarCliente).toHaveBeenCalledWith("http://127.0.0.1:54321", statusLocal().SERVICE_ROLE_KEY, expect.anything());
    expect(sistema.lidos).toEqual(["supabase/config.toml"]);
  });
});

describe("orquestrador do E2E", () => {
  const preparar = (opcoes = {}, deps = {}) => {
    const sistema = falsoSistema(opcoes);
    const api = { url: "http://127.0.0.1:49152/api", parar: vi.fn(async () => {}) };
    const completos = {
      ...sistema,
      escolherPorta: vi.fn(async () => 49152),
      iniciarApi: vi.fn(async () => api),
      rodarE2E: vi.fn(async () => 0),
      log: vi.fn(),
      reutilizarInstancia: false,
      ...deps,
    };
    return { sistema, api, deps: completos };
  };

  it("sobe a instância, reseta antes e depois, confere os resíduos e para o que iniciou", async () => {
    const { sistema, deps } = preparar();

    await expect(orquestrar(deps)).resolves.toBe(0);

    expect(resets(sistema.chamadas)).toEqual(["npx supabase db reset --local", "npx supabase db reset --local"]);
    expect(sistema.chamadas[0]).toBe("docker inspect -f {{.State.Running}} supabase_db_muve");
    expect(sistema.chamadas).toContain("npx supabase start");
    expect(sistema.chamadas.at(-1)).toBe("npx supabase stop");
    expect(deps.iniciarApi.mock.calls[0][0]).toMatchObject({ SUPABASE_URL: "http://127.0.0.1:54321", ASAAS_API_KEY: "", MUVE_IGNORAR_ARQUIVO_ENV: "true" });
  });

  it("sobe a API só em 127.0.0.1, numa porta própria, e entrega ao E2E apenas a API que ele iniciou", async () => {
    const { api, deps } = preparar();

    await orquestrar(deps);

    expect(deps.iniciarApi).toHaveBeenCalledWith(expect.objectContaining({ HOST: "127.0.0.1", PORT: "49152" }), 49152);
    expect(deps.rodarE2E).toHaveBeenCalledWith(api);
    expect(deps.iniciarApi.mock.invocationCallOrder[0]).toBeLessThan(deps.rodarE2E.mock.invocationCallOrder[0]);
  });

  it("recusa ambiente externo sem reset, sem API e sem E2E, e só para a instância que ele mesmo subiu", async () => {
    const { sistema, deps } = preparar({ status: statusLocal({ API_URL: "https://abcd.supabase.co" }) });

    await expect(orquestrar(deps)).rejects.toThrow("Ambiente E2E recusado");

    expect(resets(sistema.chamadas)).toEqual([]);
    expect(deps.iniciarApi).not.toHaveBeenCalled();
    expect(deps.rodarE2E).not.toHaveBeenCalled();
    expect(sistema.chamadas.at(-1)).toBe("npx supabase stop");
  });

  it("não mexe numa instância local já em uso sem autorização", async () => {
    const { sistema, deps } = preparar({ ativa: true });

    await expect(orquestrar(deps)).rejects.toThrow("já está rodando");

    expect(sistema.chamadas).toEqual(["docker inspect -f {{.State.Running}} supabase_db_muve"]);
    expect(deps.escolherPorta).not.toHaveBeenCalled();
    expect(deps.iniciarApi).not.toHaveBeenCalled();
  });

  it("reutiliza a instância autorizada, mas não a para no final", async () => {
    const { sistema, deps } = preparar({ ativa: true }, { reutilizarInstancia: true });

    await expect(orquestrar(deps)).resolves.toBe(0);

    expect(resets(sistema.chamadas)).toHaveLength(2);
    expect(sistema.chamadas).not.toContain("npx supabase start");
    expect(sistema.chamadas).not.toContain("npx supabase stop");
  });

  it("falha ao subir a API ainda reseta só o banco local e para a instância", async () => {
    const { sistema, deps } = preparar({}, { iniciarApi: vi.fn(async () => { throw new Error("A API local não subiu para o E2E."); }) });

    await expect(orquestrar(deps)).rejects.toThrow("A API local não subiu");

    expect(resets(sistema.chamadas)).toEqual(["npx supabase db reset --local", "npx supabase db reset --local"]);
    expect(sistema.chamadas.some((chamada) => chamada.startsWith("docker exec supabase_db_muve psql"))).toBe(true);
    expect(sistema.chamadas.at(-1)).toBe("npx supabase stop");
  });

  it("falha nos testes ainda para a API, reseta o banco local e devolve erro", async () => {
    const { sistema, api, deps } = preparar({}, { rodarE2E: vi.fn(async () => 1) });

    await expect(orquestrar(deps)).resolves.toBe(1);

    expect(api.parar).toHaveBeenCalled();
    expect(resets(sistema.chamadas)).toHaveLength(2);
  });

  it("resíduo depois do reset final reprova a execução", async () => {
    const { deps } = preparar({ residuos: "1" });
    await expect(orquestrar(deps)).resolves.toBe(1);
  });

  it("se o ambiente mudar antes do reset final, não reseta nada e reprova", async () => {
    const { sistema, deps } = preparar({ statusDepois: statusLocal({ API_URL: "https://abcd.supabase.co" }) });

    await expect(orquestrar(deps)).resolves.toBe(1);

    expect(resets(sistema.chamadas)).toEqual(["npx supabase db reset --local"]);
  });

  it("todo comando do Supabase CLI é local", async () => {
    const { sistema, deps } = preparar({}, { rodarE2E: vi.fn(async () => 1) });
    await orquestrar(deps);

    const doCli = sistema.chamadas.filter((chamada) => chamada.startsWith("npx"));
    expect(doCli.every((chamada) => ["npx supabase start", "npx supabase stop", "npx supabase status -o env", "npx supabase db reset --local"].includes(chamada))).toBe(true);
    expect(doCli.join(" ")).not.toMatch(/--linked|--db-url|push/);
  });
});

describe("encerramento do E2E", () => {
  const preparar = (opcoes = {}, deps = {}) => {
    const sistema = falsoSistema(opcoes);
    const api = { url: "http://127.0.0.1:49152/api", parar: vi.fn(async () => {}) };
    const completos = {
      ...sistema,
      escolherPorta: vi.fn(async () => 49152),
      iniciarApi: vi.fn(async () => api),
      rodarE2E: vi.fn(async () => 0),
      log: vi.fn(),
      reutilizarInstancia: false,
      ...deps,
    };
    return { sistema, api, deps: completos };
  };
  const apiQueNaoEncerra = () => ({ url: "http://127.0.0.1:49152/api", parar: vi.fn(async () => { throw new Error("A API local (processo 1234) não encerrou nem com o encerramento forçado."); }) });
  const logs = (deps) => deps.log.mock.calls.map(([mensagem]) => mensagem);
  const consultouResiduos = (sistema) => sistema.chamadas.some((chamada) => chamada.startsWith("docker exec supabase_db_muve psql"));

  it("falha ao encerrar a API não impede a limpeza nem a parada do Supabase, e reprova", async () => {
    const api = apiQueNaoEncerra();
    const { sistema, deps } = preparar({}, { iniciarApi: vi.fn(async () => api) });

    await expect(orquestrar(deps)).resolves.toBe(1);

    expect(api.parar).toHaveBeenCalledTimes(1);
    expect(resets(sistema.chamadas)).toEqual(["npx supabase db reset --local", "npx supabase db reset --local"]);
    expect(consultouResiduos(sistema)).toBe(true);
    expect(sistema.chamadas.at(-1)).toBe("npx supabase stop");
    expect(logs(deps)).toContain("Falha ao encerrar a API local: A API local (processo 1234) não encerrou nem com o encerramento forçado.");
  });

  it.each([
    ["reset final recusado pelo CLI", { resetFinal: "falha" }],
    ["reset final interrompido por exceção", { resetFinal: "excecao" }],
    ["falha na consulta de resíduos", { consultaDeResiduos: 1 }],
    ["resíduos depois do reset final", { residuos: "3" }],
  ])("%s não impede a parada do Supabase iniciado pelo E2E, e reprova", async (_caso, opcoes) => {
    const { sistema, deps } = preparar(opcoes);

    await expect(orquestrar(deps)).resolves.toBe(1);

    expect(sistema.chamadas.at(-1)).toBe("npx supabase stop");
  });

  it("falha ao parar o Supabase reprova a execução", async () => {
    const { sistema, deps } = preparar({ parada: 1 });

    await expect(orquestrar(deps)).resolves.toBe(1);

    expect(sistema.chamadas.at(-1)).toBe("npx supabase stop");
    expect(logs(deps)).toContain("Falha ao parar o Supabase local: o Supabase CLI não confirmou a parada.");
  });

  it("todas as etapas falhando ainda são tentadas, uma depois da outra", async () => {
    const api = apiQueNaoEncerra();
    const { sistema, deps } = preparar({ resetFinal: "excecao", parada: 1 }, { iniciarApi: vi.fn(async () => api), rodarE2E: vi.fn(async () => { throw new Error("E2E quebrou"); }) });

    await expect(orquestrar(deps)).rejects.toThrow("E2E quebrou");

    expect(api.parar).toHaveBeenCalledTimes(1);
    expect(resets(sistema.chamadas)).toHaveLength(2);
    expect(sistema.chamadas.at(-1)).toBe("npx supabase stop");
  });

  it("instância reutilizada não é parada nem quando o encerramento e a limpeza falham", async () => {
    const api = apiQueNaoEncerra();
    const { sistema, deps } = preparar({ ativa: true, resetFinal: "falha" }, { reutilizarInstancia: true, iniciarApi: vi.fn(async () => api) });

    await expect(orquestrar(deps)).resolves.toBe(1);

    expect(api.parar).toHaveBeenCalledTimes(1);
    expect(resets(sistema.chamadas)).toHaveLength(2);
    expect(sistema.chamadas).not.toContain("npx supabase stop");
    expect(sistema.chamadas).not.toContain("npx supabase start");
  });
});

describe("encerramento do processo da API", () => {
  const processoFalso = ({ saiCom = [] } = {}) => {
    const processo = new EventEmitter();
    Object.assign(processo, { pid: 1234, exitCode: null, signalCode: null });
    processo.kill = vi.fn((sinal = "SIGTERM") => {
      if (!saiCom.includes(sinal)) return true;
      setTimeout(() => {
        processo.signalCode = sinal;
        processo.emit("exit", null, sinal);
      }, 1);
      return true;
    });
    return processo;
  };

  it("pede o encerramento e termina quando o processo sai", async () => {
    const processo = processoFalso({ saiCom: ["SIGTERM"] });
    await expect(encerrarProcesso(processo, 50)).resolves.toBeUndefined();
    expect(processo.kill.mock.calls).toEqual([["SIGTERM"]]);
  });

  it("força o encerramento quando o processo ignora o primeiro pedido", async () => {
    const processo = processoFalso({ saiCom: ["SIGKILL"] });
    await expect(encerrarProcesso(processo, 50)).resolves.toBeUndefined();
    expect(processo.kill.mock.calls).toEqual([["SIGTERM"], ["SIGKILL"]]);
  });

  it("não espera para sempre: depois das duas tentativas, falha com o processo identificado", async () => {
    const processo = processoFalso();
    const inicio = Date.now();
    await expect(encerrarProcesso(processo, 50)).rejects.toThrow("A API local (processo 1234) não encerrou nem com o encerramento forçado.");
    expect(processo.kill.mock.calls).toEqual([["SIGTERM"], ["SIGKILL"]]);
    expect(Date.now() - inicio).toBeLessThan(2_000);
  });

  it("processo já encerrado não recebe sinal", async () => {
    const processo = processoFalso();
    processo.exitCode = 0;
    await expect(encerrarProcesso(processo, 50)).resolves.toBeUndefined();
    expect(processo.kill).not.toHaveBeenCalled();
  });

  it("processo que nem chegou a ser criado não recebe sinal nem gasta as esperas", async () => {
    const processo = processoFalso();
    processo.pid = undefined;
    const inicio = Date.now();
    await expect(encerrarProcesso(processo, 5_000)).resolves.toBeUndefined();
    expect(processo.kill).not.toHaveBeenCalled();
    expect(Date.now() - inicio).toBeLessThan(500);
  });

  it("falha ao enviar o sinal não escapa: segue para o encerramento forçado e depois falha com o processo identificado", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const processo = processoFalso();
    processo.kill = vi.fn(() => {
      throw new Error("EPERM");
    });
    await expect(encerrarProcesso(processo, 20)).rejects.toThrow("A API local (processo 1234) não encerrou nem com o encerramento forçado.");
    expect(processo.kill.mock.calls).toEqual([["SIGTERM"], ["SIGKILL"]]);
  });
});

describe("criação e acompanhamento do processo da API", () => {
  const processoIniciado = () => {
    const processo = new EventEmitter();
    Object.assign(processo, { pid: 4321, exitCode: null, signalCode: null, stdout: new EventEmitter(), stderr: new EventEmitter() });
    processo.kill = vi.fn((sinal) => {
      queueMicrotask(() => processo.emit("error", new Error(`não foi possível enviar ${sinal}`)));
      return false;
    });
    return processo;
  };

  it("falha real ao criar o processo vira erro tratado, sem esperar os prazos de encerramento", async () => {
    const processo = spawn("muve-executavel-que-nao-existe", [], { stdio: ["ignore", "pipe", "pipe"] });
    const inicio = Date.now();

    await expect(aguardarApiPronta(processo, { porta: 49152 })).rejects.toThrow(/Não foi possível criar o processo da API local: .*ENOENT/);
    expect(Date.now() - inicio).toBeLessThan(2_000);
  });

  it("evento error de criação emitido depois do spawn é capturado pelo ouvinte registrado de imediato", async () => {
    const processo = new EventEmitter();
    Object.assign(processo, { pid: undefined, exitCode: null, signalCode: null, kill: vi.fn() });
    const pronta = aguardarApiPronta(processo, { porta: 49152 });
    expect(processo.listenerCount("error")).toBe(1);
    process.nextTick(() => processo.emit("error", new Error("spawn EACCES")));

    await expect(pronta).rejects.toThrow("Não foi possível criar o processo da API local: spawn EACCES.");
    expect(processo.kill).not.toHaveBeenCalled();
  });

  it("evento error de um processo já iniciado não derruba nada e o encerramento com prazo continua", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const processo = processoIniciado();

    await expect(aguardarApiPronta(processo, { porta: 49152, tentativas: 2, intervaloMs: 5, esperaMs: 20 })).rejects.toThrow("A API local não subiu para o E2E.");
    expect(processo.kill.mock.calls).toEqual([["SIGTERM"], ["SIGKILL"]]);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("Falha ao enviar sinal ao processo da API (4321): não foi possível enviar SIGTERM"));
  });

  it("falha na criação do processo da API não derruba o orquestrador: o reset final e a parada do Supabase continuam", async () => {
    const sistema = falsoSistema();
    const deps = {
      ...sistema,
      escolherPorta: vi.fn(async () => 49152),
      iniciarApi: (_env, porta) => aguardarApiPronta(spawn("muve-executavel-que-nao-existe", [], { stdio: ["ignore", "pipe", "pipe"] }), { porta }),
      rodarE2E: vi.fn(async () => 0),
      log: vi.fn(),
      reutilizarInstancia: false,
    };

    await expect(orquestrar(deps)).rejects.toThrow("Não foi possível criar o processo da API local");

    expect(deps.rodarE2E).not.toHaveBeenCalled();
    expect(resets(sistema.chamadas)).toEqual(["npx supabase db reset --local", "npx supabase db reset --local"]);
    expect(sistema.chamadas.some((chamada) => chamada.startsWith("docker exec supabase_db_muve psql"))).toBe(true);
    expect(sistema.chamadas.at(-1)).toBe("npx supabase stop");
  });

  it("evento error durante o encerramento no orquestrador não pula a limpeza nem a parada", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const sistema = falsoSistema();
    const processo = processoIniciado();
    const deps = {
      ...sistema,
      escolherPorta: vi.fn(async () => 49152),
      iniciarApi: vi.fn(async (_env, porta) => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ status: "ok" }));
        const pronta = aguardarApiPronta(processo, { porta, intervaloMs: 5, esperaMs: 20 });
        processo.stdout.emit("data", `API do Muve em http://localhost:${porta}/api\n`);
        return pronta;
      }),
      rodarE2E: vi.fn(async () => 0),
      log: vi.fn(),
      reutilizarInstancia: false,
    };

    await expect(orquestrar(deps)).resolves.toBe(1);

    expect(processo.kill.mock.calls).toEqual([["SIGTERM"], ["SIGKILL"]]);
    expect(resets(sistema.chamadas)).toHaveLength(2);
    expect(sistema.chamadas.at(-1)).toBe("npx supabase stop");
    expect(deps.log.mock.calls.map(([mensagem]) => mensagem)).toContain("Falha ao encerrar a API local: A API local (processo 4321) não encerrou nem com o encerramento forçado.");
  });
});
