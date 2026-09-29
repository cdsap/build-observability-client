import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(import.meta.url);
const npm = process.env.npm_execpath ? [process.execPath, process.env.npm_execpath] : ["npm"];
const run = (command, args, cwd) => execFileSync(command, args, { cwd, stdio: "inherit" });
const workDir = await mkdtemp(join(tmpdir(), "gbos-browser-"));
try {
  const [packed] = JSON.parse(execFileSync(npm[0], [...npm.slice(1), "pack", "--json", "--pack-destination", workDir], { cwd: root, encoding: "utf8" }));
  const consumer = join(workDir, "consumer");
  await mkdir(consumer);
  await writeFile(join(consumer, "package.json"), JSON.stringify({ name: "gbos-browser-consumer", private: true, type: "module" }));
  run(npm[0], [...npm.slice(1), "install", "--no-audit", "--no-fund", "--ignore-scripts", "--no-package-lock", join(workDir, packed.filename)], consumer);
  await writeFile(join(consumer, "consumer.ts"), `
import { parseObservations } from "@cdsap/gbos/parse";
import { queryObservations } from "@cdsap/gbos/query";
import { validateObservation } from "@cdsap/gbos/validate";
import { observationFingerprint } from "@cdsap/gbos/model";
export const api = { parseObservations, queryObservations, validateObservation, observationFingerprint };
`);
  await writeFile(join(consumer, "tsconfig.json"), JSON.stringify({ compilerOptions: { target: "ES2022", lib: ["ES2022", "DOM"], types: [], module: "ESNext", moduleResolution: "Bundler", strict: true, noEmit: true }, files: ["consumer.ts"] }));
  run(process.execPath, [require.resolve("typescript/bin/tsc"), "--project", "tsconfig.json"], consumer);
  console.log("browser-oriented ESM consumer type-check passed");
} finally {
  await rm(workDir, { recursive: true, force: true });
}
