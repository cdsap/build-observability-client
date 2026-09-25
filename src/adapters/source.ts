import type { NormalizedDataset } from "../model.js";
export interface SourceAdapter<Input, Result extends NormalizedDataset = NormalizedDataset> { readonly source: string; parse(input: Input): Result; }
