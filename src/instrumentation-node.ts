import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const parseEnvLine = (line: string) => {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;

  const eqIndex = trimmed.indexOf("=");
  if (eqIndex <= 0) return null;

  const key = trimmed.slice(0, eqIndex).trim();
  const value = trimmed.slice(eqIndex + 1).trim().replace(/^["']|["']$/g, "");

  if (!key) return null;
  return { key, value };
};

const envUserPath = join(process.cwd(), ".env.user");
if (existsSync(envUserPath)) {
  const content = readFileSync(envUserPath, "utf-8");
  for (const line of content.split("\n")) {
    const parsed = parseEnvLine(line);
    if (!parsed) continue;
    if (!(parsed.key in process.env)) {
      process.env[parsed.key] = parsed.value;
    }
  }
}

export {};
