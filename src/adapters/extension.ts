import type { CustomValue, DevelocityProjectionResult } from "./develocity.js";
import { parseDevelocityProjection } from "./develocity.js";
export interface ExtensionMessage { readonly type: "request-custom-values" | "custom-values" | "diagnostic"; readonly values?: readonly CustomValue[]; readonly message?: string; }
export interface ExtensionPort { send(message: ExtensionMessage): Promise<ExtensionMessage>; }
export interface PageSourceAdapter { readCustomValues(): Promise<readonly CustomValue[]>; }
export interface ExtensionAdapter { collect(): Promise<DevelocityProjectionResult>; requestFromServiceWorker(): Promise<DevelocityProjectionResult>; }
/** Defines the content-script/service-worker seam; selectors, Chrome APIs, and page acquisition stay in the host. */
export function createExtensionAdapter(source: PageSourceAdapter, port: ExtensionPort): ExtensionAdapter { return { async collect(): Promise<DevelocityProjectionResult> { return parseDevelocityProjection(await source.readCustomValues()); }, async requestFromServiceWorker(): Promise<DevelocityProjectionResult> { const response = await port.send({ type: "request-custom-values" }); return parseDevelocityProjection(response.values ?? []); } }; }
