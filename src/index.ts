export const GBOS_CLIENT_PACKAGE = "@cdsap/gbos";
export type { Aggregation, RegistryEntry, RegistryKind, RegistryLookup, SemanticAttribute, SemanticMetric, SemanticRegistry, SemanticScope } from "./registry.js";
export { createRegistryLookup } from "./registry.js";
export type { DiagnosticSeverity, DiagnosticSource, DocumentKind, ParseMode, ValidationDiagnostic, ValidationOptions, ValidationResult } from "./validate.js";
export { validateBatch, validateDocument, validateFragment, validateObservation } from "./validate.js";
