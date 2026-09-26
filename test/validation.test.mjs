import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { createRegistryLookup } from "@cdsap/gbos/registry";
import { validateBatch, validateObservation } from "@cdsap/gbos/validate";

const registry = JSON.parse(readFileSync(new URL("../schemas/registry/semantic-conventions.json", import.meta.url), "utf8"));
const lookup = createRegistryLookup(registry);

const valid = {
  schemaVersion: "1.0.0",
  producer: { name: "info-test-process", version: "1.0.0" },
  scope: "jvm.process",
  aggregationScope: "build",
  attributes: { "build.tool.name": "gradle" },
  measurements: [{ name: "jvm.process.cpu.time", value: 12.5, unit: "s", aggregation: "sum" }],
};

describe("browser-safe validation", () => {
  it("accepts a valid observation and separates diagnostic sources", () => {
    const result = validateObservation(valid, { registry: lookup });
    assert.equal(result.accepted, true);
    assert.deepEqual(result.diagnostics, []);
    assert.deepEqual(result.structuralDiagnostics, []);
    assert.deepEqual(result.semanticDiagnostics, []);
  });

  it("rejects structural errors in both parse modes", () => {
    const invalid = { ...valid, measurements: [{ ...valid.measurements[0], value: Number.NaN }] };
    assert.equal(validateObservation(invalid, { registry: lookup, mode: "strict" }).accepted, false);
    assert.equal(validateObservation(invalid, { registry: lookup, mode: "compatible" }).accepted, false);
    assert.ok(validateObservation(invalid, { registry: lookup }).structuralDiagnostics.some(({ code }) => code === "measurement.value"));
  });

  it("retains an unknown future metric with a semantic diagnostic", () => {
    const future = { ...valid, measurements: [{ name: "jvm.process.future_metric", value: 1, unit: "widgets", aggregation: "last" }] };
    const result = validateObservation(future, { registry: lookup });
    assert.equal(result.accepted, true);
    assert.equal(result.retained, future);
    assert.equal(result.semanticDiagnostics[0].code, "metric.unknown");
    assert.equal(result.semanticDiagnostics[0].severity, "warning");
  });

  it("rejects semantic errors in strict mode but retains them in compatible mode", () => {
    const wrongUnit = { ...valid, measurements: [{ ...valid.measurements[0], unit: "By" }] };
    assert.equal(validateObservation(wrongUnit, { registry: lookup, mode: "strict" }).accepted, false);
    const compatible = validateObservation(wrongUnit, { registry: lookup, mode: "compatible" });
    assert.equal(compatible.accepted, true);
    assert.equal(compatible.retained, wrongUnit);
    assert.equal(compatible.semanticDiagnostics[0].source, "semantic");
  });

  it("checks partial consistency and histogram ordering", () => {
    const partial = { ...valid, partial: true, droppedObservations: 2 };
    assert.equal(validateObservation(partial, { registry: lookup }).accepted, true);
    const inconsistent = { ...valid, droppedObservations: 2 };
    assert.equal(validateObservation(inconsistent, { registry: lookup }).accepted, false);
    const { measurements: _measurements, ...observationHeader } = valid;
    const histogram = {
      ...observationHeader,
      histograms: [{ name: "jvm.gc.event.time", unit: "s", aggregation: "count", buckets: [{ gte: 0, lt: 10, count: 1 }, { gte: 5, lt: 20, count: 1 }] }],
    };
    const result = validateObservation(histogram, { registry: lookup });
    assert.equal(result.accepted, false);
    assert.ok(result.semanticDiagnostics.some(({ code }) => code === "histogram.buckets.overlap"));
  });

  it("validates batch envelopes and provides unknown lookup behavior", () => {
    const { schemaVersion: _schemaVersion, producer: _producer, ...fragment } = valid;
    const batch = { schemaVersion: "1.0.0", producer: valid.producer, observations: [fragment] };
    assert.equal(validateBatch(batch, { registry: lookup }).accepted, true);
    assert.equal(lookup.metric("does.not.exist"), undefined);
    assert.equal(lookup.scope("does.not.exist"), undefined);
    assert.equal(lookup.find("aggregation", "does-not-exist"), undefined);
    assert.equal(lookup.find("aggregation", "sum"), true);
  });

  it("has no dynamic evaluation or remote validator path", () => {
    const source = readFileSync(new URL("../src/validate.ts", import.meta.url), "utf8");
    assert.doesNotMatch(source, /\beval\s*\(/);
    assert.doesNotMatch(source, /https?:\/\//);
  });
});
