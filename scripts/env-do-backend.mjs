import { readFileSync } from "node:fs";

export const lerEnvDoBackend = () =>
  Object.fromEntries(
    readFileSync("backend/.env", "utf8")
      .split(/\r?\n/)
      .filter((line) => line.includes("=") && !line.trim().startsWith("#"))
      .map((line) => [line.slice(0, line.indexOf("=")).trim(), line.slice(line.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "")]),
  );
