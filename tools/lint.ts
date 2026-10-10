// The repository's lint: text files are tidy (Unix line endings, one newline at the end, no
// trailing spaces, no tabs), JSON parses, and the shell samples pass `bash -n` and, where it
// is installed, shellcheck. No dependencies.
import { execFileSync, spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.join(import.meta.dirname, "..");
const SKIP = new Set(["node_modules", ".git"]);

function filesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (SKIP.has(entry.name)) return [];
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? filesUnder(full) : [full];
  });
}

const problems: string[] = [];
const TEXT = /\.(md|json|ya?ml|ts|sh)$|^(LICENSE|\.gitignore)$/;

for (const file of filesUnder(ROOT)) {
  const name = path.relative(ROOT, file);
  if (!TEXT.test(path.basename(file)) || name === "package-lock.json") continue;
  const text = readFileSync(file, "utf8");
  if (text.includes("\r")) problems.push(`${name}: has Windows line endings`);
  if (!text.endsWith("\n") || text.endsWith("\n\n")) problems.push(`${name}: must end with exactly one newline`);
  text.split("\n").forEach((line, i) => {
    if (/[ \t]+$/.test(line)) problems.push(`${name}:${i + 1}: trailing whitespace`);
    if (line.includes("\t")) problems.push(`${name}:${i + 1}: a tab`);
  });
  if (name.endsWith(".json")) {
    try {
      JSON.parse(text);
    } catch (error) {
      problems.push(`${name}: not JSON (${error instanceof Error ? error.message : String(error)})`);
    }
  }
  if (name.endsWith(".sh")) {
    const syntax = spawnSync("bash", ["-n", file], { encoding: "utf8" });
    if (syntax.status !== 0) problems.push(`${name}: bash -n: ${syntax.stderr.trim()}`);
    const hasShellcheck = spawnSync("shellcheck", ["--version"]).status === 0;
    if (hasShellcheck) {
      try {
        execFileSync("shellcheck", [file], { encoding: "utf8", stdio: "pipe" });
      } catch (error) {
        problems.push(`${name}: shellcheck:\n${(error as { stdout?: string }).stdout ?? String(error)}`);
      }
    } else console.warn(`shellcheck is not installed: ${name} was checked with bash -n only.`);
  }
}

if (problems.length) {
  console.error(problems.join("\n"));
  process.exitCode = 1;
} else console.log("lint: ok");
