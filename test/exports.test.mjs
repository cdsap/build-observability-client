import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const root = new URL("../", import.meta.url);
const pkg = JSON.parse(readFileSync(new URL("package.json", root), "utf8"));
const provenance = JSON.parse(readFileSync(new URL("schemas/provenance.json", root), "utf8"));

// Keep in sync with the subpath table in README.md and docs/adr/0001.
const DOCUMENTED_SUBPATHS = [".", "./assets", "./validate", "./registry", "./model", "./parse", "./diagnostics", "./adapters/source", "./adapters/direct", "./adapters/report", "./adapters/ndjson", "./adapters/develocity", "./query", "./view", "./presentation", "./render-dom", "./adapters/extension", "./schema/*", "./registry/*", "./package.json"];

// Reserved by ADR 0001 until a spike adds the module and the matching export.
const UNIMPLEMENTED_RESERVED_SUBPATHS = ["./render-vega-lite"];

describe("package exports", () => {
  it("exposes exactly the documented subpaths", () => {
    assert.deepEqual(Object.keys(pkg.exports), DOCUMENTED_SUBPATHS);
  });

  it("does not advertise unfinished reserved subpaths", async () => {
    for (const subpath of UNIMPLEMENTED_RESERVED_SUBPATHS) {
      assert.equal(pkg.exports[subpath], undefined, subpath);
      await assert.rejects(import(`@cdsap/gbos/${subpath.slice(2)}`), { code: "ERR_PACKAGE_PATH_NOT_EXPORTED" }, subpath);
    }
  });

  it("points every declared export target at a file the build produces", () => {
    for (const [subpath, target] of Object.entries(pkg.exports)) {
      if (typeof target === "string") {
        if (target.includes("*")) continue;
        assert.ok(existsSync(new URL(target, root)), `${subpath} -> ${target}`);
        continue;
      }
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

  it("imports the model, parser, diagnostics, and Develocity adapter entry points", async () => {
    assert.equal(typeof (await import("@cdsap/gbos/model")).observationFingerprint, "function");
    assert.equal(typeof (await import("@cdsap/gbos/parse")).parseObservations, "function");
    assert.equal(typeof (await import("@cdsap/gbos/diagnostics")).diagnostic, "function");
    assert.equal(typeof (await import("@cdsap/gbos/adapters/develocity")).parseDevelocityProjection, "function");
  });

  it("imports the model, parser, and diagnostics entry points", async () => {
    assert.equal(typeof (await import("@cdsap/gbos/model")).observationFingerprint, "function");
    assert.equal(typeof (await import("@cdsap/gbos/parse")).parseObservations, "function");
    assert.equal(typeof (await import("@cdsap/gbos/diagnostics")).diagnostic, "function");
  });

  it("imports the Develocity adapter entry point", async () => {
    const { parseDevelocityProjection } = await import("@cdsap/gbos/adapters/develocity");
    assert.equal(typeof parseDevelocityProjection, "function");
  });

  it("imports validator and registry entry points", async () => {
    assert.equal(typeof (await import("@cdsap/gbos/validate")).validateObservation, "function");
    assert.equal(typeof (await import("@cdsap/gbos/registry")).createRegistryLookup, "function");
  });

  it("imports the query entry point", async () => {
    assert.equal(typeof (await import("@cdsap/gbos/query")).queryObservations, "function");
  });

  it("imports the view entry point", async () => {
    assert.equal(typeof (await import("@cdsap/gbos/view")).buildViewModel, "function");
  });

  it("imports the presentation, DOM renderer, and extension boundaries", async () => {
    assert.equal(typeof (await import("@cdsap/gbos/presentation")).createDevelocityViewSpec, "function");
    assert.equal(typeof (await import("@cdsap/gbos/render-dom")).renderViewSpec, "function");
    assert.equal(typeof (await import("@cdsap/gbos/adapters/extension")).createExtensionAdapter, "function");
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
