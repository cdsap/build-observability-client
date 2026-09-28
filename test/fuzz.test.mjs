import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseDevelocityProjection } from "@cdsap/gbos/adapters/develocity";
import { parseNdjson } from "@cdsap/gbos/adapters/ndjson";
import { parseObservations } from "@cdsap/gbos/parse";

const hostile = "__GBOS_FUZZ_SENTINEL__'; globalThis.__gbosExecuted = true; //";
const valid = { schemaVersion: "1.0.0", producer: { name: "fuzz", version: "1" }, scope: "jvm.process", aggregationScope: "entity", attributes: { "test.name": "ok" }, measurements: [{ name: "jvm.process.cpu.time", value: 1, unit: "ms", aggregation: "last" }] };

describe("malformed-input safety corpus", () => {
  it("handles malformed JSON, unknown fields, duplicate headers, huge values, and hostile strings", () => {
    const mutations = Array.from({ length: 128 }, (_, index) => `${JSON.stringify(valid).slice(0, index % 40)}${index % 3 === 0 ? "\\u0000" : "}"}`);
    const inputs = ["", "{", "[]", "null", hostile, JSON.stringify({ ...valid, unknown: hostile }), `${JSON.stringify(valid)}\n{`, `${"x".repeat(100_000)}`, ...mutations];
    for (const input of inputs) {
      assert.doesNotThrow(() => parseNdjson(input, { mode: "compatible" }));
      assert.doesNotThrow(() => parseObservations([input, { ...valid, attributes: { "test.name": hostile } }], { retainRawData: false }));
    }
    const duplicateHeaders = [
      { name: "gbos.schema", value: "1.0.0" },
      { name: "gbos.schema", value: "9.9.9" },
      { name: "gbos.v1.producer.fuzz.name", value: "fuzz" },
      { name: "gbos.v1.producer.fuzz.version", value: "1" },
      { name: "gbos.v1.producer.fuzz.version", value: hostile },
      { name: "gbos.v1.producer.fuzz.observation", value: JSON.stringify({ ...valid, producer: undefined }) },
    ];
    const result = parseDevelocityProjection(duplicateHeaders);
    assert.equal(result.schemaVersion, "1.0.0");
    assert.equal(result.observations[0]?.producer.version, "1");
    assert.equal(globalThis.__gbosExecuted, undefined);
    assert.doesNotMatch(JSON.stringify(result), /__gbosExecuted/);
  });
});
