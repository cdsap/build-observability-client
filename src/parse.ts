import { createDataset, observationFingerprint, type AttributeValue, type BuildContext, type Diagnostic, type DiagnosticSeverity, type NormalizedObservation, type Observation, type Provenance, type RejectedRecord, type Transport } from "./model.js";
import { diagnostic, DIAGNOSTIC_CODES } from "./diagnostics.js";

export type ParseMode = "strict" | "compatible";
export interface ParseOptions {
  readonly mode?: ParseMode; readonly transport?: Transport; readonly source?: string; readonly sourceId?: string; readonly build?: BuildContext;
  readonly retainRawData?: boolean; readonly knownScopes?: ReadonlySet<string>; readonly knownMetrics?: ReadonlySet<string>;
}
export type ParseResult = ReturnType<typeof createDataset>;

function issue(code: string, severity: DiagnosticSeverity, message: string, path: string, ordinal: number): Diagnostic { return diagnostic(code, severity, message, path, ordinal); }
function isRecord(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === "object" && !Array.isArray(value); }

function parseAttributes(value: unknown, ordinal: number): { value?: Readonly<Record<string, AttributeValue>>; errors: Diagnostic[] } {
  if (!isRecord(value)) return { errors: [issue(DIAGNOSTIC_CODES.INVALID_RECORD, "error", "attributes must be an object", "$.attributes", ordinal)] };
  const attributes: Record<string, AttributeValue> = {}; const errors: Diagnostic[] = [];
  for (const [name, attribute] of Object.entries(value)) {
    if (!/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/.test(name) || typeof attribute === "number" && !Number.isFinite(attribute)) errors.push(issue(DIAGNOSTIC_CODES.INVALID_RECORD, "error", "attribute name or value is invalid", `$.attributes.${name}`, ordinal));
    else if (typeof attribute !== "string" && typeof attribute !== "number" && typeof attribute !== "boolean") errors.push(issue(DIAGNOSTIC_CODES.INVALID_RECORD, "error", "attribute values must be strings, numbers, or booleans", `$.attributes.${name}`, ordinal));
    else attributes[name] = attribute;
  }
  return { value: errors.length ? undefined : Object.freeze(attributes), errors };
}

function validateObservation(raw: unknown, ordinal: number, options: ParseOptions): { observation?: Observation; diagnostics: Diagnostic[] } {
  const errors: Diagnostic[] = [];
  if (!isRecord(raw)) return { diagnostics: [issue(DIAGNOSTIC_CODES.INVALID_RECORD, "error", "observation must be an object", "$", ordinal)] };
  const allowed = new Set(["schemaVersion", "producer", "scope", "aggregationScope", "attributes", "measurements", "histograms", "partial", "droppedObservations", "diagnostics"]);
  for (const key of Object.keys(raw)) if (!allowed.has(key)) errors.push(issue(DIAGNOSTIC_CODES.INVALID_RECORD, "error", `unknown observation property: ${key}`, `$.${key}`, ordinal));
  if (raw.schemaVersion !== "1.0.0") errors.push(issue(DIAGNOSTIC_CODES.INVALID_RECORD, "error", "schemaVersion must be 1.0.0", "$.schemaVersion", ordinal));
  const producer = isRecord(raw.producer) && typeof raw.producer.name === "string" && /^[a-z0-9][a-z0-9._-]*$/.test(raw.producer.name) && raw.producer.name.length <= 255 && typeof raw.producer.version === "string" && raw.producer.version.length > 0 && raw.producer.version.length <= 64 && Object.keys(raw.producer).every((key) => key === "name" || key === "version") ? { name: raw.producer.name, version: raw.producer.version } : undefined;
  if (!producer) errors.push(issue(DIAGNOSTIC_CODES.INVALID_RECORD, "error", "producer must contain name and version", "$.producer", ordinal));
  const scope = typeof raw.scope === "string" && /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/.test(raw.scope) && raw.scope.length <= 255 ? raw.scope : undefined;
  if (!scope) errors.push(issue(DIAGNOSTIC_CODES.INVALID_RECORD, "error", "scope must be a string", "$.scope", ordinal));
  const aggregationScope = typeof raw.aggregationScope === "string" ? raw.aggregationScope : undefined;
  if (!aggregationScope || !["entity", "task", "project", "build"].includes(aggregationScope)) errors.push(issue(DIAGNOSTIC_CODES.INVALID_RECORD, "error", "aggregationScope is invalid", "$.aggregationScope", ordinal));
  const attributes = parseAttributes(raw.attributes, ordinal); errors.push(...attributes.errors);
  if (scope && options.knownScopes && !options.knownScopes.has(scope)) errors.push(issue(DIAGNOSTIC_CODES.UNKNOWN_SCOPE, "warning", `scope is not in the supplied registry: ${scope}`, "$.scope", ordinal));
  const measurements = Array.isArray(raw.measurements) ? raw.measurements : undefined;
  const histograms = Array.isArray(raw.histograms) ? raw.histograms : undefined;
  if ((!measurements || measurements.length === 0) && (!histograms || histograms.length === 0)) errors.push(issue(DIAGNOSTIC_CODES.INVALID_RECORD, "error", "measurements or histograms is required", "$", ordinal));
  const validMeasurements = measurements?.flatMap((value, index) => isRecord(value) && Object.keys(value).every((key) => ["name", "value", "unit", "aggregation"].includes(key)) && typeof value.name === "string" && /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/.test(value.name) && value.name.length <= 255 && typeof value.value === "number" && Number.isFinite(value.value) && typeof value.unit === "string" && /^[ -~]+$/.test(value.unit) && value.unit.length <= 63 && typeof value.aggregation === "string" && ["last", "min", "max", "sum", "count"].includes(value.aggregation) ? [{ name: value.name, value: value.value, unit: value.unit, aggregation: value.aggregation as never }] : (errors.push(issue(DIAGNOSTIC_CODES.INVALID_RECORD, "error", "measurement is malformed", `$.measurements[${index}]`, ordinal)), []));
  const validHistograms = histograms?.flatMap((value, index) => isRecord(value) && Object.keys(value).every((key) => ["name", "unit", "aggregation", "buckets"].includes(key)) && value.aggregation === "count" && typeof value.name === "string" && /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/.test(value.name) && value.name.length <= 255 && typeof value.unit === "string" && /^[ -~]+$/.test(value.unit) && value.unit.length <= 63 && Array.isArray(value.buckets) && value.buckets.length > 0 && value.buckets.every((bucket) => isRecord(bucket) && Object.keys(bucket).every((key) => ["gte", "lt", "count"].includes(key)) && typeof bucket.gte === "number" && Number.isFinite(bucket.gte) && typeof bucket.count === "number" && Number.isInteger(bucket.count) && bucket.count >= 0 && (bucket.lt === undefined || (typeof bucket.lt === "number" && Number.isFinite(bucket.lt)))) ? [{ name: value.name, unit: value.unit, aggregation: "count" as const, buckets: value.buckets as never }] : (errors.push(issue(DIAGNOSTIC_CODES.INVALID_RECORD, "error", "histogram is malformed", `$.histograms[${index}]`, ordinal)), []));
  for (const measurement of validMeasurements ?? []) if (options.knownMetrics && !options.knownMetrics.has(measurement.name)) errors.push(issue(DIAGNOSTIC_CODES.UNKNOWN_METRIC, "warning", `metric is not in the supplied registry: ${measurement.name}`, "$.measurements", ordinal));
  for (const histogram of validHistograms ?? []) if (options.knownMetrics && !options.knownMetrics.has(histogram.name)) errors.push(issue(DIAGNOSTIC_CODES.UNKNOWN_METRIC, "warning", `metric is not in the supplied registry: ${histogram.name}`, "$.histograms", ordinal));
  if (errors.some((entry) => entry.severity === "error") || !producer || !scope || !attributes.value) return { diagnostics: errors };
  return { observation: { schemaVersion: "1.0.0", producer, scope, aggregationScope: aggregationScope as Observation["aggregationScope"], attributes: attributes.value, ...(validMeasurements ? { measurements: validMeasurements } : {}), ...(validHistograms ? { histograms: validHistograms } : {}), ...(typeof raw.partial === "boolean" ? { partial: raw.partial } : {}), ...(typeof raw.droppedObservations === "number" ? { droppedObservations: raw.droppedObservations } : {}), ...(Array.isArray(raw.diagnostics) ? { diagnostics: raw.diagnostics as Diagnostic[] } : {}) }, diagnostics: errors };
}

export function parseObservations(records: readonly unknown[], options: ParseOptions = {}): ParseResult {
  const mode = options.mode ?? "compatible"; const observations: NormalizedObservation[] = []; const diagnostics: Diagnostic[] = []; const rejectedRecords: RejectedRecord[] = [];
  records.forEach((raw, ordinal) => {
    const result = validateObservation(raw, ordinal, options); diagnostics.push(...result.diagnostics);
    if (!result.observation) {
      rejectedRecords.push({ ordinal, ...(options.retainRawData === false ? {} : { raw }), diagnostics: result.diagnostics });
      if (mode === "strict") throw new Error(`Invalid observation at ordinal ${ordinal}: ${result.diagnostics.map((entry) => entry.message).join("; ")}`);
      return;
    }
    const provenance: Provenance = { transport: options.transport ?? "observation", ordinal, ...(options.source === undefined ? {} : { source: options.source }), ...(options.sourceId === undefined ? {} : { sourceId: options.sourceId }), ...(options.build === undefined ? {} : { build: options.build }) };
    observations.push({ ...result.observation, fingerprint: observationFingerprint(result.observation), provenance, ...(options.retainRawData === false ? {} : { raw }) });
  });
  return createDataset(observations, { diagnostics, rejectedRecords });
}

export function parseObservation(value: unknown, options: ParseOptions = {}): ParseResult { return parseObservations([value], options); }
