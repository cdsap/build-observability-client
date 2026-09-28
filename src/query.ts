export type AttributeValue = string | number | boolean;
export type AggregationScope = "entity" | "task" | "project" | "build";
export type Aggregation = "last" | "min" | "max" | "sum" | "count";
export type MetricType = "gauge" | "counter" | "histogram" | "unknown";

export interface Measurement {
  readonly name: string;
  readonly value: number;
  readonly unit: string;
  readonly aggregation: Aggregation;
}

export interface Histogram {
  readonly name: string;
  readonly unit: string;
  readonly aggregation: "count";
  readonly buckets: readonly HistogramBucket[];
}

export interface HistogramBucket {
  readonly gte: number;
  readonly lt?: number;
  readonly count: number;
}

export interface Observation {
  readonly schemaVersion?: "1.0.0";
  readonly producer?: { readonly name: string; readonly version: string };
  readonly scope: string;
  readonly aggregationScope: AggregationScope;
  readonly attributes: Readonly<Record<string, AttributeValue>>;
  readonly measurements?: readonly Measurement[];
  readonly histograms?: readonly Histogram[];
  readonly partial?: boolean;
}

export interface Diagnostic {
  readonly code: string;
  readonly severity: "info" | "warning" | "error";
  readonly message: string;
}

export interface MeasurementMatch {
  readonly observation: Observation;
  readonly measurement: Measurement;
}

export interface HistogramMatch {
  readonly observation: Observation;
  readonly histogram: Histogram;
}

export interface QueryOptions {
  readonly scope?: string | readonly string[];
  readonly aggregationScope?: AggregationScope | readonly AggregationScope[];
  readonly attributes?: Readonly<Record<string, AttributeValue | readonly AttributeValue[]>>;
  readonly metrics?: string | readonly string[];
  readonly units?: string | readonly string[];
  readonly aggregation?: Aggregation | readonly Aggregation[];
}

export interface QueryResult {
  readonly measurements: readonly MeasurementMatch[];
  readonly histograms: readonly HistogramMatch[];
  readonly diagnostics: readonly Diagnostic[];
}

export interface MetricDefinition {
  readonly type: MetricType;
  readonly unit?: string;
}

export interface AggregateOptions extends QueryOptions {
  readonly operation: "last" | "min" | "max" | "sum" | "count";
  readonly metricTypes?: Readonly<Record<string, MetricType | MetricDefinition>>;
  /** Required when observations from more than one aggregation scope are supplied. */
  readonly aggregationScope: AggregationScope;
}

export interface AggregatedMeasurement {
  readonly name: string;
  readonly value: number;
  readonly unit: string;
  readonly aggregation: Aggregation;
  readonly aggregationScope: AggregationScope;
  readonly attributes: Readonly<Record<string, AttributeValue>>;
  readonly diagnostics: readonly Diagnostic[];
}

export interface AggregationResult {
  readonly value?: AggregatedMeasurement;
  readonly diagnostics: readonly Diagnostic[];
}

export interface AggregatedHistogram {
  readonly name: string;
  readonly unit: string;
  readonly aggregation: "count";
  readonly buckets: readonly HistogramBucket[];
  readonly aggregationScope: AggregationScope;
}

export interface HistogramAggregationResult {
  readonly value?: AggregatedHistogram;
  readonly diagnostics: readonly Diagnostic[];
}

export interface GroupedObservations {
  readonly key: string;
  readonly dimensions: Readonly<Record<string, AttributeValue | undefined>>;
  readonly observations: readonly Observation[];
}

export interface GroupOptions {
  readonly by: readonly string[];
  readonly aggregationScope?: AggregationScope;
}

export interface HeapUtilization {
  readonly value?: number;
  readonly diagnostics: readonly Diagnostic[];
}

export interface SummaryCard {
  readonly name: string;
  readonly value?: number;
  readonly unit?: string;
  readonly diagnostics: readonly Diagnostic[];
}

const missing = (message: string): Diagnostic => ({ code: "missing_value", severity: "warning", message });
const values = <T>(value: T | readonly T[] | undefined): readonly T[] | undefined =>
  value === undefined ? undefined : Array.isArray(value) ? value as readonly T[] : [value as T];

function matches<T>(wanted: readonly T[] | undefined, actual: T): boolean {
  return wanted === undefined || wanted.includes(actual);
}

function attributeMatches(
  attributes: Readonly<Record<string, AttributeValue>>,
  expected: QueryOptions["attributes"],
): boolean {
  if (!expected) return true;
  return Object.entries(expected).every(([name, wanted]) => {
    const actual = attributes[name];
    return actual !== undefined && (Array.isArray(wanted) ? wanted.includes(actual) : actual === wanted);
  });
}

function selectedObservation(observation: Observation, options: QueryOptions): boolean {
  return matches(values(options.scope), observation.scope) &&
    matches(values(options.aggregationScope), observation.aggregationScope) &&
    attributeMatches(observation.attributes, options.attributes);
}

export function queryObservations(observations: readonly Observation[], options: QueryOptions = {}): QueryResult {
  const metrics = values(options.metrics);
  const units = values(options.units);
  const aggregations = values(options.aggregation);
  const measurements: MeasurementMatch[] = [];
  const histograms: HistogramMatch[] = [];

  for (const observation of observations) {
    if (!selectedObservation(observation, options)) continue;
    for (const measurement of observation.measurements ?? []) {
      if (matches(metrics, measurement.name) && matches(units, measurement.unit) && matches(aggregations, measurement.aggregation)) {
        measurements.push({ observation, measurement });
      }
    }
    for (const histogram of observation.histograms ?? []) {
      if (matches(metrics, histogram.name) && matches(units, histogram.unit)) histograms.push({ observation, histogram });
    }
  }
  return { measurements, histograms, diagnostics: [] };
}

export function readMeasurements(observations: readonly Observation[], options: QueryOptions = {}): readonly MeasurementMatch[] {
  return queryObservations(observations, options).measurements;
}

function metricType(name: string, definitions: AggregateOptions["metricTypes"]): MetricType {
  const definition = definitions?.[name];
  return typeof definition === "string" ? definition : definition?.type ?? "unknown";
}

export function aggregateMeasurements(observations: readonly Observation[], options: AggregateOptions): AggregationResult {
  const candidateScopes = new Set(observations.filter((observation) => selectedObservation(observation, { ...options, aggregationScope: undefined })).map((observation) => observation.aggregationScope));
  if (candidateScopes.size > 1) return { diagnostics: [{ code: "mixed_aggregation_scope", severity: "error", message: "Entity, task, project, and build observations must not be aggregated together." }] };
  const result = queryObservations(observations, options);
  const diagnostics: Diagnostic[] = [...result.diagnostics];
  const scopes = new Set(result.measurements.map(({ observation }) => observation.aggregationScope));
  if (scopes.size > 1) {
    diagnostics.push({ code: "mixed_aggregation_scope", severity: "error", message: "Entity, task, project, and build observations must not be aggregated together." });
    return { diagnostics };
  }
  if (scopes.size === 1 && !scopes.has(options.aggregationScope)) {
    diagnostics.push({ code: "aggregation_scope_mismatch", severity: "error", message: `Expected ${options.aggregationScope} observations.` });
    return { diagnostics };
  }
  if (result.measurements.length === 0) return { diagnostics: [missing("No matching measurements were found.")] };

  const first = result.measurements[0];
  const type = metricType(first.measurement.name, options.metricTypes);
  if (options.operation === "sum" && type !== "counter") {
    diagnostics.push({ code: type === "gauge" ? "gauge_sum_forbidden" : "metric_type_required", severity: "error", message: "Only counters may be summed; gauges are never summed implicitly." });
    return { diagnostics };
  }
  if (result.measurements.some(({ measurement }) => measurement.unit !== first.measurement.unit || measurement.name !== first.measurement.name)) {
    diagnostics.push({ code: "mixed_measurements", severity: "error", message: "Measurements with different names or units cannot be aggregated together." });
    return { diagnostics };
  }
  const numbers = result.measurements.map(({ measurement }) => measurement.value);
  const value = options.operation === "last" ? numbers[numbers.length - 1] :
    options.operation === "min" ? Math.min(...numbers) :
    options.operation === "max" ? Math.max(...numbers) :
    options.operation === "sum" ? numbers.reduce((sum, number) => sum + number, 0) : numbers.length;
  return { value: { name: first.measurement.name, value, unit: first.measurement.unit, aggregation: options.operation, aggregationScope: options.aggregationScope, attributes: first.observation.attributes, diagnostics }, diagnostics };
}

export function aggregateHistograms(observations: readonly Observation[], options: Pick<QueryOptions, "scope" | "attributes" | "metrics" | "units"> & { readonly aggregationScope: AggregationScope }): HistogramAggregationResult {
  const candidateScopes = new Set(observations.filter((observation) => selectedObservation(observation, { ...options, aggregationScope: undefined })).map((observation) => observation.aggregationScope));
  if (candidateScopes.size > 1) return { diagnostics: [{ code: "mixed_aggregation_scope", severity: "error", message: "Entity, task, project, and build observations must not be aggregated together." }] };
  const result = queryObservations(observations, options);
  if (result.histograms.length === 0) return { diagnostics: [missing("No matching histograms were found.")] };
  const first = result.histograms[0].histogram;
  if (result.histograms.some(({ histogram }) => histogram.name !== first.name || histogram.unit !== first.unit || histogram.buckets.length !== first.buckets.length || histogram.buckets.some((bucket, index) => bucket.gte !== first.buckets[index].gte || bucket.lt !== first.buckets[index].lt))) {
    return { diagnostics: [{ code: "mixed_histograms", severity: "error", message: "Histograms with different names, units, or bucket boundaries cannot be aggregated together." }] };
  }
  const buckets = first.buckets.map((bucket, index) => ({ ...bucket, count: result.histograms.reduce((sum, match) => sum + match.histogram.buckets[index].count, 0) }));
  return { value: { name: first.name, unit: first.unit, aggregation: "count", buckets, aggregationScope: options.aggregationScope }, diagnostics: [] };
}

export function groupObservations(observations: readonly Observation[], options: GroupOptions): readonly GroupedObservations[] {
  const groups = new Map<string, { dimensions: Record<string, AttributeValue | undefined>; observations: Observation[] }>();
  for (const observation of observations) {
    if (options.aggregationScope && observation.aggregationScope !== options.aggregationScope) continue;
    const dimensions = Object.fromEntries(options.by.map((name) => [name, observation.attributes[name]]));
    const key = options.by.map((name) => JSON.stringify(dimensions[name])).join("\u001f");
    const group = groups.get(key) ?? { dimensions, observations: [] };
    group.observations.push(observation);
    groups.set(key, group);
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, group]) => ({ key, ...group }));
}

function measurementValue(observation: Observation, name: string, operation: "last" | "max" = "last"): Measurement | undefined {
  const candidates = (observation.measurements ?? []).filter((measurement) => measurement.name === name);
  if (candidates.length === 0) return undefined;
  return operation === "max" ? candidates.reduce((best, item) => item.value > best.value ? item : best) : candidates[candidates.length - 1];
}

export function deriveHeapUtilization(observation: Observation): HeapUtilization {
  const used = measurementValue(observation, "jvm.process.memory.heap.used", "last");
  const limit = measurementValue(observation, "jvm.process.memory.heap.limit", "last");
  if (!used || !limit) return { diagnostics: [missing("Heap utilization requires heap used and heap limit.")] };
  if (used.unit !== limit.unit) return { diagnostics: [{ code: "mixed_units", severity: "error", message: "Heap used and heap limit must use the same unit." }] };
  if (limit.value <= 0) return { diagnostics: [{ code: "invalid_denominator", severity: "error", message: "Heap limit must be greater than zero." }] };
  return { value: used.value / limit.value, diagnostics: [] };
}

export function deriveSummaryCards(observation: Observation, metrics: readonly string[]): readonly SummaryCard[] {
  return metrics.map((name) => {
    const measurement = measurementValue(observation, name);
    return measurement ? { name, value: measurement.value, unit: measurement.unit, diagnostics: [] } : { name, diagnostics: [missing(`Metric ${name} is not present.`)] };
  });
}

export type BaseUnit = "B" | "s" | "count" | "ratio";

export function toBaseUnit(value: number, unit: string): { readonly value: number; readonly unit: BaseUnit } | undefined {
  const byteUnits: Readonly<Record<string, number>> = { B: 1, By: 1, kB: 1000, MB: 1000 ** 2, GB: 1000 ** 3, KiBy: 1024, MiBy: 1024 ** 2, GiBy: 1024 ** 3 };
  const timeUnits: Readonly<Record<string, number>> = { ns: 1e-9, us: 1e-6, ms: 1e-3, s: 1, min: 60, h: 3600 };
  if (unit in byteUnits) return { value: value * byteUnits[unit], unit: "B" };
  if (unit in timeUnits) return { value: value * timeUnits[unit], unit: "s" };
  if (unit === "1" || unit === "ratio" || unit === "{ratio}") return { value, unit: "ratio" };
  if (unit === "{count}" || unit === "count" || unit === "{collection}" || unit === "{class}" || unit === "{thread}" || unit === "{core}") return { value, unit: unit === "{core}" ? "count" : "count" };
  return undefined;
}

export interface FormatOptions { readonly maximumFractionDigits?: number; readonly ratioAsPercent?: boolean }

export function formatUnitValue(value: number, unit: string, options: FormatOptions = {}): string {
  const base = toBaseUnit(value, unit);
  if (!base) return `${value} ${unit}`;
  const digits = options.maximumFractionDigits ?? 2;
  if (base.unit === "ratio" && options.ratioAsPercent !== false) return `${(base.value * 100).toFixed(digits)}%`;
  if (base.unit === "B") {
    const prefixes = [[1024 ** 3, "GiB"], [1024 ** 2, "MiB"], [1024, "KiB"]] as const;
    const prefix = prefixes.find(([size]) => Math.abs(base.value) >= size);
    return prefix ? `${(base.value / prefix[0]).toFixed(digits)} ${prefix[1]}` : `${base.value.toFixed(digits)} B`;
  }
  return `${base.value.toFixed(digits)} ${base.unit}`;
}

export function formatMeasurement(measurement: Pick<Measurement, "value" | "unit">, options?: FormatOptions): string {
  return formatUnitValue(measurement.value, measurement.unit, options);
}
