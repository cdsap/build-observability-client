import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canonicalObservation, observationFingerprint, parseObservations } from "@cdsap/gbos";

const observation = (attributes = { "test.name": "same", "test.count": 2, "test.enabled": true }) => ({
  schemaVersion: "1.0.0", producer: { name: "fixture", version: "1" }, scope: "test", aggregationScope: "build", attributes,
  measurements: [{ name: "test.duration", value: 4, unit: "ms", aggregation: "last" }],
});

describe("canonical consumer model", () => {
  it("supports scalar attribute types and preserves repeated source values", () => {
    const dataset = parseObservations([observation(), observation()], { transport: "batch", sourceId: "source" });
    const fromAnotherTransport = parseObservations([observation()], { transport: "report", sourceId: "other" });
    assert.equal(dataset.observations.length, 2);
    assert.equal(dataset.observations[0].fingerprint, dataset.observations[1].fingerprint);
    assert.deepEqual(dataset.observations[0].attributes, { "test.name": "same", "test.count": 2, "test.enabled": true });
    assert.equal(dataset.observations[0].provenance.ordinal, 0);
    assert.equal(dataset.observations[1].provenance.ordinal, 1);
    assert.equal(dataset.observations[0].fingerprint, fromAnotherTransport.observations[0].fingerprint);
  });

  it("sorts object keys but keeps array ordering in stable identity", () => {
    const first = { ...observation(), attributes: { b: "2", a: "1" } };
    const reordered = { ...observation(), attributes: { a: "1", b: "2" } };
    assert.equal(observationFingerprint(first), observationFingerprint(reordered));
    const repeated = { ...observation(), measurements: [observation().measurements[0], { ...observation().measurements[0], value: 5 }] };
    assert.notEqual(observationFingerprint(first), observationFingerprint(repeated));
    assert.match(canonicalObservation(first), /"a":"1".*"b":"2"/);
  });

  it("reports malformed records while retaining valid records in compatible mode", () => {
    const dataset = parseObservations([observation(), { schemaVersion: "1.0.0" }, observation({ unknown: false })]);
    assert.equal(dataset.observations.length, 2);
    assert.equal(dataset.rejectedRecords.length, 1);
    assert.equal(dataset.rejectedRecords[0].ordinal, 1);
    assert.ok(dataset.diagnostics.some(({ code }) => code === "consumer.invalid_record"));
    assert.throws(() => parseObservations([observation(), {}], { mode: "strict" }), /Invalid observation at ordinal 1/);
  });

  it("keeps unknown scopes and metrics queryable and emits diagnostics", () => {
    const dataset = parseObservations([observation()], { knownScopes: new Set(["other"]), knownMetrics: new Set(["other.metric"]) });
    assert.equal(dataset.observations.length, 1);
    assert.ok(dataset.diagnostics.some(({ code }) => code === "consumer.unknown_scope"));
    assert.ok(dataset.diagnostics.some(({ code }) => code === "consumer.unknown_metric"));
    assert.equal(dataset.indexes.size, 1);
    assert.throws(() => dataset.observations.push(observation()), /read only|object is not extensible/i);
  });

  it("can omit raw transport records explicitly", () => {
    const dataset = parseObservations([observation(), {}], { retainRawData: false });
    assert.equal("raw" in dataset.observations[0], false);
    assert.equal("raw" in dataset.rejectedRecords[0], false);
  });
});
