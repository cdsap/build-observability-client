import { createRegistryLookup, type Aggregation, type RegistryLookup, type SemanticRegistry } from "./registry.js";

export type ParseMode = "strict" | "compatible";
export type DocumentKind = "observation" | "fragment" | "batch";
export type DiagnosticSeverity = "info" | "warning" | "error";
export type DiagnosticSource = "structural" | "semantic";

export interface ValidationDiagnostic {
  readonly code: string;
  readonly message: string;
  readonly path: string;
  readonly severity: DiagnosticSeverity;
  readonly source: DiagnosticSource;
}

export interface ValidationOptions {
  readonly mode?: ParseMode;
  readonly kind?: DocumentKind;
  readonly registry?: SemanticRegistry | RegistryLookup;
}

export interface ValidationResult<T = unknown> {
  readonly accepted: boolean;
  readonly retained: T | undefined;
  readonly diagnostics: readonly ValidationDiagnostic[];
  readonly structuralDiagnostics: readonly ValidationDiagnostic[];
  readonly semanticDiagnostics: readonly ValidationDiagnostic[];
}

interface ObjectValue { readonly [key: string]: unknown }
const NAME = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/;
const PRODUCER_NAME = /^[a-z0-9][a-z0-9._-]*$/;
const AGGREGATIONS: readonly Aggregation[] = ["last", "min", "max", "sum", "count"];
const AGGREGATION_SCOPES = ["entity", "task", "project", "build"] as const;

function isObject(value: unknown): value is ObjectValue {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function own(value: ObjectValue, key: string): boolean { return Object.prototype.hasOwnProperty.call(value, key); }

function diagnostic(source: DiagnosticSource, code: string, path: string, message: string, severity: DiagnosticSeverity = "error"): ValidationDiagnostic {
  return { source, code, path, message, severity };
}

function structural(value: unknown, diagnostics: ValidationDiagnostic[], kind: DocumentKind): value is ObjectValue {
  if (!isObject(value)) {
    diagnostics.push(diagnostic("structural", "record.type", "$", "record must be an object"));
    return false;
  }
  if (kind === "batch") return structuralBatch(value, diagnostics);
  return structuralObservation(value, diagnostics, kind === "fragment");
}

function checkKeys(value: ObjectValue, allowed: readonly string[], diagnostics: ValidationDiagnostic[], path = "$"): void {
  for (const key of Object.keys(value)) if (!allowed.includes(key)) diagnostics.push(diagnostic("structural", "property.unknown", `${path}.${key}`, "property is not defined by the GBOS schema"));
}

function required(value: ObjectValue, keys: readonly string[], diagnostics: ValidationDiagnostic[], path = "$"): void {
  for (const key of keys) if (!own(value, key)) diagnostics.push(diagnostic("structural", "property.required", `${path}.${key}`, "required property is missing"));
}

function stringProperty(value: ObjectValue, key: string, diagnostics: ValidationDiagnostic[], path = "$"): void {
  if (own(value, key) && typeof value[key] !== "string") diagnostics.push(diagnostic("structural", "property.type", `${path}.${key}`, "must be a string"));
}

function finiteNumber(value: unknown): boolean { return typeof value === "number" && Number.isFinite(value); }

function structuralProducer(value: unknown, diagnostics: ValidationDiagnostic[], path: string): void {
  if (!isObject(value)) { diagnostics.push(diagnostic("structural", "producer.type", path, "must be an object")); return; }
  checkKeys(value, ["name", "version"], diagnostics, path);
  required(value, ["name", "version"], diagnostics, path);
  stringProperty(value, "name", diagnostics, path);
  stringProperty(value, "version", diagnostics, path);
  if (typeof value.name === "string" && !PRODUCER_NAME.test(value.name)) diagnostics.push(diagnostic("structural", "producer.name", `${path}.name`, "has an invalid name"));
  if (typeof value.version === "string" && (value.version.length < 1 || value.version.length > 64)) diagnostics.push(diagnostic("structural", "producer.version", `${path}.version`, "must contain 1 to 64 characters"));
}

function structuralDiagnostics(value: unknown, diagnostics: ValidationDiagnostic[], path: string): void {
  if (!Array.isArray(value)) { diagnostics.push(diagnostic("structural", "diagnostics.type", path, "must be an array")); return; }
  const seen = new Set<string>();
  value.forEach((item, index) => {
    const itemPath = `${path}[${index}]`;
    if (!isObject(item)) { diagnostics.push(diagnostic("structural", "diagnostic.type", itemPath, "must be an object")); return; }
    checkKeys(item, ["code", "severity", "message"], diagnostics, itemPath);
    required(item, ["code", "severity"], diagnostics, itemPath);
    if (typeof item.code !== "string" || !NAME.test(item.code)) diagnostics.push(diagnostic("structural", "diagnostic.code", `${itemPath}.code`, "has an invalid diagnostic code"));
    if (!["info", "warning", "error"].includes(item.severity as string)) diagnostics.push(diagnostic("structural", "diagnostic.severity", `${itemPath}.severity`, "is not a supported severity"));
    if (own(item, "message") && (typeof item.message !== "string" || item.message.length > 1024)) diagnostics.push(diagnostic("structural", "diagnostic.message", `${itemPath}.message`, "must be a string of at most 1024 characters"));
    const identity = JSON.stringify(item);
    if (seen.has(identity)) diagnostics.push(diagnostic("structural", "diagnostic.unique", itemPath, "must be unique"));
    seen.add(identity);
  });
}

function structuralObservation(value: ObjectValue, diagnostics: ValidationDiagnostic[], fragment: boolean): boolean {
  const allowed = fragment ? ["scope", "aggregationScope", "attributes", "measurements", "histograms", "partial", "droppedObservations", "diagnostics"] : ["schemaVersion", "producer", "scope", "aggregationScope", "attributes", "measurements", "histograms", "partial", "droppedObservations", "diagnostics"];
  checkKeys(value, allowed, diagnostics);
  required(value, fragment ? ["scope", "aggregationScope", "attributes"] : ["schemaVersion", "producer", "scope", "aggregationScope", "attributes"], diagnostics);
  if (!fragment && value.schemaVersion !== "1.0.0") diagnostics.push(diagnostic("structural", "schema.version", "$.schemaVersion", "must equal 1.0.0"));
  if (!fragment) structuralProducer(value.producer, diagnostics, "$.producer");
  stringProperty(value, "scope", diagnostics);
  if (typeof value.scope === "string" && (value.scope.length > 255 || !NAME.test(value.scope))) diagnostics.push(diagnostic("structural", "scope.format", "$.scope", "has an invalid scope name"));
  if (!AGGREGATION_SCOPES.includes(value.aggregationScope as (typeof AGGREGATION_SCOPES)[number])) diagnostics.push(diagnostic("structural", "aggregation_scope.value", "$.aggregationScope", "is not a supported aggregation scope"));
  if (!isObject(value.attributes)) diagnostics.push(diagnostic("structural", "attributes.type", "$.attributes", "must be an object"));
  else for (const [key, attr] of Object.entries(value.attributes)) {
    if (!NAME.test(key)) diagnostics.push(diagnostic("structural", "attribute.name", `$.attributes.${key}`, "has an invalid attribute name"));
    if (!["string", "number", "boolean"].includes(typeof attr) || (typeof attr === "number" && !Number.isFinite(attr))) diagnostics.push(diagnostic("structural", "attribute.value", `$.attributes.${key}`, "must be a finite string, number, or boolean"));
  }
  if (own(value, "measurements")) structuralMeasurements(value.measurements, diagnostics);
  if (own(value, "histograms")) structuralHistograms(value.histograms, diagnostics);
  if (!Array.isArray(value.measurements) && !Array.isArray(value.histograms)) diagnostics.push(diagnostic("structural", "observations.required", "$.measurements", "measurements or histograms is required"));
  if (Array.isArray(value.measurements) && value.measurements.length === 0) diagnostics.push(diagnostic("structural", "measurements.minItems", "$.measurements", "must contain at least one measurement"));
  if (Array.isArray(value.histograms) && value.histograms.length === 0) diagnostics.push(diagnostic("structural", "histograms.minItems", "$.histograms", "must contain at least one histogram"));
  if (own(value, "partial") && typeof value.partial !== "boolean") diagnostics.push(diagnostic("structural", "partial.type", "$.partial", "must be a boolean"));
  if (own(value, "droppedObservations") && (!Number.isInteger(value.droppedObservations) || (value.droppedObservations as number) < 0)) diagnostics.push(diagnostic("structural", "dropped_observations.value", "$.droppedObservations", "must be a non-negative integer"));
  if (own(value, "diagnostics")) structuralDiagnostics(value.diagnostics, diagnostics, "$.diagnostics");
  return true;
}

function structuralMeasurements(value: unknown, diagnostics: ValidationDiagnostic[]): void {
  if (!Array.isArray(value)) { diagnostics.push(diagnostic("structural", "measurements.type", "$.measurements", "must be an array")); return; }
  value.forEach((item, index) => {
    const path = `$.measurements[${index}]`;
    if (!isObject(item)) { diagnostics.push(diagnostic("structural", "measurement.type", path, "must be an object")); return; }
    checkKeys(item, ["name", "value", "unit", "aggregation"], diagnostics, path); required(item, ["name", "value", "unit", "aggregation"], diagnostics, path);
    stringProperty(item, "name", diagnostics, path); stringProperty(item, "unit", diagnostics, path);
    if (typeof item.name === "string" && (item.name.length > 255 || !NAME.test(item.name))) diagnostics.push(diagnostic("structural", "measurement.name", `${path}.name`, "has an invalid metric name"));
    if (typeof item.unit === "string" && (item.unit.length > 63 || !/^[ -~]+$/.test(item.unit))) diagnostics.push(diagnostic("structural", "measurement.unit", `${path}.unit`, "has an invalid unit"));
    if (!finiteNumber(item.value)) diagnostics.push(diagnostic("structural", "measurement.value", `${path}.value`, "must be a finite number"));
    if (!AGGREGATIONS.includes(item.aggregation as Aggregation)) diagnostics.push(diagnostic("structural", "measurement.aggregation", `${path}.aggregation`, "is not a supported aggregation"));
  });
}

function structuralHistograms(value: unknown, diagnostics: ValidationDiagnostic[]): void {
  if (!Array.isArray(value)) { diagnostics.push(diagnostic("structural", "histograms.type", "$.histograms", "must be an array")); return; }
  value.forEach((item, index) => {
    const path = `$.histograms[${index}]`;
    if (!isObject(item)) { diagnostics.push(diagnostic("structural", "histogram.type", path, "must be an object")); return; }
    checkKeys(item, ["name", "unit", "aggregation", "buckets"], diagnostics, path); required(item, ["name", "unit", "aggregation", "buckets"], diagnostics, path);
    stringProperty(item, "name", diagnostics, path); stringProperty(item, "unit", diagnostics, path);
    if (typeof item.name === "string" && (item.name.length > 255 || !NAME.test(item.name))) diagnostics.push(diagnostic("structural", "histogram.name", `${path}.name`, "has an invalid metric name"));
    if (typeof item.unit === "string" && (item.unit.length > 63 || !/^[ -~]+$/.test(item.unit))) diagnostics.push(diagnostic("structural", "histogram.unit", `${path}.unit`, "has an invalid unit"));
    if (item.aggregation !== "count") diagnostics.push(diagnostic("structural", "histogram.aggregation", `${path}.aggregation`, "must be count"));
    if (!Array.isArray(item.buckets)) { diagnostics.push(diagnostic("structural", "histogram.buckets", `${path}.buckets`, "must be an array")); return; }
    if (item.buckets.length === 0) diagnostics.push(diagnostic("structural", "histogram.buckets.minItems", `${path}.buckets`, "must contain at least one bucket"));
    item.buckets.forEach((bucket, bucketIndex) => {
      const bucketPath = `${path}.buckets[${bucketIndex}]`;
      if (!isObject(bucket)) { diagnostics.push(diagnostic("structural", "bucket.type", bucketPath, "must be an object")); return; }
      checkKeys(bucket, ["gte", "lt", "count"], diagnostics, bucketPath); required(bucket, ["gte", "count"], diagnostics, bucketPath);
      if (!finiteNumber(bucket.gte)) diagnostics.push(diagnostic("structural", "bucket.gte", `${bucketPath}.gte`, "must be a finite number"));
      if (own(bucket, "lt") && !finiteNumber(bucket.lt)) diagnostics.push(diagnostic("structural", "bucket.lt", `${bucketPath}.lt`, "must be a finite number"));
      if (!Number.isInteger(bucket.count) || (bucket.count as number) < 0) diagnostics.push(diagnostic("structural", "bucket.count", `${bucketPath}.count`, "must be a non-negative integer"));
      if (finiteNumber(bucket.gte) && finiteNumber(bucket.lt) && (bucket.lt as number) <= (bucket.gte as number)) diagnostics.push(diagnostic("structural", "bucket.range", bucketPath, "lt must be greater than gte"));
    });
  });
}

function structuralBatch(value: ObjectValue, diagnostics: ValidationDiagnostic[]): boolean {
  checkKeys(value, ["$schema", "schemaVersion", "producer", "observations"], diagnostics); required(value, ["schemaVersion", "producer", "observations"], diagnostics);
  if (own(value, "$schema") && typeof value.$schema !== "string") diagnostics.push(diagnostic("structural", "schema.type", "$.$schema", "must be a string"));
  if (value.schemaVersion !== "1.0.0") diagnostics.push(diagnostic("structural", "schema.version", "$.schemaVersion", "must equal 1.0.0"));
  structuralProducer(value.producer, diagnostics, "$.producer");
  if (!Array.isArray(value.observations) || value.observations.length === 0) { diagnostics.push(diagnostic("structural", "observations.value", "$.observations", "must be a non-empty array")); return true; }
  value.observations.forEach((item, index) => { if (isObject(item)) structuralObservation(item, diagnostics, true); else diagnostics.push(diagnostic("structural", "observation.type", `$.observations[${index}]`, "must be an object")); });
  return true;
}

function asLookup(registry: SemanticRegistry | RegistryLookup | undefined): RegistryLookup | undefined {
  return registry && "find" in registry ? registry : registry ? createRegistryLookup(registry) : undefined;
}

function semantic(value: ObjectValue, lookup: RegistryLookup | undefined, diagnostics: ValidationDiagnostic[], path = "$"): void {
  if (!lookup) return;
  const scope = typeof value.scope === "string" ? lookup.scope(value.scope) : undefined;
  if (typeof value.scope === "string" && !scope) diagnostics.push(diagnostic("semantic", "scope.unknown", `${path}.scope`, `unknown scope "${value.scope}"`, "warning"));
  if (isObject(value.attributes)) for (const [name, attrValue] of Object.entries(value.attributes)) {
    const entry = lookup.attribute(name);
    if (!entry) { diagnostics.push(diagnostic("semantic", "attribute.unknown", `${path}.attributes.${name}`, `unknown attribute "${name}"`, "warning")); continue; }
    if (entry.type === "integer" && (!Number.isInteger(attrValue) || typeof attrValue !== "number") || entry.type === "number" && typeof attrValue !== "number" || entry.type !== "integer" && entry.type !== "number" && typeof attrValue !== entry.type) diagnostics.push(diagnostic("semantic", "attribute.type", `${path}.attributes.${name}`, `value does not match attribute type ${entry.type}`));
    if (entry.values && !entry.values.some((allowed) => Object.is(allowed, attrValue))) diagnostics.push(diagnostic("semantic", "attribute.value", `${path}.attributes.${name}`, "value is not in the registry"));
  }
  const validateMetric = (item: ObjectValue, itemPath: string, histogram: boolean): void => {
    const name = typeof item.name === "string" ? item.name : undefined;
    const metric = name ? lookup.metric(name) : undefined;
    if (!metric) { if (name) diagnostics.push(diagnostic("semantic", "metric.unknown", `${itemPath}.name`, `unknown metric "${name}"`, "warning")); return; }
    if (item.unit !== metric.unit) diagnostics.push(diagnostic("semantic", "metric.unit", `${itemPath}.unit`, `unit must be ${metric.unit}`));
    if (item.aggregation !== undefined && !metric.allowedAggregations.includes(item.aggregation as Aggregation)) diagnostics.push(diagnostic("semantic", "metric.aggregation", `${itemPath}.aggregation`, `aggregation is not allowed for ${metric.name}`));
    if (histogram !== (metric.type === "histogram")) diagnostics.push(diagnostic("semantic", "metric.type", `${itemPath}.name`, `metric is registered as ${metric.type}`));
  };
  if (Array.isArray(value.measurements)) value.measurements.forEach((item, index) => { if (isObject(item)) validateMetric(item, `${path}.measurements[${index}]`, false); });
  if (Array.isArray(value.histograms)) value.histograms.forEach((item, index) => { if (isObject(item)) validateMetric(item, `${path}.histograms[${index}]`, true); });
  if (value.partial === true && value.droppedObservations === undefined) diagnostics.push(diagnostic("semantic", "partial.dropped_missing", `${path}.droppedObservations`, "partial records should report droppedObservations", "warning"));
  if (typeof value.droppedObservations === "number" && value.droppedObservations > 0 && value.partial !== true) diagnostics.push(diagnostic("semantic", "partial.inconsistent", `${path}.partial`, "droppedObservations requires partial=true"));
  if (Array.isArray(value.histograms)) for (const [index, item] of value.histograms.entries()) if (isObject(item) && Array.isArray(item.buckets)) {
    let previousLt: number | undefined;
    item.buckets.forEach((bucket, bucketIndex) => {
      if (!isObject(bucket) || !finiteNumber(bucket.gte)) return;
      const gte = bucket.gte as number;
      if (previousLt !== undefined && gte < previousLt) diagnostics.push(diagnostic("semantic", "histogram.buckets.overlap", `${path}.histograms[${index}].buckets[${bucketIndex}]`, "buckets must be ordered and non-overlapping"));
      if (finiteNumber(bucket.lt)) previousLt = bucket.lt as number; else previousLt = Number.POSITIVE_INFINITY;
    });
  }
}

export function validateDocument<T = unknown>(value: T, options: ValidationOptions = {}): ValidationResult<T> {
  const kind = options.kind ?? "observation";
  const structuralDiagnostics: ValidationDiagnostic[] = [];
  const semanticDiagnostics: ValidationDiagnostic[] = [];
  const shape = structural(value, structuralDiagnostics, kind);
  if (shape) {
    const lookup = asLookup(options.registry);
    if (kind === "batch" && Array.isArray(value.observations)) value.observations.forEach((item, index) => { if (isObject(item)) semantic(item, lookup, semanticDiagnostics, `$.observations[${index}]`); });
    else semantic(value, lookup, semanticDiagnostics);
  }
  const diagnostics = [...structuralDiagnostics, ...semanticDiagnostics];
  const mode = options.mode ?? "strict";
  const accepted = shape && structuralDiagnostics.length === 0 && (mode === "compatible" || !semanticDiagnostics.some((item) => item.severity === "error"));
  return { accepted, retained: accepted ? value : undefined, diagnostics, structuralDiagnostics, semanticDiagnostics };
}

export function validateObservation<T = unknown>(value: T, options: Omit<ValidationOptions, "kind"> = {}): ValidationResult<T> { return validateDocument(value, { ...options, kind: "observation" }); }
export function validateFragment<T = unknown>(value: T, options: Omit<ValidationOptions, "kind"> = {}): ValidationResult<T> { return validateDocument(value, { ...options, kind: "fragment" }); }
export function validateBatch<T = unknown>(value: T, options: Omit<ValidationOptions, "kind"> = {}): ValidationResult<T> { return validateDocument(value, { ...options, kind: "batch" }); }
