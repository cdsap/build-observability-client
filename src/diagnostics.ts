import type { Diagnostic, DiagnosticSeverity } from "./model.js";

export const DIAGNOSTIC_CODES = {
  INVALID_RECORD: "consumer.invalid_record",
  UNKNOWN_SCOPE: "consumer.unknown_scope",
  UNKNOWN_METRIC: "consumer.unknown_metric",
  DUPLICATE_OBSERVATION: "consumer.duplicate_observation",
} as const;

export function diagnostic(code: string, severity: DiagnosticSeverity, message: string, path?: string, ordinal?: number): Diagnostic {
  return Object.freeze({ code, severity, message, ...(path === undefined ? {} : { path }), ...(ordinal === undefined ? {} : { ordinal }) });
}
