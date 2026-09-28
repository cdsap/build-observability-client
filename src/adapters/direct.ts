import type { NormalizedDataset } from "../model.js";
import type { SourceAdapter } from "./source.js";
import { failure, modeOf, observationOf, type ParseOptions } from "../parse.js";
export function parseDirectObservation(input: unknown, options: ParseOptions = {}): NormalizedDataset {
  const mode = modeOf(options);
  const diagnostics = [] as import("../model.js").Diagnostic[];
  const observation = observationOf(input);
  if (observation === undefined) { failure("malformed_observation", "Direct input must be a self-contained GBOS observation.", mode, diagnostics); return { records: [], diagnostics }; }
  return { records: [{ observation, metadata: {}, provenance: { source: "direct", index: 0 } }], diagnostics };
}
export const parseDirectObservations: typeof parseDirectObservation = parseDirectObservation;
export const directObservationAdapter: SourceAdapter<unknown> = { source: "direct", parse: parseDirectObservation };
