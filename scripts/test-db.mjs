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
<<<<<<< HEAD
      // O CLI trunca mensagens de erro longas. Retorne só a contagem e as falhas.
      "insert into _tap(line) select * from finish();\nreset role;\ndo $do$ begin\n" +
      "  raise exception 'TAP>> %/% | %',\n" +
      "    (select count(*) from _tap where line like 'ok %'),\n" +
      "    (select substring(line from 4)::int from _tap where line like '1..%' limit 1),\n" +
      "    coalesce((select string_agg(line, ' | ' order by ts) from _tap where line like 'not ok%' or line like '#%'), '');\n" +
      "end $do$;\n",
=======
      "insert into _tap(line) select * from finish();\nreset role;\ndo $do$ begin raise exception 'TAP>> %', (select string_agg(case when line like 'ok %' then 'ok' else line end, E'\n' order by ts) from _tap); end $do$;\n",
>>>>>>> upstream/main
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
  const summary = output.match(/TAP>> (\d+)\/(\d+) \| ([\s\S]*?)(?:\\+nCONTEXT|\r?\nCONTEXT|$)/);
  if (!summary) return { failed: 1, report: `Não foi possível executar ${file}:\n${output.trim()}` };

<<<<<<< HEAD
  const passed = Number(summary[1]);
  const planned = Number(summary[2]);
  const failures = summary[3].trim().replace(/["}]+$/, "");
  return { failed: planned - passed, report: `${file}: ${passed}/${planned} ok${failures ? `\n${failures}` : ""}` };
=======
  const lines = tap.split("\n").filter(Boolean);
  const planned = Number(lines[0]?.match(/^1\.\.(\d+)/)?.[1] ?? 0);
  const passed = lines.filter((line) => line.startsWith("ok")).length;
  const failures = lines.filter((line) => line.startsWith("not ok") || line.startsWith("#"));
  return { failed: planned - passed, report: `${file}: ${passed}/${planned} ok${failures.length ? `\n${failures.join("\n")}` : ""}` };
>>>>>>> upstream/main
}

let failed = 0;
for (const file of readdirSync(testsDir).filter((name) => name.endsWith(".test.sql")).sort()) {
  const result = run(file);
  console.log(result.report);
  failed += result.failed;
}
process.exit(failed === 0 ? 0 : 1);
