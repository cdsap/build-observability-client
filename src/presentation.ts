import type { Diagnostic as ModelDiagnostic, Observation } from "./model.js";
import type { DevelocityProjectionResult, Observation as DevelocityObservation } from "./adapters/develocity.js";

export interface ViewDiagnostic {
  readonly severity: "info" | "warning" | "error";
  readonly message: string;
}
export interface SummaryView { readonly kind: "summary"; readonly title: string; readonly items: readonly { readonly label: string; readonly value: string }[]; }
export interface TableView { readonly kind: "table"; readonly title: string; readonly columns: readonly string[]; readonly rows: readonly (readonly string[])[]; }
export interface ChartView { readonly kind: "chart"; readonly title: string; readonly labels: readonly string[]; readonly values: readonly number[]; readonly unit: string; }
export type ViewSection = SummaryView | TableView | ChartView;
/** Renderer-neutral, already formatted data. Renderers must not parse GBOS input. */
export interface ViewSpec { readonly title: string; readonly diagnostics: readonly ViewDiagnostic[]; readonly sections: readonly ViewSection[]; }

function projectionDiagnostics(result: DevelocityProjectionResult): readonly ViewDiagnostic[] {
  return result.diagnostics.map((diagnostic) => ({ severity: diagnostic.severity, message: diagnostic.message }));
}

/** Builds a small presentation slice from parsed Develocity custom values. */
export function createDevelocityViewSpec(result: DevelocityProjectionResult): ViewSpec {
  const observations = result.observations;
  const measurements = observations.flatMap((observation) => (observation.measurements ?? []).map((measurement) => ({ observation, measurement })));
  const firstMeasurement = measurements[0]?.measurement;
  const chartMeasurements = firstMeasurement === undefined ? [] : measurements.filter(({ measurement }) => measurement.name === firstMeasurement.name && measurement.unit === firstMeasurement.unit);
  const rows = observations.map((observation) => [observation.scope, observation.aggregationScope, Object.entries(observation.attributes).map(([name, value]) => `${name}=${String(value)}`).join(", ")]);
  const summary: SummaryView = { kind: "summary", title: "GBOS observations", items: [{ label: "Observations", value: String(observations.length) }, { label: "Indexes", value: String(result.indexes.length) }, { label: "Tags", value: String(result.tags.length) }] };
  const table: TableView = { kind: "table", title: "Observation details", columns: ["Scope", "Aggregation", "Attributes"], rows };
  const chart: ChartView = { kind: "chart", title: firstMeasurement?.name ?? "Measurements", labels: chartMeasurements.map(({ observation }) => observation.scope), values: chartMeasurements.map(({ measurement }) => measurement.value), unit: firstMeasurement?.unit ?? "" };
  return { title: "Build observability", diagnostics: projectionDiagnostics(result), sections: [summary, table, chart] };
}

/** Creates a view without requiring a source-specific adapter. */
export function createObservationViewSpec(observations: readonly Observation[], diagnostics: readonly ModelDiagnostic[] = []): ViewSpec {
  const normalized = observations.map((observation) => ({
    ...observation,
    diagnostics: observation.diagnostics?.map((entry) => ({ ...entry, message: entry.message ?? entry.code })),
  })) as readonly DevelocityObservation[];
  return createDevelocityViewSpec({ schemaVersion: observations[0]?.schemaVersion, observations: normalized, indexes: [], tags: [], diagnostics: diagnostics.map((entry) => ({ code: entry.code, severity: entry.severity, message: entry.message ?? entry.code })), provenance: [] });
}
