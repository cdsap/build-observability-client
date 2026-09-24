// Synchronizes the released GBOS schema/registry assets pinned in
// schemas/provenance.json. Usage: node scripts/sync-schema-assets.mjs [--check]
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ASSET_ROOT,
  GENERATED_TS_FILE,
  LICENSE_FILE,
  PROVENANCE_FILE,
  artifactUrl,
  buildProvenance,
  licenseUrl,
  readZipEntries,
  renderProvenanceJson,
  renderProvenanceModule,
  selectAssetEntries,
  validatePin,
  verifyArtifactDigest,
} from "./lib/schema-assets.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const assetRoot = join(root, ASSET_ROOT);
const generatedModule = join(root, GENERATED_TS_FILE);

async function download(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`GET ${url} failed: ${response.status} ${response.statusText}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

async function readIfExists(path) {
  try {
    return await readFile(path);
  } catch (error) {
    if (error.code === "ENOENT") return undefined;
    throw error;
  }
}

async function listFiles(dir) {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true }).catch((error) => {
    if (error.code === "ENOENT") return [];
    throw error;
  });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => relative(dir, join(entry.parentPath, entry.name)).split(sep).join("/"));
}

async function main(args) {
  const unknown = args.filter((arg) => arg !== "--check");
  if (unknown.length > 0) throw new Error(`Unknown arguments: ${unknown.join(" ")}`);
  const check = args.includes("--check");

  const pin = JSON.parse(await readFile(join(assetRoot, PROVENANCE_FILE), "utf8"));
  validatePin(pin);

  const artifact = await download(artifactUrl(pin));
  verifyArtifactDigest(pin, artifact);
  const assets = selectAssetEntries(readZipEntries(artifact));
  const license = await download(licenseUrl(pin));

  const provenance = buildProvenance(pin, assets, license);
  const expected = new Map([
    ...assets,
    [LICENSE_FILE, license],
    [PROVENANCE_FILE, Buffer.from(renderProvenanceJson(provenance))],
  ]);
  const moduleSource = Buffer.from(renderProvenanceModule(provenance));

  if (check) {
    const problems = [];
    for (const [path, content] of expected) {
      const actual = await readIfExists(join(assetRoot, path));
      if (actual === undefined) problems.push(`missing ${ASSET_ROOT}/${path}`);
      else if (!actual.equals(content)) problems.push(`${ASSET_ROOT}/${path} differs from ${pin.repository}@${pin.tag}`);
    }
    for (const path of await listFiles(assetRoot)) {
      if (!expected.has(path)) problems.push(`unexpected ${ASSET_ROOT}/${path}`);
    }
    const actualModule = await readIfExists(generatedModule);
    if (actualModule === undefined || !actualModule.equals(moduleSource)) {
      problems.push(`${GENERATED_TS_FILE} is out of date`);
    }
    if (problems.length > 0) {
      console.error(`Schema assets do not match the pinned release:\n  ${problems.join("\n  ")}`);
      console.error("Run `npm run assets:sync` to regenerate them.");
      process.exitCode = 1;
      return;
    }
    console.log(`Schema assets match ${pin.repository}@${pin.tag} (${pin.artifact.name}).`);
    return;
  }

  await rm(assetRoot, { recursive: true, force: true });
  for (const [path, content] of expected) {
    const target = join(assetRoot, path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content);
  }
  await mkdir(dirname(generatedModule), { recursive: true });
  await writeFile(generatedModule, moduleSource);
  console.log(`Synchronized ${assets.size} assets from ${pin.repository}@${pin.tag} (${pin.artifact.name}).`);
}

main(process.argv.slice(2)).catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
