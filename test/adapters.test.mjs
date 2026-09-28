import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { parseDirectObservation } from "@cdsap/gbos/adapters/direct";
import { parseNdjson, parseNdjsonAsync } from "@cdsap/gbos/adapters/ndjson";
import { parseReport } from "@cdsap/gbos/adapters/report";
import { ParseError } from "@cdsap/gbos/parse";

const producer = { name: "fixture", version: "1.0.0" };
const observation = {
  schemaVersion: "1.0.0",
  producer,
  scope: "jvm.process",
  aggregationScope: "entity",
  attributes: { id: "one" },
  measurements: [{ name: "jvm.process.cpu.time", value: 1, unit: "ms", aggregation: "last" }],
};
const batchChild = { scope: observation.scope, aggregationScope: observation.aggregationScope, attributes: observation.attributes, measurements: observation.measurements };

describe("source adapters", () => {
  it("normalizes direct, report, and NDJSON inputs to equivalent observations", () => {
    const fixture = JSON.parse(readFileSync(fileURLToPath(new URL("./fixtures/source-adapters.json", import.meta.url)), "utf8"));
    const direct = parseDirectObservation(fixture.observation);
    const report = parseReport(fixture.report);
    const ndjson = parseNdjson(fixture.ndjson);
    assert.deepEqual(report.records[0].observation, direct.records[0].observation);
    assert.deepEqual(ndjson.records[0].observation, direct.records[0].observation);
    assert.deepEqual(report.records[0].metadata.resource, { "service.name": "fixture" });
    assert.equal(report.records[0].observation.attributes["service.name"], undefined);
    assert.notEqual(report.records[0].provenance.source, direct.records[0].provenance.source);
  });

  it("inherits report batch headers without adding transport metadata to attributes", () => {
    const result = parseReport({ schemaVersion: "1.0.0", resource: { "build.id": "b1" }, observationBatches: [{ schemaVersion: "1.0.0", producer, observations: [batchChild] }] });
    assert.deepEqual(result.records[0].observation.producer, producer);
    assert.equal(result.records[0].observation.schemaVersion, "1.0.0");
    assert.deepEqual(result.records[0].metadata.resource, { "build.id": "b1" });
    assert.deepEqual(result.records[0].observation.attributes, { id: "one" });
  });

  it("isolates malformed neighboring NDJSON lines in compatible mode", () => {
    const result = parseNdjson(`${JSON.stringify(observation)}\nnot-json\n${JSON.stringify({ ...observation, attributes: { id: "two" } })}`, { mode: "compatible" });
    assert.deepEqual(result.records.map(({ observation: item }) => item.attributes.id), ["one", "two"]);
    assert.deepEqual(result.diagnostics.map(({ code, line }) => [code, line]), [["malformed_json", undefined]]);
  });

  it("accepts async iterable NDJSON and documents empty input as an empty dataset", async () => {
    async function* chunks() { yield JSON.stringify(observation).slice(0, 20); yield `${JSON.stringify(observation).slice(20)}\n`; yield JSON.stringify({ ...observation, attributes: { id: "two" } }); }
    const result = await parseNdjsonAsync(chunks());
    assert.equal(result.records.length, 2);
    assert.deepEqual(parseNdjson(""), { records: [], diagnostics: [] });
  });

  it("rejects malformed input in strict mode", () => {
    assert.throws(() => parseNdjson("not-json"), ParseError);
    assert.throws(() => parseDirectObservation({}), ParseError);
  });
});
