import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildViewModel, createProfileRegistry, parseObservations, registerProfile, stableViewId } from "@cdsap/gbos";

const observation = (overrides = {}) => ({
  schemaVersion: "1.0.0", producer: { name: "fixture", version: "1" }, scope: "jvm.process", aggregationScope: "entity",
  attributes: { id: "one" },
  measurements: [{ name: "jvm.process.memory.heap.used", value: 4, unit: "By", aggregation: "last" }], ...overrides,
});

describe("semantic presentation profiles", () => {
  it("matches by semantic shape, with deterministic priority and no producer routing", () => {
    const first = parseObservations([observation()], { transport: "batch" });
    const second = parseObservations([{ ...observation(), producer: { name: "another-producer", version: "9" } }], { transport: "report" });
    const firstView = buildViewModel(first).views[0];
    const secondView = buildViewModel(second).views[0];
    assert.equal(firstView.profileId, "jvm-process-summary");
    assert.equal(firstView.id, secondView.id);
    assert.equal(firstView.panels[0].chart, "metric");
  });

  it("supports deterministic custom registration and keeps the generic fallback", () => {
    const registry = createProfileRegistry();
    registerProfile(registry, { id: "custom", title: "Custom", priority: 100, match: { scopes: ["vendor.future"] } });
    const custom = parseObservations([observation({ scope: "vendor.future", measurements: [{ name: "vendor.value", value: 1, unit: "widgets", aggregation: "last" }] })]);
    const unknown = parseObservations([observation({ scope: "future.scope", attributes: {}, measurements: [{ name: "future.value", value: 1, unit: "widgets", aggregation: "last" }] })]);
    assert.equal(buildViewModel(custom, registry).views[0].profileId, "custom");
    assert.equal(buildViewModel(unknown, registry).views[0].state, "unknown");
  });

  it("represents empty and partial data without inventing a time series", () => {
    const empty = buildViewModel(parseObservations([]));
    const partial = buildViewModel(parseObservations([observation({ partial: true, measurements: [
      { name: "jvm.process.memory.heap.used", value: 4, unit: "By", aggregation: "last" },
      { name: "jvm.process.memory.heap.limit", value: 8, unit: "By", aggregation: "last" },
    ] })]));
    assert.equal(empty.views[0].state, "empty");
    assert.equal(partial.views[0].state, "partial");
    assert.equal(partial.views[0].panels[0].chart, "table");
  });

  it("uses a value-independent, transport-independent view identity", () => {
    const one = parseObservations([observation({ measurements: [{ name: "jvm.process.cpu.time", value: 1, unit: "s", aggregation: "last" }] })]);
    const two = parseObservations([observation({ measurements: [{ name: "jvm.process.cpu.time", value: 99, unit: "s", aggregation: "last" }] })]);
    assert.equal(stableViewId("jvm-process-entities", one.observations[0]), stableViewId("jvm-process-entities", two.observations[0]));
  });
});
