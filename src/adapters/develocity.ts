export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export interface CustomValue {
  readonly name: string;
  readonly value: string;
}

export interface DevelocityProjectionInput {
  readonly customValues: readonly CustomValue[];
  readonly tags?: readonly string[];
}

export interface Producer {
  readonly name: string;
  readonly version: string;
}

export interface Measurement {
  readonly name: string;
  readonly value: number;
  readonly unit: string;
  readonly aggregation: "last" | "min" | "max" | "sum" | "count";
}

export interface Histogram {
  readonly name: string;
  readonly unit: string;
  readonly aggregation: "count";
  readonly buckets: readonly { readonly gte: number; readonly lt?: number; readonly count: number }[];
}

export interface Observation {
  readonly schemaVersion: string;
  readonly producer: Producer;
  readonly scope: string;
  readonly aggregationScope: "entity" | "task" | "project" | "build";
  readonly attributes: Readonly<Record<string, string | number | boolean>>;
  readonly measurements?: readonly Measurement[];
  readonly histograms?: readonly Histogram[];
  readonly partial?: boolean;
  readonly droppedObservations?: number;
  readonly diagnostics?: readonly Diagnostic[];
}

export interface ScalarIndex {
  readonly name: string;
  readonly producer: string;
  readonly metric: string;
  readonly aggregation: "last" | "min" | "max" | "sum" | "count";
  readonly rawValue: string;
  readonly parsedValue: JsonValue;
}

export interface Diagnostic {
  readonly code: string;
  readonly severity: "info" | "warning" | "error";
  readonly message: string;
  readonly customValueIndex?: number;
  readonly customValueName?: string;
}

export interface ProvenanceEntry {
  readonly customValueIndex: number;
  readonly customValueName: string;
  readonly kind: "observation" | "index" | "metadata" | "tag";
}

export interface DevelocityProjectionResult {
  readonly schemaVersion: string | undefined;
  readonly observations: readonly Observation[];
  readonly indexes: readonly ScalarIndex[];
  readonly tags: readonly string[];
  readonly diagnostics: readonly Diagnostic[];
  readonly provenance: readonly ProvenanceEntry[];
}

export interface ParseOptions {
  readonly mode?: "strict" | "compatible";
}

const DEFAULT_SCHEMA_VERSION = "1.0.0";
const INDEX_PATTERN = /^gbos\.v1\.index\.([a-z0-9_]+)\.(.+)\.(last|min|max|sum|count)$/;
const PRODUCER_PATTERN = /^gbos\.v1\.producer\.([a-z0-9_]+)\.(name|version|observation)$/;

function diagnostic(
  code: string,
  severity: Diagnostic["severity"],
  message: string,
  customValue?: CustomValueWithIndex,
): Diagnostic {
  return {
    code,
    severity,
    message,
    ...(customValue === undefined
      ? {}
      : { customValueIndex: customValue.index, customValueName: customValue.value.name }),
  };
}

interface CustomValueWithIndex {
  readonly index: number;
  readonly value: CustomValue;
}

function parseJson(value: string): JsonValue | undefined {
  try {
    return JSON.parse(value) as JsonValue;
  } catch {
    return undefined;
  }
}

function asObject(value: JsonValue | undefined): Record<string, JsonValue> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value : undefined;
}

function asString(value: JsonValue | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function parseMetadataValue(value: string): string | undefined {
  const parsed = parseJson(value);
  return typeof parsed === "string" ? parsed : value.length > 0 ? value : undefined;
}

function isObservation(value: JsonValue | undefined): value is Record<string, JsonValue> {
  const object = asObject(value);
  return object !== undefined && typeof object.scope === "string" && typeof object.aggregationScope === "string";
}

function addObservation(
  target: Record<string, JsonValue>,
  observation: Record<string, JsonValue>,
  headers: { schemaVersion?: string; producer?: Producer },
): void {
  for (const [key, value] of Object.entries(observation)) target[key] = value;
  if (target.schemaVersion === undefined) target.schemaVersion = headers.schemaVersion ?? DEFAULT_SCHEMA_VERSION;
  if (target.producer === undefined && headers.producer !== undefined) {
    target.producer = { name: headers.producer.name, version: headers.producer.version };
  }
}

function normalizeObservation(
  value: Record<string, JsonValue>,
  headers: { schemaVersion?: string; producer?: Producer },
  diagnostics: Diagnostic[],
  customValue: CustomValueWithIndex,
): Observation | undefined {
  const normalized: Record<string, JsonValue> = {};
  addObservation(normalized, value, headers);
  const producer = asObject(normalized.producer);
  if (typeof normalized.schemaVersion !== "string" || producer === undefined || typeof producer.name !== "string" || typeof producer.version !== "string") {
    diagnostics.push(diagnostic("missing_header", "error", "Observation is missing schemaVersion or producer metadata.", customValue));
    return undefined;
  }
  if (!isObservation(normalized)) {
    diagnostics.push(diagnostic("malformed_observation", "error", "Observation must contain scope and aggregationScope.", customValue));
    return undefined;
  }
  return normalized as unknown as Observation;
}

function producerFromHeaders(names: Map<string, string>, versions: Map<string, string>, id: string): Producer | undefined {
  const name = names.get(id);
  const version = versions.get(id);
  return name !== undefined && version !== undefined ? { name, version } : undefined;
}

/** Reconstructs canonical GBOS observations from ordered Develocity custom values. */
export function parseDevelocityProjection(
  input: readonly CustomValue[] | DevelocityProjectionInput,
  options: ParseOptions = {},
): DevelocityProjectionResult {
  const projection: DevelocityProjectionInput | undefined = Array.isArray(input) ? undefined : input as DevelocityProjectionInput;
  const customValues: readonly CustomValue[] = projection === undefined ? input as readonly CustomValue[] : projection.customValues;
  const tags = projection === undefined ? [] : [...(projection.tags ?? [])];
  const mode = options.mode ?? "compatible";
  const diagnostics: Diagnostic[] = [];
  const provenance: ProvenanceEntry[] = [];
  const observations: Observation[] = [];
  const indexes: ScalarIndex[] = [];
  const producerNames = new Map<string, string>();
  const producerVersions = new Map<string, string>();
  const pending: { value: Record<string, JsonValue>; item: CustomValueWithIndex; producerId?: string; headers?: { schemaVersion?: string; producer?: Producer } }[] = [];
  let schemaVersion: string | undefined;

  const headers = (): { schemaVersion?: string; producer?: Producer } => ({ schemaVersion });
  const metadataConflict = (field: string, current: string | undefined, next: string, item: CustomValueWithIndex): void => {
    if (current !== undefined && current !== next) {
      diagnostics.push(diagnostic("conflicting_metadata", mode === "strict" ? "error" : "warning", `${field} has conflicting values; the first value wins.`, item));
    }
  };

  for (let index = 0; index < customValues.length; index += 1) {
    const value = customValues[index];
    const item = { index, value };
    if (typeof value?.name !== "string" || typeof value.value !== "string") {
      diagnostics.push(diagnostic("malformed_custom_value", "error", "Custom values must have string name and value fields."));
      continue;
    }
    const producerMatch = value.name.match(PRODUCER_PATTERN);
    if (value.name === "gbos.schema") {
      const next = parseMetadataValue(value.value);
      if (next === undefined) diagnostics.push(diagnostic("malformed_schema", "error", "gbos.schema must contain a non-empty schema version.", item));
      else {
        metadataConflict("schemaVersion", schemaVersion, next, item);
        if (schemaVersion === undefined) schemaVersion = next;
        provenance.push({ customValueIndex: index, customValueName: value.name, kind: "metadata" });
      }
      continue;
    }
    if (producerMatch !== null) {
      const [, id, field] = producerMatch;
      if (field === "name" || field === "version") {
        const next = parseMetadataValue(value.value);
        const map = field === "name" ? producerNames : producerVersions;
        if (next === undefined) diagnostics.push(diagnostic("malformed_producer_metadata", "error", `Producer ${field} must be a non-empty string.`, item));
        else {
          metadataConflict(`producer.${id}.${field}`, map.get(id), next, item);
          if (!map.has(id)) map.set(id, next);
          provenance.push({ customValueIndex: index, customValueName: value.name, kind: "metadata" });
        }
        continue;
      }
      const parsed = parseJson(value.value);
      if (parsed === undefined || !isObservation(parsed)) {
        diagnostics.push(diagnostic("malformed_json", mode === "strict" ? "error" : "warning", "Producer-scoped observation is not valid JSON observation data.", item));
      } else {
        pending.push({ value: parsed, item, producerId: id });
        provenance.push({ customValueIndex: index, customValueName: value.name, kind: "observation" });
      }
      continue;
    }
    const indexMatch = value.name.match(INDEX_PATTERN);
    if (indexMatch !== null) {
      const [, producer, metric, aggregation] = indexMatch;
      const parsedValue = parseJson(value.value) ?? value.value;
      indexes.push({ name: value.name, producer, metric, aggregation: aggregation as ScalarIndex["aggregation"], rawValue: value.value, parsedValue });
      provenance.push({ customValueIndex: index, customValueName: value.name, kind: "index" });
      continue;
    }
    if (value.name === "gbos.v1.observation" || value.name === "gbos.v1.observations") {
      const parsed = parseJson(value.value);
      if (parsed === undefined) {
        diagnostics.push(diagnostic("malformed_json", mode === "strict" ? "error" : "warning", "Observation custom value is not valid JSON.", item));
        continue;
      }
      const batch = asObject(parsed);
      const batchProducer = asObject(batch?.producer);
      const batchHeaders = {
        schemaVersion: asString(batch?.schemaVersion),
        producer: batchProducer !== undefined && typeof batchProducer.name === "string" && typeof batchProducer.version === "string"
          ? { name: batchProducer.name, version: batchProducer.version }
          : undefined,
      };
      const values: JsonValue[] = value.name === "gbos.v1.observations"
        ? (Array.isArray(parsed) ? parsed : batch !== undefined && Array.isArray(batch.observations) ? batch.observations : [])
        : [parsed];
      if (values.length === 0) diagnostics.push(diagnostic("malformed_observation_batch", "error", "Observation batch must contain an observations array.", item));
      for (const candidate of values) {
        if (!isObservation(candidate)) {
          diagnostics.push(diagnostic("malformed_observation", "error", "Observation payload is missing scope or aggregationScope.", item));
          continue;
        }
        pending.push({ value: candidate, item, headers: batchHeaders });
      }
      provenance.push({ customValueIndex: index, customValueName: value.name, kind: "observation" });
      continue;
    }
    if (value.name.startsWith("gbos.")) diagnostics.push(diagnostic("unsupported_key", mode === "strict" ? "error" : "warning", `Unsupported GBOS custom-value key: ${value.name}.`, item));
  }

  // Resolve all headers only after scanning the complete ordered input. This makes
  // metadata position-independent while preserving observation order.
  const defaultProducer = producerNames.size === 1 && producerVersions.size === 1
    ? producerFromHeaders(producerNames, producerVersions, [...producerNames.keys()][0])
    : undefined;
  for (const candidate of pending) {
    const candidateHeaders = candidate.headers ?? {};
    const producer = candidate.producerId === undefined
      ? candidateHeaders.producer
      : producerFromHeaders(producerNames, producerVersions, candidate.producerId);
    const observation = normalizeObservation(candidate.value, {
      schemaVersion: candidateHeaders.schemaVersion ?? schemaVersion,
      producer: producer ?? defaultProducer,
    }, diagnostics, candidate.item);
    if (observation !== undefined) observations.push(observation);
  }

  for (let index = 0; index < tags.length; index += 1) {
    if (typeof tags[index] === "string" && tags[index].startsWith("gbos:")) provenance.push({ customValueIndex: -1 - index, customValueName: tags[index], kind: "tag" });
  }
  return { schemaVersion, observations, indexes, tags, diagnostics, provenance };
}
