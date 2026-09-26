export type RegistryValue = string | number | boolean;

export interface SemanticScope {
  readonly name: string;
  readonly description: string;
}

export interface SemanticMetric {
  readonly name: string;
  readonly unit: string;
  readonly type: "counter" | "gauge" | "histogram";
  readonly description: string;
  readonly allowedAggregations: readonly Aggregation[];
}

export interface SemanticAttribute {
  readonly name: string;
  readonly type: "string" | "integer" | "number" | "boolean";
  readonly cardinality: "low" | "medium" | "high";
  readonly values?: readonly RegistryValue[];
  readonly description: string;
}

export interface SemanticRegistry {
  readonly schemaVersion?: string;
  readonly scopes: readonly SemanticScope[];
  readonly metrics: readonly SemanticMetric[];
  readonly attributes: readonly SemanticAttribute[];
}

export type RegistryEntry = SemanticScope | SemanticMetric | SemanticAttribute;
export type RegistryKind = "scope" | "metric" | "attribute" | "unit" | "aggregation";
export type Aggregation = "last" | "min" | "max" | "sum" | "count";

export interface RegistryLookup {
  readonly scope: (name: string) => SemanticScope | undefined;
  readonly metric: (name: string) => SemanticMetric | undefined;
  readonly attribute: (name: string) => SemanticAttribute | undefined;
  readonly unit: (unit: string) => SemanticMetric | undefined;
  readonly aggregation: (name: string) => boolean;
  readonly find: (kind: RegistryKind, name: string) => RegistryEntry | string | boolean | undefined;
}

const AGGREGATIONS: readonly Aggregation[] = ["last", "min", "max", "sum", "count"];

export function createRegistryLookup(registry: SemanticRegistry): RegistryLookup {
  const scopes = new Map(registry.scopes.map((entry) => [entry.name, entry]));
  const metrics = new Map(registry.metrics.map((entry) => [entry.name, entry]));
  const attributes = new Map(registry.attributes.map((entry) => [entry.name, entry]));
  const units = new Map<string, SemanticMetric>();
  for (const metric of registry.metrics) {
    if (!units.has(metric.unit)) units.set(metric.unit, metric);
  }

  const find = (kind: RegistryKind, name: string): RegistryEntry | string | boolean | undefined => {
    if (kind === "scope") return scopes.get(name);
    if (kind === "metric") return metrics.get(name);
    if (kind === "attribute") return attributes.get(name);
    if (kind === "unit") return units.get(name)?.unit;
    return AGGREGATIONS.includes(name as Aggregation) ? true : undefined;
  };

  return {
    scope: (name) => scopes.get(name),
    metric: (name) => metrics.get(name),
    attribute: (name) => attributes.get(name),
    unit: (unit) => units.get(unit),
    aggregation: (name) => AGGREGATIONS.includes(name as Aggregation),
    find,
  };
}

