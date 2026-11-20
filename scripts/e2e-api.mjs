import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { AmbienteRecusado, carregarAmbienteLocal, exigirLoopback } from "./e2e-ambiente.mjs";

let API;
const PASSWORD = "Teste-e2e-123";
const USERS = {
  contractor: { email: "e2e.contratante@muve.test", role: "CONTRACTOR" },
  musician: { email: "e2e.musico@muve.test", role: "MUSICIAN" },
  musician2: { email: "e2e.musico2@muve.test", role: "MUSICIAN" },
};
const DOCS = { contractor: "11222333000181", musician: "52998224725", musician2: "11144477735" };
const noSession = { auth: { persistSession: false, autoRefreshToken: false } };
let admin;
let local;
let criarSessao;

const png = () => new File([Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64")], "banner.png", { type: "image/png" });
let failures = 0;
function check(label, ok, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "ok  " : "FAIL"} ${label}${ok ? "" : ` -> ${detail}`}`);
}

export async function prepararE2E({ executar, lerArquivo, criarCliente, api }) {
  const ambiente = await carregarAmbienteLocal({ executar, lerArquivo });
  exigirLoopback(api, "API do E2E");
  const cliente = criarCliente(ambiente.supabaseUrl, ambiente.serviceRoleKey, noSession);
  const { data, error } = await cliente.auth.admin.listUsers({ perPage: 200 });
  if (error) throw error;
  const restantes = data.users.filter((u) => Object.values(USERS).some((t) => t.email === u.email));
  if (restantes.length) throw new Error("O banco local ainda tem contas do E2E. Rode pelo pnpm test:e2e, que reseta o Supabase local antes e depois.");
  return { ambiente, admin: cliente };
}

async function createUser(key) {
  const { email, role } = USERS[key];
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (error) throw error;
  const id = data.user.id;
  await admin.from("profiles").insert({ id, role }).throwOnError();
  const common = { user_id: id, telefone: "45999990000", foto_perfil_url: "https://placehold.co/200x200/png", uf: "PR", cidade: "Cascavel" };
  if (role === "MUSICIAN") {
    await admin.from("musician_profiles").insert({ ...common, nome_completo: key === "musician" ? "Ana Teste" : "Beto Teste", documento: DOCS[key], estilos_musicais: ["Rock", "MPB"], bio: "Conta de teste", chave_pix_tipo: "EMAIL", chave_pix: email }).throwOnError();
  } else {
    await admin.from("contractor_profiles").insert({ ...common, nome_fantasia: "Bar Teste", documento: DOCS[key] }).throwOnError();
  }
  const client = criarSessao(local.supabaseUrl, local.anonKey, noSession);
  const session = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (session.error) throw session.error;
  return { id, token: session.data.session.access_token, db: client };
}

async function api(user, method, path, body) {
  const headers = { Origin: "http://localhost:8443" };
  if (user) headers.Authorization = `Bearer ${user.token}`;
  if (body && !(body instanceof FormData)) headers["Content-Type"] = "application/json";
  const response = await fetch(`${API}${path}`, { method, headers, body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined });
  const json = response.status === 204 ? null : await response.json().catch(() => null);
  return { status: response.status, json, code: json?.error?.code };
}

const eventForm = (overrides = {}) => {
  const form = new FormData();
  form.append("dados", JSON.stringify({
    titulo: "Noite de rock (teste)", tipoEvento: "Bar e restaurante", inicio: new Date(Date.now() + 5 * 864e5).toISOString(),
    duracaoMinutos: 180, uf: "PR", cidade: "CASCAVEL", endereco: "Rua das Flores, 123 - Centro", estilosMusicais: ["Rock", "Forró"], cache: 450.5, descricao: "Evento de teste", ...overrides,
  }));
  form.append("imagem", png());
  return form;
};

export function exigirApiDoOrquestrador(apiIniciada) {
  if (!apiIniciada?.url || !apiIniciada.processo || apiIniciada.processo.exitCode !== null || apiIniciada.processo.signalCode !== null) {
    throw new AmbienteRecusado("Ambiente E2E recusado: o E2E só roda com a API iniciada pelo orquestrador (pnpm test:e2e).");
  }
  exigirLoopback(apiIniciada.url, "API do E2E");
  return apiIniciada.url;
}

async function dispararRotina(headers) {
  const response = await fetch(`${API}/admin/rotina-financeira`, { method: "POST", headers });
  const json = await response.json().catch(() => null);
  return { status: response.status, json };
}

async function execucaoDaRotina() {
  const { data, error } = await admin.from("rotina_financeira_execucao").select("dono, geracao, ultimo_resultado, ultimo_sucesso_em, ultimo_erro").eq("id", 1).single();
  if (error) throw error;
  return data;
}

async function aguardarFimDaRotina() {
  for (let tentativa = 0; tentativa < 50; tentativa++) {
    const execucao = await execucaoDaRotina();
    if (execucao.dono === null && execucao.ultimo_resultado !== null) return execucao;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return execucaoDaRotina();
}

async function rodarRotina(token) {
  const disparo = await dispararRotina({ "x-rotina-token": token });
  const execucao = await aguardarFimDaRotina();
  return disparo.status === 202 && execucao.dono === null && execucao.ultimo_resultado === "SUCESSO";
}

async function tentativasDoPagamento(asaasPaymentId) {
  const pagamento = await admin.from("payments").select("id, status, repasse_status").eq("asaas_payment_id", asaasPaymentId).single().throwOnError();
  const tentativas = await admin.from("repasse_tentativas").select("estado, origem").eq("payment_id", pagamento.data.id).throwOnError();
  return { pagamento: pagamento.data, tentativas: tentativas.data };
}

async function verificarRotinaFinanceira(token) {
  if (!token) throw new AmbienteRecusado("Ambiente E2E recusado: a API local foi iniciada sem token de disparo da rotina financeira.");
  let r = await dispararRotina({});
  check("rotina financeira sem token: 401", r.status === 401, JSON.stringify(r));
  r = await dispararRotina({ "x-rotina-token": "token-errado" });
  check("rotina financeira com token errado: 401", r.status === 401, JSON.stringify(r));
  r = await dispararRotina({ "x-rotina-token": token, "Content-Type": "application/json" });
  check("rotina financeira com token: 202 e iniciada", r.status === 202 && r.json?.resultado === "INICIADA", JSON.stringify(r));
  const execucao = await aguardarFimDaRotina();
  check("rotina financeira termina com sucesso e libera a trava", execucao.dono === null && execucao.ultimo_resultado === "SUCESSO" && execucao.ultimo_sucesso_em !== null, JSON.stringify(execucao));

  const outra = randomUUID();
  const { data: geracao, error } = await admin.rpc("adquirir_rotina_financeira", { p_dono: outra, p_validade_segundos: 60 });
  check("outra execução segura a trava no banco local", !error && geracao !== null, JSON.stringify(error ?? geracao));
  r = await dispararRotina({ "x-rotina-token": token });
  check("rotina financeira com execução ativa: 409 sem iniciar outra", r.status === 409 && r.json?.resultado === "EM_ANDAMENTO", JSON.stringify(r));
  const depois = await execucaoDaRotina();
  check("a execução ativa continua com o mesmo dono", depois.dono === outra && depois.geracao === geracao, JSON.stringify(depois));
  const { data: encerrada } = await admin.rpc("encerrar_rotina_financeira", { p_dono: outra, p_geracao: geracao, p_resultado: "SUCESSO", p_erro: null });
  check("a execução simulada encerra a própria trava", encerrada === true, JSON.stringify(encerrada));
}

export async function executarE2E({ apiIniciada, executar, lerArquivo, criarCliente = createClient }) {
  const url = exigirApiDoOrquestrador(apiIniciada);
  failures = 0;
  criarSessao = criarCliente;
  ({ ambiente: local, admin } = await prepararE2E({ executar, lerArquivo, criarCliente, api: url }));
  API = url;
  const c = await createUser("contractor");
  let r = await api(c, "GET", "/me");
  if (r.status !== 200 || r.json?.email !== USERS.contractor.email) {
    throw new AmbienteRecusado("Ambiente E2E recusado: a API não reconheceu a sessão criada no Supabase local, então não está ligada ao banco local.");
  }
  const m = await createUser("musician");
  const m2 = await createUser("musician2");

  await verificarRotinaFinanceira(apiIniciada.tokenDaRotina);

  check("GET /me devolve o perfil com documento", r.status === 200 && r.json.documento === DOCS.contractor && r.json.email === USERS.contractor.email, JSON.stringify(r));
  r = await api(null, "GET", "/me");
  check("GET /me sem token: 401", r.status === 401);
  const patch = new FormData();
  patch.append("dados", JSON.stringify({ nome: "Bar Teste Editado", telefone: "(45) 3222-1100", uf: "PR", cidade: "Cascavel" }));
  r = await api(c, "PATCH", "/me", patch);
  check("PATCH /me atualiza nome e telefone", r.status === 200 && r.json.nome === "Bar Teste Editado" && r.json.telefone === "4532221100", JSON.stringify(r));

  r = await api(m, "POST", "/events", eventForm());
  check("músico não cria evento: 403", r.status === 403, JSON.stringify(r));
  r = await api(c, "POST", "/events", eventForm({ cache: 50 }));
  check("cachê abaixo do mínimo: 400", r.status === 400, JSON.stringify(r));
  r = await api(c, "POST", "/events", eventForm({ inicio: new Date(Date.now() - 36e5).toISOString() }));
  check("evento no passado: 400", r.code === "DATA_NO_PASSADO", JSON.stringify(r));
  r = await api(c, "POST", "/events", eventForm());
  check("contratante cria evento: 201", r.status === 201 && r.json.id, JSON.stringify(r));
  const eventId = r.json.id;
  const { data: stored } = await admin.from("events").select("imagem_url, cache").eq("id", eventId).single();
  check("banner enviado ao Storage e cachê gravado", stored.imagem_url.includes("/event-banners/") && Number(stored.cache) === 450.5, JSON.stringify(stored));
  const endOwner = await c.db.from("event_locations").select("endereco").eq("event_id", eventId).maybeSingle();
  const endOther = await m.db.from("event_locations").select("endereco").eq("event_id", eventId).maybeSingle();
  check("endereço: dono lê, músico não", endOwner.data?.endereco === "Rua das Flores, 123 - Centro" && endOther.data === null, JSON.stringify([endOwner, endOther]));
  const banner = await fetch(stored.imagem_url);
  check("URL pública do banner responde", banner.ok, String(banner.status));

  let feed = await m.db.rpc("musician_feed", { p_raio_km: 0 });
  check("feed do músico traz o evento (cidade em caixa diferente)", feed.data?.some((e) => e.event_id === eventId), JSON.stringify(feed.error ?? feed.data));
  r = await api(c, "POST", "/events", eventForm({ titulo: "Rock em Toledo (teste)", cidade: "Toledo" }));
  const toledoId = r.json.id;
  const perto = await m.db.rpc("musician_feed", { p_raio_km: 50 });
  const longe = await m.db.rpc("musician_feed", { p_raio_km: 0 });
  check("feed por raio: Toledo aparece a ~38 km com raio 50 e some com raio 0", perto.data?.some((e) => e.event_id === toledoId && Number(e.distancia_km) > 30 && Number(e.distancia_km) < 45) && !longe.data?.some((e) => e.event_id === toledoId), JSON.stringify([perto.error ?? perto.data, longe.data]));
  r = await api(m, "POST", `/events/${toledoId}/candidatura`, {});
  check("músico se inscreve em cidade vizinha dentro do raio: 204", r.status === 204, JSON.stringify(r));
  await admin.from("events").delete().eq("id", toledoId);
  const others = await m.db.from("musician_profiles").select("user_id");
  check("músico só enxerga o próprio perfil", others.data?.length === 1, JSON.stringify(others));
  const cpf = await m.db.from("musician_profiles").select("documento");
  check("documento ilegível pelo cliente", Boolean(cpf.error), JSON.stringify(cpf.data));
  const pix = await m.db.from("musician_profiles").select("chave_pix");
  check("chave Pix ilegível pelo cliente", Boolean(pix.error));
  const rep = await m.db.from("contractor_profiles").select("nome_fantasia, avaliacao_media, total_avaliacoes").eq("user_id", c.id).single();
  check("músico vê a reputação do contratante", rep.data?.total_avaliacoes === 0, JSON.stringify(rep));
  const direct = await m.db.from("event_candidates").insert({ event_id: eventId, musician_id: m.id });
  check("cliente não grava candidatura direto no banco", Boolean(direct.error));

  r = await api(m, "POST", `/events/${eventId}/candidatura`, {});
  check("músico se inscreve: 204", r.status === 204, JSON.stringify(r));
  r = await api(m, "POST", `/events/${eventId}/candidatura`, {});
  check("inscrição duplicada: 409", r.code === "JA_INSCRITO", JSON.stringify(r));
  await admin.from("musician_profiles").update({ chave_pix: null, chave_pix_tipo: null }).eq("user_id", m2.id).throwOnError();
  r = await api(m2, "POST", `/events/${eventId}/candidatura`, {});
  check("perfil incompleto (sem chave Pix) não se candidata: 409 com o que falta", r.code === "PERFIL_INCOMPLETO" && r.json.error.message.includes("chave Pix"), JSON.stringify(r));
  await admin.from("musician_profiles").update({ chave_pix: USERS.musician2.email, chave_pix_tipo: "EMAIL" }).eq("user_id", m2.id).throwOnError();
  await api(m2, "POST", `/events/${eventId}/candidatura`, {});
  const cands = await c.db.from("event_candidates").select("id, musician:musician_profiles(user_id, nome_completo, avaliacao_media)").eq("event_id", eventId);
  check("contratante vê os 2 candidatos com perfil", cands.data?.length === 2 && cands.data.every((x) => x.musician?.nome_completo), JSON.stringify(cands.error ?? cands.data));
  const candidateId = cands.data.find((x) => x.musician.user_id === m.id).id;

  r = await api(c, "POST", `/me/favoritos/${m.id}`);
  check("favorito sem Muve Casa: 403", r.code === "RECURSO_CASA", JSON.stringify(r));
  await admin.from("contractor_profiles").update({ casa_ate: new Date(Date.now() + 30 * 864e5).toISOString() }).eq("user_id", c.id).throwOnError();
  r = await api(c, "POST", `/me/favoritos/${m.id}`);
  check("favorito de músico inscrito: 204", r.status === 204, JSON.stringify(r));
  const favoritado = await admin.from("contractor_favorites").select("musician_id").eq("contractor_id", c.id);
  check("favorito gravado no banco local", favoritado.data?.length === 1 && favoritado.data[0].musician_id === m.id, JSON.stringify(favoritado.error ?? favoritado.data));
  r = await api(c, "POST", `/me/favoritos/${randomUUID()}`);
  check("favorito de músico que não se inscreveu: 404", r.code === "MUSICO_NAO_ENCONTRADO", JSON.stringify(r));
  r = await api(m, "POST", `/me/favoritos/${m2.id}`);
  check("músico não favorita: 403", r.code === "PERFIL_NAO_AUTORIZADO", JSON.stringify(r));
  r = await api(c, "POST", "/events", eventForm({ titulo: "Convite (teste)" }));
  const conviteEventId = r.json.id;
  const convite = await fetch(`${API}/events/${conviteEventId}/convites`, {
    method: "POST",
    headers: { Origin: "http://localhost:8443", Authorization: `Bearer ${c.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ musicianId: m.id }),
  });
  const corpoDoConvite = await convite.text();
  check("convite responde 204 sem corpo", convite.status === 204 && corpoDoConvite === "", `${convite.status} ${corpoDoConvite}`);
  const convites = await admin.from("event_invites").select("musician_id").eq("event_id", conviteEventId);
  check("convite gravado uma vez no banco local", convites.data?.length === 1 && convites.data[0].musician_id === m.id, JSON.stringify(convites.error ?? convites.data));
  r = await api(c, "DELETE", `/me/favoritos/${m.id}`);
  check("remover favorito: 204", r.status === 204, JSON.stringify(r));
  const favoritos = await admin.from("contractor_favorites").select("musician_id").eq("contractor_id", c.id);
  check("favorito removido no banco local", favoritos.data?.length === 0, JSON.stringify(favoritos.error ?? favoritos.data));
  await admin.from("events").delete().eq("id", conviteEventId).throwOnError();
  await admin.from("contractor_profiles").update({ casa_ate: null }).eq("user_id", c.id).throwOnError();

  r = await api(m, "POST", `/events/${eventId}/checkout`, { candidateId });
  check("músico não aprova candidato: 404", r.status === 404, JSON.stringify(r));
  r = await api(c, "POST", `/events/${eventId}/checkout`, { candidateId });
  check("checkout sem Asaas configurada: 503 controlado", r.code === "PAGAMENTO_NAO_CONFIGURADO", JSON.stringify(r));
  r = await api(c, "GET", `/events/${eventId}/contratacao`);
  check("comprovante indisponível antes da contratação: 409", r.code === "EVENTO_NAO_CONTRATADO", JSON.stringify(r));
  r = await api(null, "POST", "/webhooks/asaas", { id: "evt", event: "PAYMENT_RECEIVED", payment: { id: "x" } });
  check("webhook sem token: 401", r.status === 401);

  await admin.from("payments").delete().eq("event_id", eventId);
  await admin.from("payments").insert({ event_id: eventId, candidate_id: candidateId, contractor_id: c.id, asaas_payment_id: "pay_e2e_1", valor: 495.55, valor_comissao: 45.05, expira_em: new Date(Date.now() + 9e5).toISOString() }).throwOnError();
  const confirmed = await admin.rpc("confirm_asaas_payment", { p_asaas_payment_id: "pay_e2e_1" });
  check("confirmação de pagamento contrata o músico", confirmed.data === "CONTRATADO", JSON.stringify(confirmed));
  r = await api(c, "DELETE", `/events/${eventId}`);
  check("evento contratado não pode ser excluído: 409", r.code === "EVENTO_BLOQUEADO", JSON.stringify(r));
  feed = await m2.db.rpc("musician_feed", { p_raio_km: 0 });
  check("evento contratado some do feed", !feed.data?.some((e) => e.event_id === eventId));

  r = await api(m, "GET", `/events/${eventId}/contratacao`);
  check("músico contratado vê endereço, contato e valores", r.json?.evento?.endereco === "Rua das Flores, 123 - Centro" && r.json?.contratante?.telefone === "4532221100" && r.json?.pagamento?.cache === 450.5 && r.json?.pagamento?.comissao === 45.05 && r.json?.pagamento?.repasseStatus === "RETIDO", JSON.stringify(r.json));
  check("comprovante não expõe documento nem chave Pix", !JSON.stringify(r.json).includes(DOCS.contractor) && !JSON.stringify(r.json).includes("chave"), JSON.stringify(r.json));
  r = await api(m2, "GET", `/events/${eventId}/contratacao`);
  check("músico não contratado não vê o comprovante: 404", r.status === 404, JSON.stringify(r));
  r = await api(c, "GET", `/events/${eventId}/contratacao`);
  check("contratante vê o telefone do músico", r.json?.musico?.telefone === "45999990000" && r.json?.papel === "contratante", JSON.stringify(r.json));
  const rotinaComContratado = await rodarRotina(apiIniciada.tokenDaRotina);
  let repasse = await tentativasDoPagamento("pay_e2e_1");
  check("rotina não repassa pagamento retido de evento ainda contratado", rotinaComContratado && repasse.pagamento.repasse_status === "RETIDO" && repasse.tentativas.length === 0, JSON.stringify(repasse));
  r = await api(m, "DELETE", "/me", { email: USERS.musician.email, password: PASSWORD });
  check("músico com show contratado não exclui a conta: 409", r.code === "CONTRATACAO_EM_ANDAMENTO", JSON.stringify(r));
  r = await api(m, "DELETE", `/events/${eventId}/contratacao`);
  check("desistência sem Asaas: falha controlada, contratação intacta", r.status === 503, JSON.stringify(r));

  r = await api(c, "POST", `/events/${eventId}/confirmacao`);
  check("confirmação antes do evento: 409", r.code === "EVENTO_NAO_INICIADO", JSON.stringify(r));
  await admin.from("events").update({ inicio: new Date(Date.now() - 36e5).toISOString() }).eq("id", eventId).throwOnError();
  r = await api(m2, "POST", `/events/${eventId}/confirmacao`);
  check("músico não contratado não confirma: 404", r.status === 404, JSON.stringify(r));
  r = await api(c, "POST", `/events/${eventId}/confirmacao`);
  check("contratante confirma; evento segue CONTRATADO", r.json?.status === "CONTRATADO", JSON.stringify(r));
  r = await api(c, "POST", `/events/${eventId}/avaliacao`, { rating: 5 });
  check("avaliação antes da conclusão: 409", r.code === "EVENTO_NAO_CONCLUIDO", JSON.stringify(r));
  r = await api(m, "POST", `/events/${eventId}/confirmacao`);
  check("músico confirma; evento CONCLUIDO", r.json?.status === "CONCLUIDO", JSON.stringify(r));
  r = await api(c, "POST", `/events/${eventId}/avaliacao`, { rating: 5, comment: "Show excelente (teste)" });
  check("contratante avalia o músico: 204", r.status === 204, JSON.stringify(r));
  r = await api(c, "POST", `/events/${eventId}/avaliacao`, { rating: 1 });
  check("avaliação duplicada: 409", r.code === "JA_AVALIADO", JSON.stringify(r));
  r = await api(m, "POST", `/events/${eventId}/avaliacao`, { rating: 4 });
  check("músico avalia o contratante: 204", r.status === 204, JSON.stringify(r));
  r = await api(m, "GET", "/me");
  check("média do músico atualizada", r.json?.avaliacaoMedia === 5 && r.json?.totalAvaliacoes === 1, JSON.stringify(r.json));
  r = await api(c, "GET", "/me");
  check("média do contratante atualizada", r.json?.avaliacaoMedia === 4 && r.json?.totalAvaliacoes === 1, JSON.stringify(r.json));
  r = await api(c, "GET", `/events/${eventId}/contratacao`);
  await api(m, "GET", `/events/${eventId}/contratacao`);
  await api(c, "GET", `/events/${eventId}/contratacao`);
  check("show concluído e consultado: o repasse continua RETIDO", r.json?.evento?.status === "CONCLUIDO" && r.json?.pagamento?.repasseStatus === "RETIDO", JSON.stringify(r.json?.pagamento));
  const tentativas = await admin.from("repasse_tentativas").select("estado").eq("payment_id", (await admin.from("payments").select("id").eq("asaas_payment_id", "pay_e2e_1").single()).data?.id);
  check("consultas da contratação não criam tentativa de repasse", tentativas.data?.length === 0, JSON.stringify(tentativas.error ?? tentativas.data));

  const rotinaComConcluido = await rodarRotina(apiIniciada.tokenDaRotina);
  repasse = await tentativasDoPagamento("pay_e2e_1");
  check("rotina encontra o pagamento retido do show concluído e abre uma tentativa (sem Asaas, termina como FALHOU)", rotinaComConcluido && repasse.pagamento.repasse_status === "FALHOU" && repasse.tentativas.length === 1 && repasse.tentativas[0].estado === "FALHOU" && repasse.tentativas[0].origem === "ATUAL", JSON.stringify(repasse));
  const rotinaRepetida = await rodarRotina(apiIniciada.tokenDaRotina);
  await api(c, "GET", `/events/${eventId}/contratacao`);
  repasse = await tentativasDoPagamento("pay_e2e_1");
  check("rotina e consulta repetidas não tentam de novo o repasse que falhou", rotinaRepetida && repasse.pagamento.repasse_status === "FALHOU" && repasse.tentativas.length === 1, JSON.stringify(repasse));

  await admin.from("payments").update({ repasse_status: "RETIDO", multa_descontada: 0 }).eq("asaas_payment_id", "pay_e2e_1").throwOnError();
  await admin.from("events").update({ status: "CANCELADO" }).eq("id", eventId).throwOnError();
  const rotinaComCancelado = await rodarRotina(apiIniciada.tokenDaRotina);
  repasse = await tentativasDoPagamento("pay_e2e_1");
  check("rotina encontra o pagamento retido de evento cancelado (dados preparados)", rotinaComCancelado && repasse.pagamento.repasse_status === "FALHOU" && repasse.tentativas.length === 2, JSON.stringify(repasse));

  await admin.from("payments").update({ status: "ESTORNADO", repasse_status: "RETIDO" }).eq("asaas_payment_id", "pay_e2e_1").throwOnError();
  await admin.from("events").update({ status: "CONCLUIDO" }).eq("id", eventId).throwOnError();
  const rotinaComEstornado = await rodarRotina(apiIniciada.tokenDaRotina);
  repasse = await tentativasDoPagamento("pay_e2e_1");
  check("rotina ignora pagamento estornado de evento concluído (dados preparados)", rotinaComEstornado && repasse.pagamento.repasse_status === "RETIDO" && repasse.tentativas.length === 2, JSON.stringify(repasse));

  r = await api(m2, "DELETE", "/me", { email: USERS.musician2.email, password: "senha-errada" });
  check("exclusão com senha errada: 400", r.code === "CREDENCIAIS_NAO_CONFEREM", JSON.stringify(r));
  r = await api(m2, "DELETE", "/me", { email: USERS.musician2.email, password: PASSWORD });
  check("exclusão de conta: 204", r.status === 204, JSON.stringify(r));
  const docLivre = await admin.from("musician_profiles").select("user_id").eq("documento", DOCS.musician2).maybeSingle();
  check("documento da conta excluída fica livre para novo cadastro (sem lista de bloqueio)", docLivre.data === null, JSON.stringify(docLivre));

  console.log(failures ? `\n${failures} verificação(ões) falharam` : "\nTodas as verificações passaram");
  return failures;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.error("Este arquivo não roda sozinho. Use pnpm test:e2e: o orquestrador sobe o Supabase e a API locais e só então executa o E2E.");
  process.exitCode = 1;
}
