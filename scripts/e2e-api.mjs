// Verificação ponta a ponta: exercita a API local (pnpm dev:api) contra o projeto
// Supabase configurado em backend/.env, com contas de teste temporárias criadas
// já confirmadas (nenhum e-mail é enviado). Ao final de "run", duas contas de
// teste permanecem para inspeção manual; "cleanup" remove tudo.
//
//   node scripts/e2e-api.mjs run       (ou: pnpm test:e2e)
//   node scripts/e2e-api.mjs cleanup
//
// A API limita cadastros e exclusões a 10 por IP a cada 10 minutos: rodar o
// script várias vezes seguidas faz essas verificações falharem com 429.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync("backend/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
);
const API = "http://localhost:3333/api";
const PASSWORD = "Teste-e2e-123";
const USERS = {
  contractor: { email: "e2e.contratante@muve.test", role: "CONTRACTOR" },
  musician: { email: "e2e.musico@muve.test", role: "MUSICIAN" },
  musician2: { email: "e2e.musico2@muve.test", role: "MUSICIAN" },
};
const DOCS = { contractor: "11222333000181", musician: "52998224725", musician2: "11144477735" };
const noSession = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, noSession);

const png = () => new File([Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64")], "banner.png", { type: "image/png" });
let failures = 0;
function check(label, ok, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "ok  " : "FAIL"} ${label}${ok ? "" : ` -> ${detail}`}`);
}

async function cleanup() {
  const { data } = await admin.auth.admin.listUsers({ perPage: 200 });
  for (const user of data.users.filter((u) => Object.values(USERS).some((t) => t.email === u.email))) {
    for (const bucket of ["avatars", "event-banners"]) {
      const { data: files } = await admin.storage.from(bucket).list(user.id);
      if (files?.length) await admin.storage.from(bucket).remove(files.map((f) => `${user.id}/${f.name}`));
    }
    await admin.from("payments").delete().eq("contractor_id", user.id);
    await admin.auth.admin.deleteUser(user.id);
  }
  await admin.from("payments").delete().like("asaas_payment_id", "pay_e2e_%");
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
  const client = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, noSession);
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

async function run() {
  await cleanup();
  const c = await createUser("contractor");
  const m = await createUser("musician");
  const m2 = await createUser("musician2");

  // --- conta
  let r = await api(c, "GET", "/me");
  check("GET /me devolve o perfil com documento", r.status === 200 && r.json.documento === DOCS.contractor && r.json.email === USERS.contractor.email, JSON.stringify(r));
  r = await api(null, "GET", "/me");
  check("GET /me sem token: 401", r.status === 401);
  const patch = new FormData();
  patch.append("dados", JSON.stringify({ nome: "Bar Teste Editado", telefone: "(45) 3222-1100", uf: "PR", cidade: "Cascavel" }));
  r = await api(c, "PATCH", "/me", patch);
  check("PATCH /me atualiza nome e telefone", r.status === 200 && r.json.nome === "Bar Teste Editado" && r.json.telefone === "4532221100", JSON.stringify(r));

  // --- eventos
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

  // --- feed (RLS + função de match, com o cliente do músico)
  let feed = await m.db.rpc("musician_feed", { p_raio_km: 0 });
  check("feed do músico traz o evento (cidade em caixa diferente)", feed.data?.some((e) => e.event_id === eventId), JSON.stringify(feed.error ?? feed.data));
  r = await api(c, "POST", "/events", eventForm({ titulo: "Rock em Toledo (teste)", cidade: "Toledo" }));
  const toledoId = r.json.id;
  const perto = await m.db.rpc("musician_feed", { p_raio_km: 50 });
  const longe = await m.db.rpc("musician_feed", { p_raio_km: 0 });
  check("feed por raio: Toledo aparece a ~38 km com raio 50 e some com raio 0", perto.data?.some((e) => e.event_id === toledoId && Number(e.distancia_km) > 30 && Number(e.distancia_km) < 45) && !longe.data?.some((e) => e.event_id === toledoId), JSON.stringify([perto.error ?? perto.data, longe.data]));
  r = await api(m, "POST", `/events/${toledoId}/candidatura`);
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

  // --- candidaturas
  r = await api(m, "POST", `/events/${eventId}/candidatura`);
  check("músico se inscreve: 204", r.status === 204, JSON.stringify(r));
  r = await api(m, "POST", `/events/${eventId}/candidatura`);
  check("inscrição duplicada: 409", r.code === "JA_INSCRITO", JSON.stringify(r));
  await admin.from("musician_profiles").update({ chave_pix: null, chave_pix_tipo: null }).eq("user_id", m2.id).throwOnError();
  r = await api(m2, "POST", `/events/${eventId}/candidatura`);
  check("perfil incompleto (sem chave Pix) não se candidata: 409 com o que falta", r.code === "PERFIL_INCOMPLETO" && r.json.error.message.includes("chave Pix"), JSON.stringify(r));
  await admin.from("musician_profiles").update({ chave_pix: USERS.musician2.email, chave_pix_tipo: "EMAIL" }).eq("user_id", m2.id).throwOnError();
  await api(m2, "POST", `/events/${eventId}/candidatura`);
  const cands = await c.db.from("event_candidates").select("id, musician:musician_profiles(user_id, nome_completo, avaliacao_media)").eq("event_id", eventId);
  check("contratante vê os 2 candidatos com perfil", cands.data?.length === 2 && cands.data.every((x) => x.musician?.nome_completo), JSON.stringify(cands.error ?? cands.data));
  const candidateId = cands.data.find((x) => x.musician.user_id === m.id).id;

  // --- checkout (sem chave da Asaas configurada)
  r = await api(m, "POST", `/events/${eventId}/checkout`, { candidateId });
  check("músico não aprova candidato: 404", r.status === 404, JSON.stringify(r));
  r = await api(c, "POST", `/events/${eventId}/checkout`, { candidateId });
  check(env.ASAAS_API_KEY ? "checkout gera cobrança Pix com comissão: 201" : "checkout sem Asaas configurada: 503 controlado", env.ASAAS_API_KEY ? r.status === 201 && Boolean(r.json.pixCopiaCola) && r.json.valor === 495.55 : r.code === "PAGAMENTO_NAO_CONFIGURADO", JSON.stringify(r));
  r = await api(c, "GET", `/events/${eventId}/contratacao`);
  check("comprovante indisponível antes da contratação: 409", r.code === "EVENTO_NAO_CONTRATADO", JSON.stringify(r));
  r = await api(null, "POST", "/webhooks/asaas", { id: "evt", event: "PAYMENT_RECEIVED", payment: { id: "x" } });
  check("webhook sem token: 401", r.status === 401);

  // --- pagamento confirmado (simulado direto no banco, como faria o webhook)
  await admin.from("payments").delete().eq("event_id", eventId);
  await admin.from("payments").insert({ event_id: eventId, candidate_id: candidateId, contractor_id: c.id, asaas_payment_id: "pay_e2e_1", valor: 495.55, valor_comissao: 45.05, expira_em: new Date(Date.now() + 9e5).toISOString() }).throwOnError();
  const confirmed = await admin.rpc("confirm_asaas_payment", { p_asaas_payment_id: "pay_e2e_1" });
  check("confirmação de pagamento contrata o músico", confirmed.data === "CONTRATADO", JSON.stringify(confirmed));
  r = await api(c, "DELETE", `/events/${eventId}`);
  check("evento contratado não pode ser excluído: 409", r.code === "EVENTO_BLOQUEADO", JSON.stringify(r));
  feed = await m2.db.rpc("musician_feed", { p_raio_km: 0 });
  check("evento contratado some do feed", !feed.data?.some((e) => e.event_id === eventId));

  // --- comprovante da contratação
  r = await api(m, "GET", `/events/${eventId}/contratacao`);
  check("músico contratado vê endereço, contato e valores", r.json?.evento?.endereco === "Rua das Flores, 123 - Centro" && r.json?.contratante?.telefone === "4532221100" && r.json?.pagamento?.cache === 450.5 && r.json?.pagamento?.comissao === 45.05 && r.json?.pagamento?.repasseStatus === "RETIDO", JSON.stringify(r.json));
  check("comprovante não expõe documento nem chave Pix", !JSON.stringify(r.json).includes(DOCS.contractor) && !JSON.stringify(r.json).includes("chave"), JSON.stringify(r.json));
  r = await api(m2, "GET", `/events/${eventId}/contratacao`);
  check("músico não contratado não vê o comprovante: 404", r.status === 404, JSON.stringify(r));
  r = await api(c, "GET", `/events/${eventId}/contratacao`);
  check("contratante vê o telefone do músico", r.json?.musico?.telefone === "45999990000" && r.json?.papel === "contratante", JSON.stringify(r.json));
  r = await api(m, "DELETE", "/me", { email: USERS.musician.email, password: PASSWORD });
  check("músico com show contratado não exclui a conta: 409", r.code === "CONTRATACAO_EM_ANDAMENTO", JSON.stringify(r));
  r = await api(m, "DELETE", `/events/${eventId}/contratacao`);
  check(env.ASAAS_API_KEY ? "músico desiste: estorno e evento reaberto" : "desistência sem Asaas: falha controlada, contratação intacta", env.ASAAS_API_KEY ? r.json?.reembolsado === true : r.status === 503, JSON.stringify(r));

  // --- conclusão e avaliação
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
  check(env.ASAAS_API_KEY ? "repasse ao músico solicitado após a conclusão" : "repasse sem Asaas: registrado como FALHOU para nova tentativa", env.ASAAS_API_KEY ? ["PROCESSANDO", "REPASSADO"].includes(r.json?.pagamento?.repasseStatus) : r.json?.pagamento?.repasseStatus === "FALHOU", JSON.stringify(r.json?.pagamento));

  // --- exclusão de conta (músico 2, sem contratação em andamento)
  r = await api(m2, "DELETE", "/me", { email: USERS.musician2.email, password: "senha-errada" });
  check("exclusão com senha errada: 400", r.code === "CREDENCIAIS_NAO_CONFEREM", JSON.stringify(r));
  r = await api(m2, "DELETE", "/me", { email: USERS.musician2.email, password: PASSWORD });
  check("exclusão de conta: 204", r.status === 204, JSON.stringify(r));
  const docLivre = await admin.from("musician_profiles").select("user_id").eq("documento", DOCS.musician2).maybeSingle();
  check("documento da conta excluída fica livre para novo cadastro (sem lista de bloqueio)", docLivre.data === null, JSON.stringify(docLivre));

  console.log(failures ? `\n${failures} verificação(ões) falharam` : "\nTodas as verificações passaram");
  process.exit(failures ? 1 : 0);
}

if (process.argv[2] === "cleanup") cleanup().then(() => console.log("contas e dados de teste removidos"));
else run().catch((error) => { console.error(error); process.exit(1); });
