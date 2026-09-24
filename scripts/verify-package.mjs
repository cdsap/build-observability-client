// Packs the library, checks the tarball contents against the export map, and
// installs it into a throwaway consumer that imports and type-checks every
// documented subpath. Run after `npm run build`.
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(import.meta.url);
const FORBIDDEN_PREFIXES = ["src/", "test/", "scripts/", "node_modules/", ".github/", "docs/"];

function run(command, args, cwd) {
  return execFileSync(command, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
}

function npm(args, cwd) {
  const npmCli = process.env.npm_execpath;
  if (npmCli) return run(process.execPath, [npmCli, ...args], cwd);
  return execFileSync("npm", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
    shell: process.platform === "win32",
  });
}

function exportTargets(exports) {
  return Object.values(exports).flatMap((target) => (typeof target === "string" ? [target] : Object.values(target)));
}

function verifyTarballFiles(pkg, provenance, files) {
  const problems = [];
  const has = (path) => files.has(path);
  for (const target of exportTargets(pkg.exports)) {
    const path = target.replace(/^\.\//, "");
    if (path.includes("*")) {
      const prefix = path.slice(0, path.indexOf("*"));
      if (![...files].some((file) => file.startsWith(prefix))) problems.push(`no files for export target ${target}`);
    } else if (!has(path)) {
      problems.push(`missing export target ${target}`);
    }
  }
  for (const file of [...provenance.files, provenance.license]) {
    if (!has(`schemas/${file.path}`)) problems.push(`missing schemas/${file.path}`);
  }
  if (!has("schemas/provenance.json")) problems.push("missing schemas/provenance.json");
  for (const file of files) {
    if (FORBIDDEN_PREFIXES.some((prefix) => file.startsWith(prefix))) problems.push(`unexpected ${file}`);
  }
  return problems;
}

const CONSUMER_JS = `import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { GBOS_CLIENT_PACKAGE } from "@cdsap/gbos";
import { SCHEMA_ASSETS } from "@cdsap/gbos/assets";

if (GBOS_CLIENT_PACKAGE !== "@cdsap/gbos") throw new Error("unexpected root export");
for (const { path } of SCHEMA_ASSETS.files) {
  JSON.parse(readFileSync(fileURLToPath(import.meta.resolve("@cdsap/gbos/" + path)), "utf8"));
}
console.log("consumer imported @cdsap/gbos, @cdsap/gbos/assets, and " + SCHEMA_ASSETS.files.length + " schema/registry assets");
`;

const CONSUMER_TS = `import { GBOS_CLIENT_PACKAGE } from "@cdsap/gbos";
import { SCHEMA_ASSETS, type SchemaAssetProvenance } from "@cdsap/gbos/assets";
import observationSchema from "@cdsap/gbos/schema/observation.schema.json" with { type: "json" };
import semanticConventions from "@cdsap/gbos/registry/semantic-conventions.json" with { type: "json" };

export const name: "@cdsap/gbos" = GBOS_CLIENT_PACKAGE;
export const provenance: SchemaAssetProvenance = SCHEMA_ASSETS;
export const assets: readonly unknown[] = [observationSchema, semanticConventions];
`;

function consumerTsconfig(module, moduleResolution) {
  return `${JSON.stringify(
    {
      compilerOptions: {
        target: "ES2022",
        lib: ["ES2022"],
        types: [],
        module,
        moduleResolution,
        resolveJsonModule: true,
        strict: true,
        noEmit: true,
      },
      files: ["consumer.ts"],
    },
    null,
    2,
  )}\n`;
}

async function main() {
  const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  const provenance = JSON.parse(await readFile(join(root, "schemas", "provenance.json"), "utf8"));
  const workDir = await mkdtemp(join(tmpdir(), "gbos-pack-"));
  try {
    const [packed] = JSON.parse(npm(["pack", "--json", "--pack-destination", workDir], root));
    const files = new Set(packed.files.map((file) => file.path));
    const problems = verifyTarballFiles(pkg, provenance, files);
    if (problems.length > 0) {
      throw new Error(`Packed tarball ${packed.filename} is invalid:\n  ${problems.join("\n  ")}`);
    }
    console.log(`${packed.filename}: ${files.size} files, ${packed.size} bytes`);

    const consumer = join(workDir, "consumer");
    await mkdir(consumer);
    await writeFile(
      join(consumer, "package.json"),
      `${JSON.stringify({ name: "gbos-consumer", private: true, type: "module" }, null, 2)}\n`,
    );
    npm(
      ["install", "--no-audit", "--no-fund", "--ignore-scripts", "--no-package-lock", join(workDir, packed.filename)],
      consumer,
    );

    await writeFile(join(consumer, "consumer.mjs"), CONSUMER_JS);
    process.stdout.write(run(process.execPath, ["consumer.mjs"], consumer));

    const tsc = require.resolve("typescript/bin/tsc");
    await writeFile(join(consumer, "consumer.ts"), CONSUMER_TS);
    for (const [module, moduleResolution] of [
      ["NodeNext", "NodeNext"],
      ["ESNext", "Bundler"],
    ]) {
      const config = `tsconfig.${moduleResolution.toLowerCase()}.json`;
      await writeFile(join(consumer, config), consumerTsconfig(module, moduleResolution));
      run(process.execPath, [tsc, "--project", config], consumer);
      console.log(`consumer type-checks with moduleResolution ${moduleResolution}`);
    }
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error.stdout || error.message);
  process.exitCode = 1;
});
