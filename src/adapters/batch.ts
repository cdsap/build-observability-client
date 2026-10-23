import type { ParseOptions, ParseResult } from "../parse.js";
import { parseObservations } from "../parse.js";

interface BatchEnvelope {
  readonly schemaVersion?: unknown;
  readonly producer?: unknown;
  readonly observations?: unknown;
}

/** Parses a batch envelope while inheriting its headers into child observations. */
export function parseBatch(input: unknown, options: ParseOptions = {}): ParseResult {
  const batch = input as BatchEnvelope | null | undefined;
  const observations = Array.isArray(batch?.observations) ? batch.observations : [];
  const headers = { schemaVersion: batch?.schemaVersion, producer: batch?.producer };
  return parseObservations(
    observations.map((item) => ({
      ...(item as object),
      schemaVersion: (item as { schemaVersion?: unknown }).schemaVersion ?? headers.schemaVersion,
      producer: (item as { producer?: unknown }).producer ?? headers.producer,
    })),
    options,
  );
}
