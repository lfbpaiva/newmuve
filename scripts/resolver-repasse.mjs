import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync("backend/.env", "utf8")
    .split("\n")
    .filter((line) => line.includes("=") && !line.trim().startsWith("#"))
    .map((line) => [line.slice(0, line.indexOf("=")).trim(), line.slice(line.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "")]),
);
const apiUrl = process.env.API_URL || `http://localhost:${env.PORT || 3333}/api`;
const [id] = process.argv.slice(2);

if (!id) {
  const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const { data, error } = await admin
    .from("payments")
    .select("id, valor_cache, multa_descontada, event:events(titulo, inicio)")
    .eq("status", "PAGO")
    .eq("repasse_status", "PROCESSANDO")
    .is("repasse_asaas_id", null);
  if (error) throw error;
  if (data.length === 0) console.log("Nenhum repasse aguardando conferência.");
  for (const pagamento of data) {
    console.log(`\n${pagamento.id}\n  Evento: ${pagamento.event?.titulo} (${new Date(pagamento.event?.inicio).toLocaleString("pt-BR")})\n  Cachê: R$ ${pagamento.valor_cache}, multa descontada: R$ ${pagamento.multa_descontada ?? 0}`);
  }
  console.log("\nConfira em Transferências, no painel da Asaas. Para liberar: node scripts/resolver-repasse.mjs <id>");
} else if (!env.ADMIN_TOKEN) {
  console.error("Defina ADMIN_TOKEN em backend/.env (o mesmo valor usado pela API).");
  process.exitCode = 1;
} else {
  const response = await fetch(`${apiUrl}/admin/repasses/${id}/liberacao`, { method: "POST", headers: { "x-admin-token": env.ADMIN_TOKEN } });
  if (response.ok) {
    const { resultado } = await response.json();
    console.log(resultado === "VINCULADO" ? "A transferência foi localizada na Asaas e vinculada ao pagamento; nada foi reenviado." : "Nenhuma transferência encontrada: o repasse foi enviado de novo.");
  } else {
    console.error(`Falhou (${response.status}):`, await response.text());
    process.exitCode = 1;
  }
}
