// Test-only module hooks: resolve the "@/..." path alias and extensionless
// TypeScript imports so route handlers can run under `node --experimental-strip-types`.
import { existsSync } from "node:fs";
import { dirname, resolve as resolvePath } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const src = resolvePath(dirname(fileURLToPath(import.meta.url)), "../../src");
const candidates = (base) => [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`];

export async function resolve(specifier, context, nextResolve) {
  let base = null;
  if (specifier.startsWith("@/")) base = resolvePath(src, specifier.slice(2));
  else if ((specifier.startsWith("./") || specifier.startsWith("../")) && context.parentURL?.endsWith(".ts")) base = resolvePath(dirname(fileURLToPath(context.parentURL)), specifier);
  if (base) for (const file of candidates(base)) if (existsSync(file) && !file.endsWith(base) || (file === base && /\.[cm]?[jt]sx?$/.test(file) && existsSync(file))) return { url: pathToFileURL(file).href, shortCircuit: true };
  // Bare package subpaths such as "next/server" need the explicit .js file under ESM.
  if (specifier === "next/server") return nextResolve("next/server.js", context);
  return nextResolve(specifier, context);
}
