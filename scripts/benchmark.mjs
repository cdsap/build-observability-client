import { performance } from "node:perf_hooks";
import { parseNdjson } from "../dist/adapters/ndjson.js";
import { parseObservations } from "../dist/parse.js";
import { queryObservations } from "../dist/query.js";
import { validateObservation } from "../dist/validate.js";

const observation = {
  schemaVersion: "1.0.0",
  producer: { name: "benchmark", version: "1" },
  scope: "jvm.process",
  aggregationScope: "entity",
  attributes: { "build.tool.name": "gradle", "jvm.process.role": "daemon" },
  measurements: [
    { name: "jvm.process.cpu.time", value: 12.5, unit: "s", aggregation: "sum" },
    { name: "jvm.process.memory.heap.used", value: 42, unit: "By", aggregation: "last" },
  ],
};
const observations = Array.from({ length: 100 }, (_, index) => ({ ...observation, attributes: { ...observation.attributes, "build.id": `build-${index}` } }));
const ndjson = observations.map((item) => JSON.stringify(item)).join("\n");
const iterations = Number(process.env.GBOS_BENCHMARK_ITERATIONS ?? 200);

function measure(name, operation) {
  for (let index = 0; index < 20; index += 1) operation();
  const samples = [];
  for (let index = 0; index < iterations; index += 1) {
    const start = performance.now();
    operation();
    samples.push(performance.now() - start);
  }
  samples.sort((a, b) => a - b);
  const percentile = (fraction) => samples[Math.min(samples.length - 1, Math.floor(samples.length * fraction))];
  return { name, iterations, p50Ms: percentile(0.5), p95Ms: percentile(0.95), totalMs: samples.reduce((sum, value) => sum + value, 0) };
}

const registry = undefined;
const results = [
  measure("validation", () => validateObservation(observation, { registry })),
  measure("parsing", () => parseNdjson(ndjson)),
  measure("normalization", () => parseObservations(observations, { retainRawData: false })),
  measure("query-planning", () => queryObservations(observations, { scope: "jvm.process", metrics: "jvm.process.cpu.time" })),
  measure("render-input-format", () => JSON.stringify(queryObservations(observations, { metrics: "jvm.process.cpu.time" }))),
];

const report = { schema: 1, node: process.version, platform: process.platform, arch: process.arch, dataset: observations.length, results };
console.log(JSON.stringify(report, null, 2));
