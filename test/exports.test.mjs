import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const root = new URL("../", import.meta.url);
const pkg = JSON.parse(readFileSync(new URL("package.json", root), "utf8"));
const provenance = JSON.parse(readFileSync(new URL("schemas/provenance.json", root), "utf8"));

// Keep in sync with the subpath table in README.md and docs/adr/0001.
const DOCUMENTED_SUBPATHS = [".", "./assets", "./schema/*", "./registry/*", "./package.json"];

describe("package exports", () => {
  it("exposes exactly the documented subpaths", () => {
    assert.deepEqual(Object.keys(pkg.exports), DOCUMENTED_SUBPATHS);
  });

  it("points every code subpath at built JavaScript and declarations", () => {
    for (const [subpath, target] of Object.entries(pkg.exports)) {
      if (typeof target === "string") continue;
      assert.deepEqual(Object.keys(target), ["types", "default"], `${subpath} condition order`);
      assert.ok(existsSync(new URL(target.types, root)), `${subpath} types: ${target.types}`);
      assert.ok(existsSync(new URL(target.default, root)), `${subpath} default: ${target.default}`);
    }
  });

  it("imports the root entry point", async () => {
    const gbos = await import("@cdsap/gbos");
    assert.equal(gbos.GBOS_CLIENT_PACKAGE, "@cdsap/gbos");
  });

  it("imports the assets entry point", async () => {
    const { SCHEMA_ASSETS } = await import("@cdsap/gbos/assets");
    assert.equal(SCHEMA_ASSETS.repository, "cdsap/build-observability-schema");
    assert.deepEqual(SCHEMA_ASSETS, provenance);
  });

  it("resolves every pinned schema and registry file through its subpath", () => {
    for (const { path } of provenance.files) {
      const resolved = fileURLToPath(import.meta.resolve(`@cdsap/gbos/${path}`));
      assert.equal(resolved, fileURLToPath(new URL(`schemas/${path}`, root)));
      assert.doesNotThrow(() => JSON.parse(readFileSync(resolved, "utf8")), path);
    }
  });

  it("does not expose internal files", async () => {
    for (const specifier of ["@cdsap/gbos/dist/index.js", "@cdsap/gbos/schemas/provenance.json", "@cdsap/gbos/src/index.ts"]) {
      await assert.rejects(import(specifier), { code: "ERR_PACKAGE_PATH_NOT_EXPORTED" }, specifier);
    }
  });
});
