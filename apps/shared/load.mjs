import { parseDirectObservation } from "@cdsap/gbos/adapters/direct";
import { parseDevelocityProjection } from "@cdsap/gbos/adapters/develocity";
import { parseNdjson } from "@cdsap/gbos/adapters/ndjson";
import { parseReport } from "@cdsap/gbos/adapters/report";
import { parseObservations, ParseError } from "@cdsap/gbos/parse";
import { createDevelocityViewSpec, createObservationViewSpec } from "@cdsap/gbos/presentation";
import { detectTransport, isKnownFormat } from "./detect-transport.mjs";

const COMPATIBLE = Object.freeze({ mode: "compatible" });

/**
 * @param {string} text
 * @param {{ format?: string }} [options]
 */
export function loadView(text, options = {}) {
  const format = options.format === undefined || options.format === ""
    ? detectTransport(text)
    : options.format;
  if (!isKnownFormat(format)) {
    return {
      format: "unknown",
      observationCount: 0,
      view: {
        title: "Build observability",
        diagnostics: [{ severity: "error", message: "Input is not a recognized GBOS transport." }],
        sections: [],
      },
      ok: false,
    };
  }

  try {
    if (format === "ndjson") {
      const dataset = parseNdjson(text, COMPATIBLE);
      return viewFromDataset(format, dataset);
    }

    const value = JSON.parse(text);
    if (format === "report") return viewFromDataset(format, parseReport(value, COMPATIBLE));
    if (format === "observation") return viewFromDataset(format, parseDirectObservation(value, COMPATIBLE));
    if (format === "batch") {
      const observations = Array.isArray(value?.observations) ? value.observations : [];
      const headers = { schemaVersion: value?.schemaVersion, producer: value?.producer };
      return viewFromDataset(
        format,
        parseObservations(
          observations.map((item) => ({
            ...item,
            schemaVersion: item.schemaVersion ?? headers.schemaVersion,
            producer: item.producer ?? headers.producer,
          })),
          COMPATIBLE,
        ),
      );
    }
    const projection = parseDevelocityProjection(value, COMPATIBLE);
    return {
      format,
      observationCount: projection.observations.length,
      view: createDevelocityViewSpec(projection),
      ok: projection.observations.length > 0,
    };
  } catch (error) {
    const message = error instanceof ParseError ? error.message : error instanceof Error ? error.message : "Unable to parse GBOS input.";
    return {
      format,
      observationCount: 0,
      view: {
        title: "Build observability",
        diagnostics: [{ severity: "error", message }],
        sections: [],
      },
      ok: false,
    };
  }
}

function viewFromDataset(format, dataset) {
  const observations = Array.isArray(dataset.records)
    ? dataset.records.map((record) => record.observation)
    : [...(dataset.observations ?? [])];
  const diagnostics = dataset.diagnostics ?? [];
  return {
    format,
    observationCount: observations.length,
    view: createObservationViewSpec(observations, diagnostics),
    ok: observations.length > 0,
  };
}

