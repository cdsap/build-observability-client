import type { AttributeValue, Observation, Producer } from "../model.js";

export function objectOf(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

export function isAttributeRecord(value: unknown): value is Record<string, AttributeValue> {
  const object = objectOf(value);
  return object !== undefined && Object.values(object).every((item) => typeof item === "string" || typeof item === "number" || typeof item === "boolean");
}

export function producerOf(value: unknown): Producer | undefined {
  const object = objectOf(value);
  return typeof object?.name === "string" && typeof object.version === "string" ? { name: object.name, version: object.version } : undefined;
}

export function observationOf(value: unknown, headers: { schemaVersion?: unknown; producer?: unknown } = {}): Observation | undefined {
  const object = objectOf(value);
  if (object === undefined) return undefined;
  const schemaVersion = object.schemaVersion ?? headers.schemaVersion;
  const producer = producerOf(object.producer ?? headers.producer);
  if (schemaVersion !== "1.0.0" || producer === undefined || typeof object.scope !== "string" || !["entity", "task", "project", "build"].includes(object.aggregationScope as string) || !isAttributeRecord(object.attributes) || (!Array.isArray(object.measurements) && !Array.isArray(object.histograms))) return undefined;
  const observation = { ...object, schemaVersion, producer };
  delete (observation as Record<string, unknown>).$schema;
  return observation as unknown as Observation;
}
