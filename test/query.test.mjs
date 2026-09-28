import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  aggregateMeasurements,
  aggregateHistograms,
  deriveHeapUtilization,
  formatUnitValue,
  groupObservations,
  queryObservations,
} from "@cdsap/gbos/query";

const observation = (scope, aggregationScope, attributes, measurements) => ({ scope, aggregationScope, attributes, measurements });

describe("query primitives", () => {
  it("filters by scope, attributes, units, and keeps unknown metrics accessible", () => {
    const result = queryObservations([
      observation("jvm.process", "entity", { "jvm.process.role": "gradle-daemon" }, [
        { name: "vendor.metric", value: 7, unit: "widgets", aggregation: "last" },
      ]),
    ], { scope: "jvm.process", attributes: { "jvm.process.role": "gradle-daemon" }, metrics: "vendor.metric", units: "widgets" });
    assert.equal(result.measurements[0].measurement.value, 7);
  });

  it("does not sum gauges and does not mix entity/build observations", () => {
    const entity = observation("jvm.process", "entity", {}, [{ name: "jvm.process.memory.heap.used", value: 4, unit: "By", aggregation: "last" }]);
    const build = observation("jvm.process", "build", {}, [{ name: "jvm.process.memory.heap.used", value: 5, unit: "By", aggregation: "last" }]);
    assert.equal(aggregateMeasurements([entity], { operation: "sum", aggregationScope: "entity", metricTypes: { "jvm.process.memory.heap.used": "gauge" } }).value, undefined);
    assert.equal(aggregateMeasurements([entity, build], { operation: "max", aggregationScope: "entity" }).value, undefined);
  });

  it("preserves missing values in derivations", () => {
    const result = deriveHeapUtilization(observation("jvm.process", "entity", {}, [{ name: "jvm.process.memory.heap.used", value: 2, unit: "By", aggregation: "last" }]));
    assert.equal(result.value, undefined);
    assert.equal(result.diagnostics[0].code, "missing_value");
  });

  it("merges histograms only when bucket boundaries agree", () => {
    const first = { scope: "jvm.gc", aggregationScope: "entity", attributes: {}, histograms: [{ name: "jvm.gc.event.time", unit: "s", aggregation: "count", buckets: [{ gte: 0, lt: 1, count: 2 }] }] };
    const second = { ...first, histograms: [{ ...first.histograms[0], buckets: [{ gte: 0, lt: 1, count: 3 }] }] };
    assert.equal(aggregateHistograms([first, second], { aggregationScope: "entity", metrics: "jvm.gc.event.time" }).value.buckets[0].count, 5);
  });

  it("groups deterministically by dimensions", () => {
    const result = groupObservations([
      observation("jvm.gc", "entity", { "jvm.gc.action": "z", "jvm.gc.name": "G1" }, []),
      observation("jvm.gc", "entity", { "jvm.gc.action": "a", "jvm.gc.name": "G1" }, []),
    ], { by: ["jvm.gc.name", "jvm.gc.action"] });
    assert.deepEqual(result.map((group) => group.dimensions["jvm.gc.action"]), ["a", "z"]);
  });

  it("formats bytes, seconds, and ratios consistently", () => {
    assert.equal(formatUnitValue(2048, "By"), "2.00 KiB");
    assert.equal(formatUnitValue(1.5, "s"), "1.50 s");
    assert.equal(formatUnitValue(0.25, "ratio"), "25.00%");
  });
});
