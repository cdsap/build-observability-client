import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const root = fileURLToPath(new URL("../", import.meta.url));
const readJson = (path) => JSON.parse(readFileSync(join(root, path), "utf8"));

// Opt-in renderer subpaths may later live here with their own tsconfig.
const RENDERER_DIR = "src/render/";

const IMPORT_SPECIFIER = [
  /\b(?:import|export)\b[^;]*?\bfrom\s*["']([^"']+)["']/g,
  /\bimport\s*["']([^"']+)["']/g,
  /\bimport\s*\(\s*["']([^"']+)["']/g,
  /\brequire\s*\(\s*["']([^"']+)["']/g,
];

function coreSourceFiles() {
  return readdirSync(join(root, "src"), { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
    .map((entry) => relative(root, join(entry.parentPath, entry.name)).split(sep).join("/"))
    .filter((path) => !path.startsWith(RENDERER_DIR));
}

describe("core package boundary", () => {
  it("type-checks against ECMAScript only, without DOM or Node.js globals", () => {
    const { compilerOptions } = readJson("tsconfig.json");
    assert.deepEqual(compilerOptions.lib, ["ES2022"]);
    assert.deepEqual(compilerOptions.types, []);
  });

  it("has no runtime dependencies", () => {
    const pkg = readJson("package.json");
    for (const field of ["dependencies", "peerDependencies", "optionalDependencies", "bundleDependencies"]) {
      assert.equal(pkg[field], undefined, `package.json must not declare ${field}`);
    }
  });

  it("only imports relative modules from core sources", () => {
    const files = coreSourceFiles();
    assert.ok(files.length > 0);
    for (const file of files) {
      const source = readFileSync(join(root, file), "utf8");
      assert.doesNotMatch(source, /\/\/\/\s*<reference\s+(?:types|lib)\s*=/, `${file} must not add ambient types`);
      for (const pattern of IMPORT_SPECIFIER) {
        for (const [, specifier] of source.matchAll(pattern)) {
          assert.match(specifier, /^\.\.?\//, `${file} imports non-relative module "${specifier}"`);
        }
      }
    }
  });
});
