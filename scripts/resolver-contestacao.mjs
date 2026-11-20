import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync("backend/.env", "utf8")
    .split("\n")
    .filter((line) => line.includes("=") && !line.trim().startsWith("#"))
    .map((line) => [line.slice(0, line.indexOf("=")).trim(), line.slice(line.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "")]),
);
const apiUrl = process.env.API_URL || `http://localhost:${env.PORT || 3333}/api`;
const [id, decisao, ...observacao] = process.argv.slice(2);
const decisoes = { pagar: "PAGAR_MUSICO", devolver: "DEVOLVER_CONTRATANTE" };

if (!id) {
  const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const { data, error } = await admin
    .from("disputes")
    .select("id, event_id, status, motivo, observacao, created_at, aberta_por, event:events(titulo, inicio, contractor_id, musico_contratado_id)")
    .in("status", ["ABERTA", "AGUARDANDO_ESTORNO"])
    .order("created_at");
  if (error) throw error;
  if (data.length === 0) console.log("Nenhuma contestação aberta ou aguardando estorno.");
  for (const disputa of data) {
    const quem = disputa.aberta_por === disputa.event?.contractor_id ? "contratante" : "músico";
    console.log(`\n${disputa.id} [${disputa.status}]\n  Evento: ${disputa.event?.titulo} (${new Date(disputa.event?.inicio).toLocaleString("pt-BR")})\n  Aberta pelo ${quem} em ${new Date(disputa.created_at).toLocaleString("pt-BR")}\n  Motivo: ${disputa.motivo}`);
    if (disputa.status === "ABERTA") {
      console.log("  Situação: em análise, sem decisão. Decida com pagar ou devolver.");
      continue;
    }
    const pagamento = await admin
      .from("payments")
      .select("status, refund_status")
      .eq("event_id", disputa.event_id)
      .eq("status", "PAGO")
      .maybeSingle();
    if (pagamento.error) throw pagamento.error;
    const estorno = pagamento.data?.refund_status ?? null;
    console.log(`  Decisão já tomada: devolver ao contratante.${disputa.observacao ? ` Observação: ${disputa.observacao}` : ""}`);
    if (!pagamento.data) {
      console.log("  Situação: não há pagamento confirmado para estornar. Não retome; concilie manualmente.");
    } else if (estorno === "PROCESSANDO" || estorno === "CONFIRMADO") {
      console.log(`  Situação: estorno ${estorno === "PROCESSANDO" ? "pedido e aguardando a Asaas" : "confirmado"}. Nada a fazer; a contestação é encerrada quando a Asaas confirmar.`);
    } else {
      console.log(`  Situação: estorno não pedido (estorno: ${estorno ?? "nenhum"}). Pode ser retomada com: node scripts/resolver-contestacao.mjs ${disputa.id} devolver`);
    }
  }
  console.log(`\nPara decidir uma contestação em análise: node scripts/resolver-contestacao.mjs <id> pagar|devolver "observação opcional"
Para retomar uma devolução sem estorno pedido: node scripts/resolver-contestacao.mjs <id> devolver
Uma contestação aguardando estorno não aceita decisão diferente; a API recusa.`);
  process.exit(0);
}

if (!decisoes[decisao]) {
  console.error("Use: node scripts/resolver-contestacao.mjs <id> pagar|devolver \"observação opcional\"");
  process.exit(1);
}
if (!env.ADMIN_TOKEN) {
  console.error("Defina ADMIN_TOKEN em backend/.env (o mesmo valor usado pela API).");
  process.exit(1);
}

const response = await fetch(`${apiUrl}/admin/contestacoes/${id}/resolucao`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "x-admin-token": env.ADMIN_TOKEN },
  body: JSON.stringify({ decisao: decisoes[decisao], observacao: observacao.join(" ") || undefined }),
});
if (!response.ok) {
  console.error(`Falhou (${response.status}):`, await response.text());
  process.exit(1);
}
console.log(decisao === "pagar" ? "Decidido: o cachê será repassado ao músico." : "Decidido: o valor será devolvido ao contratante.");
