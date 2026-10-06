// Executa os testes pgTAP de supabase/tests/database no projeto Supabase vinculado,
// sem Docker (alternativa a `supabase test db`, que exige Docker).
//
// Cada arquivo roda em uma única transação que termina com uma exceção proposital:
// isso garante o rollback (nenhum dado de teste permanece no banco) e traz o
// resultado TAP de volta na mensagem de erro.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const testsDir = "supabase/tests/database";
const workDir = mkdtempSync(join(tmpdir(), "muve-pgtap-"));

function toRemoteScript(sql) {
  return sql
    .replace(
      /^select plan\(/m,
      "create temp table _tap(ts timestamptz default clock_timestamp(), line text);\ngrant all on _tap to public;\ninsert into _tap(line) select plan(",
    )
    .replace(/^select (throws_ok|results_eq|is|ok|isnt|lives_ok)\(/gm, "insert into _tap(line) select $1(")
    .replace(
      /^select \* from finish\(\);\s*rollback;\s*$/m,
      "insert into _tap(line) select * from finish();\nreset role;\ndo $do$ begin raise exception 'TAP>> %', (select string_agg(line, E'\\n' order by ts) from _tap); end $do$;\n",
    );
}

function run(file) {
  const scriptPath = join(workDir, file);
  writeFileSync(scriptPath, toRemoteScript(readFileSync(join(testsDir, file), "utf8")));
  let output;
  try {
    output = execFileSync("npx", ["-y", "supabase", "db", "query", "--linked", "-f", scriptPath], {
      encoding: "utf8",
      shell: process.platform === "win32",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    output = `${error.stdout ?? ""}${error.stderr ?? ""}`;
  }
  const tap = output.match(/TAP>> ([\s\S]*?)(?:\\nCONTEXT|\nCONTEXT|$)/)?.[1]?.replace(/\\n/g, "\n");
  if (!tap) return { failed: 1, report: `Não foi possível executar ${file}:\n${output.trim()}` };

  const lines = tap.split("\n").filter(Boolean);
  const planned = Number(lines[0]?.match(/^1\.\.(\d+)/)?.[1] ?? 0);
  const passed = lines.filter((line) => line.startsWith("ok ")).length;
  const failures = lines.filter((line) => line.startsWith("not ok") || line.startsWith("#"));
  return { failed: planned - passed, report: `${file}: ${passed}/${planned} ok${failures.length ? `\n${failures.join("\n")}` : ""}` };
}

let failed = 0;
for (const file of readdirSync(testsDir).filter((name) => name.endsWith(".test.sql")).sort()) {
  const result = run(file);
  console.log(result.report);
  failed += result.failed;
}
process.exit(failed === 0 ? 0 : 1);
