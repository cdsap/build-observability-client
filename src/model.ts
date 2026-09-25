export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { readonly [key: string]: JsonValue };

export interface Producer { readonly name: string; readonly version: string; }
export type AggregationScope = "entity" | "task" | "project" | "build";
export type Aggregation = "last" | "min" | "max" | "sum" | "count";
export type AttributeValue = string | number | boolean;
export interface Measurement { readonly name: string; readonly value: number; readonly unit: string; readonly aggregation: Aggregation; }
export interface HistogramBucket { readonly gte: number; readonly lt?: number; readonly count: number; }
export interface Histogram { readonly name: string; readonly unit: string; readonly aggregation: "count"; readonly buckets: readonly HistogramBucket[]; }
export interface Diagnostic { readonly code: string; readonly severity: "warning" | "error"; readonly message: string; readonly line?: number; }
export interface Observation {
  readonly schemaVersion: "1.0.0";
  readonly producer: Producer;
  readonly scope: string;
  readonly aggregationScope: AggregationScope;
  readonly attributes: Readonly<Record<string, AttributeValue>>;
  readonly measurements?: readonly Measurement[];
  readonly histograms?: readonly Histogram[];
  readonly partial?: boolean;
  readonly droppedObservations?: number;
  readonly diagnostics?: readonly { readonly code: string; readonly severity: "info" | "warning" | "error"; readonly message?: string }[];
}
export type Resource = Readonly<Record<string, AttributeValue>>;
export type BuildContext = Readonly<Record<string, JsonValue>>;
export type SourceKind = "report" | "ndjson" | "direct";
export interface RecordMetadata { readonly resource?: Resource; readonly buildContext?: BuildContext; }
export interface RecordProvenance { readonly source: SourceKind; readonly index: number; readonly line?: number; }
export interface NormalizedRecord { readonly observation: Observation; readonly metadata: RecordMetadata; readonly provenance: RecordProvenance; }
export interface NormalizedDataset { readonly records: readonly NormalizedRecord[]; readonly diagnostics: readonly Diagnostic[]; }
