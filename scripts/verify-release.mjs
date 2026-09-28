import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const errors = [];
if (pkg.type !== "module") errors.push("package must remain ESM");
if (pkg.sideEffects !== false) errors.push("package must declare sideEffects false for tree-shaking");
if (pkg.publishConfig?.provenance !== true) errors.push("npm provenance must remain enabled");
if (!Array.isArray(pkg.files) || !pkg.files.includes("dist") || !pkg.files.includes("schemas")) errors.push("publish files must include dist and schemas");
if (!pkg.scripts?.prepublishOnly?.includes("verify-package.mjs")) errors.push("prepublishOnly must include package verification");
for (const [subpath, target] of Object.entries(pkg.exports)) {
  if (subpath.includes("*") || typeof target === "string") continue;
  if (target.default?.startsWith("./src/") || target.types?.startsWith("./src/")) errors.push(`${subpath} exposes source files`);
}
if (errors.length) throw new Error(`Release gate failed:\n- ${errors.join("\n- ")}`);
console.log(`release metadata gate passed for ${pkg.name}@${pkg.version}`);
