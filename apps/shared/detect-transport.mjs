/** @typedef {"report" | "ndjson" | "observation" | "batch" | "projection" | "unknown"} TransportKind */

const FORMATS = Object.freeze(["report", "ndjson", "observation", "batch", "projection"]);

/**
 * @param {string} text
 * @returns {TransportKind}
 */
export function detectTransport(text) {
  const trimmed = text.trim();
  if (trimmed === "") return "unknown";

  const lines = trimmed.split(/\r?\n/).filter((line) => line.trim() !== "");
  if (lines.length > 1) {
    let jsonLines = 0;
    for (const line of lines) {
      try {
        JSON.parse(line);
        jsonLines += 1;
      } catch {
        // skip non-JSON lines
      }
    }
    if (jsonLines >= 2) return "ndjson";
  }

  try {
    return detectJsonValue(JSON.parse(trimmed));
  } catch {
    if (lines.length > 1 && lines.some(isJsonLine)) return "ndjson";
    return "unknown";
  }
}

/**
 * @param {unknown} value
 * @returns {TransportKind}
 */
export function detectJsonValue(value) {
  if (Array.isArray(value) && value.length > 0 && value.every(isCustomValue)) return "projection";
  const object = value !== null && typeof value === "object" && !Array.isArray(value) ? value : undefined;
  if (object === undefined) return "unknown";
  if (Array.isArray(object.customValues)) return "projection";
  if (object.schemaVersion === "1.0.0" && object.resource !== null && typeof object.resource === "object") {
    return "report";
  }
  if (Array.isArray(object.observations) && object.producer !== undefined) return "batch";
  if (typeof object.scope === "string" && typeof object.aggregationScope === "string") return "observation";
  return "unknown";
}

/**
 * @param {string} value
 * @returns {boolean}
 */
export function isKnownFormat(value) {
  return FORMATS.includes(value);
}

/**
 * Filename is a host hint, weaker than an explicit --format flag.
 * @param {string | undefined} name
 * @returns {string | undefined}
 */
export function formatFromFileName(name) {
  if (typeof name !== "string") return undefined;
  return name.toLowerCase().endsWith(".ndjson") ? "ndjson" : undefined;
}

export { FORMATS };

function isCustomValue(value) {
  return value !== null && typeof value === "object" && typeof value.name === "string" && typeof value.value === "string";
}

function isJsonLine(line) {
  try {
    JSON.parse(line);
    return true;
  } catch {
    return false;
  }
}
