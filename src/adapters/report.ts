import type { BuildContext, NormalizedDataset, Observation, Resource } from "../model.js";
import { failure, modeOf, objectOf, observationOf, producerOf, type ParseOptions } from "../parse.js";
import type { SourceAdapter } from "./source.js";
export interface ReportInput { readonly schemaVersion: "1.0.0"; readonly resource: Resource; readonly buildContext?: BuildContext; readonly observations?: readonly Observation[]; readonly observationBatches?: readonly { readonly schemaVersion: "1.0.0"; readonly producer: { readonly name: string; readonly version: string }; readonly observations: readonly Omit<Observation, "schemaVersion" | "producer">[] }[]; }
export function parseReport(input: unknown, options: ParseOptions = {}): NormalizedDataset {
  const mode = modeOf(options); const diagnostics = [] as import("../model.js").Diagnostic[]; const report = objectOf(input);
  if (report === undefined || report.schemaVersion !== "1.0.0" || !objectOf(report.resource)) { failure("malformed_report", "Report must contain schemaVersion 1.0.0 and a resource object.", mode, diagnostics); return { records: [], diagnostics }; }
  const records = [] as import("../model.js").NormalizedRecord[];
  const metadata = { resource: report.resource as Resource, ...(objectOf(report.buildContext) ? { buildContext: report.buildContext as BuildContext } : {}) };
  const add = (value: unknown, index: number, headers: { schemaVersion?: unknown; producer?: unknown } = {}): void => { const observation = observationOf(value, headers); if (observation === undefined) { failure("malformed_observation", `Report observation ${index} is not a valid observation.`, mode, diagnostics); return; } records.push({ observation, metadata, provenance: { source: "report", index } }); };
  if (Array.isArray(report.observations)) report.observations.forEach((value, index) => add(value, index));
  if (Array.isArray(report.observationBatches)) for (const batch of report.observationBatches) { const batchObject = objectOf(batch); const producer = producerOf(batchObject?.producer); if (batchObject?.schemaVersion !== "1.0.0" || producer === undefined || !Array.isArray(batchObject.observations)) { failure("malformed_observation_batch", "Report observation batch is missing valid headers or observations.", mode, diagnostics); continue; } batchObject.observations.forEach((value, index) => add(value, records.length + index, { schemaVersion: batchObject.schemaVersion, producer })); }
  if (records.length === 0 && report.observations === undefined && report.observationBatches === undefined) failure("empty_report", "Report must contain observations or observationBatches.", mode, diagnostics);
  return { records, diagnostics };
}
export const parseReportJson: typeof parseReport = parseReport;
export const reportAdapter: SourceAdapter<unknown> = { source: "report", parse: parseReport };
