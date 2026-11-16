import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync("backend/.env", "utf8")
    .split("\n")
    .filter((line) => line.includes("=") && !line.trim().startsWith("#"))
    .map((line) => [line.slice(0, line.indexOf("=")).trim(), line.slice(line.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "")]),
);
const apiUrl = process.env.API_URL || `http://localhost:${env.PORT || 3333}/api`;
const [comando, tentativa, ...resto] = process.argv.slice(2);
const opcao = (nome) => {
  const posicao = resto.indexOf(`--${nome}`);
  return posicao === -1 ? undefined : resto[posicao + 1];
};
const operador = opcao("operador");
const admin = () => createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const LIMITES = `Atenção: a espera de 24 horas e as duas buscas completas na Asaas reduzem o risco de Pix duplicado, mas não comprovam que a transferência não existe.
O nome informado fica registrado como declaração de quem conferiu; ele não é uma identidade autenticada.`;

async function listar() {
  const banco = admin();
  const { data, error } = await banco
    .from("repasse_tentativas")
    .select("id, payment_id, origem, estado, asaas_transfer_id, solicitada_em, verificacao_iniciada_em, payment:payments(status, valor_cache, multa_descontada, event:events(titulo, inicio))")
    .in("estado", ["SOLICITANDO", "INCONCLUSIVA", "EM_VERIFICACAO"])
    .order("solicitada_em");
  if (error) throw error;
  if (data.length === 0) console.log("Nenhuma tentativa de repasse aguardando conferência.");
  for (const t of data) {
    console.log(`\nTentativa ${t.id} (${t.origem}, ${t.estado})\n  Pagamento: ${t.payment_id} (${t.payment?.status})\n  Evento: ${t.payment?.event?.titulo} (${new Date(t.payment?.event?.inicio).toLocaleString("pt-BR")})\n  Cachê: R$ ${t.payment?.valor_cache}, multa reservada: R$ ${t.payment?.multa_descontada ?? 0}\n  Solicitada em: ${new Date(t.solicitada_em).toLocaleString("pt-BR")}${t.asaas_transfer_id ? `\n  Transferência registrada: ${t.asaas_transfer_id}` : ""}${t.verificacao_iniciada_em ? `\n  Verificação iniciada em: ${new Date(t.verificacao_iniciada_em).toLocaleString("pt-BR")}` : ""}`);
  }
  const alertas = await banco.from("repasse_alertas").select("tentativa_id, tipo, asaas_transfer_id, status_transferencia, detalhes, created_at").order("created_at");
  if (alertas.error) throw alertas.error;
  if (alertas.data.length) console.log("\nAlertas para conciliação manual:");
  for (const a of alertas.data) {
    console.log(`  ${a.tipo}: tentativa ${a.tentativa_id}, transferência ${a.asaas_transfer_id} (${a.status_transferencia ?? "situação não informada"})`);
    if (a.tipo === "REPASSE_E_ESTORNO") {
      const d = a.detalhes;
      console.log(`    Transferência concluída e pagamento ${d.payment_id} estornado (${d.ordem}). Retido: R$ ${d.valor_retido}, transferido: R$ ${d.valor_transferido}, multas pendentes: R$ ${d.valor_pendente}.`);
      for (const m of d.multas) console.log(`    Multa ${m.id}: R$ ${m.multa}, reservada em ${m.reserva_payment_id ?? "nenhum pagamento"}, ${m.quitada_em ? `quitada antes em ${new Date(m.quitada_em).toLocaleString("pt-BR")}` : "sem quitação anterior"}`);
    }
  }
  console.log(`\nComandos:
  node scripts/resolver-repasse.mjs verificar <tentativa> --operador "Seu nome"
  node scripts/resolver-repasse.mjs confirmar <tentativa> --operador "Seu nome" --declaro
  node scripts/resolver-repasse.mjs conferir <tentativa>

${LIMITES}`);
}

async function chamar(caminho, corpo) {
  if (!env.ADMIN_TOKEN) {
    console.error("Defina ADMIN_TOKEN em backend/.env (o mesmo valor usado pela API).");
    process.exitCode = 1;
    return null;
  }
  const response = await fetch(`${apiUrl}/admin/repasses/tentativas/${tentativa}/${caminho}`, {
    method: "POST",
    headers: { "x-admin-token": env.ADMIN_TOKEN, "Content-Type": "application/json" },
    body: JSON.stringify(corpo ?? {}),
  });
  if (!response.ok) {
    console.error(`Recusado (${response.status}):`, await response.text());
    process.exitCode = 1;
    return null;
  }
  return response.json();
}

if (!comando) {
  await listar();
} else if (!tentativa || !["verificar", "confirmar", "conferir"].includes(comando)) {
  console.error("Uso: node scripts/resolver-repasse.mjs [verificar|confirmar|conferir] <tentativa> [--operador \"Seu nome\"] [--declaro]");
  process.exitCode = 1;
} else if (comando === "conferir") {
  const resposta = await chamar("conferencia");
  if (resposta) console.log(`Conferência da transferência registrada: ${resposta.resultado}.`);
} else if (!operador) {
  console.error("Informe --operador \"Seu nome\". O nome fica registrado como informado, sem autenticação individual.");
  process.exitCode = 1;
} else if (comando === "verificar") {
  console.log(LIMITES);
  const resposta = await chamar("verificacao", { operador });
  if (resposta?.resultado === "TRANSFERENCIA_ENCONTRADA") console.log("A busca encontrou transferência para esta tentativa; ela foi registrada ou virou alerta. Nada foi liberado.");
  if (resposta?.resultado === "VERIFICACAO_INICIADA") {
    console.log(`Primeira busca completa e vazia registrada. A confirmação só é aceita a partir de ${new Date(resposta.confirmarAPartirDe).toLocaleString("pt-BR")}.`);
  }
} else if (!resto.includes("--declaro")) {
  const { data, error } = await admin().rpc("declaracao_ausencia_repasse");
  if (error) throw error;
  console.log(`${LIMITES}\n\nPara confirmar, leia a declaração abaixo e repita o comando com --declaro:\n\n"${data}"`);
  process.exitCode = 1;
} else {
  const { data: declaracao, error } = await admin().rpc("declaracao_ausencia_repasse");
  if (error) throw error;
  console.log(LIMITES);
  const resposta = await chamar("confirmacao", { operador, declaracao });
  if (resposta?.resultado === "TRANSFERENCIA_ENCONTRADA") console.log("A segunda busca encontrou transferência para esta tentativa; nada foi liberado.");
  if (resposta?.resultado === "AUSENCIA_CONFIRMADA") console.log("Ausência confirmada com a segunda busca vazia. Uma nova tentativa de repasse foi solicitada.");
}
