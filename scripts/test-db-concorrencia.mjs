import { execFileSync, spawn } from "node:child_process";
import { readFileSync } from "node:fs";

const CONTAINER = "supabase_db_muve";

function containerLocalAtivo() {
  try {
    return execFileSync("docker", ["inspect", "-f", "{{.State.Running}}", CONTAINER], { encoding: "utf8" }).trim() === "true";
  } catch {
    return false;
  }
}

function psql(sql, usuario = "postgres") {
  return execFileSync("docker", ["exec", "-i", CONTAINER, "psql", "-U", usuario, "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-At"], { input: sql, encoding: "utf8" }).trim();
}

function psqlEmParalelo(sql) {
  return new Promise((resolve) => {
    const inicio = Date.now();
    const sessao = spawn("docker", ["exec", "-i", CONTAINER, "psql", "-U", "postgres", "-d", "postgres", "-At"]);
    let saida = "";
    sessao.stdout.on("data", (parte) => (saida += parte));
    sessao.stderr.on("data", (parte) => (saida += parte));
    sessao.on("close", () => resolve({ saida: saida.trim(), ms: Date.now() - inicio }));
    sessao.stdin.end(sql);
  });
}

const id = (prefixo, n) => `00000000-0000-0000-0000-${prefixo}${String(n).padStart(6, "0")}`;
const espera = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function preparar(n) {
  const musico = id("c0c0a1", n);
  const contratante = id("c0c0c1", n);
  const evento = id("c0c0e1", n);
  const candidatura = id("c0c0d1", n);
  const pagamento = id("c0c0f1", n);
  psql(`
    insert into auth.users (id, email) values ('${musico}', 'conc-musico-${n}@example.com'), ('${contratante}', 'conc-contratante-${n}@example.com');
    insert into public.profiles (id, role) values ('${musico}', 'MUSICIAN'), ('${contratante}', 'CONTRACTOR');
    insert into public.musician_profiles (user_id, nome_completo, documento, telefone, foto_perfil_url, estilos_musicais, uf, cidade)
      values ('${musico}', 'Musico Concorrencia', '9${String(n).padStart(10, "0")}', '45999990099', 'https://x/a.png', '{Rock}', 'PR', 'Cascavel');
    insert into public.contractor_profiles (user_id, nome_fantasia, documento, telefone, foto_perfil_url, uf, cidade)
      values ('${contratante}', 'Bar Concorrencia', '9${String(n).padStart(13, "0")}', '4532220099', 'https://x/c.png', 'PR', 'Cascavel');
    insert into public.events (id, contractor_id, titulo, tipo_evento, inicio, duracao_minutos, uf, cidade, estilos_musicais, cache, imagem_url)
      values ('${evento}', '${contratante}', 'Concorrencia', 'Bar e restaurante', now() + interval '2 days', 120, 'PR', 'Cascavel', '{Rock}', 500, 'https://x/e.png');
    insert into public.event_candidates (id, event_id, musician_id) values ('${candidatura}', '${evento}', '${musico}');
    insert into public.payments (id, event_id, candidate_id, contractor_id, asaas_payment_id, valor, valor_comissao, expira_em)
      values ('${pagamento}', '${evento}', '${candidatura}', '${contratante}', 'pay_conc_${n}', 550, 50, now() + interval '15 minutes');
    select public.confirm_asaas_payment('pay_conc_${n}');
    select public.claim_asaas_refund('${pagamento}', 'NAO_COMPARECIMENTO');
  `);
  return { musico, contratante, pagamento };
}

function prepararMulta(n) {
  const musico = id("c1c1a1", n);
  const contratante = id("c1c1c1", n);
  const pagamentos = [1, 2].map((k) => id(`c1c1f${k}`, n));
  psql(`
    insert into auth.users (id, email) values ('${musico}', 'mult-musico-${n}@example.com'), ('${contratante}', 'mult-contratante-${n}@example.com');
    insert into public.profiles (id, role) values ('${musico}', 'MUSICIAN'), ('${contratante}', 'CONTRACTOR');
    insert into public.musician_profiles (user_id, nome_completo, documento, telefone, foto_perfil_url, estilos_musicais, uf, cidade)
      values ('${musico}', 'Musico Multa', '8${String(n).padStart(10, "0")}', '45999990098', 'https://x/a.png', '{Rock}', 'PR', 'Cascavel');
    insert into public.contractor_profiles (user_id, nome_fantasia, documento, telefone, foto_perfil_url, uf, cidade)
      values ('${contratante}', 'Bar Multa', '8${String(n).padStart(13, "0")}', '4532220098', 'https://x/c.png', 'PR', 'Cascavel');
    ${[1, 2].map((k) => `
      insert into public.events (id, contractor_id, titulo, tipo_evento, inicio, duracao_minutos, uf, cidade, estilos_musicais, cache, imagem_url)
        values ('${id(`c1c1e${k}`, n)}', '${contratante}', 'Multa ${k}', 'Bar e restaurante', now() + interval '${k * 2} days', 60, 'PR', 'Cascavel', '{Rock}', 500, 'https://x/e.png');
      insert into public.event_candidates (id, event_id, musician_id) values ('${id(`c1c1d${k}`, n)}', '${id(`c1c1e${k}`, n)}', '${musico}');
      insert into public.payments (id, event_id, candidate_id, contractor_id, asaas_payment_id, valor, valor_comissao, expira_em)
        values ('${pagamentos[k - 1]}', '${id(`c1c1e${k}`, n)}', '${id(`c1c1d${k}`, n)}', '${contratante}', 'pay_mult_${n}_${k}', 550, 50, now() + interval '15 minutes');
      select public.confirm_asaas_payment('pay_mult_${n}_${k}');`).join("")}
    insert into public.penalties (musician_id, tipo, multa) values ('${musico}', 'AUSENCIA', 100);
  `);
  return { musico, pagamentos };
}

function reservas({ musico, pagamentos }) {
  const [porPagamento, total, descontos] = psql(`
    select string_agg(coalesce(reserva_payment_id::text, 'livre'), ',') from public.penalties where musician_id = '${musico}';
    select count(*) filter (where reserva_payment_id is not null) from public.penalties where musician_id = '${musico}';
    select string_agg(multa_descontada::text, ',' order by multa_descontada) from public.payments where id in ('${pagamentos[0]}', '${pagamentos[1]}');
  `).split("\n");
  return { porPagamento, reservadas: Number(total), descontos };
}

function prepararTentativa(n) {
  const musico = id("c2c2a1", n);
  const contratante = id("c2c2c1", n);
  const pagamento = id("c2c2f1", n);
  const tentativa = psql(`
    insert into auth.users (id, email) values ('${musico}', 'tent-musico-${n}@example.com'), ('${contratante}', 'tent-contratante-${n}@example.com');
    insert into public.profiles (id, role) values ('${musico}', 'MUSICIAN'), ('${contratante}', 'CONTRACTOR');
    insert into public.musician_profiles (user_id, nome_completo, documento, telefone, foto_perfil_url, estilos_musicais, uf, cidade)
      values ('${musico}', 'Musico Tentativa', '7${String(n).padStart(10, "0")}', '45999990097', 'https://x/a.png', '{Rock}', 'PR', 'Cascavel');
    insert into public.contractor_profiles (user_id, nome_fantasia, documento, telefone, foto_perfil_url, uf, cidade)
      values ('${contratante}', 'Bar Tentativa', '7${String(n).padStart(13, "0")}', '4532220097', 'https://x/c.png', 'PR', 'Cascavel');
    insert into public.events (id, contractor_id, titulo, tipo_evento, inicio, duracao_minutos, uf, cidade, estilos_musicais, cache, imagem_url)
      values ('${id("c2c2e1", n)}', '${contratante}', 'Tentativa', 'Bar e restaurante', now() + interval '2 days', 60, 'PR', 'Cascavel', '{Rock}', 500, 'https://x/e.png');
    insert into public.event_candidates (id, event_id, musician_id) values ('${id("c2c2d1", n)}', '${id("c2c2e1", n)}', '${musico}');
    insert into public.payments (id, event_id, candidate_id, contractor_id, asaas_payment_id, valor, valor_comissao, expira_em)
      values ('${pagamento}', '${id("c2c2e1", n)}', '${id("c2c2d1", n)}', '${contratante}', 'pay_tent_${n}', 550, 50, now() + interval '15 minutes');
    select public.confirm_asaas_payment('pay_tent_${n}');
    insert into public.penalties (musician_id, tipo, multa) values ('${musico}', 'AUSENCIA', 100);
    select tentativa_id from public.claim_payout('${pagamento}');
  `).split("\n").at(-1);
  return { musico, pagamento, tentativa };
}

function prepararContestacao(n, { confirmado = true } = {}) {
  const musico = id("c3c3a1", n);
  const contratante = id("c3c3c1", n);
  const evento = id("c3c3e1", n);
  const pagamento = id("c3c3f1", n);
  psql(`
    insert into auth.users (id, email) values ('${musico}', 'disp-musico-${n}@example.com'), ('${contratante}', 'disp-contratante-${n}@example.com');
    insert into public.profiles (id, role) values ('${musico}', 'MUSICIAN'), ('${contratante}', 'CONTRACTOR');
    insert into public.musician_profiles (user_id, nome_completo, documento, telefone, foto_perfil_url, estilos_musicais, uf, cidade)
      values ('${musico}', 'Musico Disputa', '6${String(n).padStart(10, "0")}', '45999990096', 'https://x/a.png', '{Rock}', 'PR', 'Cascavel');
    insert into public.contractor_profiles (user_id, nome_fantasia, documento, telefone, foto_perfil_url, uf, cidade)
      values ('${contratante}', 'Bar Disputa', '6${String(n).padStart(13, "0")}', '4532220096', 'https://x/c.png', 'PR', 'Cascavel');
    insert into public.events (id, contractor_id, titulo, tipo_evento, inicio, duracao_minutos, uf, cidade, estilos_musicais, cache, imagem_url)
      values ('${evento}', '${contratante}', 'Disputa', 'Bar e restaurante', now() + interval '2 days', 60, 'PR', 'Cascavel', '{Rock}', 500, 'https://x/e.png');
    insert into public.event_candidates (id, event_id, musician_id) values ('${id("c3c3d1", n)}', '${evento}', '${musico}');
    insert into public.payments (id, event_id, candidate_id, contractor_id, asaas_payment_id, valor, valor_comissao, expira_em)
      values ('${pagamento}', '${evento}', '${id("c3c3d1", n)}', '${contratante}', 'pay_disp_${n}', 550, 50, now() + interval '15 minutes');
    ${confirmado ? `select public.confirm_asaas_payment('pay_disp_${n}');` : ""}
    insert into public.penalties (musician_id, tipo, multa) values ('${musico}', 'AUSENCIA', 100);
  `);
  return { musico, contratante, evento, pagamento, cobranca: `pay_disp_${n}` };
}

const contestar = ({ evento, contratante }) =>
  `select resultado from public.abrir_contestacao('${evento}', '${contratante}', 'O show não aconteceu como combinado.');`;
const reivindicar = ({ pagamento }) => `select tentativa_id is not null from public.claim_payout('${pagamento}');`;

function situacaoDaContestacao({ evento, pagamento, musico }) {
  const [abertas, tentativas, repasse, reservadas] = psql(`
    select count(*) from public.disputes where event_id = '${evento}' and status = 'ABERTA';
    select count(*) from public.repasse_tentativas where payment_id = '${pagamento}';
    select repasse_status::text from public.payments where id = '${pagamento}';
    select count(*) from public.penalties where musician_id = '${musico}' and reserva_payment_id is not null;
  `).split("\n");
  return { contestacoes: Number(abertas), tentativas: Number(tentativas), repasse, reservadas: Number(reservadas) };
}

function emVerificacao(n) {
  const preparada = prepararTentativa(n);
  const { tentativa } = preparada;
  psql(`
    select public.marcar_tentativa_inconclusiva('${tentativa}');
    update public.repasse_tentativas set solicitada_em = now() - interval '25 hours' where id = '${tentativa}';
    select public.iniciar_verificacao_ausencia('${tentativa}', 'Ana Suporte', '${tentativa}', current_date - 30, now(), true, 1, 0, 0);
    update public.repasse_tentativas set verificacao_iniciada_em = now() - interval '61 minutes' where id = '${tentativa}';
  `);
  return preparada;
}

const confirmar = (tentativa) =>
  `select public.confirmar_ausencia('${tentativa}', 'Ana Suporte', public.declaracao_ausencia_repasse(), '${tentativa}', current_date - 30, now(), true, 1, 0, 0);`;

function situacao({ pagamento, musico }) {
  const [abertas, estados, repasse, reservadas, quitadas, alertas, confirmacoes] = psql(`
    select count(*) from public.repasse_tentativas where payment_id = '${pagamento}' and encerrada_em is null;
    select string_agg(estado, ',' order by created_at, id) from public.repasse_tentativas where payment_id = '${pagamento}';
    select repasse_status::text from public.payments where id = '${pagamento}';
    select count(*) from public.penalties where musician_id = '${musico}' and reserva_payment_id is not null and quitada_em is null;
    select count(*) from public.penalties where musician_id = '${musico}' and quitada_em is not null;
    select coalesce(string_agg(a.tipo, ',' order by a.tipo), '') from public.repasse_alertas a join public.repasse_tentativas t on t.id = a.tentativa_id where t.payment_id = '${pagamento}';
    select count(*) from public.repasse_decisoes d join public.repasse_tentativas t on t.id = d.tentativa_id where t.payment_id = '${pagamento}' and d.etapa = 'CONFIRMACAO';
  `).split("\n");
  return { abertas: Number(abertas), estados, repasse, reservadas: Number(reservadas), quitadas: Number(quitadas), alertas, confirmacoes: Number(confirmacoes) };
}

const LIBERAR_TRAVA_DA_ROTINA = "update public.rotina_financeira_execucao set dono = null, iniciada_em = null, valida_ate = null where id = 1;";

function limpar() {
  psql(LIBERAR_TRAVA_DA_ROTINA);
  psql(`
    set session_replication_role = replica;
    delete from public.repasse_alertas where tentativa_id in (select t.id from public.repasse_tentativas t join public.payments p on p.id = t.payment_id where p.asaas_payment_id like 'pay_conc_%' or p.asaas_payment_id like 'pay_mult_%' or p.asaas_payment_id like 'pay_tent_%' or p.asaas_payment_id like 'pay_disp_%');
  `, "supabase_admin");
  psql(`
    delete from public.repasse_decisoes where tentativa_id in (select t.id from public.repasse_tentativas t join public.payments p on p.id = t.payment_id where p.asaas_payment_id like 'pay_conc_%' or p.asaas_payment_id like 'pay_mult_%' or p.asaas_payment_id like 'pay_tent_%' or p.asaas_payment_id like 'pay_disp_%');
    delete from public.repasse_tentativas where payment_id in (select id from public.payments where asaas_payment_id like 'pay_conc_%' or asaas_payment_id like 'pay_mult_%' or asaas_payment_id like 'pay_tent_%' or asaas_payment_id like 'pay_disp_%');
    delete from public.penalties where musician_id::text like '00000000-0000-0000-0000-c0c0a1%' or musician_id::text like '00000000-0000-0000-0000-c1c1a1%' or musician_id::text like '00000000-0000-0000-0000-c2c2a1%' or musician_id::text like '00000000-0000-0000-0000-c3c3a1%';
    delete from public.payments where asaas_payment_id like 'pay_conc_%' or asaas_payment_id like 'pay_mult_%' or asaas_payment_id like 'pay_tent_%' or asaas_payment_id like 'pay_disp_%';
    delete from public.events where id::text like '00000000-0000-0000-0000-c0c0e1%' or id::text like '00000000-0000-0000-0000-c1c1e%' or id::text like '00000000-0000-0000-0000-c2c2e1%' or id::text like '00000000-0000-0000-0000-c3c3e1%';
    delete from auth.users where email like 'conc-%@example.com' or email like 'mult-%@example.com' or email like 'tent-%@example.com' or email like 'disp-%@example.com';
  `);
}

function estado({ musico, pagamento }) {
  const [penalidades, visibilidade, status] = psql(`
    select count(*) from public.penalties where estorno_payment_id = '${pagamento}';
    select (visibilidade_reduzida_ate is not null)::text from public.musician_profiles where user_id = '${musico}';
    select status::text from public.payments where id = '${pagamento}';
  `).split("\n");
  return { penalidades: Number(penalidades), visibilidade: visibilidade === "true", status };
}

const resultados = [];
const confere = (nome, ok, detalhe) => resultados.push({ nome, ok, detalhe });

if (!containerLocalAtivo()) {
  console.error(`O contêiner local ${CONTAINER} não está rodando. Suba o banco local com "npx supabase start"; este teste nunca usa o banco compartilhado.`);
  process.exit(1);
}

try {
  limpar();

  const travado = preparar(1);
  const primeira = psqlEmParalelo(`begin; select public.finalize_asaas_refund('${travado.pagamento}'); select pg_sleep(3); commit;`);
  await espera(1000);
  const segunda = psqlEmParalelo(`select public.finalize_asaas_refund('${travado.pagamento}');`);
  const [a, b] = await Promise.all([primeira, segunda]);
  const final = estado(travado);
  confere("sessão que pegou a trava confirma o estorno", a.saida.includes("CONFIRMADO"), a.saida.replace(/\n/g, " | "));
  confere("sessão concorrente espera a trava e recebe JA_PROCESSADO", b.saida === "JA_PROCESSADO" && b.ms >= 1500, `${b.saida} em ${b.ms} ms`);
  confere("uma única penalidade e visibilidade aplicada", final.penalidades === 1 && final.visibilidade && final.status === "ESTORNADO", JSON.stringify(final));

  for (let n = 2; n <= 6; n++) {
    const corrida = preparar(n);
    const sessoes = await Promise.all([1, 2, 3].map(() => psqlEmParalelo(`select public.finalize_asaas_refund('${corrida.pagamento}');`)));
    const saidas = sessoes.map((s) => s.saida).sort();
    const depois = estado(corrida);
    confere(
      `corrida ${n - 1}: três sessões simultâneas, uma confirma e duas recebem JA_PROCESSADO`,
      saidas.join(",") === "CONFIRMADO,JA_PROCESSADO,JA_PROCESSADO" && depois.penalidades === 1,
      `${saidas.join(", ")}; penalidades: ${depois.penalidades}`,
    );
  }

  const disputa = prepararMulta(1);
  const repasseA = psqlEmParalelo(`begin; select tentativa_id is not null, desconto from public.claim_payout('${disputa.pagamentos[0]}'); select pg_sleep(3); commit;`);
  await espera(1000);
  const repasseB = psqlEmParalelo(`select tentativa_id is not null, desconto from public.claim_payout('${disputa.pagamentos[1]}');`);
  const [ra, rb] = await Promise.all([repasseA, repasseB]);
  const estadoDisputa = reservas(disputa);
  confere("repasse que pegou a trava reserva a multa", ra.saida.includes("t|100.00"), ra.saida.replace(/\n/g, " | "));
  confere("repasse concorrente do mesmo músico espera a trava e não reserva a mesma multa", rb.saida === "t|0.00" && rb.ms >= 1500, `${rb.saida} em ${rb.ms} ms`);
  confere("a multa fica reservada por um único repasse", estadoDisputa.reservadas === 1 && estadoDisputa.porPagamento === disputa.pagamentos[0] && estadoDisputa.descontos === "0.00,100.00", JSON.stringify(estadoDisputa));

  for (let n = 2; n <= 6; n++) {
    const corrida = prepararMulta(n);
    const sessoes = await Promise.all(corrida.pagamentos.map((pagamento) => psqlEmParalelo(`select tentativa_id is not null, desconto from public.claim_payout('${pagamento}');`)));
    const saidas = sessoes.map((s) => s.saida).sort();
    const depois = reservas(corrida);
    confere(
      `corrida de multas ${n - 1}: dois repasses simultâneos do mesmo músico, só um reserva a multa`,
      saidas.join(",") === "t|0.00,t|100.00" && depois.reservadas === 1 && depois.descontos === "0.00,100.00",
      `${saidas.join(", ")}; reservadas: ${depois.reservadas}; descontos: ${depois.descontos}`,
    );
  }

  const liberacaoPrimeiro = emVerificacao(1);
  const confirmacaoTravada = psqlEmParalelo(`begin; ${confirmar(liberacaoPrimeiro.tentativa)} select pg_sleep(3); commit;`);
  await espera(1000);
  const respostaTardia = psqlEmParalelo(`select public.registrar_transferencia('${liberacaoPrimeiro.tentativa}', 'tra_conc_tardia_1');`);
  const [lc, lt] = await Promise.all([confirmacaoTravada, respostaTardia]);
  const depoisDaLiberacao = situacao(liberacaoPrimeiro);
  confere("liberação com a trava confirma a ausência", lc.saida.includes("AUSENCIA_CONFIRMADA"), lc.saida.replace(/\n/g, " | "));
  confere("resposta da Asaas durante a liberação espera a trava e vira alerta de resposta tardia", lt.saida === "TARDIA" && lt.ms >= 1500, `${lt.saida} em ${lt.ms} ms`);
  confere("a resposta tardia não reabre a tentativa nem toca a multa liberada", depoisDaLiberacao.estados === "AUSENCIA_CONFIRMADA" && depoisDaLiberacao.alertas === "RESPOSTA_TARDIA" && depoisDaLiberacao.reservadas === 0 && depoisDaLiberacao.repasse === "FALHOU", JSON.stringify(depoisDaLiberacao));

  const respostaPrimeiro = emVerificacao(2);
  const registroTravado = psqlEmParalelo(`begin; select public.registrar_transferencia('${respostaPrimeiro.tentativa}', 'tra_conc_achada_2'); select pg_sleep(3); commit;`);
  await espera(1000);
  const liberacaoAtrasada = psqlEmParalelo(confirmar(respostaPrimeiro.tentativa));
  const [rr, rl] = await Promise.all([registroTravado, liberacaoAtrasada]);
  const depoisDoRegistro = situacao(respostaPrimeiro);
  confere("resposta da Asaas que chega primeiro registra a transferência", rr.saida.includes("REGISTRADA"), rr.saida.replace(/\n/g, " | "));
  confere("liberação concorrente espera a trava e é recusada", rl.saida === "ESTADO_INVALIDO" && rl.ms >= 1500, `${rl.saida} em ${rl.ms} ms`);
  confere("a tentativa fica pendente com a multa ainda reservada", depoisDoRegistro.estados === "PENDENTE" && depoisDoRegistro.reservadas === 1 && depoisDoRegistro.confirmacoes === 0, JSON.stringify(depoisDoRegistro));

  const liberacaoEReivindicacao = emVerificacao(3);
  const liberacaoLonga = psqlEmParalelo(`begin; ${confirmar(liberacaoEReivindicacao.tentativa)} select pg_sleep(3); commit;`);
  await espera(1000);
  const novaReivindicacao = psqlEmParalelo(`select tentativa_id is not null, desconto from public.claim_payout('${liberacaoEReivindicacao.pagamento}');`);
  const [ll, lr] = await Promise.all([liberacaoLonga, novaReivindicacao]);
  const depoisDaReivindicacao = situacao(liberacaoEReivindicacao);
  confere("reivindicação durante a liberação espera a trava", ll.saida.includes("AUSENCIA_CONFIRMADA") && lr.ms >= 1500, `${lr.saida} em ${lr.ms} ms`);
  confere("depois da liberação, a nova tentativa nasce sozinha e reserva a multa de novo", lr.saida === "t|100.00" && depoisDaReivindicacao.abertas === 1 && depoisDaReivindicacao.estados === "AUSENCIA_CONFIRMADA,SOLICITANDO" && depoisDaReivindicacao.reservadas === 1, JSON.stringify(depoisDaReivindicacao));

  const reivindicacaoAntes = emVerificacao(4);
  const reivindicacaoRecusada = await Promise.all([
    psqlEmParalelo(`select tentativa_id is not null from public.claim_payout('${reivindicacaoAntes.pagamento}');`),
    psqlEmParalelo(`select tentativa_id is not null from public.claim_payout('${reivindicacaoAntes.pagamento}');`),
  ]);
  confere("reivindicação com a tentativa em verificação é recusada", reivindicacaoRecusada.every((r) => r.saida === "f") && situacao(reivindicacaoAntes).abertas === 1, reivindicacaoRecusada.map((r) => r.saida).join(", "));

  for (let n = 5; n <= 9; n++) {
    const corrida = emVerificacao(n);
    const sessoes = await Promise.all([1, 2, 3].map(() => psqlEmParalelo(confirmar(corrida.tentativa))));
    const saidas = sessoes.map((r) => r.saida).sort();
    const depois = situacao(corrida);
    confere(
      `confirmações simultâneas ${n - 4}: só uma libera`,
      saidas.join(",") === "AUSENCIA_CONFIRMADA,ESTADO_INVALIDO,ESTADO_INVALIDO" && depois.confirmacoes === 1 && depois.estados === "AUSENCIA_CONFIRMADA",
      `${saidas.join(", ")}; ${JSON.stringify(depois)}`,
    );
  }

  for (let n = 10; n <= 15; n++) {
    const corrida = prepararTentativa(n);
    psql(`select public.registrar_transferencia('${corrida.tentativa}', 'tra_conc_${n}');`);
    const [conclusao, falha] = await Promise.all([
      psqlEmParalelo(`select public.concluir_tentativa('${corrida.tentativa}', 'tra_conc_${n}');`),
      psqlEmParalelo(`select public.falhar_tentativa('${corrida.tentativa}', 'tra_conc_${n}');`),
    ]);
    const depois = situacao(corrida);
    const concluiu = conclusao.saida === "CONCLUIDA" && falha.saida === "f" && depois.estados === "CONCLUIDA" && depois.repasse === "REPASSADO" && depois.quitadas === 1 && depois.reservadas === 0;
    const falhou = conclusao.saida === "ALERTA" && falha.saida === "t" && depois.estados === "FALHOU" && depois.repasse === "FALHOU" && depois.quitadas === 0 && depois.reservadas === 0 && depois.alertas === "POSSIVEL_DUPLICIDADE";
    confere(`conclusão e falha simultâneas ${n - 9}: só uma vence e o estado fica coerente`, concluiu || falhou, `conclusão ${conclusao.saida}, falha ${falha.saida}; ${JSON.stringify(depois)}`);
  }

  for (let n = 16; n <= 20; n++) {
    const musico = id("c2c2a1", n);
    const pagamento = id("c2c2f1", n);
    prepararTentativa(n);
    psql(`select public.falhar_tentativa(id, null) from public.repasse_tentativas where payment_id = '${pagamento}';`);
    const sessoes = await Promise.all([1, 2, 3].map(() => psqlEmParalelo(`select tentativa_id is not null from public.claim_payout('${pagamento}');`)));
    const saidas = sessoes.map((r) => r.saida).sort();
    const depois = situacao({ pagamento, musico });
    confere(
      `reivindicações simultâneas do mesmo pagamento ${n - 15}: só uma cria tentativa`,
      saidas.join(",") === "f,f,t" && depois.abertas === 1 && depois.reservadas === 1,
      `${saidas.join(", ")}; ${JSON.stringify(depois)}`,
    );
  }

  const contestacaoPrimeiro = prepararContestacao(1);
  const contestacaoTravada = psqlEmParalelo(`begin; ${contestar(contestacaoPrimeiro)} select pg_sleep(3); commit;`);
  await espera(1000);
  const reivindicacaoAtrasada = psqlEmParalelo(reivindicar(contestacaoPrimeiro));
  const [ct, ra2] = await Promise.all([contestacaoTravada, reivindicacaoAtrasada]);
  const depoisDaContestacao = situacaoDaContestacao(contestacaoPrimeiro);
  confere("contestação que pega a trava do pagamento é aberta", ct.saida.includes("ABERTA"), ct.saida.replace(/\n/g, " | "));
  confere("reivindicação concorrente espera a contestação e é recusada", ra2.saida === "f" && ra2.ms >= 1500, `${ra2.saida} em ${ra2.ms} ms`);
  confere("com a contestação aberta, nenhuma tentativa nem multa reservada", depoisDaContestacao.contestacoes === 1 && depoisDaContestacao.tentativas === 0 && depoisDaContestacao.repasse === "RETIDO" && depoisDaContestacao.reservadas === 0, JSON.stringify(depoisDaContestacao));

  const reivindicacaoPrimeiro = prepararContestacao(2);
  const reivindicacaoTravada = psqlEmParalelo(`begin; ${reivindicar(reivindicacaoPrimeiro)} select pg_sleep(3); commit;`);
  await espera(1000);
  const contestacaoAtrasada = psqlEmParalelo(contestar(reivindicacaoPrimeiro));
  const [rt, ca] = await Promise.all([reivindicacaoTravada, contestacaoAtrasada]);
  const aposReivindicacao = situacaoDaContestacao(reivindicacaoPrimeiro);
  confere("reivindicação que pega a trava do pagamento cria a tentativa", rt.saida.split("\n").includes("t"), rt.saida.replace(/\n/g, " | "));
  confere("contestação concorrente espera o repasse e é recusada", ca.saida === "REPASSE_INICIADO" && ca.ms >= 1500, `${ca.saida} em ${ca.ms} ms`);
  confere("com o repasse iniciado, nenhuma contestação aberta", aposReivindicacao.contestacoes === 0 && aposReivindicacao.tentativas === 1 && aposReivindicacao.repasse === "PROCESSANDO", JSON.stringify(aposReivindicacao));

  for (let n = 3; n <= 8; n++) {
    const corrida = prepararContestacao(n);
    const [contestacao, reivindicacao] = await Promise.all([psqlEmParalelo(contestar(corrida)), psqlEmParalelo(reivindicar(corrida))]);
    const depois = situacaoDaContestacao(corrida);
    const venceuContestacao = contestacao.saida === "ABERTA" && reivindicacao.saida === "f" && depois.contestacoes === 1 && depois.tentativas === 0 && depois.reservadas === 0;
    const venceuRepasse = contestacao.saida === "REPASSE_INICIADO" && reivindicacao.saida === "t" && depois.contestacoes === 0 && depois.tentativas === 1;
    confere(
      `contestação e repasse simultâneos ${n - 2}: só um vence e o estado fica coerente`,
      venceuContestacao || venceuRepasse,
      `contestação ${contestacao.saida}, reivindicação ${reivindicacao.saida}; ${JSON.stringify(depois)}`,
    );
  }

  const releitura = prepararContestacao(9, { confirmado: false });
  const eventoTravado = psqlEmParalelo(`begin;
    select 1 from public.events where id = '${releitura.evento}' for update;
    update public.payments set status = 'PAGO', repasse_status = 'PROCESSANDO' where id = '${releitura.pagamento}';
    select pg_sleep(3);
    commit;`);
  await espera(1000);
  const contestacaoSemPagamentoPago = psqlEmParalelo(contestar(releitura));
  const [et, cs] = await Promise.all([eventoTravado, contestacaoSemPagamentoPago]);
  const aposReleitura = situacaoDaContestacao(releitura);
  confere("sessão que segura o evento confirma o pagamento e inicia o repasse", et.saida.includes("UPDATE 1") || et.saida.split("\n").includes("1"), et.saida.replace(/\n/g, " | "));
  confere("contestação iniciada sem pagamento confirmado espera o evento e relê o repasse", cs.saida === "REPASSE_INICIADO" && cs.ms >= 1500, `${cs.saida} em ${cs.ms} ms`);
  confere("nenhuma contestação aberta quando o repasse começou enquanto ela esperava", aposReleitura.contestacoes === 0 && aposReleitura.repasse === "PROCESSANDO", JSON.stringify(aposReleitura));

  const confirmacaoNoMeio = prepararContestacao(10, { confirmado: false });
  const contestacaoSegurando = psqlEmParalelo(`begin; ${contestar(confirmacaoNoMeio)} select pg_sleep(3); commit;`);
  await espera(1000);
  const confirmacao = psqlEmParalelo(`select public.confirm_asaas_payment('${confirmacaoNoMeio.cobranca}');`);
  await espera(500);
  const reivindicacaoDepois = psqlEmParalelo(reivindicar(confirmacaoNoMeio));
  const [cg, cf, rd] = await Promise.all([contestacaoSegurando, confirmacao, reivindicacaoDepois]);
  const aposConfirmacao = situacaoDaContestacao(confirmacaoNoMeio);
  confere("contestação aberta sem pagamento confirmado segura o evento", cg.saida.includes("ABERTA"), cg.saida.replace(/\n/g, " | "));
  confere("confirmação do pagamento espera a contestação terminar", cf.saida === "CONTRATADO" && cf.ms >= 1500, `${cf.saida} em ${cf.ms} ms`);
  confere("reivindicação do pagamento recém-confirmado espera e é recusada pela contestação", rd.saida === "f" && rd.ms >= 1000, `${rd.saida} em ${rd.ms} ms`);
  confere("fica só a contestação: nenhuma tentativa nem multa reservada", aposConfirmacao.contestacoes === 1 && aposConfirmacao.tentativas === 0 && aposConfirmacao.repasse === "RETIDO" && aposConfirmacao.reservadas === 0, JSON.stringify(aposConfirmacao));

  for (let n = 11; n <= 15; n++) {
    const corrida = prepararContestacao(n);
    const [estorno, reivindicacao] = await Promise.all([
      psqlEmParalelo(`select public.claim_asaas_refund('${corrida.pagamento}', 'CANCELAR');`),
      psqlEmParalelo(reivindicar(corrida)),
    ]);
    const [estornoEmAndamento] = psql(`select (refund_status is not distinct from 'PROCESSANDO')::text from public.payments where id = '${corrida.pagamento}';`).split("\n");
    const depois = situacaoDaContestacao(corrida);
    const venceuEstorno = estorno.saida === "t" && reivindicacao.saida === "f" && estornoEmAndamento === "true" && depois.tentativas === 0 && depois.reservadas === 0;
    const venceuRepasse = estorno.saida === "f" && reivindicacao.saida === "t" && estornoEmAndamento === "false" && depois.tentativas === 1;
    confere(
      `estorno e repasse simultâneos ${n - 10}: só um vence e o estado fica coerente`,
      venceuEstorno || venceuRepasse,
      `estorno ${estorno.saida}, reivindicação ${reivindicacao.saida}; estorno em andamento ${estornoEmAndamento}; ${JSON.stringify(depois)}`,
    );
  }

  const prepararDecisao = (n) => {
    const preparado = prepararContestacao(n);
    const [contestacao] = psql(`select contestacao_id from public.abrir_contestacao('${preparado.evento}', '${preparado.contratante}', 'O show não aconteceu como combinado.');`).split("\n");
    return { ...preparado, contestacao };
  };
  const decidir = ({ contestacao }, decisao) => `select public.decidir_contestacao('${contestacao}', '${decisao}', null);`;
  const estadoDaDecisao = ({ contestacao }) => psql(`select status || '|' || coalesce(decisao, '-') from public.disputes where id = '${contestacao}';`);

  for (const [n, primeira, segunda, final] of [
    [20, "PAGAR_MUSICO", "DEVOLVER_CONTRATANTE", "RESOLVIDA|PAGAR_MUSICO"],
    [21, "DEVOLVER_CONTRATANTE", "PAGAR_MUSICO", "AGUARDANDO_ESTORNO|DEVOLVER_CONTRATANTE"],
  ]) {
    const caso = prepararDecisao(n);
    const travada = psqlEmParalelo(`begin; ${decidir(caso, primeira)} select pg_sleep(3); commit;`);
    await espera(1000);
    const oposta = psqlEmParalelo(decidir(caso, segunda));
    const [a, b] = await Promise.all([travada, oposta]);
    confere(`decisão ${primeira} com a trava vence`, a.saida.split("\n").includes("DECIDIDA"), a.saida.replace(/\n/g, " | "));
    confere(`decisão oposta ${segunda} espera e recebe conflito`, b.saida === "JA_DECIDIDA" && b.ms >= 1500, `${b.saida} em ${b.ms} ms`);
    confere(`contestação fica com a decisão ${primeira}`, estadoDaDecisao(caso) === final, estadoDaDecisao(caso));
  }

  for (let n = 22; n <= 26; n++) {
    const caso = prepararDecisao(n);
    const [pagar, devolver] = await Promise.all([psqlEmParalelo(decidir(caso, "PAGAR_MUSICO")), psqlEmParalelo(decidir(caso, "DEVOLVER_CONTRATANTE"))]);
    const final = estadoDaDecisao(caso);
    const venceuPagar = pagar.saida === "DECIDIDA" && devolver.saida === "JA_DECIDIDA" && final === "RESOLVIDA|PAGAR_MUSICO";
    const venceuDevolver = devolver.saida === "DECIDIDA" && pagar.saida === "JA_DECIDIDA" && final === "AGUARDANDO_ESTORNO|DEVOLVER_CONTRATANTE";
    confere(`decisões opostas simultâneas ${n - 21}: só uma vence`, venceuPagar || venceuDevolver, `pagar ${pagar.saida}, devolver ${devolver.saida}; ${final}`);
  }

  const confirmacaoContraPagar = prepararDecisao(27);
  psql(`${decidir(confirmacaoContraPagar, "DEVOLVER_CONTRATANTE")} select public.claim_asaas_refund('${confirmacaoContraPagar.pagamento}', 'NAO_COMPARECIMENTO', '${confirmacaoContraPagar.contestacao}');`);
  const confirmando = psqlEmParalelo(`begin; select public.finalize_asaas_refund('${confirmacaoContraPagar.pagamento}'); select pg_sleep(3); commit;`);
  await espera(1000);
  const pagarDuranteConfirmacao = psqlEmParalelo(decidir(confirmacaoContraPagar, "PAGAR_MUSICO"));
  const [cc, pc] = await Promise.all([confirmando, pagarDuranteConfirmacao]);
  confere("confirmação do estorno encerra a contestação", cc.saida.split("\n").includes("CONFIRMADO") && estadoDaDecisao(confirmacaoContraPagar) === "RESOLVIDA|DEVOLVER_CONTRATANTE", `${cc.saida.replace(/\n/g, " | ")}; ${estadoDaDecisao(confirmacaoContraPagar)}`);
  confere("decisão de pagar durante a confirmação espera e recebe conflito", pc.saida === "JA_DECIDIDA" && pc.ms >= 1500, `${pc.saida} em ${pc.ms} ms`);

  const negativaContraDecisao = prepararDecisao(28);
  psql(`${decidir(negativaContraDecisao, "DEVOLVER_CONTRATANTE")} select public.claim_asaas_refund('${negativaContraDecisao.pagamento}', 'NAO_COMPARECIMENTO', '${negativaContraDecisao.contestacao}');`);
  const negando = psqlEmParalelo(`begin; select public.negar_estorno('${negativaContraDecisao.pagamento}'); select pg_sleep(3); commit;`);
  await espera(1000);
  const pagarDuranteNegativa = psqlEmParalelo(decidir(negativaContraDecisao, "PAGAR_MUSICO"));
  const [ng, pn] = await Promise.all([negando, pagarDuranteNegativa]);
  const [estornoNegado] = psql(`select refund_status from public.payments where id = '${negativaContraDecisao.pagamento}';`).split("\n");
  confere("negativa do estorno devolve a contestação para análise", ng.saida.split("\n").includes(negativaContraDecisao.contestacao) && estornoNegado === "NEGADO", `${ng.saida.replace(/\n/g, " | ")}; estorno ${estornoNegado}`);
  confere("decisão nova feita durante a negativa espera e só vale depois dela", pn.saida === "DECIDIDA" && pn.ms >= 1500 && estadoDaDecisao(negativaContraDecisao) === "RESOLVIDA|PAGAR_MUSICO", `${pn.saida} em ${pn.ms} ms; ${estadoDaDecisao(negativaContraDecisao)}`);

  const solicitacaoAntiga = (n) => {
    const preparado = prepararContestacao(n);
    const [tentativa] = psql(`
      select tentativa_id from public.claim_payout('${preparado.pagamento}');
      update public.repasse_tentativas set solicitada_em = now() - interval '11 minutes' where payment_id = '${preparado.pagamento}';
    `).split("\n");
    return { ...preparado, tentativa };
  };
  const registrarEnvio = ({ tentativa }) => `select public.registrar_pedido_enviado('${tentativa}');`;
  const marcarParada = ({ tentativa }) => `select public.marcar_tentativa_parada('${tentativa}');`;
  const estadoDaTentativa = ({ tentativa }) => psql(`select estado from public.repasse_tentativas where id = '${tentativa}';`);

  const paradaPrimeiro = solicitacaoAntiga(30);
  const paradaTravada = psqlEmParalelo(`begin; ${marcarParada(paradaPrimeiro)} select pg_sleep(3); commit;`);
  await espera(1000);
  const registroAtrasado = psqlEmParalelo(registrarEnvio(paradaPrimeiro));
  const [pt, ra3] = await Promise.all([paradaTravada, registroAtrasado]);
  confere("solicitação parada sem envio é encerrada como falha", pt.saida.split("\n").includes("FALHOU") && estadoDaTentativa(paradaPrimeiro) === "FALHOU", `${pt.saida.replace(/\n/g, " | ")}; ${estadoDaTentativa(paradaPrimeiro)}`);
  confere("registro de envio feito durante a marcação espera e é recusado, então nada é enviado", ra3.saida === "f" && ra3.ms >= 1500, `${ra3.saida} em ${ra3.ms} ms`);

  const registroPrimeiro = solicitacaoAntiga(31);
  const envioTravado = psqlEmParalelo(`begin; ${registrarEnvio(registroPrimeiro)} select pg_sleep(3); commit;`);
  await espera(1000);
  const paradaAtrasada = psqlEmParalelo(marcarParada(registroPrimeiro));
  const [rg, pa] = await Promise.all([envioTravado, paradaAtrasada]);
  confere("registro de envio que pega a trava é aceito", rg.saida.split("\n").includes("t"), rg.saida.replace(/\n/g, " | "));
  confere("marcação de parada espera o registro e deixa a tentativa inconclusiva", pa.saida === "INCONCLUSIVA" && pa.ms >= 1500 && estadoDaTentativa(registroPrimeiro) === "INCONCLUSIVA", `${pa.saida} em ${pa.ms} ms; ${estadoDaTentativa(registroPrimeiro)}`);

  for (let n = 32; n <= 36; n++) {
    const caso = solicitacaoAntiga(n);
    const [registro, parada] = await Promise.all([psqlEmParalelo(registrarEnvio(caso)), psqlEmParalelo(marcarParada(caso))]);
    const final = estadoDaTentativa(caso);
    const venceuRegistro = registro.saida === "t" && parada.saida === "INCONCLUSIVA" && final === "INCONCLUSIVA";
    const venceuParada = registro.saida === "f" && parada.saida === "FALHOU" && final === "FALHOU";
    confere(`registro de envio e marcação de parada simultâneos ${n - 31}: nunca falha com envio registrado`, venceuRegistro || venceuParada, `registro ${registro.saida}, parada ${parada.saida}; ${final}`);
  }

  const repasseRegistrado = (n) => {
    const preparado = prepararContestacao(n);
    const transferencia = `tra_c3_${n}`;
    const tentativa = psql(`select tentativa_id from public.claim_payout('${preparado.pagamento}');`);
    psql(`select public.registrar_pedido_enviado('${tentativa}'); select public.registrar_transferencia('${tentativa}', '${transferencia}');`);
    return { ...preparado, tentativa, transferencia };
  };
  const concluirTransferencia = ({ tentativa, transferencia }) => `select public.concluir_tentativa('${tentativa}', '${transferencia}');`;
  const confirmarEstorno = ({ pagamento }) => `select public.finalize_asaas_refund('${pagamento}');`;
  const ESTADO_FINAL_COM_ESTORNO = "CONCLUIDA|ESTORNADO|CONFIRMADO|REPASSADO|100.00|CANCELADO|1|0|1|0";
  const estadoComEstorno = ({ pagamento, tentativa, evento, musico }) => psql(`
    select concat_ws('|',
      (select estado from public.repasse_tentativas where id = '${tentativa}'),
      p.status, p.refund_status, p.repasse_status, p.multa_descontada,
      (select status from public.events where id = '${evento}'),
      (select count(*) from public.penalties x where x.musician_id = '${musico}' and x.reserva_payment_id = p.id and x.quitada_em is null and x.payment_id is null),
      (select count(*) from public.penalties x where x.musician_id = '${musico}' and x.quitada_em is not null),
      (select count(*) from public.repasse_alertas a where a.tentativa_id = '${tentativa}' and a.tipo = 'REPASSE_E_ESTORNO'),
      (select count(*) from public.penalties x where x.estorno_payment_id = p.id))
    from public.payments p where p.id = '${pagamento}';`);
  const ordemDoAlerta = ({ tentativa }) => psql(`select detalhes ->> 'ordem' from public.repasse_alertas where tentativa_id = '${tentativa}' and tipo = 'REPASSE_E_ESTORNO';`);

  const estornoPrimeiro = repasseRegistrado(40);
  const estornoTravado = psqlEmParalelo(`begin; ${confirmarEstorno(estornoPrimeiro)} select pg_sleep(3); commit;`);
  await espera(1000);
  const conclusaoAtrasada = psqlEmParalelo(concluirTransferencia(estornoPrimeiro));
  const [et2, ca2] = await Promise.all([estornoTravado, conclusaoAtrasada]);
  confere("estorno que pega a trava fica conflitante com a tentativa aberta", et2.saida.split("\n").includes("REPASSE_CONFLITANTE"), et2.saida.replace(/\n/g, " | "));
  confere("conclusão concorrente espera o estorno e vira alerta", ca2.saida === "REPASSE_E_ESTORNO" && ca2.ms >= 1500, `${ca2.saida} em ${ca2.ms} ms`);
  confere("estorno antes da conclusão: multas reservadas sem quitação e um alerta", estadoComEstorno(estornoPrimeiro) === ESTADO_FINAL_COM_ESTORNO && ordemDoAlerta(estornoPrimeiro) === "ESTORNO_ANTES_DA_CONCLUSAO", `${estadoComEstorno(estornoPrimeiro)}; ${ordemDoAlerta(estornoPrimeiro)}`);

  const conclusaoPrimeiro = repasseRegistrado(41);
  const conclusaoTravada = psqlEmParalelo(`begin; ${concluirTransferencia(conclusaoPrimeiro)} select pg_sleep(3); commit;`);
  await espera(1000);
  const estornoAtrasado = psqlEmParalelo(confirmarEstorno(conclusaoPrimeiro));
  const [ct2, ea2] = await Promise.all([conclusaoTravada, estornoAtrasado]);
  confere("conclusão que pega a trava conclui o repasse", ct2.saida.split("\n").includes("CONCLUIDA"), ct2.saida.replace(/\n/g, " | "));
  confere("estorno concorrente espera a conclusão e fica conflitante", ea2.saida === "REPASSE_CONFLITANTE" && ea2.ms >= 1500, `${ea2.saida} em ${ea2.ms} ms`);
  confere("estorno depois da conclusão: quitação desfeita e o mesmo estado final", estadoComEstorno(conclusaoPrimeiro) === ESTADO_FINAL_COM_ESTORNO && ordemDoAlerta(conclusaoPrimeiro) === "ESTORNO_DEPOIS_DA_CONCLUSAO", `${estadoComEstorno(conclusaoPrimeiro)}; ${ordemDoAlerta(conclusaoPrimeiro)}`);

  for (let n = 42; n <= 46; n++) {
    const caso = repasseRegistrado(n);
    const [conclusao, estorno] = await Promise.all([psqlEmParalelo(concluirTransferencia(caso)), psqlEmParalelo(confirmarEstorno(caso))]);
    const final = estadoComEstorno(caso);
    const venceuConclusao = conclusao.saida === "CONCLUIDA" && estorno.saida === "REPASSE_CONFLITANTE" && ordemDoAlerta(caso) === "ESTORNO_DEPOIS_DA_CONCLUSAO";
    const venceuEstorno = conclusao.saida === "REPASSE_E_ESTORNO" && estorno.saida === "REPASSE_CONFLITANTE" && ordemDoAlerta(caso) === "ESTORNO_ANTES_DA_CONCLUSAO";
    confere(`conclusão e estorno simultâneos ${n - 41}: um alerta e o mesmo estado final em qualquer ordem`, (venceuConclusao || venceuEstorno) && final === ESTADO_FINAL_COM_ESTORNO, `conclusão ${conclusao.saida}, estorno ${estorno.saida}; ${final}`);
  }

  const repetido = repasseRegistrado(47);
  psql(confirmarEstorno(repetido));
  const repeticoes = await Promise.all([
    ...[1, 2, 3].map(() => psqlEmParalelo(concluirTransferencia(repetido))),
    ...[1, 2].map(() => psqlEmParalelo(confirmarEstorno(repetido))),
  ]);
  const saidasRepetidas = repeticoes.map((r) => r.saida).sort().join(",");
  confere(
    "webhooks repetidos e simultâneos não quitam multas nem duplicam o alerta",
    saidasRepetidas === "JA_PROCESSADO,JA_PROCESSADO,REPASSE_E_ESTORNO,REPASSE_E_ESTORNO,REPASSE_E_ESTORNO" && estadoComEstorno(repetido) === ESTADO_FINAL_COM_ESTORNO,
    `${saidasRepetidas}; ${estadoComEstorno(repetido)}`,
  );

  const estornoExterno = ({ pagamento }) => `select public.finalize_asaas_refund('${pagamento}');`;
  const pendentes = ({ evento }) => Number(psql(`select count(*) from public.disputes where event_id = '${evento}' and status in ('ABERTA', 'AGUARDANDO_ESTORNO');`));

  const externoPrimeiro = prepararDecisao(60);
  const confirmandoExterno = psqlEmParalelo(`begin; ${estornoExterno(externoPrimeiro)} select pg_sleep(3); commit;`);
  await espera(1000);
  const devolverDuranteExterno = psqlEmParalelo(decidir(externoPrimeiro, "DEVOLVER_CONTRATANTE"));
  const [ce, de] = await Promise.all([confirmandoExterno, devolverDuranteExterno]);
  confere("estorno externo com a contestação aberta a encerra como devolvida", ce.saida.split("\n").includes("CONFIRMADO") && estadoDaDecisao(externoPrimeiro) === "RESOLVIDA|DEVOLVER_CONTRATANTE", `${ce.saida.replace(/\n/g, " | ")}; ${estadoDaDecisao(externoPrimeiro)}`);
  confere("decisão de devolver durante o estorno externo espera e recebe conflito, sem ficar aguardando estorno", de.saida === "JA_DECIDIDA" && de.ms >= 1500 && pendentes(externoPrimeiro) === 0, `${de.saida} em ${de.ms} ms; pendentes ${pendentes(externoPrimeiro)}`);

  const decisaoPrimeiro = prepararDecisao(61);
  const decidindo = psqlEmParalelo(`begin; ${decidir(decisaoPrimeiro, "DEVOLVER_CONTRATANTE")} select pg_sleep(3); commit;`);
  await espera(1000);
  const externoDuranteDecisao = psqlEmParalelo(estornoExterno(decisaoPrimeiro));
  const [dd, ed] = await Promise.all([decidindo, externoDuranteDecisao]);
  confere("decisão de devolver que pega a trava vence", dd.saida.split("\n").includes("DECIDIDA"), dd.saida.replace(/\n/g, " | "));
  confere("estorno externo durante a decisão espera e encerra a contestação aguardando estorno", ed.saida === "CONFIRMADO" && ed.ms >= 1500 && estadoDaDecisao(decisaoPrimeiro) === "RESOLVIDA|DEVOLVER_CONTRATANTE", `${ed.saida} em ${ed.ms} ms; ${estadoDaDecisao(decisaoPrimeiro)}`);

  for (let n = 62; n <= 66; n++) {
    const caso = prepararDecisao(n);
    const [estorno, decisao] = await Promise.all([psqlEmParalelo(estornoExterno(caso)), psqlEmParalelo(decidir(caso, "DEVOLVER_CONTRATANTE"))]);
    const final = estadoDaDecisao(caso);
    confere(
      `estorno externo e decisão de devolver simultâneos ${n - 61}: a contestação nunca fica presa`,
      estorno.saida === "CONFIRMADO" && ["DECIDIDA", "JA_DECIDIDA"].includes(decisao.saida) && final === "RESOLVIDA|DEVOLVER_CONTRATANTE" && pendentes(caso) === 0,
      `estorno ${estorno.saida}, decisão ${decisao.saida}; ${final}`,
    );
  }

  const pagamentoSecundario = (caso, n) => {
    const secundario = id("c3c3f2", n);
    psql(`
      insert into public.payments (id, event_id, candidate_id, contractor_id, asaas_payment_id, valor, valor_comissao, expira_em)
        values ('${secundario}', '${caso.evento}', '${id("c3c3d1", n)}', '${caso.contratante}', 'pay_disp_sec_${n}', 550, 50, now() - interval '1 minute');
      update public.payments set status = 'EXPIRADO' where id = '${secundario}';
      select public.claim_asaas_refund('${secundario}', 'NENHUMA');
    `);
    return secundario;
  };
  const situacaoComSecundario = (caso, secundario) =>
    psql(`select d.status || '|' || coalesce(d.decisao, '-') || '|' || p.status || '|' || s.status from public.disputes d join public.payments p on p.id = d.payment_id join public.payments s on s.id = '${secundario}' where d.id = '${caso.contestacao}';`);

  const secundarioDuranteDecisao = prepararDecisao(72);
  const secundario72 = pagamentoSecundario(secundarioDuranteDecisao, 72);
  const estornandoSecundario = psqlEmParalelo(`begin; select public.finalize_asaas_refund('${secundario72}'); select pg_sleep(3); commit;`);
  await espera(1000);
  const decisaoDuranteSecundario = psqlEmParalelo(decidir(secundarioDuranteDecisao, "DEVOLVER_CONTRATANTE"));
  const [es, ds] = await Promise.all([estornandoSecundario, decisaoDuranteSecundario]);
  confere("estorno de pagamento secundário com a trava não encerra a contestação do contratado", es.saida.split("\n").includes("CONFIRMADO"), es.saida.replace(/\n/g, " | "));
  confere(
    "decisão de devolver durante o estorno secundário espera e continua aguardando o estorno do contratado",
    ds.saida === "DECIDIDA" && ds.ms >= 1500 && situacaoComSecundario(secundarioDuranteDecisao, secundario72) === "AGUARDANDO_ESTORNO|DEVOLVER_CONTRATANTE|PAGO|ESTORNADO",
    `${ds.saida} em ${ds.ms} ms; ${situacaoComSecundario(secundarioDuranteDecisao, secundario72)}`,
  );

  for (let n = 73; n <= 77; n++) {
    const caso = prepararDecisao(n);
    const secundario = pagamentoSecundario(caso, n);
    const [doSecundario, doContratado] = await Promise.all([psqlEmParalelo(estornoExterno({ pagamento: secundario })), psqlEmParalelo(estornoExterno(caso))]);
    const final = psql(`select d.status || '|' || d.decisao || '|' || d.observacao from public.disputes d where d.id = '${caso.contestacao}';`);
    confere(
      `estornos simultâneos do secundário e do contratado ${n - 72}: só o contratado encerra a contestação, uma vez`,
      doSecundario.saida === "CONFIRMADO" && doContratado.saida === "CONFIRMADO" && final === "RESOLVIDA|DEVOLVER_CONTRATANTE|Valor devolvido ao contratante por estorno confirmado fora da decisão do suporte." && pendentes(caso) === 0,
      `secundário ${doSecundario.saida}, contratado ${doContratado.saida}; ${final}`,
    );
  }

  const migrationDoM1 = readFileSync(new URL("../supabase/migrations/20261116140000_contestacao_com_estorno_externo.sql", import.meta.url), "utf8");
  const vincularAntigas = "select private.vincular_contestacoes_ao_pagamento();";
  const encerrarPresas = migrationDoM1.match(/^update public\.disputes d\r?\nset status[\s\S]*?;$/m)[0];
  const presaAberta = prepararDecisao(67);
  const presaAguardando = prepararDecisao(68);
  const comPagamento = prepararDecisao(69);
  const comSecundario = prepararDecisao(70);
  const secundario70 = pagamentoSecundario(comSecundario, 70);
  const recontratada = prepararDecisao(71);
  const contratacaoAnterior = id("c3c3f3", 71);
  psql(`
    ${decidir(presaAguardando, "DEVOLVER_CONTRATANTE")}
    update public.payments set status = 'ESTORNADO', refund_status = 'CONFIRMADO' where id in ('${presaAberta.pagamento}', '${presaAguardando.pagamento}');
    select public.finalize_asaas_refund('${secundario70}');
    insert into public.payments (id, event_id, candidate_id, contractor_id, asaas_payment_id, valor, valor_comissao, expira_em)
      values ('${contratacaoAnterior}', '${recontratada.evento}', '${id("c3c3d1", 71)}', '${recontratada.contratante}', 'pay_disp_ant_71', 550, 50, now() - interval '3 days');
    update public.payments set status = 'ESTORNADO', pago_em = now() - interval '3 days', refund_status = 'CONFIRMADO', refund_action = 'REABRIR' where id = '${contratacaoAnterior}';
    update public.disputes set payment_id = null where id in ('${presaAberta.contestacao}', '${presaAguardando.contestacao}', '${comPagamento.contestacao}', '${comSecundario.contestacao}', '${recontratada.contestacao}');
  `);
  const casosAntigos = [presaAberta, presaAguardando, comPagamento, comSecundario, recontratada];
  const vinculo = (caso) => psql(`select coalesce(payment_id::text, '-') from public.disputes where id = '${caso.contestacao}';`);
  const observacao = ({ contestacao }) => psql(`select coalesce(observacao, '-') from public.disputes where id = '${contestacao}';`);
  const retrato = () => casosAntigos.map((caso) => `${estadoDaDecisao(caso)}|${observacao(caso)}|${vinculo(caso)}`);
  psql(`${vincularAntigas}\n${encerrarPresas}`);
  const primeiraCorrecao = retrato();
  psql(`${vincularAntigas}\n${encerrarPresas}`);
  const segundaCorrecao = retrato();
  confere(
    "a migration vincula as contestações antigas ao pagamento que contratou o evento antes da abertura",
    casosAntigos.every((caso) => vinculo(caso) === caso.pagamento),
    casosAntigos.map((caso) => `${vinculo(caso)} esperado ${caso.pagamento}`).join(" ; "),
  );
  confere(
    "a migration encerra contestações já presas com o pagamento vinculado estornado e marca que são anteriores à correção",
    [0, 1].every((i) => primeiraCorrecao[i].startsWith("RESOLVIDA|DEVOLVER_CONTRATANTE|") && primeiraCorrecao[i].includes("antes desta correção.")),
    primeiraCorrecao.slice(0, 2).join(" ; "),
  );
  confere("a correção não toca contestação de evento com pagamento ainda pago", primeiraCorrecao[2].startsWith("ABERTA|-|-|"), primeiraCorrecao[2]);
  confere("a correção não encerra contestação do contratado ainda pago quando outro pagamento do evento foi estornado", primeiraCorrecao[3].startsWith("ABERTA|-|-|"), primeiraCorrecao[3]);
  confere("a correção ignora a contratação anterior estornada e mantém a contestação da recontratação aberta", primeiraCorrecao[4].startsWith("ABERTA|-|-|"), primeiraCorrecao[4]);
  confere("a correção dos casos antigos pode rodar de novo sem mudar nada", JSON.stringify(segundaCorrecao) === JSON.stringify(primeiraCorrecao), segundaCorrecao.join(" ; "));
  confere("a migration aplica o mesmo vínculo testado aqui", migrationDoM1.includes(`\n${vincularAntigas}\n`), vincularAntigas);

  const empatada = prepararDecisao(78);
  const unica = prepararDecisao(79);
  const empatadaComEstorno = prepararDecisao(80);
  for (const [caso, n] of [[empatada, 78], [empatadaComEstorno, 80]]) {
    const empate = id("c3c3f4", n);
    psql(`
      insert into public.payments (id, event_id, candidate_id, contractor_id, asaas_payment_id, valor, valor_comissao, expira_em)
        values ('${empate}', '${caso.evento}', '${id("c3c3d1", n)}', '${caso.contratante}', 'pay_disp_emp_${n}', 550, 50, now() - interval '1 minute');
      update public.payments
      set status = 'ESTORNADO', refund_status = 'CONFIRMADO', refund_action = 'REABRIR', pago_em = (select pago_em from public.payments where id = '${caso.pagamento}')
      where id = '${empate}';
    `);
  }
  psql(`update public.disputes set payment_id = null where id in ('${empatada.contestacao}', '${unica.contestacao}', '${empatadaComEstorno.contestacao}');`);
  const vinculacoes = await Promise.all([
    ...Array.from({ length: 4 }, () => psqlEmParalelo(vincularAntigas)),
    psqlEmParalelo(estornoExterno(empatadaComEstorno)),
  ]);
  const vinculosDepois = [empatada, unica, empatadaComEstorno].map(vinculo);
  confere(
    "vínculo simultâneo em quatro sessões: o empate fica sem vínculo e o caso único é vinculado uma vez",
    vinculosDepois[0] === "-" && vinculosDepois[1] === unica.pagamento && vinculosDepois[2] === "-"
      && vinculacoes.slice(0, 4).every((sessao) => /^\d+$/.test(sessao.saida)) && vinculacoes.slice(0, 4).filter((sessao) => Number(sessao.saida) > 0).length >= 1,
    `${vinculosDepois.join(" ; ")}; sessões ${vinculacoes.slice(0, 4).map((sessao) => sessao.saida).join(", ")}`,
  );
  confere(
    "estorno simultâneo ao vínculo não encerra a contestação empatada, que fica sem vínculo",
    vinculacoes[4].saida === "CONFIRMADO" && estadoDaDecisao(empatadaComEstorno) === "ABERTA|-",
    `${vinculacoes[4].saida}; ${estadoDaDecisao(empatadaComEstorno)}`,
  );
  psql(`update public.payments set status = 'ESTORNADO', refund_status = 'CONFIRMADO' where id = '${empatada.pagamento}';`);
  psql(`${vincularAntigas}\n${encerrarPresas}`);
  const depoisDaCorrecao = [empatada, empatadaComEstorno].map((caso) => `${estadoDaDecisao(caso)}|${vinculo(caso)}`);
  confere(
    "a correção das presas não encerra contestação sem vínculo, mesmo com os pagamentos empatados estornados",
    depoisDaCorrecao.every((situacao) => situacao === "ABERTA|-|-"),
    depoisDaCorrecao.join(" ; "),
  );

  const prepararDevolucao = (n) => {
    const caso = prepararDecisao(n);
    psql(`${decidir(caso, "DEVOLVER_CONTRATANTE")} select public.claim_asaas_refund('${caso.pagamento}', 'NAO_COMPARECIMENTO', '${caso.contestacao}');`);
    return { ...caso, secundario: pagamentoSecundario(caso, n) };
  };
  const negar = (pagamento) => `select public.negar_estorno('${pagamento}');`;
  const contestacaoCompleta = ({ contestacao }) => psql(`select status || '|' || coalesce(decisao, '-') || '|' || coalesce(observacao, '-') from public.disputes where id = '${contestacao}';`);

  const negativaAntesDaConfirmacao = prepararDevolucao(81);
  const negandoSecundario = psqlEmParalelo(`begin; ${negar(negativaAntesDaConfirmacao.secundario)} select pg_sleep(3); commit;`);
  await espera(1000);
  const confirmandoContratado = psqlEmParalelo(estornoExterno(negativaAntesDaConfirmacao));
  const [nsc, ccs] = await Promise.all([negandoSecundario, confirmandoContratado]);
  confere("negativa secundária com a trava não reabre a contestação aguardando o estorno do contratado", nsc.saida.startsWith("BEGIN") && nsc.saida.endsWith("COMMIT") && !/[0-9a-f]{8}-[0-9a-f]{4}-/.test(nsc.saida), nsc.saida.replace(/\n/g, " | "));
  confere(
    "confirmação do contratado durante a negativa secundária espera e encerra pela decisão do suporte",
    ccs.saida === "CONFIRMADO" && ccs.ms >= 1500 && contestacaoCompleta(negativaAntesDaConfirmacao) === "RESOLVIDA|DEVOLVER_CONTRATANTE|-",
    `${ccs.saida} em ${ccs.ms} ms; ${contestacaoCompleta(negativaAntesDaConfirmacao)}`,
  );

  const confirmacaoAntesDaNegativa = prepararDevolucao(82);
  const confirmandoPrimeiro = psqlEmParalelo(`begin; ${estornoExterno(confirmacaoAntesDaNegativa)} select pg_sleep(3); commit;`);
  await espera(1000);
  const negandoDepois = psqlEmParalelo(negar(confirmacaoAntesDaNegativa.secundario));
  const [ccp, nsd] = await Promise.all([confirmandoPrimeiro, negandoDepois]);
  confere(
    "negativa secundária durante a confirmação do contratado espera e não reabre a contestação encerrada",
    ccp.saida.split("\n").includes("CONFIRMADO") && nsd.saida === "" && nsd.ms >= 1500 && contestacaoCompleta(confirmacaoAntesDaNegativa) === "RESOLVIDA|DEVOLVER_CONTRATANTE|-",
    `"${nsd.saida}" em ${nsd.ms} ms; ${contestacaoCompleta(confirmacaoAntesDaNegativa)}`,
  );

  const negativaContraPagar = prepararDevolucao(83);
  const negandoContraPagar = psqlEmParalelo(`begin; ${negar(negativaContraPagar.secundario)} select pg_sleep(3); commit;`);
  await espera(1000);
  const pagarDuranteNegativaSecundaria = psqlEmParalelo(decidir(negativaContraPagar, "PAGAR_MUSICO"));
  const [, pns] = await Promise.all([negandoContraPagar, pagarDuranteNegativaSecundaria]);
  confere(
    "decisão de pagar durante a negativa secundária espera e é recusada, sem trocar a decisão do suporte",
    pns.saida === "JA_DECIDIDA" && pns.ms >= 1500 && estadoDaDecisao(negativaContraPagar) === "AGUARDANDO_ESTORNO|DEVOLVER_CONTRATANTE",
    `${pns.saida} em ${pns.ms} ms; ${estadoDaDecisao(negativaContraPagar)}`,
  );

  for (let n = 84; n <= 88; n++) {
    const caso = prepararDevolucao(n);
    const [negativa, confirmacao] = await Promise.all([psqlEmParalelo(negar(caso.secundario)), psqlEmParalelo(estornoExterno(caso))]);
    const final = contestacaoCompleta(caso);
    confere(
      `negativa secundária e confirmação do contratado simultâneas ${n - 83}: encerra pela decisão do suporte`,
      negativa.saida === "" && confirmacao.saida === "CONFIRMADO" && final === "RESOLVIDA|DEVOLVER_CONTRATANTE|-" && pendentes(caso) === 0,
      `negativa "${negativa.saida}", confirmação ${confirmacao.saida}; ${final}`,
    );
  }

  for (let n = 89; n <= 93; n++) {
    const caso = prepararDevolucao(n);
    const [doContratado, doSecundario] = await Promise.all([psqlEmParalelo(negar(caso.pagamento)), psqlEmParalelo(negar(caso.secundario))]);
    const final = estadoDaDecisao(caso);
    confere(
      `negativas simultâneas do contratado e do secundário ${n - 88}: só a do contratado reabre, uma vez`,
      doContratado.saida === caso.contestacao && doSecundario.saida === "" && final === "ABERTA|-",
      `contratado "${doContratado.saida}", secundário "${doSecundario.saida}"; ${final}`,
    );
  }

  const pedirEstorno = (pagamento, acao, contestacao) => `select public.claim_asaas_refund('${pagamento}', '${acao}'${contestacao ? `, '${contestacao}'` : ""});`;
  const situacaoDaAusencia = ({ evento, pagamento }) =>
    psql(`select coalesce((select status from public.disputes where event_id = '${evento}'), 'sem contestação') || '|' || coalesce(refund_status, '-') || '|' || coalesce(refund_action, '-') from public.payments where id = '${pagamento}';`);

  const contestacaoAntesDaAusencia = prepararContestacao(94);
  const abrindoAntes = psqlEmParalelo(`begin; ${contestar(contestacaoAntesDaAusencia)} select pg_sleep(3); commit;`);
  await espera(1000);
  const ausenciaDepois = psqlEmParalelo(pedirEstorno(contestacaoAntesDaAusencia.pagamento, "NAO_COMPARECIMENTO"));
  const [aa, ad] = await Promise.all([abrindoAntes, ausenciaDepois]);
  confere("contestação que pega a trava é aberta antes do não comparecimento", aa.saida.split("\n").includes("ABERTA"), aa.saida.replace(/\n/g, " | "));
  confere(
    "estorno de não comparecimento durante a abertura espera e é recusado",
    ad.saida === "f" && ad.ms >= 1500 && situacaoDaAusencia(contestacaoAntesDaAusencia) === "ABERTA|-|-",
    `${ad.saida} em ${ad.ms} ms; ${situacaoDaAusencia(contestacaoAntesDaAusencia)}`,
  );

  const ausenciaAntesDaContestacao = prepararContestacao(95);
  const ausenciaAntes = psqlEmParalelo(`begin; ${pedirEstorno(ausenciaAntesDaContestacao.pagamento, "NAO_COMPARECIMENTO")} select pg_sleep(3); commit;`);
  await espera(1000);
  const abrindoDepois = psqlEmParalelo(contestar(ausenciaAntesDaContestacao));
  const [ea, ab] = await Promise.all([ausenciaAntes, abrindoDepois]);
  confere("estorno de não comparecimento que pega a trava é pedido", ea.saida.split("\n").includes("t"), ea.saida.replace(/\n/g, " | "));
  confere(
    "contestação durante o estorno de não comparecimento espera e é recusada",
    ab.saida === "ESTORNO_EM_ANDAMENTO" && ab.ms >= 1500 && situacaoDaAusencia(ausenciaAntesDaContestacao) === "sem contestação|PROCESSANDO|NAO_COMPARECIMENTO",
    `${ab.saida} em ${ab.ms} ms; ${situacaoDaAusencia(ausenciaAntesDaContestacao)}`,
  );

  for (let n = 96; n <= 100; n++) {
    const caso = prepararContestacao(n);
    const [abertura, estorno] = await Promise.all([psqlEmParalelo(contestar(caso)), psqlEmParalelo(pedirEstorno(caso.pagamento, "NAO_COMPARECIMENTO"))]);
    const final = situacaoDaAusencia(caso);
    const venceuContestacao = abertura.saida === "ABERTA" && estorno.saida === "f" && final === "ABERTA|-|-";
    const venceuEstorno = abertura.saida === "ESTORNO_EM_ANDAMENTO" && estorno.saida === "t" && final === "sem contestação|PROCESSANDO|NAO_COMPARECIMENTO";
    confere(`contestação e não comparecimento simultâneos ${n - 95}: exatamente um vence`, venceuContestacao || venceuEstorno, `contestação ${abertura.saida}, estorno ${estorno.saida}; ${final}`);
  }

  const decisaoComEstorno = prepararDecisao(101);
  const decidindoDevolver = psqlEmParalelo(`begin; ${decidir(decisaoComEstorno, "DEVOLVER_CONTRATANTE")} select pg_sleep(3); commit;`);
  await espera(1000);
  const estornoDaDecisao = psqlEmParalelo(pedirEstorno(decisaoComEstorno.pagamento, "NAO_COMPARECIMENTO", decisaoComEstorno.contestacao));
  const [, edc] = await Promise.all([decidindoDevolver, estornoDaDecisao]);
  confere(
    "estorno da decisão do suporte com o id da contestação espera a decisão e é aceito",
    edc.saida === "t" && edc.ms >= 1500 && situacaoDaAusencia(decisaoComEstorno) === "AGUARDANDO_ESTORNO|PROCESSANDO|NAO_COMPARECIMENTO",
    `${edc.saida} em ${edc.ms} ms; ${situacaoDaAusencia(decisaoComEstorno)}`,
  );

  const aguardandoSemId = prepararDecisao(102);
  psql(decidir(aguardandoSemId, "DEVOLVER_CONTRATANTE"));
  const tentativasSemId = await Promise.all([
    psqlEmParalelo(pedirEstorno(aguardandoSemId.pagamento, "NAO_COMPARECIMENTO")),
    psqlEmParalelo(pedirEstorno(aguardandoSemId.pagamento, "CANCELAR", aguardandoSemId.contestacao)),
  ]);
  confere(
    "com a contestação aguardando estorno, pedido sem o id ou com outra ação é recusado",
    tentativasSemId.every((tentativa) => tentativa.saida === "f") && situacaoDaAusencia(aguardandoSemId) === "AGUARDANDO_ESTORNO|-|-",
    `${tentativasSemId.map((tentativa) => tentativa.saida).join(", ")}; ${situacaoDaAusencia(aguardandoSemId)}`,
  );

  const devolucaoComAbertura = prepararContestacao(103);
  const secundario103 = id("c3c3f2", 103);
  psql(`
    insert into public.payments (id, event_id, candidate_id, contractor_id, asaas_payment_id, valor, valor_comissao, expira_em)
      values ('${secundario103}', '${devolucaoComAbertura.evento}', '${id("c3c3d1", 103)}', '${devolucaoComAbertura.contratante}', 'pay_disp_sec_103', 550, 50, now() - interval '1 minute');
    update public.payments set status = 'EXPIRADO' where id = '${secundario103}';
  `);
  const [devolucao, aberturaComDevolucao] = await Promise.all([psqlEmParalelo(pedirEstorno(secundario103, "NENHUMA")), psqlEmParalelo(contestar(devolucaoComAbertura))]);
  confere(
    "devolução de Pix fora de hora e abertura de contestação simultâneas passam as duas",
    devolucao.saida === "t" && aberturaComDevolucao.saida === "ABERTA" && situacaoDaAusencia(devolucaoComAbertura) === "ABERTA|-|-",
    `devolução ${devolucao.saida}, contestação ${aberturaComDevolucao.saida}; ${situacaoDaAusencia(devolucaoComAbertura)}`,
  );

  for (const [n, segurar] of [[104, true], [105, false], [106, false], [107, false]]) {
    const caso = prepararContestacao(n);
    const secundario = id("c3c3f2", n);
    psql(`
      insert into public.payments (id, event_id, candidate_id, contractor_id, asaas_payment_id, valor, valor_comissao, expira_em)
        values ('${secundario}', '${caso.evento}', '${id("c3c3d1", n)}', '${caso.contratante}', 'pay_disp_sec_${n}', 550, 50, now() - interval '1 minute');
      update public.payments set status = 'EXPIRADO' where id = '${secundario}';
      select public.claim_asaas_refund('${secundario}', 'NENHUMA');
      insert into public.disputes (event_id, payment_id, aberta_por, motivo) values ('${caso.evento}', '${secundario}', '${caso.contratante}', 'Contestacao vinculada ao pagamento secundario.');
    `);
    const negando = psqlEmParalelo(segurar ? `begin; ${negar(secundario)} select pg_sleep(3); commit;` : negar(secundario));
    if (segurar) await espera(1000);
    const estornando = psqlEmParalelo(pedirEstorno(caso.pagamento, "NAO_COMPARECIMENTO"));
    const [, estorno] = await Promise.all([negando, estornando]);
    confere(
      `contestação vinculada a outro pagamento, estorno do contratado e negativa do outro ${segurar ? "com a trava" : `simultâneos ${n - 104}`}: sem deadlock e estorno recusado`,
      estorno.saida === "f" && (!segurar || estorno.ms >= 1500) && situacaoDaAusencia(caso) === "ABERTA|-|-",
      `estorno ${estorno.saida} em ${estorno.ms} ms; ${situacaoDaAusencia(caso)}`,
    );
  }

  const adquirirTrava = "select public.adquirir_rotina_financeira(gen_random_uuid(), 600);";
  const venceuAlguma = (saidas) => saidas.filter((saida) => /^\d+$/.test(saida)).length;

  psql(LIBERAR_TRAVA_DA_ROTINA);
  const travaSegurada = psqlEmParalelo(`begin; ${adquirirTrava} select pg_sleep(3); commit;`);
  await espera(1000);
  const travaDisputada = psqlEmParalelo(adquirirTrava);
  const [ts, td] = await Promise.all([travaSegurada, travaDisputada]);
  confere("sessão que adquire a trava da rotina recebe a geração", /^\d+$/m.test(ts.saida), ts.saida.replace(/\n/g, " | "));
  confere("sessão concorrente espera e é recusada enquanto a trava vale", td.saida === "" && td.ms >= 1500, `"${td.saida}" em ${td.ms} ms`);

  for (let rodada = 1; rodada <= 5; rodada++) {
    psql(LIBERAR_TRAVA_DA_ROTINA);
    const sessoes = await Promise.all(Array.from({ length: 8 }, () => psqlEmParalelo(adquirirTrava)));
    const saidas = sessoes.map((sessao) => sessao.saida);
    confere(`aquisição simultânea da trava ${rodada}: oito sessões, uma vence`, venceuAlguma(saidas) === 1 && saidas.filter((saida) => saida === "").length === 7, saidas.map((saida) => saida || "recusada").join(", "));
  }

  for (let rodada = 1; rodada <= 3; rodada++) {
    psql(`${LIBERAR_TRAVA_DA_ROTINA} ${adquirirTrava} update public.rotina_financeira_execucao set valida_ate = now() - interval '1 second' where id = 1;`);
    const sessoes = await Promise.all(Array.from({ length: 6 }, () => psqlEmParalelo(adquirirTrava)));
    const saidas = sessoes.map((sessao) => sessao.saida);
    const resultado = psql("select ultimo_resultado from public.rotina_financeira_execucao where id = 1;");
    confere(`retomada simultânea de trava vencida ${rodada}: uma sessão vence e a anterior fica EXPIRADA`, venceuAlguma(saidas) === 1 && resultado === "EXPIRADA", `${saidas.map((saida) => saida || "recusada").join(", ")}; ${resultado}`);
  }

  psql(LIBERAR_TRAVA_DA_ROTINA);
  const geracaoAntiga = psql("select public.adquirir_rotina_financeira('00000000-0000-4000-8000-00000000aa01', 600);");
  psql("update public.rotina_financeira_execucao set valida_ate = now() - interval '1 second' where id = 1;");
  const [renovacaoAntiga, novaAquisicao] = await Promise.all([
    psqlEmParalelo(`select public.renovar_rotina_financeira('00000000-0000-4000-8000-00000000aa01', ${geracaoAntiga}, 600);`),
    psqlEmParalelo(adquirirTrava),
  ]);
  const encerramentoAntigo = psql(`select public.encerrar_rotina_financeira('00000000-0000-4000-8000-00000000aa01', ${geracaoAntiga}, 'SUCESSO', null);`);
  confere(
    "dono com trava vencida não renova nem encerra a execução que assumiu",
    renovacaoAntiga.saida === "f" && /^\d+$/.test(novaAquisicao.saida) && encerramentoAntigo === "f",
    `geração antiga ${geracaoAntiga}; renovação ${renovacaoAntiga.saida}, aquisição ${novaAquisicao.saida}, encerramento ${encerramentoAntigo}`,
  );
  psql(LIBERAR_TRAVA_DA_ROTINA);
} finally {
  limpar();
}

for (const { nome, ok, detalhe } of resultados) console.log(`${ok ? "ok" : "FALHOU"} - ${nome} (${detalhe})`);
const falhas = resultados.filter((r) => !r.ok).length;
console.log(`${resultados.length - falhas}/${resultados.length} ok`);
process.exit(falhas === 0 ? 0 : 1);
