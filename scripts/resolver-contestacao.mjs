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
    .select("id, motivo, created_at, aberta_por, event:events(titulo, inicio, contractor_id, musico_contratado_id)")
    .eq("status", "ABERTA")
    .order("created_at");
  if (error) throw error;
  if (data.length === 0) console.log("Nenhuma contestação aberta.");
  for (const disputa of data) {
    const quem = disputa.aberta_por === disputa.event?.contractor_id ? "contratante" : "músico";
    console.log(`\n${disputa.id}\n  Evento: ${disputa.event?.titulo} (${new Date(disputa.event?.inicio).toLocaleString("pt-BR")})\n  Aberta pelo ${quem} em ${new Date(disputa.created_at).toLocaleString("pt-BR")}\n  Motivo: ${disputa.motivo}`);
  }
  console.log("\nPara decidir: node scripts/resolver-contestacao.mjs <id> pagar|devolver \"observação opcional\"");
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
