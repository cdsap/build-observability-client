export type AttributeValue = string | number | boolean;
export type Attributes = Readonly<Record<string, AttributeValue>>;
export interface Producer { readonly name: string; readonly version: string; }
export type Aggregation = "last" | "min" | "max" | "sum" | "count";
export type AggregationScope = "entity" | "task" | "project" | "build";
export interface Measurement { readonly name: string; readonly value: number; readonly unit: string; readonly aggregation: Aggregation; }
export interface HistogramBucket { readonly gte: number; readonly lt?: number; readonly count: number; }
export interface Histogram { readonly name: string; readonly unit: string; readonly aggregation: "count"; readonly buckets: readonly HistogramBucket[]; }
export type DiagnosticSeverity = "info" | "warning" | "error";
export interface Diagnostic { readonly code: string; readonly severity: DiagnosticSeverity; readonly message?: string; readonly path?: string; readonly ordinal?: number; }
export interface Observation {
  readonly schemaVersion: "1.0.0"; readonly producer: Producer; readonly scope: string; readonly aggregationScope: AggregationScope;
  readonly attributes: Attributes; readonly measurements?: readonly Measurement[]; readonly histograms?: readonly Histogram[];
  readonly partial?: boolean; readonly droppedObservations?: number; readonly diagnostics?: readonly Diagnostic[];
}
export type Transport = "observation" | "batch" | "fragment" | "report" | "ndjson" | string;
export interface BuildContext { readonly buildId?: string; readonly projectId?: string; readonly invocationId?: string; readonly url?: string; readonly [key: string]: string | undefined; }
export interface Provenance {
  readonly transport: Transport; readonly ordinal: number; readonly source?: string; readonly sourceId?: string; readonly build?: BuildContext;
}
export interface NormalizedObservation extends Observation { readonly fingerprint: string; readonly provenance: Provenance; readonly raw?: unknown; }
export interface RejectedRecord { readonly ordinal: number; readonly raw?: unknown; readonly diagnostics: readonly Diagnostic[]; }
export interface DatasetDiagnostics { readonly diagnostics: readonly Diagnostic[]; readonly rejectedRecords: readonly RejectedRecord[]; }
export interface ObservationDataset extends DatasetDiagnostics {
  readonly observations: readonly NormalizedObservation[]; readonly indexes: ReadonlyMap<string, readonly NormalizedObservation[]>;
  readonly tags: ReadonlyMap<string, readonly NormalizedObservation[]>;
}
export interface DatasetOptions { readonly diagnostics?: readonly Diagnostic[]; readonly rejectedRecords?: readonly RejectedRecord[]; }

function freeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) freeze(child);
  }
  return value;
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonical(object[key])}`).join(",")}}`;
}

function utf8(value: string): Uint8Array {
  const bytes: number[] = [];
  for (const character of value) {
    const code = character.codePointAt(0) as number;
    if (code < 0x80) bytes.push(code);
    else if (code < 0x800) bytes.push(0xc0 | (code >>> 6), 0x80 | (code & 0x3f));
    else if (code < 0x10000) bytes.push(0xe0 | (code >>> 12), 0x80 | ((code >>> 6) & 0x3f), 0x80 | (code & 0x3f));
    else bytes.push(0xf0 | (code >>> 18), 0x80 | ((code >>> 12) & 0x3f), 0x80 | ((code >>> 6) & 0x3f), 0x80 | (code & 0x3f));
  }
  return new Uint8Array(bytes);
}

const SHA256_K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb,
  0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624,
  0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb,
  0xbef9a3f7, 0xc67178f2,
] as const;
const SHA256_H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
const rotate = (value: number, bits: number): number => (value >>> bits) | (value << (32 - bits));

function sha256(value: string): string {
  const bytes = utf8(value); const bitLength = bytes.length * 8;
  const paddedLength = Math.ceil((bytes.length + 9) / 64) * 64; const message = new Uint8Array(paddedLength);
  message.set(bytes); message[bytes.length] = 0x80; const view = new DataView(message.buffer); view.setUint32(paddedLength - 4, bitLength, false);
  const hash = SHA256_H.slice();
  for (let offset = 0; offset < message.length; offset += 64) {
    const words = new Uint32Array(64);
    for (let index = 0; index < 16; index++) words[index] = view.getUint32(offset + index * 4, false);
    for (let index = 16; index < 64; index++) {
      const a = words[index - 15]; const b = words[index - 2];
      words[index] = (words[index - 16] + (rotate(a, 7) ^ rotate(a, 18) ^ (a >>> 3)) + words[index - 7] + (rotate(b, 17) ^ rotate(b, 19) ^ (b >>> 10))) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = hash;
    for (let index = 0; index < 64; index++) {
      const temp1 = (h + (rotate(e, 6) ^ rotate(e, 11) ^ rotate(e, 25)) + ((e & f) ^ (~e & g)) + SHA256_K[index] + words[index]) >>> 0;
      const temp2 = ((rotate(a, 2) ^ rotate(a, 13) ^ rotate(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
      [h, g, f, e, d, c, b, a] = [g, f, e, (d + temp1) >>> 0, c, b, a, (temp1 + temp2) >>> 0];
    }
    for (let index = 0; index < 8; index++) hash[index] = (hash[index] + [a, b, c, d, e, f, g, h][index]) >>> 0;
  }
  return hash.map((word) => word.toString(16).padStart(8, "0")).join("");
}

/** Object keys are sorted for identity; arrays retain source order, including repeated values. */
export function canonicalObservation(observation: Observation): string { return canonical(observation); }
/** A SHA-256 identity shared by equivalent observations from different transports. */
export function observationFingerprint(observation: Observation): string { return `sha256:${sha256(canonicalObservation(observation))}`; }

function mapOf(values: readonly NormalizedObservation[], key: (observation: NormalizedObservation) => string): ReadonlyMap<string, readonly NormalizedObservation[]> {
  const result = new Map<string, NormalizedObservation[]>();
  for (const observation of values) { const name = key(observation); const bucket = result.get(name) ?? []; bucket.push(observation); result.set(name, bucket); }
  const entries = [...result].map(([name, bucket]) => [name, Object.freeze(bucket)] as [string, readonly NormalizedObservation[]]);
  const immutable = {
    get size(): number { return entries.length; },
    get(name: string): readonly NormalizedObservation[] | undefined { return entries.find(([entry]) => entry === name)?.[1]; },
    has(name: string): boolean { return entries.some(([entry]) => entry === name); },
    keys(): IterableIterator<string> { return entries.map(([name]) => name)[Symbol.iterator](); },
    values(): IterableIterator<readonly NormalizedObservation[]> { return entries.map(([, bucket]) => bucket)[Symbol.iterator](); },
    entries(): IterableIterator<[string, readonly NormalizedObservation[]]> { return entries[Symbol.iterator](); },
    forEach(callback: (value: readonly NormalizedObservation[], key: string, map: ReadonlyMap<string, readonly NormalizedObservation[]>) => void): void { for (const [name, bucket] of entries) callback(bucket, name, immutable); },
    [Symbol.iterator](): IterableIterator<[string, readonly NormalizedObservation[]]> { return entries[Symbol.iterator](); },
  };
  return Object.freeze(immutable);
}

/** Creates a deeply immutable dataset. Duplicate fingerprints remain separate observations. */
export function createDataset(observations: readonly NormalizedObservation[], options: DatasetOptions = {}): ObservationDataset {
  const normalized = observations.map((observation) => freeze({ ...observation }));
  const diagnostics = options.diagnostics?.map((entry) => freeze({ ...entry })) ?? [];
  const rejectedRecords = options.rejectedRecords?.map((record) => freeze({ ...record, diagnostics: Object.freeze([...record.diagnostics]) })) ?? [];
  const indexes = mapOf(normalized, (observation) => `${observation.scope}:${observation.measurements?.map((entry) => entry.name).join(",") ?? observation.histograms?.map((entry) => entry.name).join(",") ?? ""}`);
  const tags = mapOf(normalized, (observation) => Object.keys(observation.attributes).sort().map((key) => `${key}=${String(observation.attributes[key])}`).join("&"));
  return freeze({ observations: Object.freeze(normalized), diagnostics: Object.freeze(diagnostics), rejectedRecords: Object.freeze(rejectedRecords), indexes, tags });
}
