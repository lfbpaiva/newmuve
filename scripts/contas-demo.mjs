import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(readFileSync("backend/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]));
const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const PASSWORD = "teste123";
const unsplash = (id) => `https://images.unsplash.com/photo-${id}?w=400&h=400&fit=crop`;

const contas = [
  { email: "teste@teste.com", role: "MUSICIAN", perfil: { nome_completo: "Músico Teste", documento: "52998224725", telefone: "45999990001", foto_perfil_url: unsplash("1510915361894-db8b60106cb1"), uf: "PR", cidade: "Cascavel", estilos_musicais: ["Rock", "MPB", "Sertanejo"], bio: "Conta de demonstração. Voz e violão, repertório variado.", chave_pix_tipo: "EMAIL", chave_pix: "cliente-a00001@pix.bcb.gov.br" } },
  { email: "contratante@teste.com", role: "CONTRACTOR", perfil: { nome_fantasia: "Bar Teste", documento: "11222333000181", telefone: "45322210001", foto_perfil_url: unsplash("1514933651103-005eec06c04b"), uf: "PR", cidade: "Cascavel" } },
];

const { data } = await admin.auth.admin.listUsers({ perPage: 200 });
for (const conta of contas) {
  for (const u of data.users.filter((u) => u.email === conta.email)) await admin.auth.admin.deleteUser(u.id);
  const { data: created, error } = await admin.auth.admin.createUser({ email: conta.email, password: PASSWORD, email_confirm: true });
  if (error) throw error;
  await admin.from("profiles").insert({ id: created.user.id, role: conta.role }).throwOnError();
  await admin.from(conta.role === "MUSICIAN" ? "musician_profiles" : "contractor_profiles").insert({ user_id: created.user.id, ...conta.perfil }).throwOnError();
  console.log(`${conta.role === "MUSICIAN" ? "Músico" : "Contratante"}: ${conta.email} / ${PASSWORD}`);
}
