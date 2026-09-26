import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { parseDevelocityProjection } from "@cdsap/gbos/adapters/develocity";

const producer = [
  { name: "gbos.schema", value: "1.0.0" },
  { name: "gbos.v1.producer.info_test_process.name", value: "info-test-process" },
  { name: "gbos.v1.producer.info_test_process.version", value: "2.0.0" },
];
const first = JSON.stringify({ scope: "jvm.process", aggregationScope: "entity", attributes: { id: "a" }, measurements: [{ name: "jvm.process.cpu.time", value: 1, unit: "ms", aggregation: "last" }] });
const second = JSON.stringify({ scope: "jvm.process", aggregationScope: "entity", attributes: { id: "b" }, measurements: [{ name: "jvm.process.cpu.time", value: 2, unit: "ms", aggregation: "last" }] });

describe("parseDevelocityProjection", () => {
  it("covers full, batch, fragment, metadata, index, and tag transports", () => {
    const fixture = JSON.parse(readFileSync(fileURLToPath(new URL("./fixtures/develocity-transports.json", import.meta.url)), "utf8"));
    const result = parseDevelocityProjection(fixture);
    assert.deepEqual(result.observations.map(({ attributes }) => attributes.kind), ["full", "batch", "fragment"]);
    assert.equal(result.indexes[0].parsedValue, 6);
    assert.deepEqual(result.tags, ["gbos:v1:producer:info-test-process"]);
  });

  it("preserves repeated observation names and input order", () => {
    const result = parseDevelocityProjection([...producer, { name: "gbos.v1.observation", value: first }, { name: "gbos.v1.observation", value: second }]);
    assert.deepEqual(result.observations.map(({ attributes }) => attributes.id), ["a", "b"]);
    assert.deepEqual(result.observations[0].producer, { name: "info-test-process", version: "2.0.0" });
  });

  it("does not depend on header position", () => {
    const ordered = parseDevelocityProjection([...producer, { name: "gbos.v1.observations", value: JSON.stringify({ observations: [JSON.parse(first)] }) }]);
    const headersLast = parseDevelocityProjection([{ name: "gbos.v1.observation", value: first }, ...producer]);
    assert.deepEqual(headersLast.observations, ordered.observations);
  });

  it("reconstructs producer-scoped fragments and records conflicts", () => {
    const result = parseDevelocityProjection([
      { name: "gbos.v1.producer.info_test_process.observation", value: first },
      ...producer,
      { name: "gbos.schema", value: "9.9.9" },
    ]);
    assert.equal(result.observations.length, 1);
    assert.ok(result.diagnostics.some(({ code }) => code === "conflicting_metadata"));
  });

  it("keeps indexes separate and retains raw and parsed values", () => {
    const result = parseDevelocityProjection([{ name: "gbos.v1.index.info_test_process.jvm.process.cpu.time.sum", value: "12.5" }]);
    assert.equal(result.observations.length, 0);
    assert.deepEqual(result.indexes[0], {
      name: "gbos.v1.index.info_test_process.jvm.process.cpu.time.sum",
      producer: "info_test_process",
      metric: "jvm.process.cpu.time",
      aggregation: "sum",
      rawValue: "12.5",
      parsedValue: 12.5,
    });
  });

  it("reports malformed JSON and unknown GBOS keys", () => {
    const result = parseDevelocityProjection([
      { name: "gbos.v1.observation", value: "{" },
      { name: "gbos.v1.future", value: "true" },
    ]);
    assert.deepEqual(result.diagnostics.map(({ code }) => code), ["malformed_json", "unsupported_key"]);
  });
});
