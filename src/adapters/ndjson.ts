import type { Diagnostic, NormalizedDataset } from "../model.js";
import { failure, modeOf, observationOf, objectOf, type ParseOptions } from "../parse.js";
import type { SourceAdapter } from "./source.js";
export interface NdjsonOptions extends ParseOptions { readonly resource?: Readonly<Record<string, string | number | boolean>>; readonly buildContext?: Readonly<Record<string, import("../model.js").JsonValue>>; }
function parseLines(lines: Iterable<string>, options: NdjsonOptions): NormalizedDataset {
  const mode = modeOf(options); const diagnostics: Diagnostic[] = []; const records = [] as import("../model.js").NormalizedRecord[]; let line = 0;
  for (const text of lines) { line += 1; if (text.trim() === "") continue; let value: unknown; try { value = JSON.parse(text) as unknown; } catch { failure("malformed_json", `NDJSON line ${line} is not valid JSON.`, mode, diagnostics); continue; }
    const object = objectOf(value); const candidates = object !== undefined && Array.isArray(object.observations) ? object.observations.map((item) => ({ item, headers: { schemaVersion: object.schemaVersion, producer: object.producer } })) : [{ item: value, headers: {} }];
    for (const candidate of candidates) { const observation = observationOf(candidate.item, candidate.headers); if (observation === undefined) { failure("malformed_observation", `NDJSON line ${line} is not a valid observation.`, mode, diagnostics); continue; } records.push({ observation, metadata: { ...(options.resource === undefined ? {} : { resource: options.resource }), ...(options.buildContext === undefined ? {} : { buildContext: options.buildContext }) }, provenance: { source: "ndjson", index: records.length, line } }); }
  }
  return { records, diagnostics };
}
export function parseNdjson(input: string, options: NdjsonOptions = {}): NormalizedDataset { return parseLines(input.split(/\r?\n/), options); }
export async function parseNdjsonAsync(input: AsyncIterable<string>, options: NdjsonOptions = {}): Promise<NormalizedDataset> {
  const lines: string[] = []; let pending = "";
  for await (const chunk of input) {
    pending += chunk;
    const parts = pending.split(/\r?\n/);
    pending = parts.pop() ?? "";
    lines.push(...parts);
  }
  if (pending !== "") lines.push(pending);
  return parseLines(lines, options);
}
export const parseNDJSON: typeof parseNdjson = parseNdjson;
export const parseNDJSONAsync: typeof parseNdjsonAsync = parseNdjsonAsync;
export const ndjsonAdapter: SourceAdapter<string> = { source: "ndjson", parse: parseNdjson };
