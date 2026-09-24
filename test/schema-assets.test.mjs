import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateRawSync } from "node:zlib";
import { describe, it } from "node:test";
import {
  GENERATED_TS_FILE,
  artifactUrl,
  buildProvenance,
  licenseUrl,
  readZipEntries,
  renderProvenanceJson,
  renderProvenanceModule,
  selectAssetEntries,
  sha256,
  validatePin,
  verifyArtifactDigest,
} from "../scripts/lib/schema-assets.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const assetRoot = join(root, "schemas");
const provenanceText = readFileSync(join(assetRoot, "provenance.json"), "utf8");
const provenance = JSON.parse(provenanceText);

function zip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const { name, content = Buffer.alloc(0), method = 8 } of entries) {
    const nameBytes = Buffer.from(name);
    const data = method === 8 ? deflateRawSync(content) : content;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(content.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(content.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, nameBytes, data);
    centrals.push(central, nameBytes);
    offset += local.length + nameBytes.length + data.length;
  }
  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

function readAssetTree() {
  return readdirSync(assetRoot, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(assetRoot, join(entry.parentPath, entry.name)).split(sep).join("/"))
    .sort();
}

describe("release artifact extraction", () => {
  it("reads stored and deflated entries and skips directories", () => {
    const archive = zip([
      { name: "schema/" },
      { name: "schema/a.schema.json", content: Buffer.from('{"a":1}'), method: 0 },
      { name: "registry/b.json", content: Buffer.from('{"b":2}'.repeat(50)) },
    ]);
    const entries = readZipEntries(archive);
    assert.deepEqual([...entries.keys()], ["schema/a.schema.json", "registry/b.json"]);
    assert.equal(entries.get("schema/a.schema.json").toString(), '{"a":1}');
    assert.equal(entries.get("registry/b.json").toString(), '{"b":2}'.repeat(50));
  });

  it("rejects malformed archives", () => {
    assert.throws(() => readZipEntries(Buffer.from("not a zip archive at all")), /not a zip archive/i);
    assert.throws(
      () => readZipEntries(zip([{ name: "schema/a.json", content: Buffer.from("x"), method: 12 }])),
      /Unsupported zip compression method 12/,
    );
    assert.throws(
      () => readZipEntries(zip([{ name: "schema/a.json" }, { name: "schema/a.json" }])),
      /Duplicate zip entry/,
    );
  });

  it("selects only top-level schema and registry JSON files, sorted", () => {
    const entries = new Map(
      [
        "registry/z.json",
        "schema/b.schema.json",
        "schema/a.schema.json",
        "META-INF/MANIFEST.MF",
        "schema/nested/c.json",
        "schema/../escape.json",
        "../schema/escape.json",
        "schema/.hidden.json",
        "schema/readme.md",
        "develocity/custom-values.json",
      ].map((name) => [name, Buffer.from(name)]),
    );
    assert.deepEqual([...selectAssetEntries(entries).keys()], [
      "registry/z.json",
      "schema/a.schema.json",
      "schema/b.schema.json",
    ]);
  });

  it("requires both schema and registry assets", () => {
    const only = (name) => new Map([[name, Buffer.from("{}")]]);
    assert.throws(() => selectAssetEntries(only("registry/a.json")), /schema\/\*\.json/);
    assert.throws(() => selectAssetEntries(only("schema/a.schema.json")), /registry\/\*\.json/);
  });

  it("fails closed when the artifact digest does not match the pin", () => {
    const bytes = Buffer.from("tampered");
    assert.throws(() => verifyArtifactDigest(provenance, bytes), /digest mismatch/);
    assert.doesNotThrow(() =>
      verifyArtifactDigest({ ...provenance, artifact: { ...provenance.artifact, sha256: sha256(bytes) } }, bytes),
    );
  });

  it("rejects incomplete or floating pins", () => {
    assert.throws(() => validatePin({ ...provenance, tag: "main" }), /tag/);
    assert.throws(() => validatePin({ ...provenance, commit: "f195210" }), /commit/);
    assert.throws(() => validatePin({ ...provenance, repository: "../evil" }), /repository/);
    assert.throws(() => validatePin({ ...provenance, repository: "cdsap/.." }), /repository/);
    assert.throws(() => validatePin({ ...provenance, artifact: { ...provenance.artifact, sha256: "" } }), /sha256/);
    assert.throws(() => validatePin({ ...provenance, artifact: { ...provenance.artifact, name: "../x.jar" } }), /name/);
  });
});

describe("pinned schema assets", () => {
  it("pins an immutable released artifact", () => {
    validatePin(provenance);
    assert.equal(provenance.repository, "cdsap/build-observability-schema");
    assert.equal(provenance.artifact.url, artifactUrl(provenance));
    assert.equal(provenance.license.url, licenseUrl(provenance));
  });

  it("contains exactly the recorded files", () => {
    const recorded = [...provenance.files.map((file) => file.path), provenance.license.path, "provenance.json"].sort();
    assert.deepEqual(readAssetTree(), recorded);
  });

  it("matches the recorded digests byte-for-byte", () => {
    for (const file of [...provenance.files, provenance.license]) {
      assert.equal(sha256(readFileSync(join(assetRoot, file.path))), file.sha256, file.path);
    }
  });

  it("keeps provenance.json and the generated module in sync with the files", () => {
    const assets = new Map(provenance.files.map(({ path }) => [path, readFileSync(join(assetRoot, path))]));
    const regenerated = buildProvenance(provenance, assets, readFileSync(join(assetRoot, provenance.license.path)));
    assert.equal(renderProvenanceJson(regenerated), provenanceText);
    assert.equal(renderProvenanceModule(regenerated), readFileSync(join(root, GENERATED_TS_FILE), "utf8"));
  });
});
